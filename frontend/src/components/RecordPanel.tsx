import type { LogActionPayload, OutreachRecord } from "../api/types";
import { formatDate, timeSince } from "../lib/dates";
import { closingAction } from "../lib/records";
import { CallHistory } from "./CallHistory";
import { LogCallForm } from "./LogCallForm";

export function RecordStatusBadge({ record }: { record: OutreachRecord }) {
  const closer = closingAction(record);
  if (!closer) return <span className="badge status--open">Open</span>;
  return <span className={`badge action--${closer.action_type}`}>{closer.action_label}</span>;
}

type Props = {
  record: OutreachRecord;
  /** When given (and the record is open), the outcome pad is shown. */
  onLogCall?: (payload: LogActionPayload) => Promise<unknown>;
};

/** One visit the patient is due for: what it is, how it's going, and the calls so far. */
export function RecordPanel({ record, onLogCall }: Props) {
  const closer = closingAction(record);
  const calls = record.actions.length;
  const titleId = `record-${record.id}-title`;

  return (
    <article className={`record record--${record.status}`} aria-labelledby={titleId}>
      <header className="record__header">
        <h3 id={titleId}>{record.visit_type}</h3>
        <RecordStatusBadge record={record} />
      </header>

      <dl className="facts">
        <div>
          <dt>Clinic</dt>
          <dd>{record.clinic}</dd>
        </div>
        <div>
          <dt>Last visit</dt>
          <dd>
            {formatDate(record.last_visit)} <span className="muted">({timeSince(record.last_visit)})</span>
          </dd>
        </div>
        <div>
          <dt>Calls</dt>
          <dd>{calls === 0 ? "None yet" : calls}</dd>
        </div>
        {closer?.appointment_date && (
          <div>
            <dt>Appointment</dt>
            <dd>{formatDate(closer.appointment_date)}</dd>
          </div>
        )}
      </dl>

      {record.status === "open" && onLogCall && <LogCallForm onSubmit={onLogCall} />}

      {calls > 0 &&
        (record.status === "open" ? (
          <section className="record__history" aria-label="Previous calls">
            <h4>Previous calls</h4>
            <CallHistory actions={record.actions} />
          </section>
        ) : (
          <details className="record__history">
            <summary>Call history ({calls})</summary>
            <CallHistory actions={record.actions} />
          </details>
        ))}
    </article>
  );
}
