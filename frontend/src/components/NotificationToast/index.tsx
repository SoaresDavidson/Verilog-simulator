import { useSession } from "../../context/SessionContext";

// ── Tipos ─────────────────────────────────────────────────────────────────

export type ToastKind = "success" | "error" | "warning" | "info" | "loading";

// ── Ícone por tipo ─────────────────────────────────────────────────────────

function toastIcon(kind: ToastKind): string {
  switch (kind) {
    case "success":
      return "✓";
    case "error":
      return "✕";
    case "warning":
      return "⚠";
    case "loading":
      return "⟳";
    case "info":
    default:
      return "ℹ";
  }
}

function iconColor(kind: ToastKind): string {
  switch (kind) {
    case "success":
      return "var(--signal-ok)";
    case "error":
      return "var(--signal-flush)";
    case "warning":
      return "var(--signal-bubble)";
    case "loading":
      return "var(--text-muted)";
    case "info":
    default:
      return "var(--signal-active)";
  }
}

// ── Componente ────────────────────────────────────────────────────────────

export function NotificationToast() {
  const { toast, dismissToast } = useSession();

  if (!toast) return null;

  const kind = toast.kind as ToastKind;

  return (
    <div className="toast-container" aria-live="assertive" aria-atomic="true">
      <div className={`toast toast--${kind}`} role="alert">
        <span
          className="toast-icon"
          style={{ color: iconColor(kind) }}
          aria-hidden="true"
        >
          {kind === "loading" ? <span className="spinner" /> : toastIcon(kind)}
        </span>

        <div className="toast-body">
          <p className="toast-title">
            {kind === "success" && "Sucesso"}
            {kind === "error" && "Erro"}
            {kind === "warning" && "Atenção"}
            {kind === "loading" && "Aguarde"}
            {kind === "info" && "Informação"}
          </p>
          <p className="toast-message">{toast.message}</p>
        </div>

        <button
          className="toast-dismiss"
          onClick={dismissToast}
          aria-label="Fechar notificação"
        >
          ×
        </button>
      </div>
    </div>
  );
}
