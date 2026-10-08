from datetime import date

import pytest

from outreach.csv_import.parsing import (
    CleanRow,
    CsvFileError,
    decode_csv_bytes,
    normalize_account_number,
    normalize_text,
    parse_csv,
    parse_date,
)
from outreach.tests.csv_samples import SAMPLE_CSV, csv_text

TODAY = date(2026, 10, 7)


def parse(text, **kwargs):
    return parse_csv(text, today=TODAY, **kwargs)


def only_row(text):
    rows = parse(text)
    assert len(rows) == 1
    return rows[0]


class TestNormalization:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [(" ab123 ", "AB123"), ("AB1001", "AB1001"), ("\tab1001 ", "AB1001")],
    )
    def test_account_numbers_are_trimmed_and_uppercased(self, raw, expected):
        assert normalize_account_number(raw) == expected

    def test_text_is_trimmed_and_inner_whitespace_collapsed(self):
        assert normalize_text("  Maple   Clinic \t") == "Maple Clinic"


class TestParseDate:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("1980-02-14", date(1980, 2, 14)),
            ("02/14/1980", date(1980, 2, 14)),
            ("2/4/1980", date(1980, 2, 4)),
            (" 2024-09-10 ", date(2024, 9, 10)),
        ],
    )
    def test_accepts_iso_and_us_formats(self, raw, expected):
        assert parse_date(raw) == expected

    @pytest.mark.parametrize(
        "raw", ["1975-13-40", "2023-02-29", "14/02/1980", "02/14/80", "yesterday", "1980/02/14"]
    )
    def test_rejects_invalid_or_ambiguous_dates(self, raw):
        with pytest.raises(ValueError):
            parse_date(raw)


class TestFileStructure:
    def test_headers_match_ignoring_case_and_extra_spaces(self):
        text = (
            " account no ,PATIENT NAME,dob,Clinic,visit  type,Last Visit\n"
            "AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10\n"
        )
        assert only_row(text).errors == ()

    def test_missing_columns_reject_the_whole_file(self):
        text = "Account No,Patient Name,Visit Type,Last Visit\nAB1001,Jane,Annual Physical,2024-09-10\n"
        with pytest.raises(CsvFileError, match="Missing required column\\(s\\): DOB, Clinic"):
            parse(text)

    def test_duplicate_columns_reject_the_whole_file(self):
        text = "Account No,Patient Name,DOB,Clinic,Clinic,Visit Type,Last Visit\n"
        with pytest.raises(CsvFileError, match="Duplicate column: Clinic"):
            parse(text)

    def test_empty_file_is_rejected(self):
        with pytest.raises(CsvFileError, match="The file is empty"):
            parse("")

    def test_file_with_only_a_header_is_rejected(self):
        with pytest.raises(CsvFileError, match="no data rows"):
            parse(csv_text())

    def test_unknown_extra_columns_are_ignored(self):
        text = (
            "Account No,Patient Name,DOB,Clinic,Visit Type,Last Visit,Notes\n"
            "AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10,call after 5\n"
        )
        assert only_row(text).errors == ()

    def test_too_many_rows_reject_the_whole_file(self):
        row = "AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10"
        with pytest.raises(CsvFileError, match="more than 2 data rows"):
            parse(csv_text(row, row, row), max_rows=2)


class TestRows:
    def test_valid_row_is_cleaned(self):
        row = only_row(csv_text(" ab1001 ,Jane  Testperson,02/14/1980,maple clinic, annual physical ,2024-09-10"))

        assert row.errors == ()
        assert row.clean == CleanRow(
            account_number="AB1001",
            patient_name="Jane Testperson",
            dob=date(1980, 2, 14),
            clinic="maple clinic",
            visit_type="annual physical",
            last_visit=date(2024, 9, 10),
        )

    def test_sample_file_rows(self):
        rows = parse(SAMPLE_CSV)

        assert [row.row_number for row in rows] == [2, 3, 4, 5, 6]
        assert [row.errors == () for row in rows] == [True, True, False, False, True]
        assert rows[2].errors == ("DOB '1975-13-40' is not a valid date (use YYYY-MM-DD or MM/DD/YYYY).",)
        assert rows[3].errors == ("Account Number is required.",)

    def test_raw_values_are_kept_for_display(self):
        row = parse(SAMPLE_CSV)[2]

        assert row.clean is None
        assert row.raw["patient_name"] == "Lee, Pat"
        assert row.raw["dob"] == "1975-13-40"

    def test_row_numbers_match_spreadsheet_rows_when_blank_lines_are_skipped(self):
        good = "AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10"
        rows = parse(csv_text(good, "", ",,,,,", good.replace("2024", "2023")))

        assert [row.row_number for row in rows] == [2, 5]

    def test_every_problem_in_a_row_is_reported(self):
        row = only_row(csv_text("AB1001,,1980-02-14,,Annual Physical,not-a-date"))

        assert row.errors == (
            "Patient Name is required.",
            "Clinic is required.",
            "Last Visit 'not-a-date' is not a valid date (use YYYY-MM-DD or MM/DD/YYYY).",
        )

    def test_short_rows_report_the_missing_values(self):
        row = only_row(csv_text("AB1001,Jane Testperson"))

        assert row.errors == (
            "DOB is required.",
            "Clinic is required.",
            "Visit Type is required.",
            "Last Visit is required.",
        )

    def test_dates_in_the_future_are_rejected(self):
        row = only_row(csv_text("AB1001,Jane Testperson,2026-10-08,Maple Clinic,Annual Physical,2026-10-08"))

        assert row.errors == ("DOB cannot be in the future.", "Last Visit cannot be in the future.")

    def test_today_is_a_valid_last_visit(self):
        row = only_row(csv_text("AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2026-10-07"))

        assert row.errors == ()

    def test_last_visit_before_dob_is_rejected(self):
        row = only_row(csv_text("AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,1979-01-01"))

        assert row.errors == ("Last Visit cannot be before DOB.",)

    def test_dob_before_1900_is_rejected(self):
        row = only_row(csv_text("AB1001,Jane Testperson,1899-12-31,Maple Clinic,Annual Physical,2024-09-10"))

        assert row.errors == ("DOB cannot be before 1900.",)

    def test_unquoted_comma_shifting_values_is_reported(self):
        row = only_row(csv_text("AB1002,Lee, Pat,1975-01-05,Oak Clinic,Annual Physical,2025-01-05"))

        assert row.errors == ("Row has 7 values but the header has 6 columns (is a comma missing quotes?).",)

    def test_trailing_empty_values_are_ignored(self):
        row = only_row(csv_text("AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10,,"))

        assert row.errors == ()

    def test_overlong_values_are_rejected(self):
        row = only_row(csv_text(f"{'A' * 51},Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10"))

        assert row.errors == ("Account Number is too long (max 50 characters).",)


class TestDecoding:
    def test_utf8_byte_order_mark_is_removed(self):
        assert decode_csv_bytes("﻿Account No".encode("utf-8")) == "Account No"

    def test_windows_1252_files_are_accepted(self):
        assert decode_csv_bytes("José".encode("cp1252")) == "José"

    def test_undecodable_files_are_rejected(self):
        with pytest.raises(CsvFileError, match="UTF-8"):
            decode_csv_bytes(b"\x81\x8d")
