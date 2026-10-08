import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/endpoints";
import type { ImportBatchDetail, ImportSummary } from "../api/types";
import { renderWithProviders } from "../test/renderWithProviders";
import { ImportPage } from "./ImportPage";

vi.mock("../api/endpoints", () => ({
  api: { imports: vi.fn(), importDetail: vi.fn(), previewImport: vi.fn(), commitImport: vi.fn(), discardImport: vi.fn() },
}));

function preview(summary: Omit<ImportSummary, "total">): ImportBatchDetail {
  return {
    id: 3,
    filename: "demo_patients.csv",
    status: "previewed",
    summary: { total: summary.create + summary.duplicate + summary.error, ...summary },
    uploaded_by: { id: 1, username: "admin", display_name: "Alex Morgan" },
    created_at: "2026-10-08T17:50:00Z",
    committed_at: null,
    rows: [],
  };
}

async function upload(detail: ImportBatchDetail) {
  vi.mocked(api.previewImport).mockResolvedValue(detail);
  const user = userEvent.setup();
  const { container } = renderWithProviders(<ImportPage />, { path: "/import" });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  await user.upload(input as HTMLInputElement, new File(["csv"], "demo_patients.csv", { type: "text/csv" }));
  return user;
}

describe("ImportPage", () => {
  beforeEach(() => {
    vi.mocked(api.imports).mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  });

  it("imports a file whose only change is phone numbers for patients already in the system", async () => {
    const detail = preview({ create: 0, duplicate: 25, error: 8, phones: 15 });
    vi.mocked(api.commitImport).mockResolvedValue({ ...detail, status: "committed", committed_at: "2026-10-08T17:51:00Z" });
    const user = await upload(detail);

    expect(
      await screen.findByText(
        "Every row is a duplicate or was rejected, so no records will be created. " +
          "Importing saves 15 phone numbers for patients already in the system.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save 15 phone numbers" }));

    expect(api.commitImport).toHaveBeenCalledWith(3);
    expect(await screen.findByText("Saved 15 phone numbers from demo_patients.csv.")).toBeVisible();
  });

  it("has nothing to import when no row creates a record or changes a phone number", async () => {
    await upload(preview({ create: 0, duplicate: 25, error: 8, phones: 0 }));

    expect(await screen.findByRole("button", { name: "Nothing to import" })).toBeDisabled();
    expect(screen.getByText("Every row is a duplicate or was rejected, so this file has nothing to import.")).toBeVisible();
  });
});
