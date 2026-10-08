import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { ImportBatch, ImportBatchDetail } from "../api/types";
import { ImportPreview } from "../components/ImportPreview";
import { useNotify } from "../components/Toasts";
import { formatDateTime } from "../lib/dates";

function records(count: number) {
  return count === 1 ? "1 record" : `${count} records`;
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [batchId, setBatchId] = useState<number | null>(null);
  const [changedNote, setChangedNote] = useState<string | null>(null);

  const batch = useQuery({
    queryKey: ["import", batchId],
    queryFn: () => api.importDetail(batchId as number),
    enabled: batchId !== null,
  });
  const history = useQuery({ queryKey: ["imports"], queryFn: () => api.imports() });

  function show(detail: ImportBatchDetail) {
    queryClient.setQueryData(["import", detail.id], detail);
    setBatchId(detail.id);
  }

  const upload = useMutation<ImportBatchDetail, ApiError, File>({
    mutationFn: api.previewImport,
    onSuccess: (detail) => {
      setChangedNote(null);
      show(detail);
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
  });

  const commit = useMutation<ImportBatchDetail, ApiError, ImportBatchDetail>({
    mutationFn: (preview) => api.commitImport(preview.id),
    onSuccess: (result, preview) => {
      show(result);
      // The commit re-checks every row, so the outcome can differ if data changed meanwhile.
      setChangedNote(
        result.summary.create !== preview.summary.create
          ? `The data changed since the preview, so ${records(result.summary.create)} were created instead of ${preview.summary.create}.`
          : null,
      );
      notify(`Imported ${records(result.summary.create)} from ${result.filename}.`);
      for (const key of ["imports", "pool", "admin-patients", "filter-options"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error) => {
      notify(error.message, { tone: "error" });
      void queryClient.invalidateQueries({ queryKey: ["import", batchId] });
    },
  });

  const discard = useMutation<void, ApiError, number>({
    mutationFn: api.discardImport,
    onSuccess: () => {
      setBatchId(null);
      notify("Preview discarded. Nothing was imported.");
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (error) => notify(error.message, { tone: "error" }),
  });

  const current = batchId !== null ? batch.data : undefined;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Import patients</h1>
          <p className="page-header__lede">
            Upload a CSV of patients who are due for a visit. You'll see what each row will do before anything is
            saved.
          </p>
        </div>
      </header>

      {current ? (
        <section className="import-result" aria-labelledby="import-title">
          <header className="import-result__header">
            <div>
              <h2 id="import-title">{current.filename}</h2>
              <p className="muted">
                {current.status === "committed" && current.committed_at
                  ? `Imported ${formatDateTime(current.committed_at)} by ${current.uploaded_by.display_name}`
                  : `Uploaded ${formatDateTime(current.created_at)} by ${current.uploaded_by.display_name}. Not imported yet.`}
              </p>
            </div>
            <div className="button-row">
              {current.status === "previewed" ? (
                <>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={discard.isPending || commit.isPending}
                    onClick={() => discard.mutate(current.id)}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={current.summary.create === 0 || commit.isPending || discard.isPending}
                    onClick={() => commit.mutate(current)}
                  >
                    {commit.isPending
                      ? "Importing…"
                      : current.summary.create === 0
                        ? "Nothing to import"
                        : `Import ${records(current.summary.create)}`}
                  </button>
                </>
              ) : (
                <button type="button" className="button button--secondary" onClick={() => setBatchId(null)}>
                  Import another file
                </button>
              )}
            </div>
          </header>
          {changedNote && <p className="notice">{changedNote}</p>}
          {current.status === "previewed" && current.summary.create === 0 && (
            <p className="notice">Every row is a duplicate or was rejected, so this file has nothing to import.</p>
          )}
          <ImportPreview batch={current} />
        </section>
      ) : batchId !== null && batch.isPending ? (
        <p className="loading">Loading…</p>
      ) : (
        <FilePicker
          busy={upload.isPending}
          error={upload.error?.message ?? null}
          onFile={(file) => upload.mutate(file)}
        />
      )}

      <ImportHistory batches={history.data?.results ?? []} currentId={batchId} onOpen={setBatchId} />
    </>
  );
}

function FilePicker({ busy, error, onFile }: { busy: boolean; error: string | null; onFile: (file: File) => void }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = ""; // Allow choosing the same file again after fixing it.
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  }

  return (
    <section className="file-picker" aria-label="Choose a file">
      <div
        className={`dropzone${dragging ? " dropzone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <p className="dropzone__title">{busy ? "Checking the file…" : "Drop a CSV file here"}</p>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="visually-hidden"
          tabIndex={-1}
          onChange={pick}
          disabled={busy}
        />
        <button
          type="button"
          className="button button--primary"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-describedby={`${inputId}-format`}
        >
          Choose file
        </button>
        <p className="dropzone__format" id={`${inputId}-format`}>
          Columns: Account No, Patient Name, DOB, Clinic, Visit Type, Last Visit. Dates as YYYY-MM-DD or
          MM/DD/YYYY. Up to 5 MB.
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ImportHistory({
  batches,
  currentId,
  onOpen,
}: {
  batches: ImportBatch[];
  currentId: number | null;
  onOpen: (id: number) => void;
}) {
  if (batches.length === 0) return null;
  return (
    <section className="import-history" aria-labelledby="history-title">
      <h2 id="history-title" className="section-title">
        Recent files
      </h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Status</th>
              <th scope="col" className="numeric">
                Rows
              </th>
              <th scope="col" className="numeric">
                Created
              </th>
              <th scope="col" className="numeric">
                Duplicates
              </th>
              <th scope="col" className="numeric">
                Rejected
              </th>
              <th scope="col">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((item) => (
              <tr key={item.id} aria-current={item.id === currentId ? "true" : undefined}>
                <td>
                  {/* The open file is shown as text, not a link, since clicking it would do nothing. */}
                  {item.id === currentId ? (
                    <span className="import-history__current">
                      {item.filename}
                      <span className="badge badge--current">Viewing</span>
                    </span>
                  ) : (
                    <button type="button" className="link-button" onClick={() => onOpen(item.id)}>
                      {item.filename}
                    </button>
                  )}
                </td>
                <td>
                  {item.status === "committed" ? (
                    <span className="badge outcome--create">Imported</span>
                  ) : (
                    <span className="badge status--pending">Preview only</span>
                  )}
                </td>
                <td className="numeric">{item.summary.total}</td>
                <td className="numeric">{item.status === "committed" ? item.summary.create : "–"}</td>
                <td className="numeric">{item.summary.duplicate}</td>
                <td className="numeric">{item.summary.error}</td>
                <td>
                  {formatDateTime(item.created_at)}, {item.uploaded_by.display_name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
