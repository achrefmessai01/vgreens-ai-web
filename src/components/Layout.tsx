import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";
import { roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";

export default function Layout() {
  const { user, setUser } = useAuth();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("vg-sidebar") === "1");
  const [health, setHealth] = useState<{ tone: string; label: string }>({ tone: "unknown", label: "…" });

  useEffect(() => { localStorage.setItem("vg-sidebar", collapsed ? "1" : "0"); }, [collapsed]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const o = await api.systemOverview();
        if (!live) return;
        const crit = !o.nas_mounted || o.workers.online === 0 || o.alerts.firing.critical > 0;
        const warn = o.workers.online < o.workers.total || o.alerts.firing.warning > 0;
        setHealth(crit ? { tone: "crit", label: "Critical" }
          : warn ? { tone: "warn", label: "Degraded" } : { tone: "ok", label: "Healthy" });
      } catch { if (live) setHealth({ tone: "unknown", label: "Unknown" }); }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  async function signOut() {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
  }

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <div className="brand"><span className="dot" /><span className="brand-txt">vGreens AI</span></div>

        <nav aria-label="Primary">
          <Group label="Platform">
            <Side to="/" icon="◧" text="Overview" end />
            <Side to="/jobs" icon="▤" text="Jobs" />
            <Side to="/datasets" icon="▦" text="Datasets" />
            <Side to="/models" icon="◈" text="Models" />
          </Group>

          <Group label="Operations">
            <Side to="/monitoring" icon="◔" text="Monitoring" />
            {roleAtLeast(user?.role, "operator") && <Side to="/submit" icon="＋" text="Submit job" />}
          </Group>

          {roleAtLeast(user?.role, "admin") && (
            <Group label="Administration"><Side to="/admin" icon="⚙" text="Admin" /></Group>
          )}
        </nav>

        <div style={{ flex: 1 }} />
        <button className="side-link" onClick={() => setCollapsed((c) => !c)}
                style={{ border: "none", background: "none", cursor: "pointer", width: "100%" }}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
          <span className="side-ic">{collapsed ? "»" : "«"}</span><span className="side-txt">Collapse</span>
        </button>
      </aside>

      <div>
        <header className="app-header">
          <span className="app-header-brand">vGreens AI</span>
          <div style={{ flex: 1 }} />
          <span className="health-pill" title="Platform health" role="status" aria-live="polite">
            <span className={`hdot ${health.tone}`} />{health.label}
          </span>
          <button className="theme-toggle" onClick={toggle}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                  title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <UserMenu
            username={user?.username ?? "—"}
            role={user?.role ?? ""}
            theme={theme}
            onToggleTheme={toggle}
            onSignOut={signOut}
          />
        </header>
        <main className="content" id="main" tabIndex={-1}>
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="side-group"><div className="side-group-label">{label}</div>{children}</div>;
}

function Side({ to, icon, text, end }: { to: string; icon: string; text: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} title={text}
             className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
      <span className="side-ic">{icon}</span><span className="side-txt">{text}</span>
    </NavLink>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function UserMenu({ username, role, theme, onToggleTheme, onSignOut }: {
  username: string; role: string; theme: "light" | "dark";
  onToggleTheme: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((focusBtn = true) => {
    setOpen(false);
    if (focusBtn) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div className="usermenu" ref={wrapRef}>
      <button ref={btnRef} type="button" className="usermenu-trigger"
              aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">{initials(username)}</span>
        <span className="usermenu-id">
          <span className="usermenu-name">{username}</span>
          <span className="usermenu-role">{role}</span>
        </span>
        <svg className="usermenu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="usermenu-pop" role="menu" aria-label="Account">
          <div className="usermenu-head">
            <div className="usermenu-name">{username}</div>
            <div className="usermenu-role muted">Signed in as {role || "user"}</div>
          </div>
          <button className="usermenu-item" role="menuitem" onClick={() => close()}>Profile</button>
          <button className="usermenu-item" role="menuitem"
                  onClick={() => { onToggleTheme(); }}>
            Theme: {theme === "dark" ? "Dark" : "Light"}
          </button>
          <div className="usermenu-sep" />
          <button className="usermenu-item danger" role="menuitem"
                  onClick={() => { close(false); onSignOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
