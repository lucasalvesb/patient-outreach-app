from datetime import date

from outreach.csv_import.parsing import parse_csv
from outreach.csv_import.planning import ExistingData, Outcome, PatientIdentity, plan_import, summarize
from outreach.tests.csv_samples import SAMPLE_CSV, csv_text

TODAY = date(2026, 10, 7)
JANE = PatientIdentity(name="Jane Testperson", dob=date(1980, 2, 14))


def plan(text, existing=None):
    return plan_import(parse_csv(text, today=TODAY), existing or ExistingData())


def outcomes(planned):
    return [(row.row_number, row.outcome) for row in planned]


def test_sample_file_plan():
    planned = plan(SAMPLE_CSV)

    assert outcomes(planned) == [
        (2, Outcome.CREATE),
        (3, Outcome.DUPLICATE),
        (4, Outcome.ERROR),
        (5, Outcome.ERROR),
        (6, Outcome.CREATE),
    ]
    assert planned[1].messages == ("Duplicate of row 2 in this file.",)
    assert summarize(planned) == {"total": 5, "create": 2, "duplicate": 1, "error": 2}


def test_row_matching_an_existing_record_is_a_duplicate():
    existing = ExistingData(
        patients={"AB1001": JANE},
        record_keys={("AB1001", "annual physical", date(2024, 9, 10))},
    )

    planned = plan(csv_text("ab1001,Jane Testperson,1980-02-14,Maple Clinic,ANNUAL PHYSICAL,2024-09-10"), existing)

    assert outcomes(planned) == [(2, Outcome.DUPLICATE)]
    assert planned[0].messages == ("A record for this patient, visit type and last visit already exists.",)


def test_same_visit_type_with_a_newer_last_visit_is_created():
    existing = ExistingData(
        patients={"AB1001": JANE},
        record_keys={("AB1001", "annual physical", date(2024, 9, 10))},
    )

    planned = plan(csv_text("AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2025-09-10"), existing)

    assert outcomes(planned) == [(2, Outcome.CREATE)]


def test_dob_that_conflicts_with_the_existing_patient_is_an_error():
    existing = ExistingData(patients={"AB1001": JANE})

    planned = plan(csv_text("AB1001,Jane Testperson,1981-02-14,Maple Clinic,Annual Physical,2024-09-10"), existing)

    assert outcomes(planned) == [(2, Outcome.ERROR)]
    assert planned[0].messages == (
        "DOB doesn't match the existing patient with account AB1001 (Jane Testperson, DOB 1980-02-14).",
    )


def test_name_that_conflicts_with_the_existing_patient_is_an_error():
    existing = ExistingData(patients={"AB1001": JANE})

    planned = plan(csv_text("AB1001,Janet Smith,1980-02-14,Maple Clinic,Annual Physical,2024-09-10"), existing)

    assert planned[0].messages == (
        "Name doesn't match the existing patient with account AB1001 (Jane Testperson, DOB 1980-02-14).",
    )


def test_name_comparison_ignores_case_and_spacing():
    existing = ExistingData(patients={"AB1001": JANE})

    planned = plan(csv_text("AB1001,JANE   testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10"), existing)

    assert outcomes(planned) == [(2, Outcome.CREATE)]


def test_conflicting_identity_within_the_file_is_an_error():
    planned = plan(
        csv_text(
            "AB2001,Pat Lee,1975-01-05,Oak Clinic,Annual Physical,2025-01-05",
            "AB2001,Patricia Lee,1975-05-01,Oak Clinic,Flu Shot,2025-01-05",
        )
    )

    assert outcomes(planned) == [(2, Outcome.CREATE), (3, Outcome.ERROR)]
    assert planned[1].messages == (
        "Name and DOB don't match row 2 for account AB2001 (Pat Lee, DOB 1975-01-05).",
    )


def test_identity_conflict_wins_over_duplicate():
    existing = ExistingData(
        patients={"AB1001": JANE},
        record_keys={("AB1001", "annual physical", date(2024, 9, 10))},
    )

    planned = plan(csv_text("AB1001,Jane Testperson,1990-02-14,Maple Clinic,Annual Physical,2024-09-10"), existing)

    assert outcomes(planned) == [(2, Outcome.ERROR)]


def test_clinic_and_visit_type_reuse_the_existing_spelling():
    existing = ExistingData(clinics={"Maple Clinic"}, visit_types={"Annual Physical"})

    planned = plan(csv_text("AB1001,Jane Testperson,1980-02-14,maple clinic,annual physical,2024-09-10"), existing)

    assert planned[0].clean.clinic == "Maple Clinic"
    assert planned[0].clean.visit_type == "Annual Physical"


def test_first_spelling_in_the_file_wins_for_new_names():
    planned = plan(
        csv_text(
            "AB1001,Jane Testperson,1980-02-14,Oak Clinic,Flu Shot,2024-09-10",
            "AB1001,Jane Testperson,1980-02-14,OAK CLINIC,Annual Physical,2024-09-10",
        )
    )

    assert [row.clean.clinic for row in planned] == ["Oak Clinic", "Oak Clinic"]


def test_rows_serialize_cleaned_values_or_raw_values_with_reasons():
    created, _, rejected, _, _ = plan(SAMPLE_CSV)

    assert created.as_dict() == {
        "row_number": 2,
        "outcome": "create",
        "values": {
            "account_number": "AB1001",
            "patient_name": "Jane Testperson",
            "dob": "1980-02-14",
            "clinic": "Maple Clinic",
            "visit_type": "Annual Physical",
            "last_visit": "2024-09-10",
        },
        "messages": [],
    }
    assert rejected.as_dict() == {
        "row_number": 4,
        "outcome": "error",
        "values": {
            "account_number": "AB1002",
            "patient_name": "Lee, Pat",
            "dob": "1975-13-40",
            "clinic": "Oak Clinic",
            "visit_type": "Annual Physical",
            "last_visit": "2025-01-05",
        },
        "messages": ["DOB '1975-13-40' is not a valid date (use YYYY-MM-DD or MM/DD/YYYY)."],
    }
