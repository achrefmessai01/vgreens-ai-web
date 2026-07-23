import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Gpu, type Job, type Worker } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "./StatusBadge";
import { fmt } from "../lib/format";

interface State {
  version?: string;
  gitCommit?: string;
  healthy?: boolean;
  healthChecks?: Record<string, unknown>;
  workers: Worker[];
  gpus: Gpu[];
  jobs: Job[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [s, setS] = useState<State>({ workers: [], gpus: [], jobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ver, health, workers, gpus, jobs] = await Promise.allSettled([
        api.version(),
        api.health(),
        api.workers(),
        api.gpus(),
        api.jobs(10),
      ]);
      // any auth failure => bounce to login
      for (const r of [ver, health, workers, gpus, jobs]) {
        if (r.status === "rejected" && r.reason instanceof ApiError && r.reason.code === "auth") {
          handleAuthLost();
          return;
        }
      }
      setS({
        version: val(ver)?.version,
        gitCommit: val(ver)?.git_commit,
        healthy: val(health) ? val(health)!.status === "ok" || val(health)!.status === "ready" : undefined,
        healthChecks: val(health)?.checks,
        workers: val(workers) ?? [],
        gpus: val(gpus) ?? [],
        jobs: val(jobs) ?? [],
      });
      setUpdated(new Date());
      const firstErr = [health, workers, gpus, jobs].find((r) => r.status === "rejected");
      if (firstErr && firstErr.status === "rejected") {
        setError(firstErr.reason instanceof Error ? firstErr.reason.message : "Some data failed to load.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // light auto-refresh
    return () => clearInterval(t);
  }, [load]);

  const onlineWorkers = s.workers.filter((w) => (w.status ?? "online") !== "offline");

  return (
    <div className="dash">
      <div className="dash-head">
        <h1>Dashboard</h1>
        <div className="dash-meta">
          {updated && <span className="muted">Updated {updated.toLocaleTimeString()}</span>}
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="error-box wide">{error}</div>}

      <section className="cards">
        <Card label="API health" value={s.healthy === undefined ? "?" : s.healthy ? "Ready" : "Degraded"}
          tone={s.healthy === undefined ? "muted" : s.healthy ? "ok" : "bad"} />
        <Card label="Version" value={s.version ?? "—"} sub={s.gitCommit ? `(${s.gitCommit})` : undefined} />
        <Card label="Workers online" value={String(onlineWorkers.length)} />
        <Card label="GPUs" value={String(s.gpus.length)} />
      </section>

      <section className="panel">
        <h2>GPUs</h2>
        {s.gpus.length === 0 ? (
          <p className="muted">No GPU data.</p>
        ) : (
          <table className="table">
            <thead><tr><th>#</th><th>Name</th><th>Util</th><th>Memory</th></tr></thead>
            <tbody>
              {s.gpus.map((g) => (
                <tr key={g.index}>
                  <td>{g.index}</td>
                  <td>{g.name ?? "—"}</td>
                  <td>{g.utilization_pct != null ? `${g.utilization_pct}%` : "—"}</td>
                  <td>{g.memory_used_mb != null && g.memory_total_mb != null ? `${g.memory_used_mb} / ${g.memory_total_mb} MB` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Workers</h2>
        {s.workers.length === 0 ? (
          <p className="muted">No workers registered.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Worker</th><th>Status</th><th>Current job</th><th>Last seen</th></tr></thead>
            <tbody>
              {s.workers.map((w) => (
                <tr key={w.worker_id}>
                  <td>{w.worker_id}</td>
                  <td><StatusBadge status={w.status ?? "online"} /></td>
                  <td className="mono">{w.current_job ?? "—"}</td>
                  <td className="muted">{fmt(w.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent jobs</h2>
          <Link to="/jobs" className="link">View all →</Link>
        </div>
        {s.jobs.length === 0 ? (
          <p className="muted">No jobs yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Job</th><th>Type</th><th>Model</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {s.jobs.map((j) => (
                <tr key={j.job_id} className="row-link" onClick={() => navigate(`/jobs/${j.job_id}`)}>
                  <td className="mono">{j.job_id}</td>
                  <td>{j.job_type}</td>
                  <td>{j.model_name}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td className="muted">{fmt(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" | "muted" }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value ${tone ?? ""}`}>{value}</div>
      {sub && <div className="card-sub muted">{sub}</div>}
    </div>
  );
}

function val<T>(r: PromiseSettledResult<T>): T | undefined {
  return r.status === "fulfilled" ? r.value : undefined;
}
