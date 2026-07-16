import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Job } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { fmt } from "../lib/format";

const STATUSES = ["", "queued", "running", "succeeded", "validated", "failed", "rejected", "cancelled"];
const TYPES = ["", "training", "processing"];
const PAGE = 20;

export default function JobsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [model, setModel] = useState("");
  const [offset, setOffset] = useState(0);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [status, type, model, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // reset to first page whenever a filter changes
  function onFilter(setter: (v: string) => void, v: string) {
    setter(v);
    setOffset(0);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <div className="dash">
      <div className="dash-head">
        <h1>Jobs</h1>
        <button className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="filters">
        <label>
          Status
          <select className="input sm" value={status} onChange={(e) => onFilter(setStatus, e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
          </select>
        </label>
        <label>
          Type
          <select className="input sm" value={type} onChange={(e) => onFilter(setType, e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t || "any"}</option>)}
          </select>
        </label>
        <label>
          Model
          <input
            className="input sm"
            placeholder="filter by model"
            value={model}
            onChange={(e) => onFilter(setModel, e.target.value)}
          />
        </label>
      </div>

      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        {jobs.length === 0 && !loading ? (
          <p className="muted">No jobs match.</p>
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
          <button className="btn" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            ← Prev
          </button>
          <button className="btn" disabled={to >= total || loading} onClick={() => setOffset(offset + PAGE)}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
