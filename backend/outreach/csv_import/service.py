"""Previewing and committing CSV imports against the database."""

from django.conf import settings
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from outreach.exceptions import ConflictError
from outreach.models import ImportBatch, ImportStatus, OutreachRecord, Patient

from .parsing import CsvFileError, decode_csv_bytes, parse_csv
from .planning import ExistingData, Outcome, PatientIdentity, plan_import, record_key, summarize

# Arbitrary application-wide key for the Postgres advisory lock that serializes commits.
_IMPORT_LOCK_KEY = 4_802_117


def preview_import(*, user, filename, data):
    """Validate an uploaded file and store the preview. Nothing is imported yet.

    Raises CsvFileError if the file as a whole is unusable; no batch is stored then.
    """
    max_bytes = settings.OUTREACH_IMPORT_MAX_BYTES
    if len(data) > max_bytes:
        raise CsvFileError(f"The file is larger than the {_format_size(max_bytes)} limit.")
    text = decode_csv_bytes(data)
    planned = _plan(text)
    return ImportBatch.objects.create(
        uploaded_by=user,
        filename=filename[:255],
        content=text,
        rows=[row.as_dict() for row in planned],
        summary=summarize(planned),
    )


def commit_import(batch_id):
    """Import a previewed file, re-checking every row against the data as it is now."""
    with transaction.atomic():
        _lock_imports()
        batch = get_object_or_404(ImportBatch.objects.select_for_update(), pk=batch_id)
        if batch.status != ImportStatus.PREVIEWED:
            raise ConflictError("This import has already been committed.")

        planned = _plan(batch.content)
        _create_records(batch, [row.clean for row in planned if row.outcome == Outcome.CREATE])
        _save_phones(planned)

        batch.status = ImportStatus.COMMITTED
        batch.committed_at = timezone.now()
        batch.rows = [row.as_dict() for row in planned]
        batch.summary = summarize(planned)
        batch.save(update_fields=["status", "committed_at", "rows", "summary"])
    return batch


def discard_import(batch_id):
    with transaction.atomic():
        batch = get_object_or_404(ImportBatch.objects.select_for_update(), pk=batch_id)
        if batch.status != ImportStatus.PREVIEWED:
            raise ConflictError("A committed import can't be discarded.")
        batch.delete()


def _plan(text):
    rows = parse_csv(text, today=timezone.localdate(), max_rows=settings.OUTREACH_IMPORT_MAX_ROWS)
    return plan_import(rows, _existing_data_for(rows))


def _existing_data_for(rows):
    accounts = {row.clean.account_number for row in rows if row.clean}
    patients = list(
        Patient.objects.filter(account_number__in=accounts).values_list("account_number", "name", "dob", "phone")
    )
    records = OutreachRecord.objects.filter(patient__account_number__in=accounts)
    all_records = OutreachRecord.objects.order_by()  # No ordering, so DISTINCT works as expected.
    return ExistingData(
        patients={account: PatientIdentity(name, dob) for account, name, dob, _ in patients},
        phones={account: phone for account, _, _, phone in patients if phone},
        record_keys={
            record_key(*values)
            for values in records.values_list("patient__account_number", "visit_type", "last_visit")
        },
        clinics=set(all_records.values_list("clinic", flat=True).distinct()),
        visit_types=set(all_records.values_list("visit_type", flat=True).distinct()),
    )


def _create_records(batch, rows_to_create):
    accounts = {row.account_number for row in rows_to_create}
    patients = {patient.account_number: patient for patient in Patient.objects.filter(account_number__in=accounts)}
    new_patients = []
    for row in rows_to_create:
        if row.account_number not in patients:
            patient = Patient(account_number=row.account_number, name=row.patient_name, dob=row.dob)
            patients[row.account_number] = patient
            new_patients.append(patient)
    Patient.objects.bulk_create(new_patients)
    OutreachRecord.objects.bulk_create(
        OutreachRecord(
            patient=patients[row.account_number],
            clinic=row.clinic,
            visit_type=row.visit_type,
            last_visit=row.last_visit,
            import_batch=batch,
        )
        for row in rows_to_create
    )


def _save_phones(planned):
    """Give each patient the last phone the file has for them, from created or duplicate rows.

    A blank phone leaves the saved one alone, as the plan's messages describe.
    """
    phones = {row.clean.account_number: row.clean.phone for row in planned if row.clean and row.clean.phone}
    changed = []
    for patient in Patient.objects.filter(account_number__in=phones):
        if patient.phone != phones[patient.account_number]:
            patient.phone = phones[patient.account_number]
            changed.append(patient)
    Patient.objects.bulk_update(changed, ["phone"])


def _lock_imports():
    """Serialize commits so two imports can't race to create the same patients or records."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [_IMPORT_LOCK_KEY])


def _format_size(num_bytes):
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):g} MB"
    return f"{num_bytes:,} bytes"
