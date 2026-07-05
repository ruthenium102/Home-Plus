import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface Toast {
  id: string;
  message: string;
  /** Optional undo handler — when set, shows "Undo" button on the toast */
  onUndo?: () => void;
  /** ms until auto-dismiss. Default 4000. */
  duration?: number;
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = 't-' + Math.random().toString(36).slice(2, 10);
    setToasts((prev) => [...prev, { ...toast, id }]);
    const duration = toast.duration ?? 4000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none w-full px-4"
      // Ride above the dock AND the home indicator on notched phones.
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {toasts.map((t) => (
        <ToastPill key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastPill({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // trigger entry animation
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleUndo = () => {
    toast.onUndo?.();
    onDismiss();
  };

  return (
    <div
      className={
        'pointer-events-auto flex items-center gap-3 px-4 py-2.5 bg-text text-bg rounded-full shadow-lg transition-[opacity,transform] duration-200 ' +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2')
      }
      // Cap to the viewport so long undo messages don't overflow small phones.
      style={{ minWidth: 240, maxWidth: '100%' }}
    >
      <span className="text-sm flex-1">{toast.message}</span>
      {toast.onUndo && (
        <button
          onClick={handleUndo}
          className="text-sm font-medium uppercase tracking-wider hover:opacity-70"
          style={{ color: 'rgb(var(--accent))' }}
        >
          Undo
        </button>
      )}
      <button
        onClick={onDismiss}
        className="text-sm opacity-50 hover:opacity-100 ml-1"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
