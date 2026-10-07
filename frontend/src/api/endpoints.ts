import { apiRequest } from "./client";
import type {
  AdminPatient,
  CurrentUser,
  FilterOptions,
  ImportBatch,
  ImportBatchDetail,
  LogActionPayload,
  LogActionResult,
  Page,
  PatientWork,
  PoolPatient,
} from "./types";

export type AdminPatientFilters = {
  search?: string;
  status?: "" | "open" | "closed";
  agent?: string; // a user id, or "unassigned"
  clinic?: string;
  visit_type?: string;
};

export const api = {
  // Session
  me: () => apiRequest<CurrentUser>("/api/auth/me/"),
  login: (username: string, password: string) =>
    apiRequest<CurrentUser>("/api/auth/login/", { method: "POST", json: { username, password } }),
  logout: () => apiRequest<void>("/api/auth/logout/", { method: "POST" }),

  // Agent work
  pool: (params: { search?: string; page?: number }) => apiRequest<Page<PoolPatient>>(`/api/pool/${query(params)}`),
  claim: (patientId: number) => apiRequest<PatientWork>(`/api/patients/${patientId}/claim/`, { method: "POST" }),
  myWork: () => apiRequest<PatientWork[]>("/api/my-work/"),
  logAction: (recordId: number, payload: LogActionPayload) =>
    apiRequest<LogActionResult>(`/api/records/${recordId}/actions/`, { method: "POST", json: payload }),

  // CSV imports (admin)
  imports: (page = 1) => apiRequest<Page<ImportBatch>>(`/api/imports/${query({ page })}`),
  importDetail: (id: number) => apiRequest<ImportBatchDetail>(`/api/imports/${id}/`),
  previewImport: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<ImportBatchDetail>("/api/imports/", { method: "POST", formData });
  },
  commitImport: (id: number) => apiRequest<ImportBatchDetail>(`/api/imports/${id}/commit/`, { method: "POST" }),
  discardImport: (id: number) => apiRequest<void>(`/api/imports/${id}/`, { method: "DELETE" }),

  // Admin overview
  adminPatients: (filters: AdminPatientFilters & { page?: number }) =>
    apiRequest<Page<AdminPatient>>(`/api/admin/patients/${query(filters)}`),
  adminPatient: (id: number) => apiRequest<PatientWork>(`/api/admin/patients/${id}/`),
  reassign: (patientId: number, agentId: number | null) =>
    apiRequest<AdminPatient>(`/api/admin/patients/${patientId}/reassign/`, {
      method: "POST",
      json: { agent_id: agentId },
    }),
  filterOptions: () => apiRequest<FilterOptions>("/api/admin/filter-options/"),
};

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
