from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


class RecordStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"


class ActionType(models.TextChoices):
    NO_ANSWER = "no_answer", "No Answer"
    VOICEMAIL = "voicemail", "Voicemail"
    SCHEDULED = "scheduled", "Scheduled"
    NOT_INTERESTED = "not_interested", "Not Interested"

    @property
    def closes_record(self):
        return self in {ActionType.SCHEDULED, ActionType.NOT_INTERESTED}


class ImportStatus(models.TextChoices):
    PREVIEWED = "previewed", "Previewed"
    COMMITTED = "committed", "Committed"


class Patient(models.Model):
    """A person to reach out to. Identified by the (normalized) account number."""

    account_number = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    dob = models.DateField()
    # As the latest import wrote it; blank when no file has given one.
    phone = models.CharField(max_length=30, blank=True, default="")
    # The agent currently working this patient; null means the patient is in the pool
    # (if they have open records) or simply has nothing left to work.
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="claimed_patients",
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "account_number"]

    def __str__(self):
        return f"{self.name} ({self.account_number})"


class ImportBatch(models.Model):
    """One uploaded CSV: its preview, and once confirmed, the result of the import."""

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="import_batches"
    )
    filename = models.CharField(max_length=255)
    # The decoded file is kept so the commit re-validates exactly what was previewed.
    content = models.TextField()
    status = models.CharField(
        max_length=20, choices=ImportStatus.choices, default=ImportStatus.PREVIEWED
    )
    # Per-row outcomes and their counts, from the preview or (once committed) the import.
    rows = models.JSONField(default=list)
    summary = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    committed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "import batches"

    def __str__(self):
        return f"{self.filename} ({self.status})"


class OutreachRecord(models.Model):
    """One visit a patient is due for. Closed by a Scheduled or Not Interested call."""

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="records")
    clinic = models.CharField(max_length=200)
    visit_type = models.CharField(max_length=200)
    last_visit = models.DateField()
    status = models.CharField(max_length=10, choices=RecordStatus.choices, default=RecordStatus.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    import_batch = models.ForeignKey(
        ImportBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="records"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["last_visit", "id"]
        constraints = [
            # The duplicate rule: same patient + visit type + last visit.
            models.UniqueConstraint(
                "patient",
                Lower("visit_type"),
                "last_visit",
                name="unique_record_per_patient_visit_type_last_visit",
            ),
        ]
        indexes = [models.Index(fields=["patient", "status"], name="record_patient_status_idx")]

    def __str__(self):
        return f"{self.visit_type} for {self.patient} (last visit {self.last_visit})"


class OutreachAction(models.Model):
    """A logged call attempt on a record."""

    record = models.ForeignKey(OutreachRecord, on_delete=models.CASCADE, related_name="actions")
    agent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="outreach_actions"
    )
    action_type = models.CharField(max_length=20, choices=ActionType.choices)
    appointment_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(action_type=ActionType.SCHEDULED, appointment_date__isnull=False)
                    | (~Q(action_type=ActionType.SCHEDULED) & Q(appointment_date__isnull=True))
                ),
                name="appointment_date_required_only_for_scheduled",
            ),
        ]

    def __str__(self):
        return f"{self.get_action_type_display()} on record {self.record_id}"
