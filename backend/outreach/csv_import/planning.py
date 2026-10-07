"""Deciding what each parsed row will do: create a record, skip it as a duplicate, or reject it.

Pure: the caller passes in what the database already holds (`ExistingData`), so the
same plan is computed for the preview and again, against fresh data, for the commit.
"""

from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import date
from enum import StrEnum

from .parsing import CleanRow, normalize_text

EXISTING_DUPLICATE_MESSAGE = "A record for this patient, visit type and last visit already exists."


class Outcome(StrEnum):
    CREATE = "create"
    DUPLICATE = "duplicate"
    ERROR = "error"


@dataclass(frozen=True)
class PatientIdentity:
    name: str
    dob: date

    def mismatched_fields(self, name, dob):
        fields = []
        if _name_key(name) != _name_key(self.name):
            fields.append("Name")
        if dob != self.dob:
            fields.append("DOB")
        return fields

    def describe(self):
        return f"{self.name}, DOB {self.dob.isoformat()}"


@dataclass(frozen=True)
class ExistingData:
    """What the database already holds that matters for planning an import."""

    patients: dict = field(default_factory=dict)  # account number -> PatientIdentity
    record_keys: set = field(default_factory=set)  # see record_key()
    clinics: set = field(default_factory=set)  # spellings already in use
    visit_types: set = field(default_factory=set)


@dataclass(frozen=True)
class PlannedRow:
    row_number: int
    outcome: Outcome
    values: dict  # What to show for the row: cleaned values, or the raw ones for errors.
    messages: tuple[str, ...]
    clean: CleanRow | None = None

    def as_dict(self):
        return {
            "row_number": self.row_number,
            "outcome": self.outcome.value,
            "values": self.values,
            "messages": list(self.messages),
        }


def record_key(account_number, visit_type, last_visit):
    """The duplicate rule: same patient + visit type (any case) + last visit."""
    return (account_number, visit_type.lower(), last_visit)


def plan_import(rows, existing):
    clinics = _SpellingBook(existing.clinics)
    visit_types = _SpellingBook(existing.visit_types)
    # account number -> (identity, row number that introduced it, or None if from the database)
    identities = {account: (identity, None) for account, identity in existing.patients.items()}
    rows_creating = {}  # record key -> row number that will create it

    planned = []
    for row in rows:
        if row.clean is None:
            planned.append(PlannedRow(row.row_number, Outcome.ERROR, dict(row.raw), row.errors))
            continue

        clean = row.clean
        if clean.account_number in identities:
            identity, source_row = identities[clean.account_number]
            mismatched = identity.mismatched_fields(clean.patient_name, clean.dob)
            if mismatched:
                message = _identity_message(mismatched, clean.account_number, identity, source_row)
                planned.append(PlannedRow(row.row_number, Outcome.ERROR, _display_values(clean), (message,)))
                continue

        clean = replace(
            clean,
            clinic=clinics.canonical(clean.clinic),
            visit_type=visit_types.canonical(clean.visit_type),
        )
        key = record_key(clean.account_number, clean.visit_type, clean.last_visit)
        if key in existing.record_keys:
            outcome, messages = Outcome.DUPLICATE, (EXISTING_DUPLICATE_MESSAGE,)
        elif key in rows_creating:
            outcome, messages = Outcome.DUPLICATE, (f"Duplicate of row {rows_creating[key]} in this file.",)
        else:
            outcome, messages = Outcome.CREATE, ()
            rows_creating[key] = row.row_number
            clinics.add(clean.clinic)
            visit_types.add(clean.visit_type)
            identities.setdefault(
                clean.account_number, (PatientIdentity(clean.patient_name, clean.dob), row.row_number)
            )
        planned.append(PlannedRow(row.row_number, outcome, _display_values(clean), messages, clean))
    return planned


def summarize(planned):
    counts = Counter(row.outcome for row in planned)
    return {"total": len(planned), **{outcome.value: counts[outcome] for outcome in Outcome}}


def _name_key(name):
    return normalize_text(name).casefold()


def _identity_message(mismatched, account_number, identity, source_row):
    what = " and ".join(mismatched)
    verb = "don't" if len(mismatched) > 1 else "doesn't"
    if source_row is None:
        where = f"the existing patient with account {account_number}"
    else:
        where = f"row {source_row} for account {account_number}"
    return f"{what} {verb} match {where} ({identity.describe()})."


def _display_values(clean):
    return {
        "account_number": clean.account_number,
        "patient_name": clean.patient_name,
        "dob": clean.dob.isoformat(),
        "clinic": clean.clinic,
        "visit_type": clean.visit_type,
        "last_visit": clean.last_visit.isoformat(),
    }


class _SpellingBook:
    """One canonical spelling per case-insensitive name; the first one seen wins."""

    def __init__(self, names):
        self._by_key = {}
        for name in sorted(names):
            self.add(name)

    def canonical(self, name):
        return self._by_key.get(name.lower(), name)

    def add(self, name):
        self._by_key.setdefault(name.lower(), name)
