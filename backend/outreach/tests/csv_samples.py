# The starter file from the assignment, verbatim (intentionally messy).
SAMPLE_CSV = """Account No,Patient Name,DOB,Clinic,Visit Type,Last Visit
AB1001,Jane Testperson,1980-02-14,Maple Clinic,Annual Physical,2024-09-10
ab1001 ,Jane Testperson,02/14/1980,maple clinic,annual physical,2024-09-10
AB1002,"Lee, Pat",1975-13-40,Oak Clinic,Annual Physical,2025-01-05
,No Account,1990-01-01,Maple Clinic,Annual Physical,2025-02-01
AB1001,Jane Testperson,1980-02-14,Maple Clinic,Diabetes Follow-Up,2025-03-01
"""

HEADER = "Account No,Patient Name,DOB,Clinic,Visit Type,Last Visit\n"


def csv_text(*rows):
    """Build a CSV with the standard header from raw row strings."""
    return HEADER + "".join(f"{row}\n" for row in rows)
