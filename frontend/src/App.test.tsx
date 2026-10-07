import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiError } from "./api/client";
import { api } from "./api/endpoints";
import type { CurrentUser } from "./api/types";
import { AuthProvider } from "./auth/AuthProvider";
import { renderWithProviders } from "./test/renderWithProviders";

vi.mock("./api/endpoints", () => ({
  api: {
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    myWork: vi.fn(),
    pool: vi.fn(),
    adminPatients: vi.fn(),
    filterOptions: vi.fn(),
  },
}));

const agent: CurrentUser = { id: 2, username: "agent1", display_name: "Jamie Rivera", is_admin: false };
const admin: CurrentUser = { id: 1, username: "admin", display_name: "Alex Morgan", is_admin: true };
const emptyPage = { count: 0, next: null, previous: null, results: [] };

function renderApp(path: string) {
  return renderWithProviders(
    <AuthProvider>
      <App />
    </AuthProvider>,
    { path },
  );
}

async function logIn(username: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), "a-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

beforeEach(() => {
  vi.mocked(api.myWork).mockResolvedValue([]);
  vi.mocked(api.pool).mockResolvedValue(emptyPage);
  vi.mocked(api.logout).mockResolvedValue(undefined);
  vi.mocked(api.adminPatients).mockResolvedValue(emptyPage);
  vi.mocked(api.filterOptions).mockResolvedValue({ clinics: [], visit_types: [], agents: [] });
});

describe("App", () => {
  it("asks visitors without a session to log in", async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401, { detail: "Not logged in." }));

    renderApp("/pool");

    expect(await screen.findByRole("heading", { name: "Reach patients who are due for a visit" })).toBeVisible();
  });

  it("returns to the requested page after logging in", async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401, { detail: "Not logged in." }));
    vi.mocked(api.login).mockResolvedValue(agent);
    renderApp("/pool");

    await logIn("agent1");

    expect(await screen.findByRole("heading", { name: "Unassigned patients" })).toBeVisible();
  });

  it("starts the next person on their own home page after a log out", async () => {
    vi.mocked(api.me).mockResolvedValue(agent);
    vi.mocked(api.login).mockResolvedValue(admin);
    renderApp("/my-work");

    await userEvent.setup().click(await screen.findByRole("button", { name: "Log out" }));
    await logIn("admin");

    expect(await screen.findByRole("heading", { name: "All patients" })).toBeVisible();
  });

  it("keeps agents out of admin pages", async () => {
    vi.mocked(api.me).mockResolvedValue(agent);

    renderApp("/import");

    expect(await screen.findByRole("heading", { name: "This page is for admins" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
  });
});
