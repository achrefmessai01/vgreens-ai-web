import { useEffect, useState, type ReactNode } from "react";

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  requirePhrase,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** if set, the user must type this exact string to enable the confirm button */
  requirePhrase?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  const ok = !requirePhrase || text === requirePhrase;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {body && <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{body}</div>}
        {requirePhrase && (
          <label className="field">
            <span className="field-label">Type <b className="mono">{requirePhrase}</b> to confirm</span>
            <input className="input" value={text} autoFocus autoComplete="off"
                   onChange={(e) => setText(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter" && ok && !busy) onConfirm(); }} />
          </label>
        )}
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} disabled={!ok || busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
