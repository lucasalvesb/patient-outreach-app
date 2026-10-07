"""Read-side queries used by the API views."""

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, Max, Min, OuterRef, Prefetch, Q

from .models import OutreachAction, OutreachRecord, Patient, RecordStatus

_OPEN = Q(records__status=RecordStatus.OPEN)


def records_with_history():
    """Records with their calls (newest first) and who made each call."""
    return OutreachRecord.objects.prefetch_related(
        Prefetch("actions", queryset=OutreachAction.objects.select_related("agent"))
    )


def patients_with_history():
    """Patients with every record (open and closed) and each record's calls."""
    return Patient.objects.select_related("assigned_to").prefetch_related(
        Prefetch("records", queryset=records_with_history())
    )


def pool_patients(search=""):
    """Unassigned patients with at least one open record, most overdue first."""
    patients = (
        Patient.objects.filter(assigned_to__isnull=True)
        .annotate(
            open_record_count=Count("records", filter=_OPEN),
            oldest_last_visit=Min("records__last_visit", filter=_OPEN),
        )
        .filter(open_record_count__gt=0)
        .prefetch_related(
            Prefetch(
                "records",
                queryset=OutreachRecord.objects.filter(status=RecordStatus.OPEN),
                to_attr="open_records",
            )
        )
        .order_by("oldest_last_visit", "name", "id")
    )
    return _search(patients, search)


def agent_work(user):
    """The patients an agent has claimed, in the order they claimed them."""
    return patients_with_history().filter(assigned_to=user).order_by("claimed_at", "id")


def admin_patients(*, search="", status="", agent="", clinic="", visit_type=""):
    """All patients with assignment and record counts, filtered for the admin view.

    `status` is "open" (has an open record) or "closed" (every record closed).
    `agent` is a user id or "unassigned". `clinic` and `visit_type` match any of
    the patient's records (an open one when status is "open"), ignoring case.
    """
    patients = (
        Patient.objects.select_related("assigned_to")
        .annotate(
            open_record_count=Count("records", filter=_OPEN, distinct=True),
            closed_record_count=Count(
                "records", filter=Q(records__status=RecordStatus.CLOSED), distinct=True
            ),
            last_action_at=Max("records__actions__created_at"),
        )
        .prefetch_related("records")
        .order_by("name", "id")
    )
    patients = _search(patients, search)

    if agent == "unassigned":
        patients = patients.filter(assigned_to__isnull=True)
    elif agent:
        patients = patients.filter(assigned_to_id=agent)

    matching = OutreachRecord.objects.filter(patient=OuterRef("pk"))
    if clinic:
        matching = matching.filter(clinic__iexact=clinic)
    if visit_type:
        matching = matching.filter(visit_type__iexact=visit_type)
    if status == "open":
        patients = patients.filter(Exists(matching.filter(status=RecordStatus.OPEN)))
    elif status == "closed":
        any_open = OutreachRecord.objects.filter(patient=OuterRef("pk"), status=RecordStatus.OPEN)
        patients = patients.filter(Exists(matching)).filter(~Exists(any_open))
    elif clinic or visit_type:
        patients = patients.filter(Exists(matching))
    return patients


@dataclass(frozen=True)
class FilterOptions:
    clinics: list
    visit_types: list
    agents: list


def filter_options():
    records = OutreachRecord.objects.order_by()
    return FilterOptions(
        clinics=list(records.values_list("clinic", flat=True).distinct().order_by("clinic")),
        visit_types=list(records.values_list("visit_type", flat=True).distinct().order_by("visit_type")),
        agents=list(get_user_model().objects.filter(is_active=True).order_by("username")),
    )


def _search(patients, search):
    search = search.strip()
    if not search:
        return patients
    return patients.filter(Q(name__icontains=search) | Q(account_number__icontains=search))
