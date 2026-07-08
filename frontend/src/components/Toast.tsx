import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  const tone: Record<ToastKind, string> = {
    success: "border-success-500 bg-success-500/10 text-success-600 dark:text-success-500",
    error: "border-danger-500 bg-danger-500/10 text-danger-600 dark:text-danger-500",
    info: "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400",
  };
  const icon: Record<ToastKind, string> = { success: "✓", error: "✕", info: "ℹ" };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg dark:bg-slate-900 ${tone[t.kind]}`}
          >
            <span aria-hidden className="font-bold">
              {icon[t.kind]}
            </span>
            <span className="text-slate-800 dark:text-slate-100">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
