// Shapes of the JSON the Django API returns. Dates are ISO strings ("1980-02-14"),
// timestamps are ISO date-times.

export type User = {
  id: number;
  username: string;
  display_name: string;
};

export type CurrentUser = User & { is_admin: boolean };

export type ActionType = "no_answer" | "voicemail" | "scheduled" | "not_interested";
export type RecordStatus = "open" | "closed";

export type OutreachAction = {
  id: number;
  action_type: ActionType;
  action_label: string;
  appointment_date: string | null;
  notes: string;
  agent: User;
  created_at: string;
};

export type OutreachRecord = {
  id: number;
  clinic: string;
  visit_type: string;
  last_visit: string;
  status: RecordStatus;
  closed_at: string | null;
  created_at: string;
  actions: OutreachAction[]; // newest first
};

/** A patient with every record and its call history (My Work, admin detail). */
export type PatientWork = {
  id: number;
  account_number: string;
  name: string;
  dob: string;
  phone: string; // "" when no import has given one
  assigned_to: User | null;
  claimed_at: string | null;
  records: OutreachRecord[];
};

export type PoolPatient = {
  id: number;
  account_number: string;
  name: string;
  dob: string;
  open_record_count: number;
  oldest_last_visit: string;
  visit_types: string[];
  clinics: string[];
};

export type AdminPatient = {
  id: number;
  account_number: string;
  name: string;
  dob: string;
  phone: string;
  assigned_to: User | null;
  claimed_at: string | null;
  open_record_count: number;
  closed_record_count: number;
  last_action_at: string | null;
  visit_types: string[];
  clinics: string[];
};

export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ImportOutcome = "create" | "duplicate" | "error";

export type ImportRowValues = {
  account_number: string;
  patient_name: string;
  dob: string;
  clinic: string;
  visit_type: string;
  last_visit: string;
  phone?: string; // Missing for a rejected row from a file without a Phone column.
};

export type ImportRow = {
  row_number: number;
  outcome: ImportOutcome;
  values: ImportRowValues;
  messages: string[];
};

// `phones`: patients already in the system whose phone number the file changes (missing on
// imports made before phone numbers existed).
export type ImportSummary = Record<ImportOutcome, number> & { total: number; phones?: number };

export type ImportBatch = {
  id: number;
  filename: string;
  status: "previewed" | "committed";
  summary: ImportSummary;
  uploaded_by: User;
  created_at: string;
  committed_at: string | null;
};

export type ImportBatchDetail = ImportBatch & { rows: ImportRow[] };

export type LogActionPayload = {
  action_type: ActionType;
  appointment_date?: string;
  notes?: string;
};

export type LogActionResult = {
  action: OutreachAction;
  record: OutreachRecord;
  patient_released: boolean;
};

export type FilterOptions = {
  clinics: string[];
  visit_types: string[];
  agents: User[];
};
