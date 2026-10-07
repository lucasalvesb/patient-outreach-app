import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Page, PatientWork, PoolPatient } from "../api/types";
import { renderWithProviders } from "../test/renderWithProviders";
import { PoolPage } from "./PoolPage";

vi.mock("../api/endpoints", () => ({ api: { pool: vi.fn(), claim: vi.fn(), myWork: vi.fn() } }));

const jane: PoolPatient = {
  id: 7,
  account_number: "AB1001",
  name: "Jane Testperson",
  dob: "1980-02-14",
  open_record_count: 2,
  oldest_last_visit: "2024-09-10",
  visit_types: ["Annual Physical", "Diabetes Follow-Up"],
  clinics: ["Maple Clinic"],
};

function page(results: PoolPatient[]): Page<PoolPatient> {
  return { count: results.length, next: null, previous: null, results };
}

describe("PoolPage", () => {
  it("shows who is waiting and what they are due for", async () => {
    vi.mocked(api.pool).mockResolvedValue(page([jane]));

    renderWithProviders(<PoolPage />);

    const row = await screen.findByRole("row", { name: /Jane Testperson/ });
    expect(row).toHaveTextContent("AB1001");
    expect(row).toHaveTextContent("Annual Physical, Diabetes Follow-Up");
    expect(row).toHaveTextContent("Sep 10, 2024");
  });

  it("confirms a claim with a link to the patient", async () => {
    vi.mocked(api.pool).mockResolvedValueOnce(page([jane])).mockResolvedValue(page([]));
    vi.mocked(api.claim).mockResolvedValue({} as PatientWork);
    renderWithProviders(<PoolPage />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Claim Jane Testperson" }));

    expect(await screen.findByText("Jane Testperson is now in your work.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/my-work?patient=7");
    expect(api.claim).toHaveBeenCalledWith(7);
  });

  it("explains when another agent claimed the patient first, and refreshes the list", async () => {
    vi.mocked(api.pool).mockResolvedValueOnce(page([jane])).mockResolvedValue(page([]));
    vi.mocked(api.claim).mockRejectedValue(
      new ApiError(409, { detail: "This patient was already claimed by another agent." }),
    );
    renderWithProviders(<PoolPage />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Claim Jane Testperson" }));

    expect(await screen.findByText("This patient was already claimed by another agent.")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Nobody is waiting" })).toBeVisible();
  });
});
