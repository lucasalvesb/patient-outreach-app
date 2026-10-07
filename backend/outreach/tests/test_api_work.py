from datetime import date, timedelta

import pytest
from django.utils import timezone

from outreach.models import ActionType, OutreachAction, RecordStatus
from outreach.tests.factories import make_patient, make_record

pytestmark = pytest.mark.django_db

TOMORROW = timezone.localdate() + timedelta(days=1)


def pool_names(client, query=""):
    return [patient["name"] for patient in client.get(f"/api/pool/?{query}").json()["results"]]


class TestPool:
    def test_lists_unassigned_patients_that_have_open_records(self, agent_client, agent):
        waiting = make_patient("AB1001", "Jane Testperson")
        make_record(waiting, visit_type="Annual Physical", last_visit=date(2024, 9, 10))
        make_record(waiting, visit_type="Diabetes Follow-Up", clinic="Oak Clinic", last_visit=date(2025, 3, 1))
        make_record(waiting, visit_type="Flu Shot", status=RecordStatus.CLOSED)
        make_record(make_patient("AB1002", "Claimed Person", assigned_to=agent))
        make_record(make_patient("AB1003", "All Done"), status=RecordStatus.CLOSED)

        response = agent_client.get("/api/pool/")

        assert response.status_code == 200
        assert response.json()["count"] == 1
        assert response.json()["results"] == [
            {
                "id": waiting.id,
                "account_number": "AB1001",
                "name": "Jane Testperson",
                "dob": "1980-02-14",
                "open_record_count": 2,
                "oldest_last_visit": "2024-09-10",
                "visit_types": ["Annual Physical", "Diabetes Follow-Up"],
                "clinics": ["Maple Clinic", "Oak Clinic"],
            }
        ]

    def test_most_overdue_patients_come_first(self, agent_client):
        make_record(make_patient("AB1", "Recent Visit"), last_visit=date(2025, 6, 1))
        make_record(make_patient("AB2", "Long Overdue"), last_visit=date(2023, 1, 1))

        assert pool_names(agent_client) == ["Long Overdue", "Recent Visit"]

    def test_search_matches_name_or_account_number(self, agent_client):
        make_record(make_patient("AB1001", "Jane Testperson"))
        make_record(make_patient("ZZ9999", "Pat Lee"))

        assert pool_names(agent_client, "search=jane") == ["Jane Testperson"]
        assert pool_names(agent_client, "search=zz99") == ["Pat Lee"]


class TestClaim:
    def test_claimed_patient_moves_from_the_pool_to_my_work(self, agent_client):
        patient = make_patient()
        make_record(patient)

        response = agent_client.post(f"/api/patients/{patient.id}/claim/")

        assert response.status_code == 200
        assert response.json()["assigned_to"]["username"] == "agent1"
        assert pool_names(agent_client) == []
        assert [p["id"] for p in agent_client.get("/api/my-work/").json()] == [patient.id]

    def test_patient_someone_else_holds_is_a_conflict(self, agent_client, other_agent):
        patient = make_patient(assigned_to=other_agent)
        make_record(patient)

        response = agent_client.post(f"/api/patients/{patient.id}/claim/")

        assert response.status_code == 409
        assert response.json() == {"detail": "This patient was already claimed by another agent."}

    def test_unknown_patient(self, agent_client):
        assert agent_client.post("/api/patients/999999/claim/").status_code == 404


class TestMyWork:
    def test_shows_only_my_patients_with_their_records_and_call_history(self, agent_client, agent, other_agent):
        mine = make_patient("AB1001", assigned_to=agent)
        record = make_record(mine)
        OutreachAction.objects.create(record=record, agent=agent, action_type=ActionType.NO_ANSWER)
        OutreachAction.objects.create(
            record=record, agent=agent, action_type=ActionType.VOICEMAIL, notes="Left message"
        )
        make_record(make_patient("AB1002", assigned_to=other_agent))

        body = agent_client.get("/api/my-work/").json()

        assert [patient["account_number"] for patient in body] == ["AB1001"]
        [record_data] = body[0]["records"]
        assert record_data["status"] == "open"
        assert [
            (action["action_type"], action["action_label"], action["notes"], action["agent"]["username"])
            for action in record_data["actions"]
        ] == [
            ("voicemail", "Voicemail", "Left message", "agent1"),
            ("no_answer", "No Answer", "", "agent1"),
        ]


class TestLogAction:
    @pytest.fixture
    def record(self, agent):
        patient = make_patient(assigned_to=agent)
        make_record(patient, visit_type="Flu Shot")  # A second open record keeps the patient assigned.
        return make_record(patient)

    @staticmethod
    def url(record):
        return f"/api/records/{record.id}/actions/"

    def test_logging_a_call_returns_the_updated_record(self, agent_client, record):
        response = agent_client.post(self.url(record), {"action_type": "no_answer", "notes": "Rang 10 times"})

        assert response.status_code == 201
        body = response.json()
        assert body["action"]["action_type"] == "no_answer"
        assert body["record"]["status"] == "open"
        assert body["record"]["actions"][0]["notes"] == "Rang 10 times"
        assert body["patient_released"] is False

    def test_scheduled_closes_the_record(self, agent_client, record):
        response = agent_client.post(
            self.url(record), {"action_type": "scheduled", "appointment_date": TOMORROW.isoformat()}
        )

        assert response.status_code == 201
        assert response.json()["record"]["status"] == "closed"
        assert response.json()["action"]["appointment_date"] == TOMORROW.isoformat()

    def test_scheduled_without_a_date_is_rejected(self, agent_client, record):
        response = agent_client.post(self.url(record), {"action_type": "scheduled"})

        assert response.status_code == 400
        assert response.json() == {"appointment_date": ["An appointment date is required for Scheduled."]}

    def test_malformed_appointment_date_is_rejected(self, agent_client, record):
        response = agent_client.post(self.url(record), {"action_type": "scheduled", "appointment_date": "next week"})

        assert response.status_code == 400
        assert "appointment_date" in response.json()

    def test_unknown_action_type_is_rejected(self, agent_client, record):
        response = agent_client.post(self.url(record), {"action_type": "emailed"})

        assert response.status_code == 400
        assert "action_type" in response.json()

    def test_another_agents_record_is_forbidden(self, other_agent_client, record):
        response = other_agent_client.post(self.url(record), {"action_type": "no_answer"})

        assert response.status_code == 403

    def test_closed_record_is_a_conflict(self, agent_client, record):
        agent_client.post(self.url(record), {"action_type": "not_interested"})

        response = agent_client.post(self.url(record), {"action_type": "no_answer"})

        assert response.status_code == 409
        assert response.json() == {"detail": "This record is already closed."}

    def test_closing_the_last_open_record_releases_the_patient(self, agent_client, agent):
        record = make_record(make_patient(assigned_to=agent))

        response = agent_client.post(self.url(record), {"action_type": "not_interested"})

        assert response.json()["patient_released"] is True
        assert agent_client.get("/api/my-work/").json() == []
