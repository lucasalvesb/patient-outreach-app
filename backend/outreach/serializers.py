from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.serializers import UserSummarySerializer

from .models import ActionType, ImportBatch, OutreachAction, OutreachRecord, Patient


def _distinct_sorted(values):
    return sorted(set(values), key=str.casefold)


class ActionSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(source="get_action_type_display", read_only=True)
    agent = UserSummarySerializer(read_only=True)

    class Meta:
        model = OutreachAction
        fields = ["id", "action_type", "action_label", "appointment_date", "notes", "agent", "created_at"]


class RecordSerializer(serializers.ModelSerializer):
    actions = ActionSerializer(many=True, read_only=True)

    class Meta:
        model = OutreachRecord
        fields = ["id", "clinic", "visit_type", "last_visit", "status", "closed_at", "created_at", "actions"]


class PatientWorkSerializer(serializers.ModelSerializer):
    """A patient with every record and each record's call history."""

    assigned_to = UserSummarySerializer(read_only=True)
    records = RecordSerializer(many=True, read_only=True)

    class Meta:
        model = Patient
        fields = ["id", "account_number", "name", "dob", "assigned_to", "claimed_at", "records"]


class PoolPatientSerializer(serializers.ModelSerializer):
    """Expects the queryset from selectors.pool_patients()."""

    open_record_count = serializers.IntegerField(read_only=True)
    oldest_last_visit = serializers.DateField(read_only=True)
    visit_types = serializers.SerializerMethodField()
    clinics = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "account_number",
            "name",
            "dob",
            "open_record_count",
            "oldest_last_visit",
            "visit_types",
            "clinics",
        ]

    def get_visit_types(self, patient):
        return _distinct_sorted(record.visit_type for record in patient.open_records)

    def get_clinics(self, patient):
        return _distinct_sorted(record.clinic for record in patient.open_records)


class AdminPatientSerializer(serializers.ModelSerializer):
    """Expects the queryset from selectors.admin_patients()."""

    assigned_to = UserSummarySerializer(read_only=True)
    open_record_count = serializers.IntegerField(read_only=True)
    closed_record_count = serializers.IntegerField(read_only=True)
    last_action_at = serializers.DateTimeField(read_only=True)
    visit_types = serializers.SerializerMethodField()
    clinics = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "account_number",
            "name",
            "dob",
            "assigned_to",
            "claimed_at",
            "open_record_count",
            "closed_record_count",
            "last_action_at",
            "visit_types",
            "clinics",
        ]

    def get_visit_types(self, patient):
        return _distinct_sorted(record.visit_type for record in patient.records.all())

    def get_clinics(self, patient):
        return _distinct_sorted(record.clinic for record in patient.records.all())


class AdminPatientFilterSerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=["open", "closed"], required=False, allow_blank=True, default="")
    agent = serializers.CharField(required=False, allow_blank=True, default="")
    clinic = serializers.CharField(required=False, allow_blank=True, default="")
    visit_type = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_agent(self, value):
        if value and value != "unassigned" and not value.isdigit():
            raise serializers.ValidationError("Use a user id or 'unassigned'.")
        return value


class LogActionSerializer(serializers.Serializer):
    action_type = serializers.ChoiceField(choices=ActionType.choices)
    appointment_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")


class ReassignSerializer(serializers.Serializer):
    agent_id = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(is_active=True), allow_null=True
    )


class ImportUploadSerializer(serializers.Serializer):
    file = serializers.FileField(error_messages={"required": "Choose a CSV file to upload."})


class ImportBatchSerializer(serializers.ModelSerializer):
    uploaded_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = ImportBatch
        fields = ["id", "filename", "status", "summary", "uploaded_by", "created_at", "committed_at"]


class ImportBatchDetailSerializer(ImportBatchSerializer):
    class Meta(ImportBatchSerializer.Meta):
        fields = ImportBatchSerializer.Meta.fields + ["rows"]
