"""Reading and cleaning an uploaded patient CSV.

Pure functions with no database access: this module only answers "is each row
well-formed?". Whether a good row is a duplicate is decided in `planning`.
"""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime

from outreach.exceptions import DomainError

# Field key -> column label as it appears in the file header.
COLUMNS = {
    "account_number": "Account No",
    "patient_name": "Patient Name",
    "dob": "DOB",
    "clinic": "Clinic",
    "visit_type": "Visit Type",
    "last_visit": "Last Visit",
}
# Field key -> name used in row error messages, where "Account No" reads better spelled out.
# Messages about the header itself keep the exact column labels above.
FIELD_NAMES = {**COLUMNS, "account_number": "Account Number"}
MAX_LENGTHS = {"account_number": 50, "patient_name": 200, "clinic": 200, "visit_type": 200}
DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y")
EARLIEST_DOB = date(1900, 1, 1)


class CsvFileError(DomainError):
    """The file as a whole cannot be imported (as opposed to one bad row)."""


@dataclass(frozen=True)
class CleanRow:
    account_number: str
    patient_name: str
    dob: date
    clinic: str
    visit_type: str
    last_visit: date


@dataclass(frozen=True)
class ParsedRow:
    row_number: int  # Spreadsheet row number: the header is row 1.
    raw: dict  # Field key -> trimmed value as it appeared in the file.
    clean: CleanRow | None  # Set only when the row has no errors.
    errors: tuple[str, ...]


def decode_csv_bytes(data):
    # A NUL byte means the file isn't plain text, and Postgres can't store one in a text field.
    if b"\x00" in data:
        raise CsvFileError(
            "The file contains binary data, so it isn't a plain-text CSV. "
            "Save it as CSV (UTF-8) and upload it again."
        )
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvFileError("The file must be UTF-8 (or Windows-1252) encoded text.")


def normalize_account_number(value):
    return value.strip().upper()


def normalize_text(value):
    return " ".join(value.split())


def parse_date(value):
    value = value.strip()
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(value, date_format).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date: {value!r}")


def parse_csv(text, *, today, max_rows=None):
    """Parse CSV text into rows, each either cleaned or carrying its errors.

    Raises CsvFileError when the file itself is unusable (no header, missing
    columns, no data rows, too many rows).
    """
    reader = csv.reader(io.StringIO(text, newline=""))
    rows = []
    try:
        header = next(reader, None)
        if header is None or not any(cell.strip() for cell in header):
            raise CsvFileError("The file is empty.")
        column_index = _map_columns(header)
        header_width = len(_without_trailing_blanks(header))

        for row_number, values in enumerate(reader, start=2):
            if not any(value.strip() for value in values):
                continue  # Blank lines are ignored but still count as spreadsheet rows.
            if max_rows is not None and len(rows) >= max_rows:
                raise CsvFileError(f"The file has more than {max_rows:,} data rows.")
            rows.append(_parse_row(row_number, values, column_index, header_width, today))
    except csv.Error as exc:
        raise CsvFileError(f"The file could not be read as CSV: {exc}.") from exc

    if not rows:
        raise CsvFileError("The file has no data rows.")
    return rows


def _header_key(label):
    return normalize_text(label).lower()


def _map_columns(header):
    """Return field key -> column position, matching labels case-insensitively."""
    keys_by_label = {_header_key(label): key for key, label in COLUMNS.items()}
    column_index = {}
    for position, cell in enumerate(header):
        key = keys_by_label.get(_header_key(cell))
        if key is None:
            continue  # Unknown extra columns are ignored.
        if key in column_index:
            raise CsvFileError(f"Duplicate column: {COLUMNS[key]}.")
        column_index[key] = position

    missing = [label for key, label in COLUMNS.items() if key not in column_index]
    if missing:
        raise CsvFileError(f"Missing required column(s): {', '.join(missing)}.")
    return column_index


def _without_trailing_blanks(values):
    values = list(values)
    while values and not values[-1].strip():
        values.pop()
    return values


def _parse_row(row_number, values, column_index, header_width, today):
    raw = {
        key: values[position].strip() if position < len(values) else ""
        for key, position in column_index.items()
    }

    value_count = len(_without_trailing_blanks(values))
    if value_count > header_width:
        # Values are shifted, so per-field errors would only be noise.
        message = (
            f"Row has {value_count} values but the header has {header_width} columns "
            "(is a comma missing quotes?)."
        )
        return ParsedRow(row_number, raw, None, (message,))

    errors = []
    account_number = _text_field(raw, "account_number", errors, normalize_account_number)
    patient_name = _text_field(raw, "patient_name", errors)
    dob = _date_field(raw, "dob", errors, today, earliest=EARLIEST_DOB)
    clinic = _text_field(raw, "clinic", errors)
    visit_type = _text_field(raw, "visit_type", errors)
    last_visit = _date_field(raw, "last_visit", errors, today)
    if dob and last_visit and last_visit < dob:
        errors.append("Last Visit cannot be before DOB.")

    if errors:
        return ParsedRow(row_number, raw, None, tuple(errors))
    clean = CleanRow(account_number, patient_name, dob, clinic, visit_type, last_visit)
    return ParsedRow(row_number, raw, clean, ())


def _text_field(raw, key, errors, normalize=normalize_text):
    label = FIELD_NAMES[key]
    value = normalize(raw[key])
    if not value:
        errors.append(f"{label} is required.")
        return None
    if len(value) > MAX_LENGTHS[key]:
        errors.append(f"{label} is too long (max {MAX_LENGTHS[key]} characters).")
        return None
    return value


def _date_field(raw, key, errors, today, earliest=None):
    label = FIELD_NAMES[key]
    value = raw[key]
    if not value:
        errors.append(f"{label} is required.")
        return None
    try:
        parsed = parse_date(value)
    except ValueError:
        errors.append(f"{label} '{value}' is not a valid date (use YYYY-MM-DD or MM/DD/YYYY).")
        return None
    if parsed > today:
        errors.append(f"{label} cannot be in the future.")
        return None
    if earliest and parsed < earliest:
        errors.append(f"{label} cannot be before {earliest.year}.")
        return None
    return parsed
