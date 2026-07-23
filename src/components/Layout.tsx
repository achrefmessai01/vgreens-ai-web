import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";
import { roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";

export default function Layout() {
  const { user, setUser } = useAuth();
  const { theme, toggle } = useTheme();

  async function signOut() {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="dot" /> vGreens AI</div>
        <nav className="nav">
          <NavLink to="/" end className={link}>Dashboard</NavLink>
          <NavLink to="/datasets" className={link}>Datasets</NavLink>
          <NavLink to="/jobs" className={link}>Jobs</NavLink>
          {roleAtLeast(user?.role, "operator") && (
            <NavLink to="/submit" className={link}>Submit</NavLink>
          )}
          <NavLink to="/models" className={link}>Models</NavLink>
          <NavLink to="/monitoring" className={link}>Monitoring</NavLink>
          {roleAtLeast(user?.role, "admin") && (
            <NavLink to="/admin" className={link}>Admin</NavLink>
          )}
        </nav>
        <div className="user-box">
          <button className="theme-toggle" style={{ marginRight: 10 }} onClick={toggle}
                  title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} aria-label="Toggle theme">
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <span className="muted">{user?.username}</span>
          <span className="badge info" style={{ marginLeft: 6 }}>{user?.role}</span>
          <button className="btn ghost" style={{ marginLeft: 10 }} onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="content"><Outlet /></main>
    </div>
  );
}

function link({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-item active" : "nav-item";
}
