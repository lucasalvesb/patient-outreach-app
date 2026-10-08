from datetime import date

import pytest

from outreach.csv_import.parsing import CsvFileError
from outreach.csv_import.service import commit_import, discard_import, preview_import
from outreach.exceptions import ConflictError
from outreach.models import ImportBatch, ImportStatus, OutreachRecord, Patient, RecordStatus
from outreach.tests.csv_samples import SAMPLE_CSV
from outreach.tests.factories import make_patient, make_record

pytestmark = pytest.mark.django_db


def preview(user, text=SAMPLE_CSV):
    return preview_import(user=user, filename="due.csv", data=text.encode())


def test_preview_stores_the_plan_without_importing_anything(admin_user):
    batch = preview(admin_user)

    assert batch.status == ImportStatus.PREVIEWED
    assert batch.uploaded_by == admin_user
    assert batch.summary == {"total": 5, "create": 2, "duplicate": 1, "error": 2}
    assert [row["outcome"] for row in batch.rows] == ["create", "duplicate", "error", "error", "create"]
    assert Patient.objects.count() == 0
    assert OutreachRecord.objects.count() == 0


def test_commit_creates_the_patient_and_open_unassigned_records(admin_user):
    batch = preview(admin_user)

    commit_import(batch.pk)

    batch.refresh_from_db()
    assert batch.status == ImportStatus.COMMITTED
    assert batch.committed_at is not None
    patient = Patient.objects.get()
    assert (patient.account_number, patient.name, patient.dob) == ("AB1001", "Jane Testperson", date(1980, 2, 14))
    assert patient.assigned_to is None
    records = patient.records.order_by("last_visit").values_list(
        "visit_type", "clinic", "last_visit", "status", "import_batch"
    )
    assert list(records) == [
        ("Annual Physical", "Maple Clinic", date(2024, 9, 10), RecordStatus.OPEN, batch.pk),
        ("Diabetes Follow-Up", "Maple Clinic", date(2025, 3, 1), RecordStatus.OPEN, batch.pk),
    ]


def test_importing_the_same_file_again_creates_nothing(admin_user):
    commit_import(preview(admin_user).pk)

    second = commit_import(preview(admin_user).pk)

    assert second.summary == {"total": 5, "create": 0, "duplicate": 3, "error": 2}
    assert OutreachRecord.objects.count() == 2


def test_commit_revalidates_against_records_added_after_the_preview(admin_user):
    batch = preview(admin_user)
    make_record(make_patient(), visit_type="Annual Physical", last_visit=date(2024, 9, 10))

    commit_import(batch.pk)

    batch.refresh_from_db()
    assert batch.summary == {"total": 5, "create": 1, "duplicate": 2, "error": 2}
    assert OutreachRecord.objects.count() == 2


def test_closed_records_still_count_as_duplicates(admin_user):
    make_record(make_patient(), status=RecordStatus.CLOSED)

    batch = preview(admin_user)

    assert batch.summary["duplicate"] == 2


def test_new_record_for_a_claimed_patient_stays_with_that_agent(admin_user, agent):
    patient = make_patient(assigned_to=agent)
    make_record(patient, visit_type="Flu Shot")

    commit_import(preview(admin_user).pk)

    patient.refresh_from_db()
    assert patient.assigned_to == agent
    assert patient.records.filter(status=RecordStatus.OPEN).count() == 3


PHONE_CSV = (
    "Account No,Patient Name,DOB,Clinic,Visit Type,Last Visit,Phone\n"
    "AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10,555-0101\n"
)


def test_commit_saves_the_phone_of_a_new_patient(admin_user):
    commit_import(preview(admin_user, PHONE_CSV).pk)

    assert Patient.objects.get().phone == "555-0101"


def test_a_duplicate_row_adds_a_phone_to_a_patient_imported_without_one(admin_user):
    commit_import(preview(admin_user).pk)  # The starter file has no Phone column.

    batch = commit_import(preview(admin_user, PHONE_CSV).pk)

    assert batch.summary["duplicate"] == 1
    assert Patient.objects.get().phone == "555-0101"


def test_preview_says_when_a_phone_replaces_the_saved_one(admin_user):
    make_patient(phone="555-0100")

    batch = preview(admin_user, PHONE_CSV)

    assert batch.rows[0]["messages"] == ["Replaces the phone number 555-0100."]


def test_a_blank_phone_keeps_the_saved_one(admin_user):
    make_patient(phone="555-0100")

    commit_import(preview(admin_user, PHONE_CSV.replace(",555-0101", ",")).pk)

    assert Patient.objects.get().phone == "555-0100"


def test_a_preview_can_only_be_committed_once(admin_user):
    batch = preview(admin_user)
    commit_import(batch.pk)

    with pytest.raises(ConflictError):
        commit_import(batch.pk)


def test_discarding_a_preview_deletes_it(admin_user):
    batch = preview(admin_user)

    discard_import(batch.pk)

    assert not ImportBatch.objects.exists()


def test_committed_imports_cannot_be_discarded(admin_user):
    batch = commit_import(preview(admin_user).pk)

    with pytest.raises(ConflictError):
        discard_import(batch.pk)


def test_unusable_files_are_rejected_without_storing_anything(admin_user):
    with pytest.raises(CsvFileError, match="Missing required column"):
        preview(admin_user, text="Name,Phone\nJane,555-0100\n")

    assert not ImportBatch.objects.exists()


def test_oversized_files_are_rejected(admin_user, settings):
    settings.OUTREACH_IMPORT_MAX_BYTES = 100

    with pytest.raises(CsvFileError, match="larger than"):
        preview(admin_user)
