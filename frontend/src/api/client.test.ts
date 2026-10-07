import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, onUnauthorized } from "./client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setCookie(value: string) {
  document.cookie = `csrftoken=${value}; path=/`;
}

function sentHeaders(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return new Headers(init.headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("apiRequest", () => {
  it("sends the CSRF token from the cookie on writes, with the session cookie", async () => {
    setCookie("abc123");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/patients/1/claim/", { method: "POST" });

    expect(sentHeaders(fetchMock).get("X-CSRFToken")).toBe("abc123");
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("same-origin");
  });

  it("asks the server for a CSRF cookie before the first write", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        setCookie("fresh");
        return new Response(null, { status: 204 });
      })
      .mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/auth/login/", { method: "POST", json: { username: "a", password: "b" } });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/csrf/");
    expect(sentHeaders(fetchMock, 1).get("X-CSRFToken")).toBe("fresh");
  });

  it("sends JSON bodies and parses JSON responses", async () => {
    setCookie("abc123");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ id: number }>("/api/records/1/actions/", {
      method: "POST",
      json: { action_type: "voicemail" },
    });

    expect(result).toEqual({ id: 7 });
    expect(sentHeaders(fetchMock).get("Content-Type")).toBe("application/json");
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe('{"action_type":"voicemail"}');
  });

  it("returns undefined for empty responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiRequest("/api/auth/me/")).resolves.toBeUndefined();
  });

  it("turns the server's detail message into the error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(409, { detail: "This patient was already claimed by another agent." })),
    );

    const error = await apiRequest("/api/pool/").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "This patient was already claimed by another agent." });
  });

  it("keeps field errors and uses the first one as the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, { appointment_date: ["An appointment date is required for Scheduled."] }),
      ),
    );

    const error = (await apiRequest("/api/pool/").catch((e: unknown) => e)) as ApiError;

    expect(error.fieldErrors).toEqual({ appointment_date: ["An appointment date is required for Scheduled."] });
    expect(error.message).toBe("An appointment date is required for Scheduled.");
  });

  it("tells listeners when the session is gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { detail: "Not logged in." })));
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    await apiRequest("/api/my-work/").catch(() => undefined);
    unsubscribe();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("describes network failures in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiRequest("/api/pool/")).rejects.toMatchObject({
      status: 0,
      message: "Can't reach the server. Check your connection and try again.",
    });
  });
});
