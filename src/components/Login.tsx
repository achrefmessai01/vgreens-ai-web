import { useState } from "react";
import { api, ApiError } from "../api";
import type { AuthUser } from "../auth";

export default function Login({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      const msg = err instanceof ApiError
        ? (err.code === "auth" ? "Invalid username or password." : err.message)
        : "Something went wrong.";
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big"><span className="dot" /> vGreens AI</div>
        <p className="muted">Sign in to the internal AI platform.</p>
        <input className="input" placeholder="Username" value={username} autoFocus
          autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={password}
          autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" disabled={busy || !username.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
