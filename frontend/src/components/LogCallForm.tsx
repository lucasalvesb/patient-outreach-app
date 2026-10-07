import { useId, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import type { ActionType, LogActionPayload } from "../api/types";
import { ACTIONS } from "../lib/actions";
import { todayISO } from "../lib/dates";

type Props = {
  onSubmit: (payload: LogActionPayload) => Promise<unknown>;
  /** Earliest allowed appointment date (YYYY-MM-DD); defaults to today. */
  today?: string;
};

/** The outcome pad: pick how the call went, add a date for Scheduled, log it. */
export function LogCallForm({ onSubmit, today = todayISO() }: Props) {
  const id = useId();
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!actionType) {
      setError("Choose how the call went.");
      return;
    }
    if (actionType === "scheduled" && !appointmentDate) {
      setError("Enter the appointment date.");
      return;
    }

    const payload: LogActionPayload = { action_type: actionType, notes: notes.trim() };
    if (actionType === "scheduled") payload.appointment_date = appointmentDate;

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(payload);
      setActionType(null);
      setAppointmentDate("");
      setNotes("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't log the call. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="log-call" onSubmit={handleSubmit} noValidate>
      <fieldset className="outcome-pad">
        <legend>How did the call go?</legend>
        <div className="outcome-keys">
          {ACTIONS.map((action) => {
            const labelId = `${id}-${action.type}-label`;
            const hintId = `${id}-${action.type}-hint`;
            return (
              <label key={action.type} className={`outcome-key outcome-key--${action.type}`}>
                <input
                  type="radio"
                  name={`${id}-outcome`}
                  value={action.type}
                  checked={actionType === action.type}
                  onChange={() => {
                    setActionType(action.type);
                    setError(null);
                  }}
                  aria-labelledby={labelId}
                  aria-describedby={hintId}
                />
                <span className="outcome-key__label" id={labelId}>
                  {action.label}
                </span>
                <span className="outcome-key__hint" id={hintId}>
                  {action.closesRecord ? "Closes the record" : "Stays open"}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="log-call__details">
        {actionType === "scheduled" && (
          <div className="field">
            <label htmlFor={`${id}-date`}>Appointment date</label>
            <input
              id={`${id}-date`}
              type="date"
              min={today}
              value={appointmentDate}
              onChange={(event) => setAppointmentDate(event.target.value)}
              required
            />
          </div>
        )}
        <div className="field field--grow">
          <label htmlFor={`${id}-notes`}>Notes (optional)</label>
          <textarea
            id={`${id}-notes`}
            rows={1}
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? "Logging…" : "Log call"}
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
