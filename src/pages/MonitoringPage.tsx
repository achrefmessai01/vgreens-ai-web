import { useCallback, useEffect, useState } from "react";
import {
  api, ApiError, type SystemOverview, type Worker, type MonitorSnapshot, type MonitorGpu,
} from "../api";
import { handleAuthLost } from "../auth";
import { PageHeader, Button, EmptyState, Skeleton, Badge } from "../ui";
import { MetricCard, MetricCardSkeleton, type MetricStatus } from "../components/MetricCard";
import Trends from "../components/Trends";
import StatusBadge from "../components/StatusBadge";
import { fmt, relTime } from "../lib/format";
import "../styles/overview.css";

const GRAFANA_URL = (import.meta.env.VITE_GRAFANA_URL as string) || "/grafana/";
const STALE_MS = 15000;

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

function pct(used: number | null | undefined, total: number | null | undefined): number | null {
  if (used == null || total == null || total <= 0) return null;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

/** Bar colour class: red when nearly full/saturated, amber when high. */
function barTone(p: number | null | undefined): string {
  if (p == null) return "";
  if (p >= 90) return "bad";
  if (p >= 75) return "warn";
  return "";
}

type Overall = "ok" | "degraded" | "down" | "unknown";
const OVERALL_LABEL: Record<Overall, string> = {
  ok: "Healthy", degraded: "Degraded", down: "Critical", unknown: "Status unknown",
};
const OVERALL_FLAG: Record<Overall, MetricStatus> = {
  ok: "ok", degraded: "warn", down: "bad", unknown: "unknown",
};

type Conn = "connecting" | "connected" | "reconnecting";
const CONN_META: Record<Conn, { cls: string; label: string }> = {
  connecting: { cls: "offline", label: "Connecting…" },
  connected: { cls: "live", label: "Live" },
  reconnecting: { cls: "reconnecting", label: "Reconnecting…" },
};

export default function MonitoringPage() {
  const [snap, setSnap] = useState<MonitorSnapshot | null>(null);
  const [ready, setReady] = useState<boolean | undefined>(undefined);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Manual retry for the "never loaded" case (the SSE stream reconnects on its own).
  const retry = useCallback(() => {
    api.monitorSnapshot()
      .then((s) => { setSnap(s); setUpdated(new Date()); setLoadError(null); })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return handleAuthLost();
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    let alive = true;

    // Health is not part of the stream payload — fetch it once so the summary's
    // "API services" card stays meaningful.
    api.health()
      .then((h) => { if (alive) setReady(["ok", "ready"].includes((h as { status?: string }).status ?? "")); })
      .catch(() => { if (alive) setReady(undefined); });

    // Initial snapshot so the page paints immediately (before the first SSE frame).
    api.monitorSnapshot()
      .then((s) => { if (!alive) return; setSnap(s); setUpdated(new Date()); setLoadError(null); })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) return handleAuthLost();
        setLoadError(e instanceof Error ? e.message : String(e));
      });

    // Live updates over SSE. EventSource sends the vg_session cookie automatically
    // (withCredentials) and auto-reconnects on error — we never close it here.
    const es = new EventSource(api.monitorStreamUrl(), { withCredentials: true });
    es.onopen = () => { if (alive) setConn("connected"); };
    es.onmessage = (ev) => {
      if (!alive) return;
      try {
        const s = JSON.parse(ev.data) as MonitorSnapshot;
        setSnap(s);
        setUpdated(new Date());
        setConn("connected");
        setLoadError(null);
      } catch { /* ignore a malformed frame; keep last known data */ }
    };
    es.onerror = () => { if (alive) setConn("reconnecting"); }; // keep last data visible

    // UI-only ticker so "last updated" / stale note re-render (NOT API polling).
    const tick = setInterval(() => setTick((t) => t + 1), 5000);

    return () => { alive = false; es.close(); clearInterval(tick); };
  }, []);

  const connMeta = CONN_META[conn];
  const header = (
    <PageHeader
      title="Monitoring"
      description="A live health view of the platform. Full metrics live in Grafana."
      breadcrumbs={[{ label: "Monitoring" }]}
      actions={
        <>
          <span className={`mon-conn ${connMeta.cls}`}>
            <span className="mon-conn-dot" aria-hidden="true" />
            {connMeta.label}
          </span>
          <span className="ov-meta">
            {updated ? `Updated ${relTime(updated.toISOString())}` : "Loading…"}
          </span>
          <a className="btn" href={GRAFANA_URL} target="_blank" rel="noreferrer noopener">
            Open Grafana ↗
          </a>
        </>
      }
    />
  );

  // First load, nothing yet.
  if (snap === null && loadError === null) {
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
  if (snap === null) {
    return (
      <div>
        {header}
        <EmptyState title="Monitoring unavailable">
          <p className="muted" style={{ marginTop: 6 }}>
            The monitoring API could not be reached ({loadError}). Health metrics cannot be shown.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
            <Button onClick={retry}>Retry</Button>
            <a className="btn" href={GRAFANA_URL} target="_blank" rel="noreferrer noopener">Open Grafana ↗</a>
          </div>
        </EmptyState>
      </div>
    );
  }

  // We have data (possibly stale if the stream dropped).
  const s = snap.overview;
  const workers = snap.workers ?? [];
  const gpus = snap.gpus ?? [];
  const storage = snap.storage;
  const stale = updated != null && Date.now() - updated.getTime() > STALE_MS;
  const overall = computeOverall(s, ready);
  const cards = subsystemCards(s, ready);

  // Combined live problem feed: firing alerts + recent failed jobs.
  const alertList = s.alerts?.list ?? [];
  const errList = snap.recent_errors ?? [];

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
          Live stream interrupted — last update {relTime(updated ? updated.toISOString() : null)}.
          Showing the last known values while reconnecting.
        </div>
      )}

      {/* subsystem status cards */}
      <div className="mon-sub-grid">
        {cards.map((c) => <MetricCard key={c.title} {...c} />)}
      </div>

      {/* short trends (recharts) — has its own availability handling */}
      <div style={{ marginTop: "var(--space-5)" }}><Trends /></div>

      {/* live alerts + recent errors */}
      <h3 className="mon-h">Alerts &amp; recent errors</h3>
      {!s.alerts?.available && alertList.length === 0 && errList.length === 0 ? (
        <EmptyState title="Alert state unavailable">
          <p className="muted" style={{ marginTop: 4 }}>
            Metrics temporarily unavailable — Prometheus is unreachable, so firing alerts cannot be listed.
          </p>
        </EmptyState>
      ) : alertList.length === 0 && errList.length === 0 ? (
        <EmptyState title="No alerts firing">
          <p className="muted" style={{ marginTop: 4 }}>All monitored conditions are within thresholds and no jobs have failed recently.</p>
        </EmptyState>
      ) : (
        <table className="table">
          <thead><tr><th>Severity</th><th>Source</th><th>Component</th><th>Summary</th></tr></thead>
          <tbody>
            {alertList.map((a) => (
              <tr key={`alert-${a.name}`}>
                <td><span className={`badge ${a.severity === "critical" ? "bad" : "warning"}`}>{a.severity}</span></td>
                <td>{a.name}</td>
                <td className="muted">{a.component ?? "—"}</td>
                <td>{a.summary ?? ""}</td>
              </tr>
            ))}
            {errList.map((e) => (
              <tr key={`err-${e.job_id}`}>
                <td><span className="badge bad">failed job</span></td>
                <td className="mono">{e.job_id}</td>
                <td className="muted">{e.model_name ?? "—"}</td>
                <td className="muted">{e.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* GPU detail (live, per-GPU) */}
      <h3 className="mon-h">GPUs</h3>
      {gpus.length === 0 ? (
        <EmptyState title="No GPU data">
          <p className="muted" style={{ marginTop: 4 }}>GPU metrics are not being reported (nvidia-smi unavailable).</p>
        </EmptyState>
      ) : (
        <div className="mon-sub-grid">
          {gpus.map((g) => <GpuCard key={g.index} g={g} />)}
        </div>
      )}

      {/* storage: NAS + NVMe cache */}
      <h3 className="mon-h">Storage</h3>
      <div className="mon-sub-grid">
        <StorageCard
          title={`NAS · ${storage.nas_path}`}
          mounted={storage.nas_mounted}
          total={storage.nas_total_bytes}
          free={storage.nas_free_bytes}
          unmountedLabel="Not mounted"
        />
        <StorageCard
          title={`NVMe cache · ${storage.nvme_path}`}
          mounted={storage.nvme_total_bytes != null}
          total={storage.nvme_total_bytes}
          free={storage.nvme_free_bytes}
          unmountedLabel="Unavailable"
        />
      </div>

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
            {workers.map((w: Worker) => (
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

      {/* recent jobs */}
      <h3 className="mon-h">Recent jobs</h3>
      {snap.recent_jobs.length === 0 ? (
        <EmptyState title="No jobs yet">
          <p className="muted" style={{ marginTop: 4 }}>No jobs have been submitted.</p>
        </EmptyState>
      ) : (
        <table className="table">
          <thead><tr><th>Job</th><th>Model</th><th>Status</th><th>Duration</th><th>Details</th></tr></thead>
          <tbody>
            {snap.recent_jobs.map((j) => (
              <tr key={j.job_id}>
                <td className="mono" title={j.job_id}>{j.job_id}</td>
                <td>{j.model_name ?? "—"}</td>
                <td><Badge status={j.status} /></td>
                <td className="muted">{secs(j.duration_seconds)}</td>
                <td className="muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {j.status === "failed" && j.error
                    ? <span style={{ color: "var(--danger)" }} title={j.error}>{j.error}</span>
                    : <span className="mono" title={j.output_path ?? undefined}>{j.output_path ?? "—"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* queues detail */}
      <h3 className="mon-h">Queues</h3>
      {(s.queues?.length ?? 0) === 0 ? (
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
        Backups: {s.backups?.count ?? 0} on the NAS{s.backups?.latest
          ? `, latest ${s.backups.latest} (${bytes(s.backups.size_bytes)})` : ""}.
        Detailed operator dashboards are in Grafana.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
function GpuCard({ g }: { g: MonitorGpu }) {
  const util = g.utilization_pct ?? null;
  const memP = pct(g.memory_used_mb, g.memory_total_mb);
  return (
    <div className="metric-card mc-neutral">
      <div className="mc-title">GPU {g.index} · {g.name ?? "—"}</div>

      <div className="mon-metric">
        <span>Utilisation</span> <b>{util != null ? `${util}%` : "—"}</b>
        <div className="mon-bar"><div className={`mon-bar-fill ${barTone(util)}`} style={{ width: `${util ?? 0}%` }} /></div>
      </div>

      <div className="mon-metric">
        <span>Memory</span>{" "}
        <b>{g.memory_used_mb != null && g.memory_total_mb != null
          ? `${g.memory_used_mb} / ${g.memory_total_mb} MB` : "—"}</b>
        <div className="mon-bar"><div className={`mon-bar-fill ${barTone(memP)}`} style={{ width: `${memP ?? 0}%` }} /></div>
      </div>

      <div className="mon-metric">
        temp {g.temperature_c != null ? `${g.temperature_c}°C` : "—"}
        {g.power_w != null ? ` · ${g.power_w} W` : ""}
      </div>

      <div className="mon-metric">
        worker <b>{g.assigned_worker ?? "—"}</b>
        <br />
        job {g.current_job
          ? <span className="mono" title={g.current_job.job_id}>{g.current_job.job_id}{g.current_job.model_name ? ` (${g.current_job.model_name})` : ""}</span>
          : <span className="muted">idle</span>}
      </div>
    </div>
  );
}

function StorageCard({ title, mounted, total, free, unmountedLabel }: {
  title: string; mounted: boolean; total?: number | null; free?: number | null; unmountedLabel: string;
}) {
  const used = total != null && free != null ? total - free : null;
  const p = pct(used, total);
  return (
    <div className={`metric-card ${mounted ? "mc-neutral" : "mc-bad"}`}>
      <div className="mc-title">{title}</div>
      {!mounted ? (
        <div className="mc-value" style={{ fontSize: "var(--fs-lg)" }}>{unmountedLabel}</div>
      ) : (
        <>
          <div className="mon-metric">
            <b>{bytes(used)}</b> used of {bytes(total)} · {bytes(free)} free
            <div className="mon-bar"><div className={`mon-bar-fill ${barTone(p)}`} style={{ width: `${p ?? 0}%` }} /></div>
          </div>
          <div className="mon-metric">{p != null ? `${p.toFixed(0)}% full` : "capacity unknown"}</div>
        </>
      )}
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

  // GPUs healthy
  {
    const total = s.gpus?.length ?? 0;
    const hot = (s.gpus ?? []).filter((g) => g.temperature_c != null && g.temperature_c >= 85).length;
    const status: MetricStatus = total === 0 ? "unknown" : hot > 0 ? "warn" : "ok";
    cards.push({
      title: "GPUs",
      value: total === 0 ? "No data" : `${total - hot}/${total} healthy`,
      sub: total === 0 ? "nvidia-smi not reporting" : hot > 0 ? `${hot} running hot (≥85°C)` : "All within thermal limits",
      status,
    });
  }

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

  // Active / failed jobs (live)
  {
    const running = Number(s.jobs_by_status?.running ?? 0);
    const failed = Number(s.jobs_by_status?.failed ?? 0);
    cards.push({
      title: "Active jobs",
      value: `${running} running`,
      sub: failed > 0 ? `${failed} failed (all-time)` : "no failures recorded",
      status: running > 0 ? "neutral" : "ok",
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
