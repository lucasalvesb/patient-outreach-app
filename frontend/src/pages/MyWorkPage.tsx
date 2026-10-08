import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { api } from "../api/endpoints";
import type { LogActionPayload, LogActionResult, PatientWork } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { PhoneNumber } from "../components/PhoneNumber";
import { RecordPanel } from "../components/RecordPanel";
import { useNotify } from "../components/Toasts";
import { ageOn, formatDate, formatDateTime } from "../lib/dates";

type LogCallVariables = { patient: PatientWork; recordId: number; payload: LogActionPayload };

export function MyWorkPage() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [searchParams, setSearchParams] = useSearchParams();
  const work = useQuery({ queryKey: ["my-work"], queryFn: api.myWork });

  const logCall = useMutation<LogActionResult, Error, LogCallVariables>({
    mutationFn: ({ recordId, payload }) => api.logAction(recordId, payload),
    onSuccess: (result, { patient }) => {
      queryClient.setQueryData<PatientWork[]>(["my-work"], (patients = []) =>
        result.patient_released
          ? patients.filter((p) => p.id !== patient.id)
          : patients.map((p) =>
              p.id !== patient.id
                ? p
                : { ...p, records: p.records.map((r) => (r.id === result.record.id ? result.record : r)) },
            ),
      );
      if (result.patient_released) {
        notify(`All of ${patient.name}'s records are closed, so they have been released.`);
        setSearchParams({}, { replace: true });
      } else {
        notify(`${result.action.action_label} logged for ${result.record.visit_type}.`);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-work"] });
      void queryClient.invalidateQueries({ queryKey: ["pool"] });
    },
  });

  if (work.isPending) return <p className="loading">Loading your patients…</p>;
  if (work.isError) {
    return (
      <p className="form-error" role="alert">
        {work.error.message}
      </p>
    );
  }

  const patients = work.data;
  if (patients.length === 0) {
    return (
      <>
        <header className="page-header">
          <h1>My work</h1>
        </header>
        <EmptyState
          title="You haven't claimed anyone"
          action={
            <Link className="button button--primary" to="/pool">
              Find a patient in the pool
            </Link>
          }
        >
          Claim a patient from the pool to see their open records here.
        </EmptyState>
      </>
    );
  }

  const selectedId = Number(searchParams.get("patient"));
  const selected = patients.find((patient) => patient.id === selectedId) ?? patients[0];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>My work</h1>
          <p className="page-header__lede">
            {patients.length === 1 ? "1 patient" : `${patients.length} patients`} claimed. A patient is released
            once every record is closed.
          </p>
        </div>
      </header>

      <div className="worklist">
        <nav className="worklist__patients" aria-label="My patients">
          <ul>
            {patients.map((patient) => {
              const open = patient.records.filter((record) => record.status === "open").length;
              return (
                <li key={patient.id}>
                  <Link
                    to={`?patient=${patient.id}`}
                    replace
                    aria-current={patient.id === selected.id ? "page" : undefined}
                    className="worklist__patient"
                  >
                    <span className="patient-name">{patient.name}</span>
                    <span className="account">{patient.account_number}</span>
                    <span className="worklist__open">{open === 1 ? "1 open record" : `${open} open records`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <PatientDetail
          key={selected.id}
          patient={selected}
          onLogCall={(recordId, payload) => logCall.mutateAsync({ patient: selected, recordId, payload })}
        />
      </div>
    </>
  );
}

function PatientDetail({
  patient,
  onLogCall,
}: {
  patient: PatientWork;
  onLogCall: (recordId: number, payload: LogActionPayload) => Promise<unknown>;
}) {
  const open = patient.records.filter((record) => record.status === "open");
  const closed = patient.records.filter((record) => record.status === "closed");

  return (
    <section className="patient" aria-labelledby="patient-name">
      <header className="patient__header">
        <h2 id="patient-name">{patient.name}</h2>
        <dl className="identity">
          <div>
            <dt>Phone</dt>
            <dd>
              <PhoneNumber phone={patient.phone} />
            </dd>
          </div>
          <div>
            <dt>DOB</dt>
            <dd>
              {formatDate(patient.dob)} <span className="muted">(age {ageOn(patient.dob)})</span>
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd className="account account--large">{patient.account_number}</dd>
          </div>
          {patient.claimed_at && (
            <div>
              <dt>Claimed</dt>
              <dd>{formatDateTime(patient.claimed_at)}</dd>
            </div>
          )}
        </dl>
        <p className="patient__reminder">Confirm the name and date of birth before discussing any visit.</p>
      </header>

      <div className="patient__records">
        {open.map((record) => (
          <RecordPanel key={record.id} record={record} onLogCall={(payload) => onLogCall(record.id, payload)} />
        ))}
        {closed.length > 0 && (
          <section aria-label="Closed records" className="patient__closed">
            <h3 className="section-title">Closed</h3>
            {closed.map((record) => (
              <RecordPanel key={record.id} record={record} />
            ))}
          </section>
        )}
      </div>
    </section>
  );
}
