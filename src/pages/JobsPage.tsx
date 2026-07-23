import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Job } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import { PageHeader, EmptyState, Skeleton } from "../ui";
import { fmt } from "../lib/format";

const STATUSES = ["", "queued", "running", "succeeded", "validated", "failed", "rejected", "cancelled"];
const TYPES = ["", "training", "processing"];
const PAGE = 20;

export default function JobsPage() {
  const navigate = useNavigate();
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

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <div>
      <PageHeader
        title="Jobs"
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

      <div className="filters">
        <label>
          Type
          <select className="input sm" value={type} onChange={(e) => onFilter(setType, e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t || "any"}</option>)}
          </select>
        </label>
        <label>
          Model
          <input className="input sm" placeholder="filter by model" value={model}
            onChange={(e) => onFilter(setModel, e.target.value)} />
        </label>
      </div>

      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        {firstLoad ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState title="No jobs match">
            <p className="muted">Try clearing filters{canOperate ? ", or submit a new job." : "."}</p>
            {canOperate && <button className="btn primary" onClick={() => navigate("/submit")}>Submit job</button>}
          </EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Job</th><th>Type</th><th>Model</th><th>Dataset</th><th>Status</th><th>Worker</th><th>Created</th></tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id} className="row-link" onClick={() => navigate(`/jobs/${j.job_id}`)}>
                  <td className="mono">{j.job_id}</td>
                  <td>{j.job_type}</td>
                  <td>{j.model_name}</td>
                  <td className="muted">{j.dataset_name ? `${j.dataset_name}:${j.dataset_version ?? "?"}` : "—"}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td className="muted">{j.worker_id ?? "—"}</td>
                  <td className="muted">{fmt(j.created_at)}</td>
                </tr>
              ))}
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
    </div>
  );
}
