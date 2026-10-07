import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ImportBatchDetail, ImportRow } from "../api/types";
import { ImportPreview } from "./ImportPreview";

function row(row_number: number, outcome: ImportRow["outcome"], messages: string[] = [], account = "AB1001"): ImportRow {
  return {
    row_number,
    outcome,
    messages,
    values: {
      account_number: account,
      patient_name: "Jane Testperson",
      dob: "1980-02-14",
      clinic: "Maple Clinic",
      visit_type: "Annual Physical",
      last_visit: "2024-09-10",
    },
  };
}

const batch: ImportBatchDetail = {
  id: 1,
  filename: "due.csv",
  status: "previewed",
  summary: { total: 5, create: 2, duplicate: 1, error: 2 },
  uploaded_by: { id: 1, username: "admin", display_name: "Alex Morgan" },
  created_at: "2026-10-07T14:00:00Z",
  committed_at: null,
  rows: [
    row(2, "create"),
    row(3, "duplicate", ["Duplicate of row 2 in this file."]),
    row(4, "error", ["DOB '1975-13-40' is not a valid date (use YYYY-MM-DD or MM/DD/YYYY)."], "AB1002"),
    row(5, "error", ["Account No is required."], ""),
    row(6, "create"),
  ],
};

describe("ImportPreview", () => {
  it("counts what will happen to each row", () => {
    render(<ImportPreview batch={batch} />);

    const summary = screen.getByRole("list", { name: "What this file will do" });
    expect(summary).toHaveTextContent("2 will be created");
    expect(summary).toHaveTextContent("1 skipped as duplicate");
    expect(summary).toHaveTextContent("2 rejected");
  });

  it("lists every row with its reason", () => {
    render(<ImportPreview batch={batch} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(6); // header + 5 rows
    expect(table).toHaveTextContent("DOB '1975-13-40' is not a valid date");
    expect(table).toHaveTextContent("Account No is required.");
    expect(table).toHaveTextContent("Duplicate of row 2 in this file.");
  });

  it("filters the rows by outcome", async () => {
    const user = userEvent.setup();
    render(<ImportPreview batch={batch} />);

    await user.click(screen.getByRole("radio", { name: "Rejected (2)" }));

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["4", "5"]);
  });

  it("talks about the past once the file is imported", () => {
    render(<ImportPreview batch={{ ...batch, status: "committed", committed_at: "2026-10-07T14:05:00Z" }} />);

    expect(screen.getByRole("list", { name: "What this file did" })).toHaveTextContent("2 created");
  });
});
