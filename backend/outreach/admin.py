from django.contrib import admin

from .models import ImportBatch, OutreachAction, OutreachRecord, Patient


class OutreachRecordInline(admin.TabularInline):
    model = OutreachRecord
    extra = 0
    fields = ["visit_type", "clinic", "last_visit", "status", "closed_at"]
    readonly_fields = fields


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ["account_number", "name", "dob", "assigned_to", "claimed_at"]
    list_filter = ["assigned_to"]
    search_fields = ["account_number", "name"]
    inlines = [OutreachRecordInline]


class OutreachActionInline(admin.TabularInline):
    model = OutreachAction
    extra = 0
    fields = ["created_at", "agent", "action_type", "appointment_date", "notes"]
    readonly_fields = fields


@admin.register(OutreachRecord)
class OutreachRecordAdmin(admin.ModelAdmin):
    list_display = ["patient", "visit_type", "clinic", "last_visit", "status"]
    list_filter = ["status", "clinic", "visit_type"]
    search_fields = ["patient__account_number", "patient__name"]
    inlines = [OutreachActionInline]


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = ["filename", "status", "uploaded_by", "created_at", "committed_at"]
    list_filter = ["status"]
    exclude = ["content"]
