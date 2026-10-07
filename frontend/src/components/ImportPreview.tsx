import { useId, useState } from "react";
import type { ImportBatchDetail, ImportOutcome, ImportRow } from "../api/types";

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
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ImportRowView key={row.row_number} row={row} committed={committed} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="table-empty">No rows with this outcome.</p>}
      </div>
    </section>
  );
}

function ImportRowView({ row, committed }: { row: ImportRow; committed: boolean }) {
  const badge = OUTCOME_BADGE[row.outcome];
  const { values } = row;
  return (
    <tr className={`import-row import-row--${row.outcome}`}>
      <td className="numeric">{row.row_number}</td>
      <td>
        <span className={`badge outcome--${row.outcome}`}>{committed ? badge.label : badge.previewLabel}</span>
      </td>
      <Value value={values.account_number} />
      <Value value={values.patient_name} />
      <Value value={values.dob} numeric />
      <Value value={values.clinic} />
      <Value value={values.visit_type} />
      <Value value={values.last_visit} numeric />
      <td className="import-row__details">
        {row.messages.length > 0 && (
          <ul className="messages">
            {row.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function Value({ value, numeric = false }: { value: string; numeric?: boolean }) {
  return (
    <td className={numeric ? "numeric" : undefined}>
      {value ? value : <span className="blank">blank</span>}
    </td>
  );
}
