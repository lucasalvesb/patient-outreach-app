import { useId, useState } from "react";
import type { ImportBatchDetail, ImportOutcome, ImportRow } from "../api/types";
import { ClampedText } from "./ClampedText";

type Filter = "all" | ImportOutcome;

const OUTCOMES: ImportOutcome[] = ["create", "duplicate", "error"];

function describe(outcome: ImportOutcome, count: number, committed: boolean): string {
  switch (outcome) {
    case "create":
      return committed ? "created" : "will be created";
    case "duplicate":
      return count === 1 ? "skipped as duplicate" : "skipped as duplicates";
    case "error":
      return "rejected";
  }
}

function filterLabel(filter: Filter, committed: boolean): string {
  switch (filter) {
    case "all":
      return "All";
    case "create":
      return committed ? "Created" : "Will be created";
    case "duplicate":
      return "Duplicates";
    case "error":
      return "Rejected";
  }
}

const OUTCOME_BADGE: Record<ImportOutcome, { label: string; previewLabel: string }> = {
  create: { label: "Created", previewLabel: "Create" },
  duplicate: { label: "Duplicate", previewLabel: "Duplicate" },
  error: { label: "Rejected", previewLabel: "Rejected" },
};

/** What an uploaded file will do (or did): counts per outcome and every row with its reasons. */
export function ImportPreview({ batch }: { batch: ImportBatchDetail }) {
  const id = useId();
  const committed = batch.status === "committed";
  const [filter, setFilter] = useState<Filter>("all");
  const { summary } = batch;
  const rows = filter === "all" ? batch.rows : batch.rows.filter((row) => row.outcome === filter);

  return (
    <section className="import-preview" aria-label={`Rows in ${batch.filename}`}>
      <div className="composition" aria-hidden="true">
        {OUTCOMES.filter((outcome) => summary[outcome] > 0).map((outcome) => (
          <span key={outcome} className={`composition__part outcome--${outcome}`} style={{ flexGrow: summary[outcome] }} />
        ))}
      </div>
      <ul className="composition-legend" aria-label={committed ? "What this file did" : "What this file will do"}>
        {OUTCOMES.map((outcome) => (
          <li key={outcome} className={`legend-item outcome--${outcome}`}>
            <strong>{summary[outcome]}</strong> {describe(outcome, summary[outcome], committed)}
          </li>
        ))}
        {(summary.phones ?? 0) > 0 && (
          <li className="legend-item legend-item--phones">
            <strong>{summary.phones}</strong>{" "}
            {summary.phones === 1 ? "phone number" : "phone numbers"} {committed ? "saved" : "will be saved"}
          </li>
        )}
      </ul>

      <div className="segmented" role="radiogroup" aria-label="Show rows">
        {(["all", ...OUTCOMES] as Filter[]).map((option) => {
          const count = option === "all" ? summary.total : summary[option];
          return (
            <label key={option} className="segmented__option">
              <input
                type="radio"
                name={`${id}-filter`}
                value={option}
                checked={filter === option}
                onChange={() => setFilter(option)}
              />
              <span>
                {filterLabel(option, committed)} ({count})
              </span>
            </label>
          );
        })}
      </div>

      <div className="table-scroll">
        <table className="data-table import-table">
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Outcome</th>
              <th scope="col">Account No</th>
              <th scope="col">Patient</th>
              <th scope="col">DOB</th>
              <th scope="col">Clinic</th>
              <th scope="col">Visit type</th>
              <th scope="col">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ImportRowView
                key={row.row_number}
                row={row}
                committed={committed}
                messagesId={`${id}-row-${row.row_number}-messages`}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="table-empty">No rows with this outcome.</p>}
      </div>
    </section>
  );
}

// A row's reasons go on a line of their own under its values, using the table's full width,
// rather than in a column that would be empty for most rows and squeeze the values.
function ImportRowView({ row, committed, messagesId }: { row: ImportRow; committed: boolean; messagesId: string }) {
  const badge = OUTCOME_BADGE[row.outcome];
  const { values } = row;
  const hasMessages = row.messages.length > 0;
  const classes = `import-row import-row--${row.outcome}`;
  return (
    <>
      <tr
        className={hasMessages ? `${classes} import-row--has-messages` : classes}
        aria-describedby={hasMessages ? messagesId : undefined}
      >
        <th scope="row" className="numeric">
          {row.row_number}
        </th>
        <td>
          <span className={`badge outcome--${row.outcome}`}>{committed ? badge.label : badge.previewLabel}</span>
        </td>
        <Value value={values.account_number} short />
        <td>
          {values.patient_name ? <ClampedText>{values.patient_name}</ClampedText> : <span className="blank">blank</span>}
          {/* Under the name rather than in a column of its own, so the table still fits the page. */}
          {values.phone && <ClampedText className="import-row__phone">{values.phone}</ClampedText>}
        </td>
        <Value value={values.dob} short />
        <Value value={values.clinic} />
        <Value value={values.visit_type} />
        <Value value={values.last_visit} short />
      </tr>
      {hasMessages && (
        <tr className={`${classes} import-row__messages`}>
          <td colSpan={2} />
          <td colSpan={6}>
            <ul className="messages" id={messagesId}>
              {row.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

// Account numbers and dates are short, so they don't need the room a name or clinic does.
function Value({ value, short = false }: { value: string; short?: boolean }) {
  return (
    <td className={short ? "numeric" : undefined}>
      {value ? (
        <ClampedText className={short ? "cell-text--short" : undefined}>{value}</ClampedText>
      ) : (
        <span className="blank">blank</span>
      )}
    </td>
  );
}
