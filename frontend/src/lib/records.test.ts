import { describe, expect, it } from "vitest";
import type { ActionType, OutreachAction, OutreachRecord } from "../api/types";
import { closingAction } from "./records";

function action(id: number, action_type: ActionType): OutreachAction {
  return {
    id,
    action_type,
    action_label: action_type,
    appointment_date: action_type === "scheduled" ? "2026-10-20" : null,
    notes: "",
    agent: { id: 1, username: "agent1", display_name: "Jamie Rivera" },
    created_at: "2026-10-07T14:00:00Z",
  };
}

function record(status: OutreachRecord["status"], actions: OutreachAction[]): OutreachRecord {
  return {
    id: 1,
    clinic: "Maple Clinic",
    visit_type: "Annual Physical",
    last_visit: "2024-09-10",
    status,
    closed_at: status === "closed" ? "2026-10-07T14:00:00Z" : null,
    created_at: "2026-10-01T09:00:00Z",
    actions,
  };
}

describe("closingAction", () => {
  it("is the call that closed the record", () => {
    const scheduled = action(3, "scheduled");

    expect(closingAction(record("closed", [scheduled, action(2, "voicemail"), action(1, "no_answer")]))).toBe(
      scheduled,
    );
  });

  it("is missing while the record is open", () => {
    expect(closingAction(record("open", [action(1, "no_answer")]))).toBeUndefined();
  });
});
