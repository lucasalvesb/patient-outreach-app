import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ApiError } from "../api/client";
import { api, type AdminPatientFilters } from "../api/endpoints";
import type { AdminPatient, User } from "../api/types";
import { ClampedText } from "../components/ClampedText";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import { PhoneNumber } from "../components/PhoneNumber";
import { RecordPanel } from "../components/RecordPanel";
import { useNotify } from "../components/Toasts";
import { formatDate, formatDateTime } from "../lib/dates";
import { useDebouncedValue } from "../lib/useDebouncedValue";

const FILTER_KEYS = ["search", "status", "agent", "clinic", "visit_type"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

export function AdminPatientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters: Required<AdminPatientFilters> = {
    search: searchParams.get("search") ?? "",
    status: (searchParams.get("status") ?? "") as Required<AdminPatientFilters>["status"],
    agent: searchParams.get("agent") ?? "",
    clinic: searchParams.get("clinic") ?? "",
    visit_type: searchParams.get("visit_type") ?? "",
  };
  const page = Number(searchParams.get("page")) || 1;
  const [searchInput, setSearchInput] = useState(filters.search);
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [expanded, setExpanded] = useState<number | null>(null);

  function update(changes: Partial<Record<FilterKey | "page", string>>) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("page" in changes)) next.delete("page"); // New filters start on page 1.
        return next;
      },
      { replace: true },
    );
  }

  // Push the search text into the URL once typing pauses (only the debounced value matters here).
  useEffect(() => {
    if (search !== filters.search) update({ search });
  }, [search]);

  const options = useQuery({ queryKey: ["filter-options"], queryFn: api.filterOptions });
  const patients = useQuery({
    queryKey: ["admin-patients", filters, page],
    queryFn: () => api.adminPatients({ ...filters, page }),
    placeholderData: keepPreviousData,
  });

  const filtered = FILTER_KEYS.some((key) => filters[key]);
  const agents = options.data?.agents ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>All patients</h1>
          <p className="page-header__lede">Every imported patient, who is working them, and how their records stand.</p>
        </div>
      </header>

      <form className="filters" role="search" aria-label="Filter patients" onSubmit={(event) => event.preventDefault()}>
        <div className="field field--grow">
          <label htmlFor="filter-search">Search</label>
          <input
            id="filter-search"
            type="search"
            placeholder="Name or account number"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-status">Records</label>
          <select id="filter-status" value={filters.status} onChange={(event) => update({ status: event.target.value })}>
            <option value="">Any</option>
            <option value="open">Has open records</option>
            <option value="closed">All closed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-agent">Assigned to</label>
          <select id="filter-agent" value={filters.agent} onChange={(event) => update({ agent: event.target.value })}>
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-clinic">Clinic</label>
          <select id="filter-clinic" value={filters.clinic} onChange={(event) => update({ clinic: event.target.value })}>
            <option value="">Any clinic</option>
            {options.data?.clinics.map((clinic) => (
              <option key={clinic} value={clinic}>
                {clinic}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-visit-type">Visit type</label>
          <select
            id="filter-visit-type"
            value={filters.visit_type}
            onChange={(event) => update({ visit_type: event.target.value })}
          >
            <option value="">Any visit type</option>
            {options.data?.visit_types.map((visitType) => (
              <option key={visitType} value={visitType}>
                {visitType}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <button
            type="button"
            className="button button--quiet filters__clear"
            onClick={() => {
              setSearchInput("");
              setSearchParams({}, { replace: true });
            }}
          >
            Clear filters
          </button>
        )}
      </form>

      {patients.isPending ? (
        <p className="loading">Loading patients…</p>
      ) : patients.isError ? (
        <p className="form-error" role="alert">
          {patients.error.message}
        </p>
      ) : patients.data.count === 0 ? (
        filtered ? (
          <EmptyState title="No patients match these filters" />
        ) : (
          <EmptyState
            title="No patients yet"
            action={
              <Link className="button button--primary" to="/import">
                Import a file
              </Link>
            }
          >
            Patients appear here once a CSV of patients due for a visit is imported.
          </EmptyState>
        )
      ) : (
        <>
          <p className="result-count">
            {patients.data.count === 1 ? "1 patient" : `${patients.data.count} patients`}
          </p>
          <div className="table-scroll">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Assigned to</th>
                  <th scope="col" className="numeric">
                    Open
                  </th>
                  <th scope="col" className="numeric">
                    Closed
                  </th>
                  <th scope="col">Clinics</th>
                  <th scope="col">Visit types</th>
                  <th scope="col">Last call</th>
                  <th scope="col">
                    <span className="visually-hidden">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.data.results.map((patient) => {
                  const isOpen = expanded === patient.id;
                  const detailId = `patient-${patient.id}-detail`;
                  return (
                    <Fragment key={patient.id}>
                      <tr className={isOpen ? "row--expanded" : undefined}>
                        <td>
                          <ClampedText className="patient-name">{patient.name}</ClampedText>
                          <ClampedText className="account">{patient.account_number}</ClampedText>
                        </td>
                        <td data-label="Assigned to">
                          {patient.assigned_to ? (
                            <ClampedText className="cell-text--short">{patient.assigned_to.display_name}</ClampedText>
                          ) : (
                            <span className="muted">{patient.open_record_count > 0 ? "In the pool" : "Nobody"}</span>
                          )}
                        </td>
                        <td className="numeric" data-label="Open">
                          {patient.open_record_count}
                        </td>
                        <td className="numeric" data-label="Closed">
                          {patient.closed_record_count}
                        </td>
                        <td data-label="Clinics">
                          <ClampedText>{patient.clinics.join(", ")}</ClampedText>
                        </td>
                        <td data-label="Visit types">
                          <ClampedText>{patient.visit_types.join(", ")}</ClampedText>
                        </td>
                        <td className="numeric" data-label="Last call">
                          {patient.last_action_at ? (
                            formatDateTime(patient.last_action_at)
                          ) : (
                            <span className="muted">No calls</span>
                          )}
                        </td>
                        <td className="cell-action">
                          <button
                            type="button"
                            className="button button--secondary"
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            onClick={() => setExpanded(isOpen ? null : patient.id)}
                          >
                            {isOpen ? "Hide" : "Details"}
                            <span className="visually-hidden"> for {patient.name}</span>
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row" id={detailId}>
                          <td colSpan={8}>
                            <PatientAdminDetail patient={patient} agents={agents} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={patients.data.count} onPageChange={(next) => update({ page: String(next) })} />
        </>
      )}
    </>
  );
}

function PatientAdminDetail({ patient, agents }: { patient: AdminPatient; agents: User[] }) {
  const detail = useQuery({ queryKey: ["admin-patient", patient.id], queryFn: () => api.adminPatient(patient.id) });
  return (
    <div className="admin-detail">
      <div className="admin-detail__side">
        <dl className="identity identity--stacked">
          {/* In full here, since the table cuts very long names short. */}
          <div>
            <dt>Name</dt>
            <dd>{patient.name}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              <PhoneNumber phone={patient.phone} />
            </dd>
          </div>
          <div>
            <dt>DOB</dt>
            <dd>{formatDate(patient.dob)}</dd>
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
        <ReassignForm key={`${patient.id}-${patient.assigned_to?.id ?? "none"}`} patient={patient} agents={agents} />
      </div>
      <div className="admin-detail__records">
        {detail.isPending ? (
          <p className="loading">Loading records…</p>
        ) : detail.isError ? (
          <p className="form-error" role="alert">
            {detail.error.message}
          </p>
        ) : (
          detail.data.records.map((record) => <RecordPanel key={record.id} record={record} />)
        )}
      </div>
    </div>
  );
}

function ReassignForm({ patient, agents }: { patient: AdminPatient; agents: User[] }) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const current = patient.assigned_to ? String(patient.assigned_to.id) : "";
  const [choice, setChoice] = useState(current);
  const nothingOpen = patient.open_record_count === 0;
  const selectId = `reassign-${patient.id}`;

  const reassign = useMutation<AdminPatient, ApiError, string>({
    mutationFn: (agentId) => api.reassign(patient.id, agentId ? Number(agentId) : null),
    onSuccess: (updated) => {
      notify(
        updated.assigned_to
          ? `${updated.name} is now assigned to ${updated.assigned_to.display_name}.`
          : `${updated.name} is back in the pool.`,
      );
      for (const key of ["admin-patients", "admin-patient", "pool", "my-work"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error) => notify(error.message, { tone: "error" }),
  });

  return (
    <form
      className="reassign"
      onSubmit={(event) => {
        event.preventDefault();
        reassign.mutate(choice);
      }}
    >
      <div className="field">
        <label htmlFor={selectId}>Assigned to</label>
        <select id={selectId} value={choice} onChange={(event) => setChoice(event.target.value)} disabled={nothingOpen}>
          <option value="">Nobody (back to the pool)</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.display_name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="button button--secondary"
        disabled={nothingOpen || choice === current || reassign.isPending}
      >
        {reassign.isPending ? "Reassigning…" : "Reassign"}
      </button>
      {nothingOpen && <p className="muted">Every record is closed, so there is nothing to assign.</p>}
    </form>
  );
}
