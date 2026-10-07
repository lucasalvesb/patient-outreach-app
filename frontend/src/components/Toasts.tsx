import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone; link?: { label: string; to: string } };
type Notify = (message: string, options?: { tone?: Tone; link?: Toast["link"] }) => void;

const ToastContext = createContext<Notify | null>(null);
const VISIBLE_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, options = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone: options.tone ?? "success", link: options.link }]);
      window.setTimeout(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <p>{toast.message}</p>
            {toast.link && (
              <Link to={toast.link.to} onClick={() => dismiss(toast.id)}>
                {toast.link.label}
              </Link>
            )}
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useNotify(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useNotify must be used inside <ToastProvider>");
  return notify;
}
