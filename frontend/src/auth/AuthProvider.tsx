import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onUnauthorized } from "../api/client";
import { api } from "../api/endpoints";
import type { CurrentUser } from "../api/types";

type AuthState = {
  user: CurrentUser | null;
  checking: boolean; // true until we know whether a session exists
  /** True after a deliberate log out, so the next login starts from that user's home page. */
  loggedOut: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => undefined) // No session yet: show the login page.
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 (session expired, logged out elsewhere) sends the user back to the login page.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        queryClient.clear();
      }),
    [queryClient],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const me = await api.login(username, password);
      queryClient.clear();
      setLoggedOut(false);
      setUser(me);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      queryClient.clear();
      setLoggedOut(true);
      setUser(null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, checking, loggedOut, login, logout }),
    [user, checking, loggedOut, login, logout],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

/** The logged-in user, for pages that only render behind RequireAuth. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser needs a logged-in user");
  return user;
}
