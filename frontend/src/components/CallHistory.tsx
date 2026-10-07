import type { OutreachAction } from "../api/types";
import { formatDate, formatDateTime } from "../lib/dates";

/** Every call logged on a record, newest first. */
export function CallHistory({ actions }: { actions: OutreachAction[] }) {
  return (
    <ol className="history" aria-label="Call history">
      {actions.map((action) => (
        <li key={action.id} className="history__item">
          <span className={`badge action--${action.action_type}`}>{action.action_label}</span>
          <div className="history__body">
            <p className="history__meta">
              <time dateTime={action.created_at}>{formatDateTime(action.created_at)}</time>, by{" "}
              {action.agent.display_name}
            </p>
            {action.appointment_date && <p>Appointment on {formatDate(action.appointment_date)}</p>}
            {action.notes && <p className="history__notes">{action.notes}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
