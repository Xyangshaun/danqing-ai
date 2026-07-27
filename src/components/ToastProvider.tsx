import {
  createContext, useContext, useState, useCallback, type ReactNode,
} from 'react';
import {
  CheckCircle2, AlertCircle, Info, AlertTriangle, X, type LucideIcon,
} from 'lucide-react';

/* ====== 类型 ====== */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  desc?: string;
  duration: number;
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void;
  success: (title: string, desc?: string) => void;
  error: (title: string, desc?: string) => void;
  warning: (title: string, desc?: string) => void;
  info: (title: string, desc?: string) => void;
  dismiss: (id: string) => void;
}

/* ====== Context ====== */
const ToastContext = createContext<ToastContextValue | null>(null);

/* ====== 配置 ====== */
const typeConfig: Record<ToastType, { icon: LucideIcon; bg: string; iconColor: string; border: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-rice-50', iconColor: 'text-jade', border: 'border-jade/30' },
  error: { icon: AlertCircle, bg: 'bg-rice-50', iconColor: 'text-cinnabar', border: 'border-cinnabar/30' },
  warning: { icon: AlertTriangle, bg: 'bg-rice-50', iconColor: 'text-gold-dark', border: 'border-gold/30' },
  info: { icon: Info, bg: 'bg-rice-50', iconColor: 'text-stone', border: 'border-stone/30' },
};

/* ====== Provider ====== */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = t.duration ?? 3500;
      const item: ToastItem = { ...t, id, duration };
      setToasts((list) => [...list, item]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const success = useCallback((title: string, desc?: string) => toast({ type: 'success', title, desc }), [toast]);
  const error = useCallback((title: string, desc?: string) => toast({ type: 'error', title, desc }), [toast]);
  const warning = useCallback((title: string, desc?: string) => toast({ type: 'warning', title, desc }), [toast]);
  const info = useCallback((title: string, desc?: string) => toast({ type: 'info', title, desc }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ====== Hook ====== */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/* ====== 视图层（右上角堆叠，符合生态软件习惯） ====== */
function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-16 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => {
        const cfg = typeConfig[t.type];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto ${cfg.bg} ${cfg.border} border rounded-md shadow-overlay animate-slide-down overflow-hidden`}
          >
            <div className="flex items-start gap-3 p-3">
              <div className={`w-5 h-5 flex-shrink-0 mt-0.5`}>
                <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-900">{t.title}</p>
                {t.desc && <p className="text-xs text-ink-500 mt-0.5 break-words">{t.desc}</p>}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                className="w-5 h-5 flex items-center justify-center text-ink-400 hover:text-ink-700 rounded transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* 进度条 */}
            {t.duration > 0 && (
              <div className="h-0.5 bg-ink-900/5">
                <div
                  className={`h-full ${cfg.iconColor.replace('text-', 'bg-')}`}
                  style={{
                    animation: `toastProgress ${t.duration}ms linear forwards`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
