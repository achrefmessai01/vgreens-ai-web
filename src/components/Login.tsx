import { useState } from "react";
import { api, ApiError } from "../api";
import { setToken } from "../auth";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [token, setTok] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setToken(token);
    try {
      await api.probe(); // validates token against /version
      onAuthed();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === "auth"
            ? "That token was rejected by the API."
            : err.message
          : "Something went wrong.";
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big">
          <span className="dot" /> vGreens AI
        </div>
        <p className="muted">Internal platform. Paste your API token to continue.</p>
        <input
          type="password"
          className="input"
          placeholder="API token"
          value={token}
          autoFocus
          onChange={(e) => setTok(e.target.value)}
        />
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" disabled={busy || !token.trim()}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <p className="hint muted">
          The token is the same bearer token used by the CLI. It is stored only in
          this browser.
        </p>
      </form>
    </div>
  );
}
