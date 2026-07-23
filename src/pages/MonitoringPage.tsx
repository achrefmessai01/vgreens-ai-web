import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type SystemOverview } from "../api";
import { handleAuthLost } from "../auth";

function secs(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 90) return `${Math.round(n)}s`;
  if (n < 5400) return `${Math.round(n / 60)}m`;
  if (n < 172800) return `${Math.round(n / 3600)}h`;
  return `${Math.round(n / 86400)}d`;
}

function bytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card" style={{ minWidth: 150, flex: "1 1 150px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>
        <span className={`badge ${tone}`} style={{ fontSize: 18 }}>{value}</span>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const [s, setS] = useState<SystemOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setS(await api.systemOverview());
      setError(null);
      setUpdated(new Date());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return handleAuthLost();
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="card bad">Monitoring unavailable: {error}</div>;
  if (!s) return <div className="card">Loading monitoring…</div>;

  const workersTone = s.workers.online === 0 ? "bad" : s.workers.online < s.workers.total ? "run" : "ok";
  const nasTone = s.nas_mounted ? "ok" : "bad";
  const backupTone = s.backups.age_seconds == null ? "neutral"
    : s.backups.age_seconds > 172800 ? "bad" : s.backups.age_seconds > 90000 ? "run" : "ok";
  const alertsAvail = s.alerts.available;
  const crit = s.alerts.firing.critical, warn = s.alerts.firing.warning;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Monitoring</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {updated ? `updated ${updated.toLocaleTimeString()}` : ""} · auto-refresh 15s
        </span>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <Tile label="NAS" value={s.nas_mounted ? "mounted" : "down"} tone={nasTone} />
        <Tile label="Workers online" value={`${s.workers.online}/${s.workers.total}`} tone={workersTone} />
        <Tile label="Queued jobs" value={String(s.queued_total)} tone={s.queued_total > 20 ? "run" : "neutral"} />
        <Tile label="Oldest queued" value={secs(s.oldest_queued_seconds)} tone={s.oldest_queued_seconds > 1800 ? "run" : "neutral"} />
        <Tile label="Backup age" value={secs(s.backups.age_seconds)} tone={backupTone} />
        <Tile label="Alerts firing" value={alertsAvail ? `${crit} crit / ${warn} warn` : "unknown"} tone={!alertsAvail ? "neutral" : crit > 0 ? "bad" : warn > 0 ? "run" : "ok"} />
      </div>

      <h3 style={{ marginTop: 20 }}>Active alerts</h3>
      {!alertsAvail ? (
        <div className="card neutral">Alert state unavailable (Prometheus unreachable).</div>
      ) : s.alerts.list.length === 0 ? (
        <div className="card ok">No alerts firing.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Severity</th><th>Alert</th><th>Component</th><th>Summary</th></tr></thead>
          <tbody>
            {s.alerts.list.map((a) => (
              <tr key={a.name}>
                <td><span className={`badge ${a.severity === "critical" ? "bad" : "run"}`}>{a.severity}</span></td>
                <td>{a.name}</td>
                <td className="muted">{a.component ?? "—"}</td>
                <td>{a.summary ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 20 }}>GPUs</h3>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        {s.gpus.length === 0 ? <div className="card neutral">No GPU data.</div> : s.gpus.map((g) => (
          <div key={g.index} className="card" style={{ minWidth: 200, flex: "1 1 200px" }}>
            <div style={{ fontWeight: 600 }}>GPU {g.index} · {g.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              util {g.utilization_pct}% · {g.temperature_c}°C<br />
              mem {g.memory_used_mb}/{g.memory_total_mb} MB
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 20 }}>Queues</h3>
      <table className="table">
        <thead><tr><th>Type</th><th>Depth</th><th>Oldest</th></tr></thead>
        <tbody>
          {s.queues.map((q) => (
            <tr key={q.type}><td>{q.type}</td><td>{q.depth}</td><td>{secs(q.oldest_seconds)}</td></tr>
          ))}
        </tbody>
      </table>

      <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
        Backups: {s.backups.count} on the NAS{s.backups.latest ? `, latest ${s.backups.latest} (${bytes(s.backups.size_bytes)})` : ""}.
        Detailed operator dashboards are in Grafana.
      </p>
    </div>
  );
}
