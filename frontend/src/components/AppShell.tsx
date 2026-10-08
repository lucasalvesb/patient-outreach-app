import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet } from "react-router";
import { api } from "../api/endpoints";
import { useAuth, useCurrentUser } from "../auth/AuthProvider";

export function AppShell() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const myWork = useQuery({ queryKey: ["my-work"], queryFn: api.myWork });
  const claimed = myWork.data?.length ?? 0;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">
            <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="7" />
              <path d="M11.2 7.5c.6-.4 1.4-.2 1.8.4l2 3.2c.4.6.2 1.4-.3 1.8l-1.6 1.2c.9 2 2.5 3.7 4.5 4.6l1.2-1.6c.4-.6 1.2-.7 1.8-.3l3.2 2c.6.4.8 1.2.4 1.8l-1.2 2c-.6 1-1.8 1.5-3 1.2-5.3-1.4-9.5-5.6-10.9-10.9-.3-1.2.2-2.4 1.2-3l.9-.4z" />
            </svg>
            <span className="brand__name">Visit Outreach</span>
          </Link>

          <nav className="mainnav" aria-label="Main">
            <NavLink to="/my-work">
              My work
              {claimed > 0 && (
                <>
                  <span className="count" aria-hidden="true">
                    {claimed}
                  </span>
                  <span className="visually-hidden">({claimed} claimed)</span>
                </>
              )}
            </NavLink>
            <NavLink to="/pool">Pool</NavLink>
            {user.is_admin && <NavLink to="/admin/patients">All patients</NavLink>}
            {user.is_admin && <NavLink to="/import">Import</NavLink>}
          </nav>

          <div className="usermenu">
            <span className="usermenu__name">
              {user.display_name}
              {user.is_admin && <span className="usermenu__role">Admin</span>}
            </span>
            <button type="button" className="button button--quiet" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
