from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.http import Http404
from django.utils import timezone

from outreach.exceptions import ConflictError, NotPermittedError
from outreach.models import ActionType, OutreachAction, RecordStatus
from outreach.tests.factories import make_patient, make_record
from outreach.workflow import claim_patient, log_action, reassign_patient

pytestmark = pytest.mark.django_db

TOMORROW = timezone.localdate() + timedelta(days=1)


class TestClaim:
    def test_agent_claims_an_unassigned_patient_with_open_records(self, agent):
        patient = make_patient()
        make_record(patient)

        claimed = claim_patient(patient.pk, agent)

        assert claimed.assigned_to == agent
        assert claimed.claimed_at is not None

    def test_claiming_your_own_patient_again_changes_nothing(self, agent):
        patient = make_patient(assigned_to=agent)
        make_record(patient)

        claimed = claim_patient(patient.pk, agent)

        assert claimed.assigned_to == agent
        assert claimed.claimed_at == patient.claimed_at

    def test_patient_held_by_another_agent_cannot_be_claimed(self, agent, other_agent):
        patient = make_patient(assigned_to=other_agent)
        make_record(patient)

        with pytest.raises(ConflictError, match="already claimed"):
            claim_patient(patient.pk, agent)

    def test_patient_without_open_records_cannot_be_claimed(self, agent):
        patient = make_patient()
        make_record(patient, status=RecordStatus.CLOSED)

        with pytest.raises(ConflictError, match="no open records"):
            claim_patient(patient.pk, agent)

    def test_unknown_patient(self, agent):
        with pytest.raises(Http404):
            claim_patient(999_999, agent)


class TestLogAction:
    @pytest.fixture
    def record(self, agent):
        return make_record(make_patient(assigned_to=agent))

    @pytest.mark.parametrize("action_type", [ActionType.NO_ANSWER, ActionType.VOICEMAIL])
    def test_unsuccessful_calls_keep_the_record_open(self, agent, record, action_type):
        result = log_action(record.pk, agent, action_type=action_type)

        assert result.action.action_type == action_type
        assert result.action.agent == agent
        assert result.record.status == RecordStatus.OPEN
        assert result.patient_released is False
        record.patient.refresh_from_db()
        assert record.patient.assigned_to == agent

    def test_scheduled_requires_an_appointment_date(self, agent, record):
        with pytest.raises(ValidationError) as error:
            log_action(record.pk, agent, action_type=ActionType.SCHEDULED)

        assert "appointment_date" in error.value.message_dict
        assert not OutreachAction.objects.exists()

    def test_scheduled_closes_the_record_and_keeps_the_appointment_date(self, agent, record):
        result = log_action(record.pk, agent, action_type=ActionType.SCHEDULED, appointment_date=TOMORROW)

        record.refresh_from_db()
        assert record.status == RecordStatus.CLOSED
        assert record.closed_at is not None
        assert result.action.appointment_date == TOMORROW

    def test_appointment_can_be_today_but_not_in_the_past(self, agent, record):
        with pytest.raises(ValidationError, match="past"):
            log_action(
                record.pk,
                agent,
                action_type=ActionType.SCHEDULED,
                appointment_date=timezone.localdate() - timedelta(days=1),
            )

        result = log_action(
            record.pk, agent, action_type=ActionType.SCHEDULED, appointment_date=timezone.localdate()
        )
        assert result.record.status == RecordStatus.CLOSED

    def test_only_scheduled_takes_an_appointment_date(self, agent, record):
        with pytest.raises(ValidationError) as error:
            log_action(record.pk, agent, action_type=ActionType.VOICEMAIL, appointment_date=TOMORROW)

        assert "appointment_date" in error.value.message_dict

    def test_not_interested_closes_the_record(self, agent, record):
        result = log_action(record.pk, agent, action_type=ActionType.NOT_INTERESTED)

        assert result.record.status == RecordStatus.CLOSED

    def test_closing_the_last_open_record_releases_the_patient(self, agent, record):
        make_record(record.patient, visit_type="Flu Shot", status=RecordStatus.CLOSED)

        result = log_action(record.pk, agent, action_type=ActionType.NOT_INTERESTED)

        assert result.patient_released is True
        record.patient.refresh_from_db()
        assert record.patient.assigned_to is None
        assert record.patient.claimed_at is None

    def test_patient_stays_assigned_while_other_records_are_open(self, agent, record):
        make_record(record.patient, visit_type="Flu Shot")

        result = log_action(record.pk, agent, action_type=ActionType.NOT_INTERESTED)

        assert result.patient_released is False
        record.patient.refresh_from_db()
        assert record.patient.assigned_to == agent

    def test_closed_records_take_no_more_actions(self, agent, record):
        make_record(record.patient, visit_type="Flu Shot")  # keeps the patient assigned
        log_action(record.pk, agent, action_type=ActionType.NOT_INTERESTED)

        with pytest.raises(ConflictError, match="already closed"):
            log_action(record.pk, agent, action_type=ActionType.NO_ANSWER)

    def test_only_the_assigned_agent_can_log_calls(self, other_agent, record):
        with pytest.raises(NotPermittedError):
            log_action(record.pk, other_agent, action_type=ActionType.NO_ANSWER)

    def test_unclaimed_patients_cannot_be_called(self, agent):
        record = make_record(make_patient())

        with pytest.raises(NotPermittedError):
            log_action(record.pk, agent, action_type=ActionType.NO_ANSWER)

    def test_notes_are_trimmed_and_saved(self, agent, record):
        result = log_action(record.pk, agent, action_type=ActionType.VOICEMAIL, notes="  Left callback number  ")

        assert result.action.notes == "Left callback number"

    def test_unknown_record(self, agent):
        with pytest.raises(Http404):
            log_action(999_999, agent, action_type=ActionType.NO_ANSWER)


class TestReassign:
    def test_patient_moves_to_another_agent(self, agent, other_agent):
        patient = make_patient(assigned_to=agent)
        make_record(patient)

        reassigned = reassign_patient(patient.pk, other_agent)

        assert reassigned.assigned_to == other_agent
        assert reassigned.claimed_at is not None

    def test_patient_goes_back_to_the_pool(self, agent):
        patient = make_patient(assigned_to=agent)
        make_record(patient)

        reassigned = reassign_patient(patient.pk, None)

        assert reassigned.assigned_to is None
        assert reassigned.claimed_at is None

    def test_patient_without_open_records_cannot_be_assigned(self, agent):
        patient = make_patient()
        make_record(patient, status=RecordStatus.CLOSED)

        with pytest.raises(ConflictError):
            reassign_patient(patient.pk, agent)
