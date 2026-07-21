import { NavLink, Outlet } from "react-router-dom";
import { clearToken } from "../auth";

export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> vGreens AI
        </div>
        <nav className="nav">
          <NavLink to="/" end className={link}>Dashboard</NavLink>
          <NavLink to="/datasets" className={link}>Datasets</NavLink>
          <NavLink to="/jobs" className={link}>Jobs</NavLink>
          <NavLink to="/submit" className={link}>Submit</NavLink>
          <NavLink to="/models" className={link}>Models</NavLink>
        </nav>
        <button
          className="btn ghost"
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
        >
          Sign out
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function link({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-item active" : "nav-item";
}
