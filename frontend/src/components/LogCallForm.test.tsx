import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { LogCallForm } from "./LogCallForm";

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  render(<LogCallForm onSubmit={onSubmit} today="2026-10-07" />);
  return { user, onSubmit };
}

describe("LogCallForm", () => {
  it("offers the four outcomes and says which ones close the record", () => {
    setup();

    expect(screen.getByRole("radio", { name: "No Answer" })).toHaveAccessibleDescription("Stays open");
    expect(screen.getByRole("radio", { name: "Voicemail" })).toHaveAccessibleDescription("Stays open");
    expect(screen.getByRole("radio", { name: "Scheduled" })).toHaveAccessibleDescription("Closes the record");
    expect(screen.getByRole("radio", { name: "Not Interested" })).toHaveAccessibleDescription(
      "Closes the record",
    );
  });

  it("asks for an appointment date only when the call was Scheduled", async () => {
    const { user } = setup();

    expect(screen.queryByLabelText("Appointment date")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Scheduled/ }));

    expect(screen.getByLabelText("Appointment date")).toHaveAttribute("min", "2026-10-07");
  });

  it("needs an outcome before logging", async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose how the call went.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("needs the appointment date for Scheduled", async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole("radio", { name: /Scheduled/ }));
    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the appointment date.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("logs the outcome with notes", async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole("radio", { name: /No Answer/ }));
    await user.type(screen.getByLabelText("Notes (optional)"), "Rang 10 times");
    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(onSubmit).toHaveBeenCalledWith({ action_type: "no_answer", notes: "Rang 10 times" });
  });

  it("logs the appointment date for Scheduled", async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole("radio", { name: /Scheduled/ }));
    fireEvent.change(screen.getByLabelText("Appointment date"), { target: { value: "2026-10-20" } });
    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(onSubmit).toHaveBeenCalledWith({
      action_type: "scheduled",
      appointment_date: "2026-10-20",
      notes: "",
    });
  });

  it("clears itself after the call is logged", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("radio", { name: /Voicemail/ }));
    await user.type(screen.getByLabelText("Notes (optional)"), "Left callback number");
    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(screen.getByRole("radio", { name: /Voicemail/ })).not.toBeChecked();
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
  });

  it("shows the server's reason when logging fails, and keeps what was entered", async () => {
    const error = new ApiError(400, { appointment_date: ["The appointment date can't be in the past."] });
    const { user } = setup(vi.fn().mockRejectedValue(error));

    await user.click(screen.getByRole("radio", { name: /Scheduled/ }));
    fireEvent.change(screen.getByLabelText("Appointment date"), { target: { value: "2026-10-01" } });
    await user.click(screen.getByRole("button", { name: "Log call" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The appointment date can't be in the past.");
    expect(screen.getByLabelText("Appointment date")).toHaveValue("2026-10-01");
  });
});
