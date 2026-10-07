import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { PoolPatient } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import { useNotify } from "../components/Toasts";
import { formatDate, timeSince } from "../lib/dates";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function PoolPage() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput.trim(), 300);

  const pool = useQuery({
    queryKey: ["pool", search, page],
    queryFn: () => api.pool({ search, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // Other agents claim patients too.
  });

  const claim = useMutation<unknown, ApiError, PoolPatient>({
    mutationFn: (patient) => api.claim(patient.id),
    onSuccess: (_, patient) => {
      notify(`${patient.name} is now in your work.`, {
        link: { label: "Open", to: `/my-work?patient=${patient.id}` },
      });
    },
    onError: (error) => notify(error.message, { tone: "error" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["pool"] });
      void queryClient.invalidateQueries({ queryKey: ["my-work"] });
    },
  });

  const patients = pool.data?.results ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Unassigned patients</h1>
          <p className="page-header__lede">
            Most overdue first. Claiming a patient gives you all of their open records.
          </p>
        </div>
        <div className="search">
          <label htmlFor="pool-search" className="visually-hidden">
            Search by name or account number
          </label>
          <input
            id="pool-search"
            type="search"
            placeholder="Search by name or account number"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </header>

      {pool.isPending ? (
        <p className="loading">Loading patients…</p>
      ) : pool.isError ? (
        <p className="form-error" role="alert">
          {pool.error.message}
        </p>
      ) : patients.length === 0 ? (
        search ? (
          <EmptyState title="No matches">No unassigned patient matches “{search}”.</EmptyState>
        ) : (
          <EmptyState title="Nobody is waiting">
            Patients show up here when an admin imports a file, or when their open records are released.
          </EmptyState>
        )
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">DOB</th>
                  <th scope="col">Due for</th>
                  <th scope="col">Clinic</th>
                  <th scope="col">Oldest last visit</th>
                  <th scope="col">
                    <span className="visually-hidden">Claim</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const claiming = claim.isPending && claim.variables?.id === patient.id;
                  return (
                    <tr key={patient.id}>
                      <td>
                        <span className="patient-name">{patient.name}</span>
                        <span className="account">{patient.account_number}</span>
                      </td>
                      <td className="numeric" data-label="DOB">
                        {formatDate(patient.dob)}
                      </td>
                      <td data-label="Due for">
                        {patient.visit_types.join(", ")}
                        {patient.open_record_count > patient.visit_types.length && (
                          <span className="muted"> ({patient.open_record_count} records)</span>
                        )}
                      </td>
                      <td data-label="Clinic">{patient.clinics.join(", ")}</td>
                      <td className="numeric" data-label="Oldest last visit">
                        {formatDate(patient.oldest_last_visit)}
                        <span className="overdue">{timeSince(patient.oldest_last_visit)}</span>
                      </td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={claim.isPending}
                          onClick={() => claim.mutate(patient)}
                          aria-label={`Claim ${patient.name}`}
                        >
                          {claiming ? "Claiming…" : "Claim"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={pool.data.count} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
