import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type AdminUser, type AuditEvent, type TokenMeta } from "../api";
import { handleAuthLost } from "../auth";
import { useAuth } from "../AuthContext";
import { fmt, relTime } from "../lib/format";
import {
  PageHeader, ConfirmDialog, Drawer, OverflowMenu, SearchInput, Toolbar,
  EmptyState, Skeleton, useToast, type OverflowGroup,
} from "../ui";

const ROLES = ["viewer", "operator", "admin"];
const PAGE = 10;

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
function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function roleTone(role: string): string {
  return role === "admin" ? "info" : role === "operator" ? "active" : "muted";
}
function pwScore(pw: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { level: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length < 8) return { level: 1, label: "Too short (min 8)" };
  if (s <= 2) return { level: 1, label: "Weak" };
  if (s === 3) return { level: 2, label: "OK" };
  return { level: 3, label: "Strong" };
}

type Tab = "users" | "tokens" | "audit";

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
  const toast = useToast();

  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // users toolbar
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);

  // dialogs / drawers
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleDrawer, setRoleDrawer] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [tokenDrawer, setTokenDrawer] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [u, t, a] = await Promise.all([api.adminUsers(), api.adminTokens(), api.audit(40)]);
      setUsers(u);
      setTokens(t);
      setAudit(a);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(friendly(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // fire-and-reload for non-destructive actions → success/error toast
  const run = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await load(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      toast.error(friendly(e));
    }
  }, [load, toast]);

  async function confirmRun() {
    if (!dialog) return;
    setDialogBusy(true); setDialogError(null);
    try {
      await dialog.action();
      const ok = dialog.ok;
      setDialog(null);
      toast.success(ok);
      await load(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setDialogError(friendly(e));
    } finally {
      setDialogBusy(false);
    }
  }

  const adminCount = useMemo(
    () => users.filter((u) => u.role === "admin" && isActive(u)).length,
    [users]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !isActive(u)) return false;
      if (statusFilter === "disabled" && isActive(u)) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  useEffect(() => { setPage(0); }, [search, roleFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clampedPage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(clampedPage * PAGE, clampedPage * PAGE + PAGE);
  const from = filtered.length === 0 ? 0 : clampedPage * PAGE + 1;
  const to = Math.min(clampedPage * PAGE + PAGE, filtered.length);

  function openDelete(u: AdminUser) {
    setDialog({
      title: `Delete ${u.username}?`,
      danger: true,
      confirmLabel: "Delete permanently",
      requirePhrase: u.username,
      ok: `User '${u.username}' deleted`,
      action: () => api.adminDeleteUser(u.id),
      body: (
        <>
          This permanently removes the account. It only succeeds if the user has no active sessions,
          tokens, or jobs. Audit history is preserved. If you only want to retain history under an
          anonymous name, use <b>Anonymise</b> instead.
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
      ok: `User '${u.username}' anonymised`,
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

  // ----- users table row -----
  function userGroups(u: AdminUser): OverflowGroup[] {
    const self = me?.username === u.username;
    const active = isActive(u);
    return [
      {
        label: "Account",
        items: [
          { label: "Change role", onSelect: () => setRoleDrawer(u) },
          {
            label: "Reset password",
            onSelect: () => {
              const pw = window.prompt(`New password for ${u.username} (min 8 chars):`);
              if (pw) run(() => api.adminResetPassword(u.id, pw), `Password reset for ${u.username}`);
            },
          },
        ],
      },
      {
        label: "Sessions",
        items: [
          { label: "View sessions", onSelect: () => setDetail(u) },
          {
            label: "Force logout",
            disabled: self,
            title: self ? "You cannot force logout of your own active session." : undefined,
            onSelect: () => run(() => api.adminForceLogout(u.id), `${u.username} logged out everywhere`),
          },
        ],
      },
      {
        label: "Security",
        items: [
          active
            ? {
                label: "Disable account",
                disabled: self,
                title: self ? "You cannot disable your own account." : undefined,
                onSelect: () => run(() => api.adminDisableUser(u.id), `${u.username} disabled`),
              }
            : {
                label: "Enable account",
                onSelect: () => run(() => api.adminEnableUser(u.id), `${u.username} enabled`),
              },
        ],
      },
      {
        label: "Danger zone",
        danger: true,
        items: [
          {
            label: "Anonymise",
            danger: true,
            disabled: self,
            title: self ? "You cannot anonymise your own account." : undefined,
            onSelect: () => openAnonymise(u),
          },
          {
            label: "Delete",
            danger: true,
            disabled: self,
            title: self ? "You cannot delete your own account." : undefined,
            onSelect: () => openDelete(u),
          },
        ],
      },
    ];
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Users" }]}
        title="Users & access"
        description="Manage accounts, roles, sessions and platform permissions."
        actions={<button className="btn primary" onClick={() => setCreateOpen(true)}>Create user</button>}
      />

      <div className="tabs" role="tablist" aria-label="Administration sections">
        <button role="tab" aria-selected={tab === "users"} className={`tab ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}>Users<span className="tab-count">{users.length}</span></button>
        <button role="tab" aria-selected={tab === "tokens"} className={`tab ${tab === "tokens" ? "active" : ""}`}
          onClick={() => setTab("tokens")}>API tokens<span className="tab-count">{tokens.length}</span></button>
        <button role="tab" aria-selected={tab === "audit"} className={`tab ${tab === "audit" ? "active" : ""}`}
          onClick={() => setTab("audit")}>Audit log<span className="tab-count">{audit.length}</span></button>
      </div>

      {error && <div className="error-box wide" role="alert">{error}</div>}

      {tab === "users" && (
        <section>
          <Toolbar
            start={
              <>
                <SearchInput value={search} onChange={setSearch}
                  label="Search users" placeholder="Search username or display name…" />
                <label className="field-inline">Role
                  <select className="input sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                    <option value="">All</option>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="field-inline">Status
                  <select className="input sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </>
            }
            end={<button className="btn ghost" onClick={() => load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>}
          />

          <section className="panel">
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={24} />)}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState title="No users match your filters">
                <p className="muted">Adjust the search, role or status filters above.</p>
              </EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th>
                    <th>Sessions</th><th>Created</th><th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => {
                    const self = me?.username === u.username;
                    const active = isActive(u);
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="user-cell">
                            <span className="avatar" aria-hidden="true">{initials(u.display_name || u.username)}</span>
                            <div className="user-meta">
                              <span className="user-name">
                                {u.username}{self && <span className="chip-you">You</span>}
                              </span>
                              {u.display_name && <span className="muted" style={{ fontSize: 12 }}>{u.display_name}</span>}
                            </div>
                          </div>
                        </td>
                        <td><span className={`badge ${roleTone(u.role)}`}>{u.role}</span></td>
                        <td>
                          {active
                            ? <span className="badge ok status-dot">active</span>
                            : <span className="badge bad status-dot">disabled</span>}
                        </td>
                        <td className="muted" title={fmt(u.last_login)}>{relTime(u.last_login)}</td>
                        <td>
                          <button className="link" onClick={() => setDetail(u)}
                            aria-label={`View sessions for ${u.username}`}>View</button>
                        </td>
                        <td className="muted" title={fmt(u.created_at)}>{relTime(u.created_at)}</td>
                        <td className="actions-col">
                          <OverflowMenu label={`Actions for ${u.username}`} groups={userGroups(u)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {!loading && filtered.length > 0 && (
            <div className="pager">
              <span className="result-count">Showing {from}–{to} of {filtered.length} user{filtered.length === 1 ? "" : "s"}</span>
              <div className="pager-btns">
                <button className="btn" disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>← Prev</button>
                <button className="btn" disabled={to >= filtered.length} onClick={() => setPage(clampedPage + 1)}>Next →</button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "tokens" && (
        <section>
          <Toolbar end={<button className="btn primary" onClick={() => setTokenDrawer(true)}>Create token</button>} />
          <section className="panel">
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={24} />)}
              </div>
            ) : tokens.length === 0 ? (
              <EmptyState title="No API tokens">
                <p className="muted">Create a token to let CI or scripts call the API.</p>
              </EmptyState>
            ) : (
              <table className="table">
                <thead><tr><th>ID</th><th>Name</th><th>Owner</th><th>Scopes</th><th>Created</th><th>State</th><th className="actions-col"></th></tr></thead>
                <tbody>
                  {tokens.map((t) => {
                    const revoked = t.revoked === 1 || t.revoked === true;
                    return (
                      <tr key={t.id}>
                        <td className="mono">{t.id}</td>
                        <td>{t.name}</td>
                        <td className="muted">{t.owner}</td>
                        <td className="mono metrics-cell">{t.scopes || "—"}</td>
                        <td className="muted" title={fmt(t.created_at)}>{relTime(t.created_at)}</td>
                        <td>{revoked ? <span className="badge bad status-dot">revoked</span> : <span className="badge ok status-dot">active</span>}</td>
                        <td className="actions-col">
                          {!revoked && (
                            <button className="btn danger sm-btn" onClick={() =>
                              run(() => api.adminRevokeToken(t.id), `Token ${t.id} revoked`)}>Revoke</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </section>
      )}

      {tab === "audit" && (
        <section className="panel">
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={24} />)}
            </div>
          ) : audit.length === 0 ? (
            <EmptyState title="No audit events" />
          ) : (
            <table className="table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th>Source</th></tr></thead>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={i}>
                    <td className="muted" title={fmt(a.ts)}>{relTime(a.ts)}</td>
                    <td>{a.actor ?? "—"}</td>
                    <td className="mono">{a.action ?? "—"}</td>
                    <td className="mono">{a.target ?? "—"}{a.reason ? <span className="muted"> · {a.reason}</span> : null}</td>
                    <td>{a.result === "ok" || a.result == null
                      ? <span className="badge ok status-dot">ok</span>
                      : <span className="badge bad status-dot">{a.result}</span>}</td>
                    <td className="muted">{a.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {createOpen && (
        <CreateUserDrawer
          onClose={() => setCreateOpen(false)}
          onCreated={async (name) => { setCreateOpen(false); toast.success(`User '${name}' created`); await load(true); }}
        />
      )}

      {tokenDrawer && (
        <CreateTokenDrawer
          onClose={() => setTokenDrawer(false)}
          onCreated={async () => { await load(true); }}
        />
      )}

      {roleDrawer && (
        <RoleDrawer
          user={roleDrawer}
          isSelf={me?.username === roleDrawer.username}
          adminCount={adminCount}
          onClose={() => setRoleDrawer(null)}
          onApplyDirect={async (newRole) => {
            setRoleDrawer(null);
            await run(() => api.adminUpdateUser(roleDrawer.id, { role: newRole }), `${roleDrawer.username} → ${newRole}`);
          }}
          onConfirmNeeded={(newRole, body, danger) => {
            const target = roleDrawer;
            setRoleDrawer(null);
            setDialog({
              title: `Change role to ${newRole}?`,
              body,
              danger,
              confirmLabel: "Change role",
              ok: `${target.username} → ${newRole}`,
              action: () => api.adminUpdateUser(target.id, { role: newRole }),
            });
          }}
        />
      )}

      {detail && (
        <UserDetailDrawer user={detail} onClose={() => setDetail(null)} />
      )}

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

/* ------------------------------ Create user ------------------------------ */
function CreateUserDrawer({ onClose, onCreated }:
  { onClose: () => void; onCreated: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const score = pwScore(password);
  const userErr = touched && !username.trim() ? "Username is required." : null;
  const pwErr = touched && password.length < 8 ? "Password must be at least 8 characters." : null;
  const valid = username.trim().length > 0 && password.length >= 8;

  async function submit() {
    setTouched(true);
    if (!valid) return;
    setBusy(true); setErr(null);
    try {
      await api.adminCreateUser({
        username: username.trim(),
        password,
        role,
        ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
      });
      onCreated(username.trim());
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setErr(friendly(e));
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title="Create user"
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !valid}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </>
      }>
      {err && <div className="inline-alert" role="alert">{err}</div>}

      <div className="field">
        <label className="field-label" htmlFor="cu-username">Username</label>
        <input id="cu-username" className="input" value={username} autoFocus
          onChange={(e) => setUsername(e.target.value)} onBlur={() => setTouched(true)} />
        {userErr && <div className="field-error">{userErr}</div>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="cu-display">Display name <span className="muted">(optional)</span></label>
        <input id="cu-display" className="input" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="cu-role">Role</label>
        <select id="cu-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="cu-pw">Temporary password</label>
        <div className="pw-field">
          <input id="cu-pw" className="input" type={showPw ? "text" : "password"} value={password}
            autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched(true)} />
          <button type="button" className="btn ghost sm-btn pw-toggle"
            onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        <div className="pw-strength" aria-hidden="true">
          <span className={`pw-bar ${score.level >= 1 ? (score.level === 1 ? "on-weak" : score.level === 2 ? "on-ok" : "on-strong") : ""}`} />
          <span className={`pw-bar ${score.level >= 2 ? (score.level === 2 ? "on-ok" : "on-strong") : ""}`} />
          <span className={`pw-bar ${score.level >= 3 ? "on-strong" : ""}`} />
        </div>
        {score.label && <div className="pw-hint">Strength: {score.label}</div>}
        {pwErr && <div className="field-error">{pwErr}</div>}
      </div>
    </Drawer>
  );
}

/* ------------------------------ Create token ------------------------------ */
function CreateTokenDrawer({ onClose, onCreated }:
  { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("jobs:read jobs:submit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.adminCreateToken({ name: name.trim(), scopes });
      setToken(res.token);
      await onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    try { await navigator.clipboard.writeText(token); setCopied(true); } catch { /* ignore */ }
  }

  return (
    <Drawer open onClose={onClose} title="Create API token"
      footer={
        token ? (
          <button className="btn primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn primary" onClick={submit} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create token"}
            </button>
          </>
        )
      }>
      {err && <div className="inline-alert" role="alert">{err}</div>}

      {token ? (
        <>
          <div className="notice-box" style={{ margin: 0 }}>
            Copy this token now — it is shown only once.
          </div>
          <div className="field">
            <label className="field-label">Token</label>
            <div className="code-block" style={{ wordBreak: "break-all" }}>{token}</div>
            <button className="btn" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={copy}>
              {copied ? "Copied" : "Copy token"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label className="field-label" htmlFor="ct-name">Token name</label>
            <input id="ct-name" className="input" value={name} autoFocus placeholder="e.g. ci-runner"
              onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ct-scopes">Scopes <span className="muted">(space-separated)</span></label>
            <input id="ct-scopes" className="input" value={scopes} onChange={(e) => setScopes(e.target.value)} />
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ------------------------------ Role change ------------------------------ */
function RoleDrawer({ user, isSelf, adminCount, onClose, onApplyDirect, onConfirmNeeded }: {
  user: AdminUser;
  isSelf: boolean;
  adminCount: number;
  onClose: () => void;
  onApplyDirect: (role: string) => void;
  onConfirmNeeded: (role: string, body: ReactNode, danger: boolean) => void;
}) {
  const [role, setRole] = useState(user.role);
  const grantingAdmin = role === "admin" && user.role !== "admin";
  const removingAdmin = user.role === "admin" && role !== "admin";
  const wouldRemoveLastAdmin = removingAdmin && adminCount <= 1;
  const sensitive = grantingAdmin || removingAdmin || isSelf;
  const changed = role !== user.role;

  function apply() {
    if (!changed || wouldRemoveLastAdmin) return;
    if (sensitive) {
      const body = (
        <>
          {isSelf && <p style={{ margin: "0 0 8px" }}>You are changing <b>your own</b> role. You may lose access to this page.</p>}
          {grantingAdmin && <p style={{ margin: "0 0 8px" }}>This grants full administrator access to <b>{user.username}</b>.</p>}
          {removingAdmin && <p style={{ margin: 0 }}>This removes administrator access from <b>{user.username}</b>.</p>}
        </>
      );
      onConfirmNeeded(role, body, removingAdmin);
    } else {
      onApplyDirect(role);
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Change role — ${user.username}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={apply} disabled={!changed || wouldRemoveLastAdmin}
            title={wouldRemoveLastAdmin ? "You can't remove the last active administrator." : undefined}>
            Apply
          </button>
        </>
      }>
      <p className="muted" style={{ margin: 0 }}>Current role: <b className="mono">{user.role}</b></p>
      <div className="field" role="radiogroup" aria-label="Role">
        {ROLES.map((r) => (
          <label key={r} className="field-inline" style={{ gap: 8, padding: "6px 0", color: "var(--text)" }}>
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
            <b>{r}</b>
            <span className="muted" style={{ fontSize: 12 }}>
              {r === "admin" ? "Full platform control" : r === "operator" ? "Submit and manage jobs" : "Read-only access"}
            </span>
          </label>
        ))}
      </div>
      {wouldRemoveLastAdmin && (
        <div className="inline-alert" role="alert">
          You can't remove the last active administrator — the platform must always keep one.
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------ User detail (sessions) ------------------------------ */
function UserDetailDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [detail, setDetail] = useState<(AdminUser & { active_sessions: number; active_tokens: number; active_jobs: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.adminGetUser(user.id)
      .then((d) => { if (live) setDetail(d); })
      .catch((e) => { if (live) { if (e instanceof ApiError && e.code === "auth") return handleAuthLost(); setErr(friendly(e)); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user.id]);

  return (
    <Drawer open onClose={onClose} title={`Sessions — ${user.username}`}
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={40} />)}
        </div>
      ) : err ? (
        <div className="inline-alert" role="alert">{err}</div>
      ) : detail ? (
        <div className="tiles">
          <div className="stat"><div className="stat-label">Active sessions</div><div className="stat-value">{detail.active_sessions}</div></div>
          <div className="stat"><div className="stat-label">Active tokens</div><div className="stat-value">{detail.active_tokens}</div></div>
          <div className="stat"><div className="stat-label">Active jobs</div><div className="stat-value">{detail.active_jobs}</div></div>
          <div className="stat"><div className="stat-label">Last sign-in</div><div className="muted" style={{ marginTop: 6 }} title={fmt(detail.last_login)}>{relTime(detail.last_login)}</div></div>
        </div>
      ) : null}
    </Drawer>
  );
}
