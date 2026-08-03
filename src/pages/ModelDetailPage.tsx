import "../styles/models.css";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type AuditEvent, type ModelSummary, type ModelVersion } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import { PageHeader, ConfirmDialog, OverflowMenu, EmptyState, Skeleton, useToast, type OverflowGroup } from "../ui";
import { relTime } from "../lib/format";

/* ---- provenance: read optional lineage fields defensively (not in the typed
   view, so surfaced only when the API actually returns them) ---- */
interface Prov { dataset?: string; datasetVersion?: string; image?: string; commit?: string; created?: string; }
function provOf(v: ModelVersion): Prov {
  const r = v as unknown as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" && r[k] ? (r[k] as string) : undefined);
  return {
    dataset: s("dataset_name") ?? s("dataset"),
    datasetVersion: s("dataset_version"),
    image: s("docker_image") ?? s("image"),
    commit: s("git_commit") ?? s("commit"),
    created: s("created_at") ?? s("trained_at"),
  };
}
const num = (x: number | string | undefined): number =>
  typeof x === "number" ? x : Number(x);
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

type Action =
  | { kind: "promote"; version: string }
  | { kind: "rollback" };

export default function ModelDetailPage() {
  const { model = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = roleAtLeast(user?.role, "admin");

  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditEvent[] | null>(null);

  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [rollbackTo, setRollbackTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [compareVersion, setCompareVersion] = useState<string | null>(null);

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

  // Promotion history is derived from the audit log. It's admin-scoped, so we
  // only attempt it for managers and swallow any failure (never bounce auth).
  const loadHistory = useCallback(async () => {
    if (!canManage) { setHistory(null); return; }
    try {
      const events = await api.audit(200);
      const rows = events.filter((e) => {
        const a = (e.action ?? "").toLowerCase();
        const t = e.target ?? "";
        return (a.includes("promote") || a.includes("rollback")) &&
          (t === model || t.includes(model));
      });
      setHistory(rows);
    } catch {
      setHistory(null);
    }
  }, [canManage, model]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

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
      toast.success(action.kind === "promote"
        ? `Promoted — active is now ${res.active_version}.`
        : `Rolled back — active is now ${res.active_version}.`);
      await load();
      await loadHistory();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      const m = e instanceof Error ? e.message : "Action failed.";
      setModalError(m);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(force: boolean) {
    setDeleteBusy(true); setDeleteError(null);
    try {
      await api.deleteModel(model, force);
      toast.success(`Model ${model} deleted.`);
      navigate("/models");
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      if (e instanceof ApiError && e.code === "conflict") {
        setDeleteStep("force");
        setDeleteError(e.message);
      } else {
        const m = e instanceof Error ? e.message : "Delete failed.";
        setDeleteError(m);
        toast.error(m);
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  const versions = summary?.versions ?? [];
  const activeVersion = useMemo(() => versions.find((v) => v.active) ?? null, [versions]);
  const candidates = useMemo(() => versions.filter((v) => !v.active), [versions]);

  // Keep the compare selection valid as data changes.
  useEffect(() => {
    if (compareVersion && !candidates.some((v) => v.version === compareVersion)) setCompareVersion(null);
  }, [candidates, compareVersion]);

  const compared = useMemo(
    () => candidates.find((v) => v.version === compareVersion) ?? null,
    [candidates, compareVersion]
  );

  const provRows = useMemo(() => versions.map((v) => ({ v, p: provOf(v) })), [versions]);
  const hasProv = provRows.some(({ p }) => p.dataset || p.image || p.commit || p.created);

  // header actions: management moved into an overflow menu (danger zone for delete)
  const headerGroups: OverflowGroup[] = [
    {
      items: [{
        label: "Roll back…",
        onSelect: openRollback,
        disabled: !canManage || !summary?.active_version,
        title: !canManage ? "Requires the admin role."
          : !summary?.active_version ? "No active version to roll back from." : undefined,
      }],
    },
    {
      danger: true,
      label: "Danger zone",
      items: [{
        label: "Delete model…",
        danger: true,
        onSelect: () => { setDeleteError(null); setDeleteStep("confirm"); },
        disabled: !canManage,
        title: !canManage ? "Requires the admin role." : undefined,
      }],
    },
  ];

  function promoteTitle(v: ModelVersion): string | undefined {
    if (!canManage) return "Requires the admin role.";
    if (v.status !== "validated") return `Only validated versions can be promoted (status: ${v.status ?? "unknown"}).`;
    return undefined;
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Models", to: "/models" }, { label: model }]}
        title={model}
        description="Active version, candidate versions and promotion history for this model."
        actions={
          <>
            <button className="btn ghost" onClick={() => { load(); loadHistory(); }} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </button>
            <OverflowMenu label={`Manage ${model}`} groups={headerGroups} />
          </>
        }
      />

      {error && <div className="error-box wide" role="alert">{error}</div>}
      {!canManage && !error && (
        <p className="hint muted" style={{ marginBottom: 16 }}>Promotion, rollback and deletion require the admin role.</p>
      )}

      {loading && !summary ? (
        <>
          <div className="model-banner"><Skeleton height={44} /></div>
          <section className="panel">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={20} />)}
            </div>
          </section>
        </>
      ) : error && !summary ? (
        <EmptyState title="Couldn’t load model">
          <p className="muted">{error}</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={load}>Try again</button>
        </EmptyState>
      ) : summary ? (
        <>
          {/* identity + active version banner */}
          <div className={`model-banner ${activeVersion ? "" : "inactive"}`}>
            <div className="mb-main">
              <span className="mb-label">Active version</span>
              {activeVersion ? (
                <>
                  <span className="mb-version">
                    <span className="mono">{summary.active_version}</span>
                    <span className="active-tag">active</span>
                  </span>
                  <MetricChips metrics={activeVersion.metrics} />
                </>
              ) : (
                <>
                  <span className="mb-version muted">None</span>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    No version is serving yet. Promote a <strong>validated</strong> candidate to make it active.
                  </p>
                </>
              )}
            </div>
            <div className="mb-side">
              <span className="mb-count">{summary.version_count}</span>
              <span className="mb-label">version{summary.version_count === 1 ? "" : "s"}</span>
            </div>
          </div>

          {/* candidate versions */}
          <section className="panel">
            <div className="panel-head"><h2>Candidate versions</h2></div>
            {versions.length === 0 ? (
              <EmptyState title="No candidate versions">
                <p className="muted">Versions appear after a training job finishes for this model.</p>
              </EmptyState>
            ) : (
              <table className="table models-table">
                <thead>
                  <tr>
                    <th aria-label="Compare against active"></th>
                    <th>Version</th><th>Status</th><th>Metrics</th><th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const canPromote = canManage && v.status === "validated" && !v.active;
                    return (
                      <tr key={v.version}>
                        <td className="compare-radio">
                          {!v.active && activeVersion && (
                            <input
                              type="radio" name="compare"
                              checked={compareVersion === v.version}
                              onChange={() => setCompareVersion(v.version)}
                              aria-label={`Compare ${v.version} against active`}
                            />
                          )}
                        </td>
                        <td className="mono">
                          {v.version}{" "}
                          {v.active && <span className="active-tag" style={{ marginLeft: 6 }}>active</span>}
                        </td>
                        <td><StatusBadge status={v.status ?? "unknown"} /></td>
                        <td><MetricInline metrics={v.metrics} /></td>
                        <td className="actions-col">
                          {!v.active && (
                            <OverflowMenu
                              label={`Actions for ${v.version}`}
                              groups={[{ items: [{
                                label: "Promote to active",
                                onSelect: () => openPromote(v.version),
                                disabled: !canPromote,
                                title: promoteTitle(v),
                              }] }]}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="hint muted" style={{ marginTop: 10 }}>
              Only <strong>validated</strong> versions can be promoted — the API enforces this
              (an unvalidated or rejected version is refused with a conflict). Select a candidate to compare it with the active version.
            </p>
          </section>

          {/* candidate vs active comparison */}
          {activeVersion && candidates.length > 0 && (
            <ComparePanel active={activeVersion} candidate={compared} />
          )}

          {/* dataset lineage + provenance (only when the API returns it) */}
          {hasProv && (
            <section className="panel">
              <div className="panel-head"><h2>Dataset lineage &amp; provenance</h2></div>
              <table className="table models-table">
                <thead>
                  <tr>
                    <th>Version</th><th>Dataset</th><th>Image</th><th>Commit</th><th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {provRows.map(({ v, p }) => (
                    <tr key={v.version}>
                      <td className="mono">{v.version}{v.active && <span className="active-tag" style={{ marginLeft: 6 }}>active</span>}</td>
                      <td className="prov-src">{p.dataset ? `${p.dataset}${p.datasetVersion ? ` · ${p.datasetVersion}` : ""}` : <span className="muted">—</span>}</td>
                      <td className="prov-src">{p.image ?? <span className="muted">—</span>}</td>
                      <td className="prov-src">{p.commit ? p.commit.slice(0, 12) : <span className="muted">—</span>}</td>
                      <td className="muted" title={p.created}>{p.created ? relTime(p.created) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* promotion history */}
          {canManage && (
            <section className="panel">
              <div className="panel-head"><h2>Promotion history</h2></div>
              {history === null ? (
                <p className="muted">History is unavailable.</p>
              ) : history.length === 0 ? (
                <EmptyState title="No promotion events">
                  <p className="muted">Promotions and rollbacks for this model will be listed here.</p>
                </EmptyState>
              ) : (
                <ul className="timeline">
                  {history.map((e, i) => (
                    <li key={i}>
                      <span className="tl-dot" />
                      <div className="tl-body">
                        <div className="tl-top">
                          <StatusBadge status={(e.action ?? "event").includes("rollback") ? "rollback" : "promote"} />
                          <span className="tl-ts muted" title={e.ts ?? undefined}>{relTime(e.ts)}</span>
                          {e.result && <span className="muted" style={{ fontSize: 12 }}>· {e.result}</span>}
                        </div>
                        <div className="tl-worker muted">
                          {e.actor ?? "unknown"}{e.target ? ` → ${e.target}` : ""}
                        </div>
                        {e.reason && <div className="hist-reason">{e.reason}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      ) : null}

      {/* promote / rollback — reuses ConfirmDialog with a body for reason/target */}
      {action && (
        <ConfirmDialog
          title={action.kind === "promote" ? `Promote ${model} ${action.version}?` : `Roll back ${model}?`}
          confirmLabel={action.kind === "promote" ? "Promote" : "Roll back"}
          busy={busy}
          error={modalError}
          onConfirm={runAction}
          onCancel={() => { if (!busy) setAction(null); }}
          body={
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span>
                {action.kind === "promote"
                  ? "This makes the selected version the active model served for processing."
                  : "This restores a previous version as the active model."}
              </span>
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
                <textarea className="input" rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)} placeholder="optional" />
              </label>
            </div>
          }
        />
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

function MetricChips({ metrics }: { metrics: Record<string, number | string> }) {
  const keys = Object.keys(metrics ?? {});
  if (keys.length === 0) return <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>No metrics recorded.</p>;
  return (
    <div className="metric-chips">
      {keys.map((k) => (
        <span className="metric-chip" key={k}>
          <span className="mc-k">{k}</span>
          <span className="mc-v">{typeof metrics[k] === "number" ? round4(metrics[k] as number) : metrics[k]}</span>
        </span>
      ))}
    </div>
  );
}

function MetricInline({ metrics }: { metrics: Record<string, number | string> }) {
  const keys = Object.keys(metrics ?? {});
  if (keys.length === 0) return <span className="muted">—</span>;
  return (
    <span className="metrics-cell mono">
      {keys.map((k) => `${k}=${typeof metrics[k] === "number" ? round4(metrics[k] as number) : metrics[k]}`).join("  ")}
    </span>
  );
}

/** Candidate-vs-active metric comparison with signed deltas (text + shape). */
function ComparePanel({ active, candidate }: { active: ModelVersion; candidate: ModelVersion | null }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Compare · candidate vs active</h2>
      </div>
      {!candidate ? (
        <EmptyState title="Select a candidate">
          <p className="muted">Pick a candidate version in the table above to see its metric deltas against the active version <span className="mono">{active.version}</span>.</p>
        </EmptyState>
      ) : (() => {
        const keys = Array.from(new Set([...Object.keys(active.metrics ?? {}), ...Object.keys(candidate.metrics ?? {})])).sort();
        if (keys.length === 0) return <p className="muted">No metrics to compare.</p>;
        return (
          <>
            <table className="table models-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="mono">active · {active.version}</th>
                  <th className="mono">candidate · {candidate.version}</th>
                  <th>Δ (candidate − active)</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const va = active.metrics?.[k];
                  const vb = candidate.metrics?.[k];
                  const na = num(va), nb = num(vb);
                  const bothNum = Number.isFinite(na) && Number.isFinite(nb);
                  const delta = bothNum ? nb - na : null;
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="mono">{va ?? "—"}</td>
                      <td className="mono">{vb ?? "—"}</td>
                      <td><Delta delta={delta} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="hint muted" style={{ marginTop: 8 }}>
              Δ is candidate minus active. ▲ higher, ▼ lower — whether higher is better depends on the metric.
            </p>
          </>
        );
      })()}
    </section>
  );
}

function Delta({ delta }: { delta: number | null }): ReactNode {
  if (delta === null) return <span className="delta na">—</span>;
  if (delta === 0) return <span className="delta flat"><span className="delta-ar">●</span> no change</span>;
  const up = delta > 0;
  return (
    <span className={`delta ${up ? "up" : "down"}`}>
      <span className="delta-ar" aria-hidden="true">{up ? "▲" : "▼"}</span>
      {up ? "+" : ""}{round4(delta)}
    </span>
  );
}
