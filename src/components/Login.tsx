import { useState } from "react";
import { api, ApiError } from "../api";
import type { AuthUser } from "../auth";

export default function Login({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(username.trim(), password);
      onAuthed(user as AuthUser);
    } catch (err) {
      let msg = "Something went wrong. Please try again.";
      if (err instanceof ApiError) {
        if (err.code === "auth" || err.status === 401) msg = "Invalid username or password.";
        else if (err.status === 403) msg = "This account is disabled. Contact an administrator.";
        else if (err.status === 429) msg = "Too many attempts. Wait a moment and try again.";
        else msg = err.message;
      }
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} aria-label="Sign in">
        <div className="brand big"><span className="dot" /> vGreens AI</div>
        <p className="muted" style={{ margin: 0 }}>Internal MLOps platform</p>
        <p className="hint muted" style={{ margin: "0 0 6px" }}>VPN access required · sign in with your platform account.</p>

        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" placeholder="username" value={username} autoFocus
                 autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <div style={{ position: "relative" }}>
            <input className="input" type={show ? "text" : "password"} placeholder="password"
                   value={password} autoComplete="current-password"
                   onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="btn ghost sm-btn"
                    style={{ position: "absolute", right: 6, top: 6 }}
                    onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {error && <div className="error-box" role="alert">{error}</div>}

        <button className="btn primary" disabled={busy || !username.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
