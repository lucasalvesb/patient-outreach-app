import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/endpoints";
import type { OutreachAction, OutreachRecord, PatientWork } from "../api/types";
import { renderWithProviders } from "../test/renderWithProviders";
import { MyWorkPage } from "./MyWorkPage";

vi.mock("../api/endpoints", () => ({ api: { myWork: vi.fn(), logAction: vi.fn() } }));

const agent = { id: 2, username: "agent1", display_name: "Jamie Rivera" };

function record(id: number, visit_type: string, overrides: Partial<OutreachRecord> = {}): OutreachRecord {
  return {
    id,
    visit_type,
    clinic: "Maple Clinic",
    last_visit: "2024-09-10",
    status: "open",
    closed_at: null,
    created_at: "2026-10-01T09:00:00Z",
    actions: [],
    ...overrides,
  };
}

function patient(records: OutreachRecord[]): PatientWork {
  return {
    id: 7,
    account_number: "AB1001",
    name: "Jane Testperson",
    dob: "1980-02-14",
    assigned_to: agent,
    claimed_at: "2026-10-07T13:00:00Z",
    records,
  };
}

const notInterested: OutreachAction = {
  id: 90,
  action_type: "not_interested",
  action_label: "Not Interested",
  appointment_date: null,
  notes: "",
  agent,
  created_at: "2026-10-07T14:00:00Z",
};

describe("MyWorkPage", () => {
  it("shows the claimed patient's identity and open records", async () => {
    vi.mocked(api.myWork).mockResolvedValue([patient([record(11, "Annual Physical")])]);

    renderWithProviders(<MyWorkPage />, { path: "/my-work" });

    expect(await screen.findByRole("heading", { name: "Jane Testperson", level: 2 })).toBeVisible();
    expect(screen.getByRole("article", { name: "Annual Physical" })).toHaveTextContent("Maple Clinic");
    expect(screen.getByText("Confirm the name and date of birth before discussing any visit.")).toBeVisible();
  });

  it("releases the patient once their last open record is closed", async () => {
    const open = record(11, "Annual Physical");
    vi.mocked(api.myWork).mockResolvedValueOnce([patient([open])]).mockResolvedValue([]);
    vi.mocked(api.logAction).mockResolvedValue({
      action: notInterested,
      record: { ...open, status: "closed", closed_at: notInterested.created_at, actions: [notInterested] },
      patient_released: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<MyWorkPage />, { path: "/my-work" });

    await user.click(await screen.findByRole("radio", { name: "Not Interested" }));
    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(api.logAction).toHaveBeenCalledWith(11, { action_type: "not_interested", notes: "" });
    expect(
      await screen.findByText("All of Jane Testperson's records are closed, so they have been released."),
    ).toBeVisible();
    expect(await screen.findByRole("heading", { name: "You haven't claimed anyone" })).toBeVisible();
  });
});
