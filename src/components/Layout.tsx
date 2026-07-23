import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";

const TITLES: Record<string, string> = {
  "": "Overview", jobs: "Jobs", submit: "Submit job", models: "Models",
  datasets: "Datasets", monitoring: "Monitoring", admin: "Administration",
};

export default function Layout() {
  const { user, setUser } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
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

  const seg = loc.pathname.replace(/^\//, "").split("/")[0];
  const title = TITLES[seg] ?? (seg ? seg[0].toUpperCase() + seg.slice(1) : "Overview");

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><span className="dot" /><span className="brand-txt">vGreens AI</span></div>

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

        <div style={{ flex: 1 }} />
        <button className="side-link" onClick={() => setCollapsed((c) => !c)}
                style={{ border: "none", background: "none", cursor: "pointer", width: "100%" }}
                aria-label="Collapse sidebar">
          <span className="side-ic">{collapsed ? "»" : "«"}</span><span className="side-txt">Collapse</span>
        </button>
      </aside>

      <div>
        <header className="app-header">
          <div className="crumbs"><span className="cur">{title}</span></div>
          <span className="health-pill" title="Platform health">
            <span className={`hdot ${health.tone}`} />{health.label}
          </span>
          <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme"
                  title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <span className="muted">{user?.username}</span>
          <span className="badge info">{user?.role}</span>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </header>
        <main className="content"><Outlet /></main>
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
