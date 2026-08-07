import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Job } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import {
  PageHeader, EmptyState, Skeleton, Toolbar, SearchInput,
  OverflowMenu, ConfirmDialog, useToast,
} from "../ui";
import { fmt, relTime } from "../lib/format";
import "../styles/jobs.css";

const STATUSES = ["", "queued", "running", "succeeded", "validated", "failed", "rejected", "cancelled"];
const TYPES = ["", "training", "processing"];
const PAGE = 20;
const CANCELLABLE = ["queued", "running"];

function shortId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default function JobsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canOperate = roleAtLeast(user?.role, "operator");

  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [model, setModel] = useState("");
  const [offset, setOffset] = useState(0);
  const [auto, setAuto] = useState(true);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  // cancel flow
  const [cancelTarget, setCancelTarget] = useState<Job | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await api.jobsQuery({
        status: status || undefined,
        job_type: type || undefined,
        model: model.trim() || undefined,
        limit: PAGE,
        offset,
      });
      setJobs(res.jobs);
      setTotal(res.total);
      setUpdated(new Date());
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [status, type, model, offset]);

  useEffect(() => { load(); }, [load]);

  // live refresh while there are active jobs on screen
  const hasActive = jobs.some((j) => ["queued", "running", "validating"].includes(j.status));
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!auto || !hasActive) return;
    const t = setInterval(() => loadRef.current(true), 8000);
    return () => clearInterval(t);
  }, [auto, hasActive]);

  function onFilter(setter: (v: string) => void, v: string) {
    setter(v);
    setOffset(0);
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Job ID copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function doCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await api.cancelJob(cancelTarget.job_id);
      toast.success("Cancellation requested.");
      setCancelTarget(null);
      load(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      const m = e instanceof Error ? e.message : "Cancel failed.";
      setCancelError(m);
      toast.error(m);
    } finally {
      setCancelBusy(false);
    }
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <div>
      <PageHeader
        title="Jobs"
        breadcrumbs={[{ label: "Jobs" }]}
        description="Training and processing runs across the platform."
        actions={
          <>
            {updated && <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>updated {updated.toLocaleTimeString()}</span>}
            <label className="row" style={{ gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto
            </label>
            <button className="btn ghost" onClick={() => load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            {canOperate && <button className="btn primary" onClick={() => navigate("/submit")}>Submit job</button>}
          </>
        }
      />

      {/* status chips */}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {STATUSES.map((s) => (
          <button key={s}
            className={`chip ${status === s ? "chip-active" : ""}`}
            onClick={() => onFilter(setStatus, s)}>
            {s || "all"}
          </button>
        ))}
      </div>

      <Toolbar
        start={
          <>
            <SearchInput
              value={model}
              onChange={(v) => onFilter(setModel, v)}
              label="Filter by model"
              placeholder="Filter by model…"
            />
            <label className="field-inline">
              Type
              <select className="input sm" value={type} onChange={(e) => onFilter(setType, e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t || "any"}</option>)}
              </select>
            </label>
          </>
        }
        end={!firstLoad && !error ? <span className="jobs-count">{from}–{to} of {total}</span> : undefined}
      />

      {error && (
        <div className="error-box wide" role="alert">
          {error}{" "}
          <button className="btn ghost sm-btn" style={{ marginLeft: 8 }} onClick={() => load()}>Retry</button>
        </div>
      )}

      <section className="panel">
        {firstLoad ? (
          <div className="sk-table">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="sk-row" key={i}>
                {Array.from({ length: 7 }).map((__, c) => <Skeleton key={c} height={16} />)}
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          error ? (
            <EmptyState title="Couldn’t load jobs">
              <p className="muted">Check your connection, then try again.</p>
              <button className="btn" onClick={() => load()}>Retry</button>
            </EmptyState>
          ) : (
            <EmptyState title="No jobs match">
              <p className="muted">Try clearing filters{canOperate ? ", or submit a new job." : "."}</p>
              {canOperate && <button className="btn primary" onClick={() => navigate("/submit")}>Submit job</button>}
            </EmptyState>
          )
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job</th><th>Type</th><th>Model</th><th>Dataset</th>
                <th>Status</th><th>Worker</th><th>Created</th><th className="cell-actions" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const cancellable = canOperate && CANCELLABLE.includes(j.status);
                return (
                  <tr key={j.job_id} className="row-link" onClick={() => navigate(`/jobs/${j.job_id}`)}>
                    <td>
                      <span className="id-cell">
                        <span className="mono" title={j.job_id}>{shortId(j.job_id)}</span>
                        <button
                          className="copy-btn"
                          aria-label={`Copy job id ${j.job_id}`}
                          title="Copy job id"
                          onClick={(e) => { e.stopPropagation(); copyId(j.job_id); }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    </td>
                    <td>{j.job_type}</td>
                    <td>{j.model_name}</td>
                    <td className="muted">{j.dataset_name ? `${j.dataset_name}:${j.dataset_version ?? "?"}` : "—"}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td className="muted">{j.worker_id ?? "—"}</td>
                    <td className="muted"><span title={fmt(j.created_at)}>{relTime(j.created_at)}</span></td>
                    <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                      {canOperate && (
                        <OverflowMenu
                          label={`Actions for job ${shortId(j.job_id)}`}
                          groups={[
                            { items: [{ label: "Clone / re-run", onSelect: () => navigate("/submit", { state: { prefill: {
                              job_type: j.job_type, model_name: j.model_name,
                              docker_image: j.docker_image ?? undefined,
                              dataset_name: j.dataset_name ?? undefined,
                              dataset_version: j.dataset_version ?? undefined,
                              tenant: j.tenant ?? undefined, config_path: j.config_path ?? undefined,
                            } } }) }] },
                            ...(cancellable ? [{
                              danger: true,
                              items: [{ label: "Cancel job", danger: true, onSelect: () => { setCancelError(null); setCancelTarget(j); } }],
                            }] : []),
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="pager">
        <span className="muted">{from}–{to} of {total}</span>
        <div className="pager-btns">
          <button className="btn" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Prev</button>
          <button className="btn" disabled={to >= total || loading} onClick={() => setOffset(offset + PAGE)}>Next →</button>
        </div>
      </div>

      {cancelTarget && (
        <ConfirmDialog
          title="Cancel job?"
          danger
          confirmLabel="Cancel job"
          busy={cancelBusy}
          error={cancelError}
          body={<>This asks the worker to stop <b className="mono">{shortId(cancelTarget.job_id)}</b>. This can’t be undone.</>}
          onCancel={() => { if (!cancelBusy) { setCancelTarget(null); setCancelError(null); } }}
          onConfirm={doCancel}
        />
      )}
    </div>
  );
}
