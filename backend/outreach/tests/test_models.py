from datetime import date

import pytest
from django.db import IntegrityError

from outreach.models import ActionType, OutreachAction
from outreach.tests.factories import make_patient, make_record


@pytest.mark.parametrize(
    ("action", "closes"),
    [
        (ActionType.NO_ANSWER, False),
        (ActionType.VOICEMAIL, False),
        (ActionType.SCHEDULED, True),
        (ActionType.NOT_INTERESTED, True),
    ],
)
def test_only_scheduled_and_not_interested_close_a_record(action, closes):
    assert action.closes_record is closes


@pytest.mark.django_db
def test_record_key_is_unique_regardless_of_visit_type_case():
    patient = make_patient()
    make_record(patient, visit_type="Annual Physical", last_visit=date(2024, 9, 10))

    with pytest.raises(IntegrityError):
        make_record(patient, visit_type="annual physical", last_visit=date(2024, 9, 10))


@pytest.mark.django_db
def test_same_visit_type_with_a_different_last_visit_is_a_separate_record():
    patient = make_patient()
    make_record(patient, last_visit=date(2024, 9, 10))
    make_record(patient, last_visit=date(2025, 9, 10))

    assert patient.records.count() == 2


@pytest.mark.django_db
def test_database_rejects_scheduled_action_without_appointment_date(agent):
    record = make_record(make_patient(assigned_to=agent))

    with pytest.raises(IntegrityError):
        OutreachAction.objects.create(record=record, agent=agent, action_type=ActionType.SCHEDULED)


@pytest.mark.django_db
def test_database_rejects_appointment_date_on_non_scheduled_action(agent):
    record = make_record(make_patient(assigned_to=agent))

    with pytest.raises(IntegrityError):
        OutreachAction.objects.create(
            record=record,
            agent=agent,
            action_type=ActionType.NO_ANSWER,
            appointment_date=date(2030, 1, 1),
        )
