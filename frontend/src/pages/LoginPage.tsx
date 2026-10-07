import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { ApiError } from "../api/client";
import { homePath } from "../auth/guards";
import { useAuth } from "../auth/AuthProvider";

const SHOW_DEMO_LOGINS = import.meta.env.VITE_SHOW_DEMO_LOGINS === "true";

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? homePath(user.is_admin)} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't log in. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <div className="login__panel">
        <p className="brand brand--large">
          <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" />
            <path d="M11.2 7.5c.6-.4 1.4-.2 1.8.4l2 3.2c.4.6.2 1.4-.3 1.8l-1.6 1.2c.9 2 2.5 3.7 4.5 4.6l1.2-1.6c.4-.6 1.2-.7 1.8-.3l3.2 2c.6.4.8 1.2.4 1.8l-1.2 2c-.6 1-1.8 1.5-3 1.2-5.3-1.4-9.5-5.6-10.9-10.9-.3-1.2.2-2.4 1.2-3l.9-.4z" />
          </svg>
          Visit Outreach
        </p>
        <h1>Reach patients who are due for a visit</h1>
        <p className="login__lede">Claim a patient, call them, and log how each call went.</p>

        <form className="login__form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button button--primary button--wide" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        {SHOW_DEMO_LOGINS && (
          <div className="login__demo">
            <p>Demo accounts (fake data only):</p>
            <ul>
              <li>
                <strong>admin</strong> with password outreach-admin-2026 imports files and sees everything
              </li>
              <li>
                <strong>agent1</strong> or <strong>agent2</strong> with password outreach-agent-2026 work the pool
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
