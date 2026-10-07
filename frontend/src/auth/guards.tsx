import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { EmptyState } from "../components/EmptyState";
import { useAuth, useCurrentUser } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loggedOut } = useAuth();
  const location = useLocation();
  if (!user) {
    // Remember where the user was going (a deep link, or an expired session) so they land
    // back there after logging in; after a deliberate log out, start fresh instead.
    const state = loggedOut ? undefined : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (!user.is_admin) {
    return <EmptyState title="This page is for admins">Ask an admin if you need a file imported or a patient moved.</EmptyState>;
  }
  return children;
}

export function homePath(isAdmin: boolean): string {
  return isAdmin ? "/admin/patients" : "/my-work";
}
