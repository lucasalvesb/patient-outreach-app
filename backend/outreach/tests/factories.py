"""Tiny helpers for building test data with sensible defaults."""

from datetime import date

from django.utils import timezone

from outreach.models import OutreachRecord, Patient, RecordStatus


def make_patient(account_number="AB1001", name="Jane Testperson", dob=date(1980, 2, 14), assigned_to=None, phone=""):
    return Patient.objects.create(
        account_number=account_number,
        name=name,
        dob=dob,
        phone=phone,
        assigned_to=assigned_to,
        claimed_at=timezone.now() if assigned_to else None,
    )


def make_record(
    patient,
    visit_type="Annual Physical",
    clinic="Maple Clinic",
    last_visit=date(2024, 9, 10),
    status=RecordStatus.OPEN,
):
    return OutreachRecord.objects.create(
        patient=patient,
        visit_type=visit_type,
        clinic=clinic,
        last_visit=last_visit,
        status=status,
        closed_at=timezone.now() if status == RecordStatus.CLOSED else None,
    )
