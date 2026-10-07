from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from outreach.models import ActionType, OutreachAction, RecordStatus
from outreach.tests.factories import make_patient, make_record

pytestmark = pytest.mark.django_db


@pytest.fixture
def population(agent):
    jane = make_patient("AB1001", "Jane Testperson", assigned_to=agent)
    jane_record = make_record(jane, visit_type="Annual Physical", clinic="Maple Clinic")
    OutreachAction.objects.create(record=jane_record, agent=agent, action_type=ActionType.VOICEMAIL)
    pat = make_patient("AB1002", "Pat Lee")
    make_record(pat, visit_type="Diabetes Follow-Up", clinic="Oak Clinic")
    done = make_patient("AB1003", "Done Person")
    make_record(done, visit_type="Annual Physical", clinic="Oak Clinic", status=RecordStatus.CLOSED)
    return SimpleNamespace(jane=jane, pat=pat, done=done)


def names(client, query=""):
    response = client.get(f"/api/admin/patients/?{query}")
    assert response.status_code == 200
    return [patient["name"] for patient in response.json()["results"]]


def test_agents_cannot_use_admin_endpoints(agent_client, population):
    assert agent_client.get("/api/admin/patients/").status_code == 403
    assert agent_client.get(f"/api/admin/patients/{population.pat.id}/").status_code == 403
    assert agent_client.post(f"/api/admin/patients/{population.pat.id}/reassign/", {"agent_id": None}).status_code == 403
    assert agent_client.get("/api/admin/filter-options/").status_code == 403


def test_lists_every_patient_by_name(admin_client, population):
    assert names(admin_client) == ["Done Person", "Jane Testperson", "Pat Lee"]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("status=open", ["Jane Testperson", "Pat Lee"]),
        ("status=closed", ["Done Person"]),
        ("agent=unassigned", ["Done Person", "Pat Lee"]),
        ("clinic=oak clinic", ["Done Person", "Pat Lee"]),
        ("visit_type=Annual Physical", ["Done Person", "Jane Testperson"]),
        ("status=open&clinic=Oak Clinic", ["Pat Lee"]),
        ("search=ab1002", ["Pat Lee"]),
    ],
)
def test_filters(admin_client, population, query, expected):
    assert names(admin_client, query) == expected


def test_filter_by_assigned_agent(admin_client, population, agent):
    assert names(admin_client, f"agent={agent.id}") == ["Jane Testperson"]


def test_rows_summarize_assignment_and_records(admin_client, population):
    results = admin_client.get("/api/admin/patients/").json()["results"]
    jane = next(patient for patient in results if patient["account_number"] == "AB1001")

    assert jane["assigned_to"]["username"] == "agent1"
    assert jane["open_record_count"] == 1
    assert jane["closed_record_count"] == 0
    assert jane["visit_types"] == ["Annual Physical"]
    assert jane["last_action_at"] is not None


def test_patient_detail_includes_records_and_call_history(admin_client, population):
    body = admin_client.get(f"/api/admin/patients/{population.jane.id}/").json()

    assert body["account_number"] == "AB1001"
    assert [action["action_type"] for action in body["records"][0]["actions"]] == ["voicemail"]


def test_reassign_to_another_agent(admin_client, population, other_agent):
    response = admin_client.post(
        f"/api/admin/patients/{population.jane.id}/reassign/", {"agent_id": other_agent.id}
    )

    assert response.status_code == 200
    assert response.json()["assigned_to"]["id"] == other_agent.id


def test_reassign_back_to_the_pool(admin_client, population):
    response = admin_client.post(f"/api/admin/patients/{population.jane.id}/reassign/", {"agent_id": None})

    assert response.status_code == 200
    assert response.json()["assigned_to"] is None


def test_reassign_to_an_unknown_user_is_rejected(admin_client, population):
    response = admin_client.post(f"/api/admin/patients/{population.jane.id}/reassign/", {"agent_id": 999999})

    assert response.status_code == 400
    assert "agent_id" in response.json()


def test_reassign_to_an_inactive_user_is_rejected(admin_client, population):
    retired = get_user_model().objects.create_user(username="retired", is_active=False)

    response = admin_client.post(f"/api/admin/patients/{population.jane.id}/reassign/", {"agent_id": retired.id})

    assert response.status_code == 400


def test_patient_with_nothing_open_cannot_be_assigned(admin_client, population, agent):
    response = admin_client.post(f"/api/admin/patients/{population.done.id}/reassign/", {"agent_id": agent.id})

    assert response.status_code == 409


def test_filter_options(admin_client, population, other_agent):
    body = admin_client.get("/api/admin/filter-options/").json()

    assert body["clinics"] == ["Maple Clinic", "Oak Clinic"]
    assert body["visit_types"] == ["Annual Physical", "Diabetes Follow-Up"]
    assert [agent["username"] for agent in body["agents"]] == ["admin", "agent1", "agent2"]
