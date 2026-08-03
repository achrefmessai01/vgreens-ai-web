import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface OverflowItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** tooltip — e.g. why an action is disabled */
  title?: string;
  danger?: boolean;
  icon?: ReactNode;
}

export interface OverflowGroup {
  /** optional visible group label */
  label?: string;
  items: OverflowItem[];
  /** render as a visually-separated danger group */
  danger?: boolean;
}

/** A "⋯" icon button that opens a grouped menu. Closes on outside-click and
 *  Escape, traps focus while open, and supports arrow-key navigation. */
export function OverflowMenu({
  groups,
  label = "More actions",
  align = "right",
}: {
  groups: OverflowGroup[];
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const enabledItems = useCallback(
    () => Array.from(
      wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []
    ),
    []
  );

  const close = useCallback((focusBtn = true) => {
    setOpen(false);
    if (focusBtn) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => enabledItems()[0]?.focus(), 0);

    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const items = enabledItems();
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
      else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
      else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
      else if (e.key === "Tab") { e.preventDefault(); } // trap
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, enabledItems, close]);

  return (
    <div className="ovm" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="ovm-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className={`ovm-menu ${align === "left" ? "left" : "right"}`} id={menuId} role="menu" aria-label={label}>
          {groups.map((g, gi) => (
            <div className={`ovm-group ${g.danger ? "danger" : ""}`} role="group" aria-label={g.label} key={gi}>
              {g.label && <div className="ovm-group-label" aria-hidden="true">{g.label}</div>}
              {g.items.map((it, ii) => (
                <button
                  key={ii}
                  type="button"
                  role="menuitem"
                  className={`ovm-item ${it.danger ? "danger" : ""}`}
                  aria-disabled={it.disabled || undefined}
                  disabled={it.disabled}
                  title={it.title}
                  onClick={() => { if (!it.disabled) { close(false); it.onSelect(); } }}
                >
                  {it.icon && <span className="ovm-item-ic" aria-hidden="true">{it.icon}</span>}
                  <span className="ovm-item-label">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
