import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/AuthProvider";
import { homePath, RequireAdmin, RequireAuth } from "./auth/guards";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { AdminPatientsPage } from "./pages/AdminPatientsPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { MyWorkPage } from "./pages/MyWorkPage";
import { PoolPage } from "./pages/PoolPage";

export function App() {
  const { user, checking } = useAuth();
  if (checking) return <p className="loading loading--page">Loading…</p>;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to={homePath(Boolean(user?.is_admin))} replace />} />
        <Route path="my-work" element={<MyWorkPage />} />
        <Route path="pool" element={<PoolPage />} />
        <Route
          path="import"
          element={
            <RequireAdmin>
              <ImportPage />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/patients"
          element={
            <RequireAdmin>
              <AdminPatientsPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<EmptyState title="Page not found">Use the menu above to find your way.</EmptyState>} />
      </Route>
    </Routes>
  );
}
