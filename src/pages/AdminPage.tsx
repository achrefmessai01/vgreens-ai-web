import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type AdminUser, type AuditEvent, type TokenMeta } from "../api";
import { handleAuthLost } from "../auth";
import { useAuth } from "../AuthContext";
import { fmt } from "../lib/format";
import { ConfirmDialog } from "../ui";

const ROLES = ["viewer", "operator", "admin"];

// server conflict codes → operator-friendly text
const CONFLICT: Record<string, string> = {
  USER_HAS_ACTIVE_SESSIONS: "This user still has active sessions. Force logout first, then delete.",
  USER_HAS_ACTIVE_TOKENS: "This user owns active API tokens. Revoke them first, then delete.",
  USER_HAS_ACTIVE_JOBS: "This user has queued or running jobs. Wait for them to finish (or cancel them) first.",
  USER_IS_FINAL_ADMIN: "You can't remove the last active administrator — the platform must always keep one.",
  CANNOT_DELETE_SELF: "You can't delete your own account.",
  CANNOT_DISABLE_SELF: "You can't disable your own account.",
  CANNOT_ANONYMISE_SELF: "You can't anonymise your own account.",
};
function friendly(e: unknown): string {
  if (e instanceof ApiError) return CONFLICT[e.message] ?? e.message;
  return e instanceof Error ? e.message : "Action failed.";
}
function isActive(u: AdminUser): boolean {
  return u.active === 1 || u.active === true;
}

type DialogSpec = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  requirePhrase?: string;
  ok: string;
  action: () => Promise<unknown>;
};

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [nu, setNu] = useState({ username: "", password: "", role: "viewer" });
  const [nt, setNt] = useState({ name: "", scopes: "jobs:read jobs:submit" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, t, a] = await Promise.all([api.adminUsers(), api.adminTokens(), api.audit(40)]);
      setUsers(u);
      setTokens(t);
      setAudit(a);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(friendly(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // fire-and-reload for non-destructive actions
  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null); setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(friendly(e));
    }
  }

  async function confirmRun() {
    if (!dialog) return;
    setDialogBusy(true); setDialogError(null);
    try {
      await dialog.action();
      const ok = dialog.ok;
      setDialog(null);
      setNotice(ok);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setDialogError(friendly(e));
    } finally {
      setDialogBusy(false);
    }
  }

  function openDelete(u: AdminUser) {
    setDialog({
      title: `Delete ${u.username}?`,
      danger: true,
      confirmLabel: "Delete permanently",
      requirePhrase: u.username,
      ok: `user '${u.username}' deleted`,
      action: () => api.adminDeleteUser(u.id),
      body: (
        <>
          This permanently removes the account. It only succeeds if the user has no active sessions,
          tokens, or jobs. If you only want to retain history, use <b>Anonymise</b> instead.
        </>
      ),
    });
  }

  function openAnonymise(u: AdminUser) {
    setDialog({
      title: `Anonymise ${u.username}?`,
      danger: true,
      confirmLabel: "Anonymise",
      requirePhrase: u.username,
      ok: `user '${u.username}' anonymised`,
      action: () => api.adminAnonymiseUser(u.id),
      body: (
        <>
          The account is renamed to <b className="mono">deleted_user_{u.id}</b>, its sessions and tokens
          are revoked, and its password is scrambled. Audit history is kept but no longer names the person.
          This cannot be undone.
        </>
      ),
    });
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
      setNewToken(res.token);
      setNt({ name: "", scopes: "jobs:read jobs:submit" });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(friendly(e));
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
          <thead><tr><th>User</th><th>Role</th><th>State</th><th>Last login</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = me?.username === u.username;
              const active = isActive(u);
              return (
                <tr key={u.id}>
                  <td>{u.username}{self && <span className="muted"> (you)</span>}</td>
                  <td>
                    <select className="input sm" value={u.role}
                      onChange={(e) => run(() => api.adminUpdateUser(u.id, { role: e.target.value }),
                        `${u.username} → ${e.target.value}`)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    {active
                      ? <span className="badge ok">active</span>
                      : <span className="badge bad">disabled</span>}
                  </td>
                  <td className="muted">{fmt(u.last_login)}</td>
                  <td>
                    <div className="actions-cell">
                      {active
                        ? <button className="btn sm-btn" disabled={self}
                            title={self ? "You can't disable yourself" : "Disable and log out"}
                            onClick={() => run(() => api.adminDisableUser(u.id), `${u.username} disabled`)}>Disable</button>
                        : <button className="btn sm-btn"
                            onClick={() => run(() => api.adminEnableUser(u.id), `${u.username} enabled`)}>Enable</button>}
                      <button className="btn sm-btn"
                        onClick={() => run(() => api.adminForceLogout(u.id), `${u.username} logged out everywhere`)}>Force logout</button>
                      <button className="btn sm-btn"
                        onClick={() => {
                          const pw = window.prompt(`New password for ${u.username} (min 8 chars):`);
                          if (pw) run(() => api.adminResetPassword(u.id, pw), `password reset for ${u.username}`);
                        }}>Reset password</button>
                      <button className="btn danger sm-btn" disabled={self}
                        title={self ? "You can't anonymise yourself" : undefined}
                        onClick={() => openAnonymise(u)}>Anonymise</button>
                      <button className="btn danger sm-btn" disabled={self}
                        title={self ? "You can't delete yourself" : undefined}
                        onClick={() => openDelete(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
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

      <section className="panel">
        <h2>Audit log</h2>
        {audit.length === 0 ? <p className="muted">No audit events.</p> : (
          <table className="table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th>Source</th></tr></thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td className="muted">{fmt(a.ts)}</td>
                  <td>{a.actor ?? "—"}</td>
                  <td className="mono">{a.action ?? "—"}</td>
                  <td className="mono">{a.target ?? "—"}{a.reason ? <span className="muted"> · {a.reason}</span> : null}</td>
                  <td>{a.result === "ok" || a.result == null
                    ? <span className="badge ok">ok</span>
                    : <span className="badge bad">{a.result}</span>}</td>
                  <td className="muted">{a.source ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          requirePhrase={dialog.requirePhrase}
          busy={dialogBusy}
          error={dialogError}
          onConfirm={confirmRun}
          onCancel={() => { if (!dialogBusy) { setDialog(null); setDialogError(null); } }}
        />
      )}
    </div>
  );
}
