import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Gpu, type Job, type Worker, type SystemOverview } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "./StatusBadge";
import { PageHeader } from "../ui";
import { fmt } from "../lib/format";

function age(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function HealthTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div style={{ marginTop: 6 }}><span className={`badge ${tone}`} style={{ fontSize: 14 }}>{value}</span></div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canOperate = roleAtLeast(user?.role, "operator");
  const [ov, setOv] = useState<SystemOverview | null>(null);
  const [ready, setReady] = useState<boolean | undefined>(undefined);
  const [version, setVersion] = useState<string>("—");
  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ver, health, overview, w, g, j] = await Promise.allSettled([
      api.version(), api.health(), api.systemOverview(), api.workers(), api.gpus(), api.jobs(8),
    ]);
    for (const r of [ver, health, overview, w, g, j]) {
      if (r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 401) {
        return handleAuthLost();
      }
    }
    if (ver.status === "fulfilled") setVersion(ver.value.version ?? "—");
    if (health.status === "fulfilled") setReady(["ok", "ready"].includes((health.value as { status?: string }).status ?? ""));
    if (overview.status === "fulfilled") setOv(overview.value);
    if (w.status === "fulfilled") setWorkers(w.value);
    if (g.status === "fulfilled") setGpus(g.value);
    if (j.status === "fulfilled") setJobs(j.value);
    setUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const jbs = ov?.jobs_by_status ?? {};
  const backupTone = ov?.backups.age_seconds == null ? "neutral"
    : ov.backups.age_seconds > 172800 ? "bad" : ov.backups.age_seconds > 90000 ? "warning" : "ok";
  const workersTone = !ov ? "neutral" : ov.workers.online === 0 ? "bad" : ov.workers.online < ov.workers.total ? "warning" : "ok";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Platform health and activity at a glance."
        actions={
          <>
            {updated && <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>updated {updated.toLocaleTimeString()}</span>}
            <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </>
        }
      />

      {/* health strip */}
      <div className="tiles" style={{ marginBottom: 16 }}>
        <HealthTile label="API" value={ready === undefined ? "unknown" : ready ? "ready" : "degraded"} tone={ready === undefined ? "neutral" : ready ? "ok" : "bad"} />
        <HealthTile label="NAS" value={ov ? (ov.nas_mounted ? "mounted" : "down") : "unknown"} tone={!ov ? "neutral" : ov.nas_mounted ? "ok" : "bad"} />
        <HealthTile label="Workers" value={ov ? `${ov.workers.online}/${ov.workers.total} online` : "unknown"} tone={workersTone} />
        <HealthTile label="Backup age" value={ov ? age(ov.backups.age_seconds) : "unknown"} tone={backupTone} />
        <HealthTile label="Alerts" value={ov ? (ov.alerts.available ? `${ov.alerts.firing.critical} crit / ${ov.alerts.firing.warning} warn` : "unknown") : "unknown"}
          tone={!ov || !ov.alerts.available ? "neutral" : ov.alerts.firing.critical ? "bad" : ov.alerts.firing.warning ? "warning" : "ok"} />
      </div>

      {/* KPIs */}
      <div className="tiles" style={{ marginBottom: 16 }}>
        <Kpi label="Queued" value={String(ov?.queued_total ?? 0)} />
        <Kpi label="Running" value={String(jbs.running ?? 0)} />
        <Kpi label="Failed (total)" value={String(jbs.failed ?? 0)} tone={jbs.failed ? "bad" : ""} />
        <Kpi label="Succeeded (total)" value={String(jbs.succeeded ?? 0)} tone="ok" />
        <Kpi label="GPUs" value={String(gpus.length)} />
        <Kpi label="Version" value={version} />
      </div>

      {/* quick actions */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {canOperate && <button className="btn primary" onClick={() => navigate("/submit")}>Submit job</button>}
        {canOperate && <button className="btn" onClick={() => navigate("/datasets/new")}>Import dataset</button>}
        <button className="btn" onClick={() => navigate("/monitoring")}>Open monitoring</button>
        <button className="btn" onClick={() => navigate("/models")}>Review models</button>
        {!canOperate && <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>Read-only access — actions require the operator role.</span>}
      </div>

      <section className="panel">
        <h2>GPUs</h2>
        {gpus.length === 0 ? <p className="muted">No GPU data.</p> : (
          <table className="table">
            <thead><tr><th>#</th><th>Name</th><th>Util</th><th>Memory</th><th>Temp</th></tr></thead>
            <tbody>
              {gpus.map((g) => (
                <tr key={g.index}>
                  <td>{g.index}</td>
                  <td>{g.name ?? "—"}</td>
                  <td>{g.utilization_pct != null ? `${g.utilization_pct}%` : "—"}</td>
                  <td>{g.memory_used_mb != null && g.memory_total_mb != null ? `${g.memory_used_mb} / ${g.memory_total_mb} MB` : "—"}</td>
                  <td>{g.temperature_c != null ? `${g.temperature_c}°C` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Workers</h2>
        {workers.length === 0 ? <p className="muted">No workers registered.</p> : (
          <table className="table">
            <thead><tr><th>Worker</th><th>Status</th><th>Current job</th><th>Last seen</th></tr></thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.name}>
                  <td className="mono">{w.name}</td>
                  <td><StatusBadge status={w.online ? "online" : "offline"} /></td>
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
        {jobs.length === 0 ? <p className="muted">No jobs yet.</p> : (
          <table className="table">
            <thead><tr><th>Job</th><th>Type</th><th>Model</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
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
