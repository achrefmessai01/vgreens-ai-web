import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type SystemOverview, type Worker } from "../api";
import { handleAuthLost } from "../auth";
import { PageHeader, Button, EmptyState, Skeleton } from "../ui";
import { MetricCard, MetricCardSkeleton, type MetricStatus } from "../components/MetricCard";
import Trends from "../components/Trends";
import StatusBadge from "../components/StatusBadge";
import { fmt, relTime } from "../lib/format";
import "../styles/overview.css";

const GRAFANA_URL = (import.meta.env.VITE_GRAFANA_URL as string) || "/grafana/";

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

type Overall = "ok" | "degraded" | "down" | "unknown";
const OVERALL_LABEL: Record<Overall, string> = {
  ok: "Healthy", degraded: "Degraded", down: "Critical", unknown: "Status unknown",
};
const OVERALL_FLAG: Record<Overall, MetricStatus> = {
  ok: "ok", degraded: "warn", down: "bad", unknown: "unknown",
};

export default function MonitoringPage() {
  const [s, setS] = useState<SystemOverview | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [ready, setReady] = useState<boolean | undefined>(undefined);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [ovR, wR, hR] = await Promise.allSettled([
      api.systemOverview(), api.workers(), api.health(),
    ]);
    for (const r of [ovR, wR, hR]) {
      if (r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 401) {
        return handleAuthLost();
      }
    }
    if (ovR.status === "fulfilled") {
      setS(ovR.value);
      setUpdated(new Date());
      setLoadError(null);
    } else {
      setLoadError(ovR.reason instanceof Error ? ovR.reason.message : String(ovR.reason));
    }
    if (wR.status === "fulfilled") setWorkers(wR.value);
    setReady(hR.status === "fulfilled"
      ? ["ok", "ready"].includes((hR.value as { status?: string }).status ?? "")
      : undefined);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const header = (
    <PageHeader
      title="Monitoring"
      description="A curated health view of the platform. Full metrics live in Grafana."
      breadcrumbs={[{ label: "Monitoring" }]}
      actions={
        <>
          <span className="ov-meta">
            {updated ? `Updated ${updated.toLocaleTimeString()} · auto 15s` : "Loading…"}
          </span>
          <Button onClick={load} disabled={loading} variant="ghost">
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <a className="btn" href={GRAFANA_URL} target="_blank" rel="noreferrer noopener">
            Open Grafana ↗
          </a>
        </>
      }
    />
  );

  // First load, nothing yet.
  if (s === null && loadError === null) {
    return (
      <div>
        {header}
        <div className="metric-grid" style={{ marginTop: "var(--space-3)" }}>
          {Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <div style={{ marginTop: "var(--space-5)" }}><Skeleton height={160} /></div>
      </div>
    );
  }

  // Never loaded and the API is unreachable.
  if (s === null) {
    return (
      <div>
        {header}
        <EmptyState title="Monitoring unavailable">
          <p className="muted" style={{ marginTop: 6 }}>
            The monitoring API could not be reached ({loadError}). Health metrics cannot be shown.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
            <Button onClick={load} disabled={loading}>Retry</Button>
            <a className="btn" href={GRAFANA_URL} target="_blank" rel="noreferrer noopener">Open Grafana ↗</a>
          </div>
        </EmptyState>
      </div>
    );
  }

  // We have (possibly stale) data.
  const stale = loadError !== null;
  const overall = computeOverall(s, ready);
  const cards = subsystemCards(s, ready);

  return (
    <div>
      {header}

      {/* overall health summary */}
      <div className={`mon-summary st-${overall}`} role="status" aria-live="polite">
        <span className="mon-summary-title">
          <span className={`mc-flag mc-flag-${OVERALL_FLAG[overall]}`}>
            <span className="mc-shape" aria-hidden="true" />
          </span>
          {OVERALL_LABEL[overall]}
        </span>
        <span className="mon-summary-detail">{summaryDetail(s, ready, overall)}</span>
      </div>

      {stale && (
        <div className="mon-stale" role="alert">
          <span className="mc-shape" aria-hidden="true" />
          Metrics temporarily unavailable — last successful update:{" "}
          {relTime(updated ? updated.toISOString() : null)}. Showing the last known values.
        </div>
      )}

      {/* subsystem status cards */}
      <div className="mon-sub-grid">
        {loading && cards.length === 0
          ? Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)
          : cards.map((c) => <MetricCard key={c.title} {...c} />)}
      </div>

      {/* short trends (recharts) — has its own availability handling */}
      <div style={{ marginTop: "var(--space-5)" }}><Trends /></div>

      {/* active alerts */}
      <h3 className="mon-h">Active alerts</h3>
      {!s.alerts.available ? (
        <EmptyState title="Alert state unavailable">
          <p className="muted" style={{ marginTop: 4 }}>
            Metrics temporarily unavailable — Prometheus is unreachable, so firing alerts cannot be listed.
          </p>
        </EmptyState>
      ) : s.alerts.list.length === 0 ? (
        <EmptyState title="No alerts firing">
          <p className="muted" style={{ marginTop: 4 }}>All monitored conditions are within thresholds.</p>
        </EmptyState>
      ) : (
        <table className="table">
          <thead><tr><th>Severity</th><th>Alert</th><th>Component</th><th>Summary</th></tr></thead>
          <tbody>
            {s.alerts.list.map((a) => (
              <tr key={a.name}>
                <td><span className={`badge ${a.severity === "critical" ? "bad" : "warning"}`}>{a.severity}</span></td>
                <td>{a.name}</td>
                <td className="muted">{a.component ?? "—"}</td>
                <td>{a.summary ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* GPU detail */}
      <h3 className="mon-h">GPUs</h3>
      {s.gpus.length === 0 ? (
        <EmptyState title="No GPU data">
          <p className="muted" style={{ marginTop: 4 }}>GPU metrics are not being reported by any worker.</p>
        </EmptyState>
      ) : (
        <div className="mon-sub-grid">
          {s.gpus.map((g) => (
            <div key={g.index} className="metric-card mc-neutral">
              <div className="mc-title">GPU {g.index} · {g.name ?? "—"}</div>
              <div className="mc-sub" style={{ marginTop: 6 }}>
                util {g.utilization_pct != null ? `${g.utilization_pct}%` : "—"} ·{" "}
                {g.temperature_c != null ? `${g.temperature_c}°C` : "—"}
                <br />
                mem {g.memory_used_mb != null && g.memory_total_mb != null
                  ? `${g.memory_used_mb} / ${g.memory_total_mb} MB` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* workers detail */}
      <h3 className="mon-h">Workers</h3>
      {workers.length === 0 ? (
        <EmptyState title="No workers registered">
          <p className="muted" style={{ marginTop: 4 }}>No worker has checked in with the scheduler.</p>
        </EmptyState>
      ) : (
        <table className="table">
          <thead><tr><th>Worker</th><th>Status</th><th>Current job</th><th>Last seen</th><th>Heartbeat age</th></tr></thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.name}>
                <td className="mono">{w.name}</td>
                <td><StatusBadge status={w.online ? "online" : "offline"} /></td>
                <td className="mono">{w.current_job ?? "—"}</td>
                <td className="muted">{fmt(w.last_seen)}</td>
                <td className="muted">{secs(w.seconds_since_heartbeat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* queues detail */}
      <h3 className="mon-h">Queues</h3>
      {s.queues.length === 0 ? (
        <EmptyState title="No queues">
          <p className="muted" style={{ marginTop: 4 }}>No job queues are currently defined.</p>
        </EmptyState>
      ) : (
        <table className="table">
          <thead><tr><th>Type</th><th>Depth</th><th>Oldest</th></tr></thead>
          <tbody>
            {s.queues.map((q) => (
              <tr key={q.type}><td>{q.type}</td><td>{q.depth}</td><td>{secs(q.oldest_seconds)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="ov-meta" style={{ marginTop: "var(--space-5)" }}>
        Backups: {s.backups.count} on the NAS{s.backups.latest
          ? `, latest ${s.backups.latest} (${bytes(s.backups.size_bytes)})` : ""}.
        Detailed operator dashboards are in Grafana.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
function computeOverall(s: SystemOverview, ready: boolean | undefined): Overall {
  const crit =
    !s.nas_mounted ||
    s.workers.online === 0 && s.workers.total > 0 ||
    ready === false ||
    (s.alerts.available && s.alerts.firing.critical > 0) ||
    (s.backups.age_seconds != null && s.backups.age_seconds > 172800);
  if (crit) return "down";
  const warn =
    (s.workers.total > 0 && s.workers.online < s.workers.total) ||
    (s.alerts.available && s.alerts.firing.warning > 0) ||
    (s.backups.age_seconds != null && s.backups.age_seconds > 90000) ||
    (s.oldest_queued_seconds > 1800 && s.queued_total > 0);
  if (warn) return "degraded";
  return "ok";
}

function summaryDetail(s: SystemOverview, ready: boolean | undefined, overall: Overall): string {
  const issues: string[] = [];
  if (ready === false) issues.push("API health check failing");
  if (!s.nas_mounted) issues.push("NAS not mounted");
  if (s.workers.total > 0 && s.workers.online === 0) issues.push("all workers offline");
  else if (s.workers.total > 0 && s.workers.online < s.workers.total) {
    issues.push(`${s.workers.total - s.workers.online} worker(s) offline`);
  }
  if (s.alerts.available && s.alerts.firing.critical > 0) issues.push(`${s.alerts.firing.critical} critical alert(s)`);
  if (s.alerts.available && s.alerts.firing.warning > 0) issues.push(`${s.alerts.firing.warning} warning alert(s)`);
  if (s.backups.age_seconds != null && s.backups.age_seconds > 90000) issues.push("backups overdue");
  if (s.oldest_queued_seconds > 1800 && s.queued_total > 0) issues.push("jobs waiting in queue");

  if (overall === "ok") return "All monitored systems are operating normally.";
  const unknowns: string[] = [];
  if (!s.alerts.available) unknowns.push("alert state (Prometheus unreachable)");
  if (ready === undefined) unknowns.push("API health");
  let detail = issues.length ? issues.join(" · ") : "See details below.";
  if (unknowns.length) detail += ` — unavailable: ${unknowns.join(", ")}`;
  return detail;
}

function subsystemCards(s: SystemOverview, ready: boolean | undefined): {
  title: string; value: string; sub?: string; status: MetricStatus;
}[] {
  const cards: { title: string; value: string; sub?: string; status: MetricStatus }[] = [];

  // Services
  cards.push({
    title: "API services",
    value: ready === undefined ? "Unknown" : ready ? "Operational" : "Degraded",
    sub: ready === undefined ? "Health probe unavailable" : ready ? "Health probe passing" : "Health probe failing",
    status: ready === undefined ? "unknown" : ready ? "ok" : "bad",
  });

  // NAS
  cards.push({
    title: "NAS storage",
    value: s.nas_mounted ? "Mounted" : "Not mounted",
    sub: s.nas_mounted ? "Share reachable" : "Datasets & artifacts at risk",
    status: s.nas_mounted ? "ok" : "bad",
  });

  // Workers
  {
    const { online, total } = s.workers;
    const status: MetricStatus = total === 0 ? "unknown" : online === 0 ? "bad" : online < total ? "warn" : "ok";
    cards.push({
      title: "Worker fleet",
      value: total === 0 ? "None registered" : `${online}/${total} online`,
      sub: total === 0 ? "No workers checked in" : online === total ? "All workers healthy" : `${total - online} offline`,
      status,
    });
  }

  // Queue
  {
    const blocked = Number(s.jobs_by_status?.waiting_for_gpu ?? 0) + Number(s.jobs_by_status?.waiting_for_two_gpus ?? 0);
    const stuck = s.oldest_queued_seconds > 1800 && s.queued_total > 0;
    const status: MetricStatus = blocked > 0 || stuck ? "warn" : s.queued_total === 0 ? "ok" : "neutral";
    const sub = [`oldest ${secs(s.oldest_queued_seconds)}`];
    if (blocked > 0) sub.push(`${blocked} blocked on GPU`);
    cards.push({
      title: "Job queue",
      value: `${s.queued_total} queued`,
      sub: sub.join(" · "),
      status,
    });
  }

  // Backups
  {
    const a = s.backups.age_seconds;
    const status: MetricStatus = a == null ? "unknown" : a > 172800 ? "bad" : a > 90000 ? "warn" : "ok";
    cards.push({
      title: "Backups",
      value: a == null ? "None found" : `${secs(a)} old`,
      sub: s.backups.latest ? `latest ${s.backups.latest}` : `${s.backups.count} on NAS`,
      status,
    });
  }

  // Alerts — never report "healthy" when the source is unavailable.
  if (!s.alerts.available) {
    cards.push({
      title: "Active alerts",
      value: "Unavailable",
      sub: "Metrics temporarily unavailable (Prometheus unreachable)",
      status: "unknown",
    });
  } else {
    const { critical: crit, warning: warn } = s.alerts.firing;
    cards.push({
      title: "Active alerts",
      value: crit > 0 || warn > 0 ? `${crit} crit · ${warn} warn` : "None firing",
      sub: crit > 0 || warn > 0 ? "Firing alerts need attention" : "All clear",
      status: crit > 0 ? "bad" : warn > 0 ? "warn" : "ok",
    });
  }

  return cards;
}
