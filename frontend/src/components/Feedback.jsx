import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

const toastIcons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type] || Info;
        return (
          <div key={toast.id} className={`toast toast-${toast.type || "info"}`}>
            <Icon size={18} strokeWidth={2.2} />
            <div>
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Закрыть уведомление"
              title="Закрыть"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const cancelHandlerRef = useRef(onCancel);

  useEffect(() => {
    cancelHandlerRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelHandlerRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    cancelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel?.();
    }}>
      <section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className={`dialog-icon dialog-icon-${tone}`}>
          <AlertTriangle size={20} strokeWidth={2.2} />
        </div>
        <div>
          <h3 id="confirm-dialog-title">{title}</h3>
          <p>{message}</p>
        </div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={tone === "danger" ? "danger-button" : "primary-button"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function NamingDialog({
  open,
  value,
  isSaving,
  onChange,
  onSubmit,
  onSkip,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog naming-dialog" role="dialog" aria-modal="true" aria-labelledby="naming-dialog-title">
        <div className="dialog-icon dialog-icon-success">
          <CheckCircle2 size={20} strokeWidth={2.2} />
        </div>
        <div>
          <h3 id="naming-dialog-title">Назовите ваш анализ</h3>
          <p>Сохраните анализ под понятным именем, чтобы легко находить его позже.</p>
        </div>
        <form onSubmit={onSubmit} className="dialog-form">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Например, Контрольная работа 1"
            required
            autoFocus
          />
          <div className="dialog-actions">
            <button type="button" onClick={onSkip} disabled={isSaving} className="ghost-button">
              Пропустить
            </button>
            <button type="submit" disabled={isSaving} className="primary-button">
              {isSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
