import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type ModelSummary, type ModelVersion } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import { PageHeader, ConfirmDialog } from "../ui";
import { metricStr } from "../lib/format";

type Action =
  | { kind: "promote"; version: string }
  | { kind: "rollback" };

export default function ModelDetailPage() {
  const { model = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = roleAtLeast(user?.role, "admin");

  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [rollbackTo, setRollbackTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [compare, setCompare] = useState<string[]>([]);

  const [deleteStep, setDeleteStep] = useState<null | "confirm" | "force">(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await api.modelSummary(model));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load model.");
    } finally {
      setLoading(false);
    }
  }, [model]);

  useEffect(() => { load(); }, [load]);

  function openPromote(version: string) { setReason(""); setModalError(null); setAction({ kind: "promote", version }); }
  function openRollback() { setReason(""); setRollbackTo(""); setModalError(null); setAction({ kind: "rollback" }); }

  async function runAction() {
    if (!action) return;
    setBusy(true); setModalError(null);
    try {
      const res = action.kind === "promote"
        ? await api.promoteModel(model, action.version, reason || undefined)
        : await api.rollbackModel(model, rollbackTo.trim() || undefined, reason || undefined);
      setAction(null);
      setNotice(action.kind === "promote"
        ? `Promoted — active is now ${res.active_version}.`
        : `Rolled back — active is now ${res.active_version}.`);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setModalError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(force: boolean) {
    setDeleteBusy(true); setDeleteError(null);
    try {
      await api.deleteModel(model, force);
      navigate("/models");
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      if (e instanceof ApiError && e.code === "conflict") {
        // active version — offer the force path
        setDeleteStep("force");
        setDeleteError(e.message);
      } else {
        setDeleteError(e instanceof Error ? e.message : "Delete failed.");
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  function toggleCompare(version: string) {
    setCompare((cur) =>
      cur.includes(version) ? cur.filter((v) => v !== version)
      : cur.length >= 2 ? [cur[1], version]   // keep the last two picked
      : [...cur, version]);
  }

  const versions = summary?.versions ?? [];
  const cmp = useMemo(() => versions.filter((v) => compare.includes(v.version)), [versions, compare]);

  return (
    <div>
      <Link to="/models" className="link" style={{ display: "inline-block", marginBottom: 8 }}>← All models</Link>
      <PageHeader
        title={model}
        actions={
          <>
            {canManage && (
              <button className="btn" onClick={openRollback} disabled={loading || !summary?.active_version}>Rollback…</button>
            )}
            {canManage && (
              <button className="btn danger" onClick={() => { setDeleteError(null); setDeleteStep("confirm"); }} disabled={loading}>Delete…</button>
            )}
            <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "…" : "Refresh"}</button>
          </>
        }
      />

      {notice && <div className="notice-box wide">{notice}</div>}
      {error && <div className="error-box wide">{error}</div>}

      {summary && (
        <>
          <section className="panel">
            <div className="kv">
              <div className="kv-row"><div className="kv-k">Active version</div>
                <div className="kv-v mono">{summary.active_version ?? <span className="muted">none</span>}</div></div>
              <div className="kv-row"><div className="kv-k">Versions</div>
                <div className="kv-v">{summary.version_count}</div></div>
            </div>
            {!canManage && <p className="hint muted" style={{ marginTop: 8 }}>Promote and rollback require the admin role.</p>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Versions</h2>
              {compare.length > 0 && <button className="btn ghost sm-btn" onClick={() => setCompare([])}>Clear compare</button>}
            </div>
            {versions.length === 0 ? (
              <p className="muted">No versions.</p>
            ) : (
              <table className="table">
                <thead><tr><th></th><th>Version</th><th>Status</th><th>Metrics</th><th></th></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version}>
                      <td>
                        <input type="checkbox" checked={compare.includes(v.version)}
                          onChange={() => toggleCompare(v.version)} aria-label={`compare ${v.version}`} />
                      </td>
                      <td className="mono">
                        {v.version} {v.active && <span className="badge ok" style={{ marginLeft: 6 }}>active</span>}
                      </td>
                      <td><StatusBadge status={v.status ?? "unknown"} /></td>
                      <td className="mono metrics-cell">{metricStr(v.metrics)}</td>
                      <td style={{ textAlign: "right" }}>
                        {canManage && v.status === "validated" && !v.active && (
                          <button className="btn primary sm-btn" onClick={() => openPromote(v.version)}>Promote</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint muted" style={{ marginTop: 10 }}>
              Only <strong>validated</strong> versions can be promoted — the API enforces this
              (a rejected or unvalidated version is refused with a conflict). Tick two versions to compare metrics.
            </p>
          </section>

          {cmp.length === 2 && <ComparePanel a={cmp[0]} b={cmp[1]} />}
        </>
      )}

      {action && (
        <div className="modal-overlay" role="presentation" onClick={() => { if (!busy) setAction(null); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{action.kind === "promote" ? `Promote ${model} ${action.version}?` : `Roll back ${model}?`}</h3>
            <div className="muted" style={{ fontSize: 13 }}>
              {action.kind === "promote"
                ? "This makes the selected version the active model served for processing."
                : "This restores a previous version as the active model."}
            </div>
            {action.kind === "rollback" && (
              <label className="field">
                <span className="field-label">Roll back to</span>
                <select className="input" value={rollbackTo} onChange={(e) => setRollbackTo(e.target.value)}>
                  <option value="">previous active</option>
                  {versions.filter((v) => !v.active).map((v) => (
                    <option key={v.version} value={v.version}>{v.version}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span className="field-label">Reason (recorded in the audit log)</span>
              <textarea className="input" rows={2} value={reason} autoFocus
                onChange={(e) => setReason(e.target.value)} placeholder="optional" />
            </label>
            {modalError && <div className="error-box" role="alert">{modalError}</div>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setAction(null)} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={runAction} disabled={busy}>
                {busy ? "Working…" : action.kind === "promote" ? "Promote" : "Roll back"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteStep === "confirm" && (
        <ConfirmDialog
          title={`Delete model ${model}?`}
          danger
          requirePhrase={model}
          busy={deleteBusy}
          error={deleteError}
          confirmLabel="Delete"
          body={<>The model is archived and removed from the registry. If it has an active version the API refuses unless you force it.</>}
          onConfirm={() => runDelete(false)}
          onCancel={() => { if (!deleteBusy) { setDeleteStep(null); setDeleteError(null); } }}
        />
      )}

      {deleteStep === "force" && (
        <ConfirmDialog
          title={`Force delete ${model}?`}
          danger
          requirePhrase={model}
          busy={deleteBusy}
          error={deleteError}
          confirmLabel="Force delete"
          body={<>This model has an active version. Force delete removes it anyway — processing that relies on it will stop serving.</>}
          onConfirm={() => runDelete(true)}
          onCancel={() => { if (!deleteBusy) { setDeleteStep(null); setDeleteError(null); } }}
        />
      )}
    </div>
  );
}

function ComparePanel({ a, b }: { a: ModelVersion; b: ModelVersion }) {
  const keys = Array.from(new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)])).sort();
  const num = (x: number | string | undefined) => (typeof x === "number" ? x : Number(x));
  return (
    <section className="panel">
      <h2>Compare · <span className="mono">{a.version}</span> vs <span className="mono">{b.version}</span></h2>
      {keys.length === 0 ? <p className="muted">No metrics to compare.</p> : (
        <table className="table">
          <thead><tr><th>Metric</th><th className="mono">{a.version}</th><th className="mono">{b.version}</th><th>Δ</th></tr></thead>
          <tbody>
            {keys.map((k) => {
              const va = a.metrics[k], vb = b.metrics[k];
              const na = num(va), nb = num(vb);
              const bothNum = Number.isFinite(na) && Number.isFinite(nb);
              const delta = bothNum ? nb - na : null;
              const tone = delta == null || delta === 0 ? "" : delta > 0 ? "ok" : "bad";
              return (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="mono">{va ?? "—"}</td>
                  <td className="mono">{vb ?? "—"}</td>
                  <td className={`mono ${tone}`}>
                    {delta == null ? "—" : `${delta > 0 ? "+" : ""}${(Math.round(delta * 1e4) / 1e4)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="hint muted" style={{ marginTop: 8 }}>Δ is {b.version} minus {a.version}; green is higher, red is lower (direction is metric-dependent).</p>
    </section>
  );
}
