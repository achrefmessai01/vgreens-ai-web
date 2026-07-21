import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AdminUser, type TokenMeta } from "../api";
import { handleAuthLost } from "../auth";
import { fmt } from "../lib/format";

const ROLES = ["viewer", "operator", "admin"];

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  // create-user form
  const [nu, setNu] = useState({ username: "", password: "", role: "viewer" });
  // create-token form
  const [nt, setNt] = useState({ name: "", scopes: "jobs:read jobs:submit" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, t] = await Promise.all([api.adminUsers(), api.adminTokens()]);
      setUsers(u);
      setTokens(t);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null); setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Action failed.");
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    await run(() => api.adminCreateUser(nu), `user '${nu.username}' created`);
    setNu({ username: "", password: "", role: "viewer" });
  }

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null); setNewToken(null);
    try {
      const res = await api.adminCreateToken(nt);
      setNewToken(res.token);      // shown once
      setNt({ name: "", scopes: "jobs:read jobs:submit" });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Token creation failed.");
    }
  }

  return (
    <div className="dash">
      <div className="dash-head"><h1>Administration</h1>
        <button className="btn ghost" onClick={load}>Refresh</button></div>

      {notice && <div className="notice-box wide">{notice}</div>}
      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        <h2>Users</h2>
        <table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Active</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <select className="input sm" value={u.role}
                    onChange={(e) => run(() => api.adminUpdateUser(u.id, { role: e.target.value }),
                      `${u.username} → ${e.target.value}`)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  <button className="btn sm-btn" onClick={() => run(
                    () => api.adminUpdateUser(u.id, { active: !(u.active === 1 || u.active === true) }),
                    `${u.username} ${(u.active === 1 || u.active === true) ? "disabled" : "enabled"}`)}>
                    {(u.active === 1 || u.active === true) ? "active" : "disabled"}
                  </button>
                </td>
                <td className="muted">{fmt(u.last_login)}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sm-btn" onClick={() => {
                    const pw = window.prompt(`New password for ${u.username} (min 8 chars):`);
                    if (pw) run(() => api.adminResetPassword(u.id, pw), `password reset for ${u.username}`);
                  }}>Reset password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form className="form-2" style={{ marginTop: 14, alignItems: "end" }} onSubmit={createUser}>
          <div className="field"><label className="field-label">New username</label>
            <input className="input" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></div>
          <div className="field"><label className="field-label">Password (min 8)</label>
            <input className="input" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></div>
          <div className="field"><label className="field-label">Role</label>
            <select className="input" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <button className="btn primary" disabled={!nu.username || nu.password.length < 8}>Create user</button>
        </form>
      </section>

      <section className="panel">
        <h2>API tokens</h2>
        {newToken && (
          <div className="notice-box wide">
            New token (shown once — copy it now):<br />
            <span className="mono" style={{ wordBreak: "break-all" }}>{newToken}</span>
          </div>
        )}
        <table className="table">
          <thead><tr><th>ID</th><th>Name</th><th>Owner</th><th>Scopes</th><th>Created</th><th>State</th><th></th></tr></thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td>
                <td>{t.name}</td>
                <td className="muted">{t.owner}</td>
                <td className="mono metrics-cell">{t.scopes || "—"}</td>
                <td className="muted">{fmt(t.created_at)}</td>
                <td>{(t.revoked === 1 || t.revoked === true) ? <span className="badge bad">revoked</span> : <span className="badge ok">active</span>}</td>
                <td style={{ textAlign: "right" }}>
                  {!(t.revoked === 1 || t.revoked === true) && (
                    <button className="btn danger sm-btn" onClick={() =>
                      run(() => api.adminRevokeToken(t.id), `token ${t.id} revoked`)}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form className="form-2" style={{ marginTop: 14, alignItems: "end" }} onSubmit={createToken}>
          <div className="field"><label className="field-label">Token name</label>
            <input className="input" value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })}
              placeholder="e.g. ci-runner" /></div>
          <div className="field"><label className="field-label">Scopes (space-separated)</label>
            <input className="input" value={nt.scopes} onChange={(e) => setNt({ ...nt, scopes: e.target.value })} /></div>
          <button className="btn primary" disabled={!nt.name}>Create token</button>
        </form>
      </section>
    </div>
  );
}
