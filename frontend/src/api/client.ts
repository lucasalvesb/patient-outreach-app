// A small fetch wrapper for the Django API: session cookie auth, CSRF header on
// writes, JSON in and out, and errors turned into readable messages.

type FieldErrors = Record<string, string[]>;

const STATUS_MESSAGES: Record<number, string> = {
  0: "Can't reach the server. Check your connection and try again.",
  401: "Your session has ended. Log in again.",
  403: "You don't have permission to do that.",
  404: "That item no longer exists.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, body: unknown) {
    const fieldErrors = extractFieldErrors(body);
    super(
      detailOf(body) ??
        Object.values(fieldErrors)[0]?.[0] ??
        STATUS_MESSAGES[status] ??
        (status >= 500 ? "The server ran into a problem. Try again in a moment." : "Something went wrong. Try again."),
    );
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
};

const unauthorizedListeners = new Set<() => void>();

/** Called whenever the API answers 401 (not logged in / session expired). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  } else if (options.formData) {
    body = options.formData; // The browser sets the multipart boundary.
  }
  if (method !== "GET") {
    const token = await csrfToken();
    if (token) headers.set("X-CSRFToken", token);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, null);
  }

  const data = await readBody(response);
  if (!response.ok) {
    if (response.status === 401) unauthorizedListeners.forEach((listener) => listener());
    throw new ApiError(response.status, data);
  }
  return data as T;
}

async function csrfToken(): Promise<string | null> {
  let token = readCookie("csrftoken");
  if (!token) {
    await fetch("/api/auth/csrf/", { credentials: "same-origin" });
    token = readCookie("csrftoken");
  }
  return token;
}

function readCookie(name: string): string | null {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  const value = decodeURIComponent(entry.slice(name.length + 1));
  return value || null;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function detailOf(body: unknown): string | undefined {
  if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
    return body.detail;
  }
  return undefined;
}

function extractFieldErrors(body: unknown): FieldErrors {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const errors: FieldErrors = {};
  for (const [field, value] of Object.entries(body)) {
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      errors[field] = value;
    }
  }
  return errors;
}
