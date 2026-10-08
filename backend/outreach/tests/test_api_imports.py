import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from outreach.models import Patient
from outreach.tests.csv_samples import SAMPLE_CSV

pytestmark = pytest.mark.django_db


def upload(client, text=SAMPLE_CSV, name="due.csv"):
    file = SimpleUploadedFile(name, text.encode(), content_type="text/csv")
    return client.post("/api/imports/", {"file": file}, format="multipart")


def test_agents_cannot_import(agent_client):
    assert upload(agent_client).status_code == 403
    assert agent_client.get("/api/imports/").status_code == 403


def test_upload_returns_a_preview_and_imports_nothing(admin_client):
    response = upload(admin_client)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "previewed"
    assert body["filename"] == "due.csv"
    assert body["summary"] == {"total": 5, "create": 2, "duplicate": 1, "error": 2, "phones": 0}
    assert [(row["row_number"], row["outcome"], row["messages"]) for row in body["rows"]] == [
        (2, "create", []),
        (3, "duplicate", ["Duplicate of row 2 in this file."]),
        (4, "error", ["DOB '1975-13-40' is not a valid date (use YYYY-MM-DD or MM/DD/YYYY)."]),
        (5, "error", ["Account Number is required."]),
        (6, "create", []),
    ]
    assert not Patient.objects.exists()


def test_upload_without_a_file_is_rejected(admin_client):
    response = admin_client.post("/api/imports/", {}, format="multipart")

    assert response.status_code == 400
    assert response.json() == {"file": ["Choose a CSV file to upload."]}


def test_unusable_file_is_rejected_with_the_reason(admin_client):
    response = upload(admin_client, text="Name,Phone\nJane,555-0100\n")

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Missing required column(s): Account No, Patient Name, DOB, Clinic, Visit Type, Last Visit."
    }


def test_file_with_binary_data_is_rejected_not_a_server_error(admin_client):
    text = SAMPLE_CSV.replace("Jane Testperson", "Jane\x00Testperson")

    response = upload(admin_client, text=text)

    assert response.status_code == 400
    assert response.json() == {
        "detail": "The file contains binary data, so it isn't a plain-text CSV. "
        "Save it as CSV (UTF-8) and upload it again."
    }


def test_committing_imports_the_rows_into_the_pool(admin_client, agent_client):
    batch_id = upload(admin_client).json()["id"]

    response = admin_client.post(f"/api/imports/{batch_id}/commit/")

    assert response.status_code == 200
    assert response.json()["status"] == "committed"
    assert response.json()["summary"] == {"total": 5, "create": 2, "duplicate": 1, "error": 2, "phones": 0}
    pool = agent_client.get("/api/pool/").json()
    assert [(p["account_number"], p["open_record_count"]) for p in pool["results"]] == [("AB1001", 2)]


def test_committing_twice_is_a_conflict(admin_client):
    batch_id = upload(admin_client).json()["id"]
    admin_client.post(f"/api/imports/{batch_id}/commit/")

    response = admin_client.post(f"/api/imports/{batch_id}/commit/")

    assert response.status_code == 409


def test_history_lists_imports_newest_first_without_their_rows(admin_client):
    first = upload(admin_client).json()["id"]
    second = upload(admin_client).json()["id"]

    body = admin_client.get("/api/imports/").json()

    assert [batch["id"] for batch in body["results"]] == [second, first]
    assert body["results"][0]["uploaded_by"]["username"] == "admin"
    assert "rows" not in body["results"][0]


def test_detail_includes_the_rows(admin_client):
    batch_id = upload(admin_client).json()["id"]

    body = admin_client.get(f"/api/imports/{batch_id}/").json()

    assert len(body["rows"]) == 5


def test_a_preview_can_be_discarded(admin_client):
    batch_id = upload(admin_client).json()["id"]

    assert admin_client.delete(f"/api/imports/{batch_id}/").status_code == 204
    assert admin_client.get(f"/api/imports/{batch_id}/").status_code == 404


def test_a_committed_import_cannot_be_discarded(admin_client):
    batch_id = upload(admin_client).json()["id"]
    admin_client.post(f"/api/imports/{batch_id}/commit/")

    assert admin_client.delete(f"/api/imports/{batch_id}/").status_code == 409
