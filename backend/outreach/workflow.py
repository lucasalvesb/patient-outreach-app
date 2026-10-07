"""The outreach workflow: claiming patients, logging calls and releasing patients.

Every operation that reads-then-changes a patient's assignment, or closes one of
their records, first locks the patient row (SELECT ... FOR UPDATE). That makes
two agents claiming at once, or two records closing at once, run one after the
other instead of both acting on a stale view.
"""

from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .exceptions import ConflictError, NotPermittedError
from .models import ActionType, OutreachAction, OutreachRecord, Patient, RecordStatus


@dataclass(frozen=True)
class LoggedAction:
    action: OutreachAction
    record: OutreachRecord
    patient_released: bool


def claim_patient(patient_id, agent):
    with transaction.atomic():
        patient = get_object_or_404(Patient.objects.select_for_update(), pk=patient_id)
        if patient.assigned_to_id == agent.id:
            return patient
        if patient.assigned_to_id is not None:
            raise ConflictError("This patient was already claimed by another agent.")
        if not _has_open_records(patient):
            raise ConflictError("This patient has no open records to work.")
        patient.assigned_to = agent
        patient.claimed_at = timezone.now()
        patient.save(update_fields=["assigned_to", "claimed_at"])
    return patient


def log_action(record_id, agent, *, action_type, appointment_date=None, notes=""):
    action_type = ActionType(action_type)
    with transaction.atomic():
        patient_id = OutreachRecord.objects.filter(pk=record_id).values_list("patient_id", flat=True).first()
        if patient_id is None:
            raise Http404("No such record.")
        # Lock the patient first, then read the record: any other call on this
        # patient's records has either fully committed or waits for us.
        patient = Patient.objects.select_for_update().get(pk=patient_id)
        record = OutreachRecord.objects.get(pk=record_id)
        if patient.assigned_to_id != agent.id:
            raise NotPermittedError("Only the agent who claimed this patient can log calls on their records.")
        if record.status == RecordStatus.CLOSED:
            raise ConflictError("This record is already closed.")
        _validate_appointment(action_type, appointment_date)

        action = OutreachAction.objects.create(
            record=record,
            agent=agent,
            action_type=action_type,
            appointment_date=appointment_date,
            notes=notes.strip(),
        )
        released = False
        if action_type.closes_record:
            record.status = RecordStatus.CLOSED
            record.closed_at = action.created_at
            record.save(update_fields=["status", "closed_at"])
            if not _has_open_records(patient):
                patient.assigned_to = None
                patient.claimed_at = None
                patient.save(update_fields=["assigned_to", "claimed_at"])
                released = True
    return LoggedAction(action, record, released)


def reassign_patient(patient_id, agent):
    """Hand a patient to another agent, or back to the pool when `agent` is None."""
    with transaction.atomic():
        patient = get_object_or_404(Patient.objects.select_for_update(), pk=patient_id)
        if agent is not None and not _has_open_records(patient):
            raise ConflictError("This patient has no open records to work.")
        if patient.assigned_to_id != (agent.id if agent else None):
            patient.assigned_to = agent
            patient.claimed_at = timezone.now() if agent else None
            patient.save(update_fields=["assigned_to", "claimed_at"])
    return patient


def _has_open_records(patient):
    return patient.records.filter(status=RecordStatus.OPEN).exists()


def _validate_appointment(action_type, appointment_date):
    if action_type == ActionType.SCHEDULED:
        if appointment_date is None:
            raise ValidationError({"appointment_date": "An appointment date is required for Scheduled."})
        if appointment_date < timezone.localdate():
            raise ValidationError({"appointment_date": "The appointment date can't be in the past."})
    elif appointment_date is not None:
        raise ValidationError({"appointment_date": "Only Scheduled calls take an appointment date."})
