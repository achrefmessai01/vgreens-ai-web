import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Gpu, type Job, type SystemOverview } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "./StatusBadge";
import { MetricCard, MetricCardSkeleton, type MetricStatus } from "./MetricCard";
import { PageHeader, Button, EmptyState, Skeleton } from "../ui";
import { fmt } from "../lib/format";
import "../styles/overview.css";

function age(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canOperate = roleAtLeast(user?.role, "operator");

  const [ov, setOv] = useState<SystemOverview | null>(null);
  const [ready, setReady] = useState<boolean | undefined>(undefined);
  const [version, setVersion] = useState<string>("—");
  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pendingLicences, setPendingLicences] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [partialError, setPartialError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.version(),
      api.health(),
      api.systemOverview(),
      api.gpus(),
      api.jobs(6),
      api.datasetImports({ state: "awaiting_license_approval", limit: 50 }),
    ]);
    const [ver, health, overview, g, j, imports] = results;
    for (const r of results) {
      if (r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 401) {
        return handleAuthLost();
      }
    }
    if (ver.status === "fulfilled") setVersion(ver.value.version ?? "—");
    setReady(health.status === "fulfilled"
      ? ["ok", "ready"].includes((health.value as { status?: string }).status ?? "")
      : undefined);
    if (overview.status === "fulfilled") setOv(overview.value);
    if (g.status === "fulfilled") setGpus(g.value);
    if (j.status === "fulfilled") setJobs(j.value);
    setPendingLicences(imports.status === "fulfilled" ? imports.value.length : null);
    setPartialError(overview.status === "rejected");
    setUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const firstLoad = loading && updated === null;

  // ---- derive operational metrics ------------------------------------
  const jbs = ov?.jobs_by_status ?? {};
  const metrics = buildMetrics({ ov, ready, version, gpus, pendingLicences });

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Operational status of the platform — problems link straight to where you fix them."
        breadcrumbs={[{ label: "Overview" }]}
        actions={
          <>
            <span className="ov-meta">
              {updated ? `Updated ${updated.toLocaleTimeString()}` : "Loading…"}
            </span>
            <Button variant="ghost" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {partialError && (
        <div className="ov-note" role="status">
          Some metrics could not be refreshed — showing the last values received.
        </div>
      )}

      {/* operational metric cards */}
      <div className="metric-grid" style={{ marginTop: "var(--space-3)" }}>
        {firstLoad
          ? Array.from({ length: 9 }).map((_, i) => <MetricCardSkeleton key={i} />)
          : metrics.map((m) => <MetricCard key={m.title} {...m} />)}
      </div>

      {/* quick actions */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: "var(--space-5)" }}>
        {canOperate && <Button variant="primary" onClick={() => navigate("/submit")}>Submit job</Button>}
        {canOperate && <Button onClick={() => navigate("/datasets/new")}>Import dataset</Button>}
        <Button onClick={() => navigate("/monitoring")}>Open monitoring</Button>
        <Button onClick={() => navigate("/models")}>Review models</Button>
        {!canOperate && (
          <span className="ov-meta">Read-only access — actions require the operator role.</span>
        )}
      </div>

      {/* recent activity */}
      <section className="ov-section">
        <div className="ov-section-head">
          <h2>Recent activity</h2>
          <button className="link" onClick={() => navigate("/jobs")}>View all jobs →</button>
        </div>
        {firstLoad ? (
          <div className="activity">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="activity-row" key={i} style={{ cursor: "default" }}>
                <Skeleton width="60%" />
                <Skeleton width={70} />
                <Skeleton width={80} />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState title="No jobs yet">
            <p className="muted" style={{ marginTop: 4 }}>
              Submitted jobs will appear here as soon as they are created.
            </p>
          </EmptyState>
        ) : (
          <div className="activity">
            {jobs.map((jb) => (
              <button
                key={jb.job_id}
                type="button"
                className="activity-row"
                onClick={() => navigate(`/jobs/${jb.job_id}`)}
              >
                <div className="activity-main">
                  <div className="activity-title">{jb.model_name || jb.job_id}</div>
                  <div className="activity-meta">
                    {jb.job_type} · <span className="mono">{jb.job_id}</span>
                  </div>
                </div>
                <StatusBadge status={jb.status} />
                <span className="activity-time">{fmt(jb.created_at)}</span>
              </button>
            ))}
          </div>
        )}
        {!firstLoad && Number(jbs.running ?? 0) > 0 && (
          <p className="ov-meta" style={{ marginTop: 8 }}>
            {jbs.running} job{Number(jbs.running) === 1 ? "" : "s"} currently running.
          </p>
        )}
      </section>
    </div>
  );
}

// --------------------------------------------------------------------------
// Metric derivation — each card answers one operational question and links to
// the page where the problem is resolved when it needs attention.
// --------------------------------------------------------------------------
type Card = {
  title: string;
  value: string;
  sub?: string;
  status: MetricStatus;
  to?: string;
  linkLabel?: string;
};

function buildMetrics({ ov, ready, version, gpus, pendingLicences }: {
  ov: SystemOverview | null;
  ready: boolean | undefined;
  version: string;
  gpus: Gpu[];
  pendingLicences: number | null;
}): Card[] {
  const cards: Card[] = [];

  // 1. Services / API
  cards.push({
    title: "Services",
    value: ready === undefined ? "Unknown" : ready ? "Operational" : "Degraded",
    sub: `API version ${version}`,
    status: ready === undefined ? "unknown" : ready ? "ok" : "bad",
    to: ready === false ? "/monitoring" : undefined,
    linkLabel: "Investigate",
  });

  // 2. NAS storage
  cards.push({
    title: "NAS storage",
    value: !ov ? "Unknown" : ov.nas_mounted ? "Mounted" : "Not mounted",
    sub: !ov ? "Metrics unavailable" : ov.nas_mounted ? "Share reachable" : "Datasets & artifacts at risk",
    status: !ov ? "unknown" : ov.nas_mounted ? "ok" : "bad",
    to: ov && !ov.nas_mounted ? "/monitoring" : undefined,
    linkLabel: "Investigate",
  });

  // 3. Workers
  if (!ov) {
    cards.push({ title: "Workers", value: "Unknown", sub: "Metrics unavailable", status: "unknown" });
  } else {
    const { online, total } = ov.workers;
    const offline = Math.max(0, total - online);
    const status: MetricStatus = total === 0 ? "unknown" : online === 0 ? "bad" : online < total ? "warn" : "ok";
    cards.push({
      title: "Workers",
      value: total === 0 ? "None registered" : `${online}/${total} online`,
      sub: total === 0 ? "No workers registered" : offline > 0 ? `${offline} offline` : "All workers healthy",
      status,
      to: status === "warn" || status === "bad" ? "/monitoring" : undefined,
      linkLabel: "View workers",
    });
  }

  // 4. GPUs available
  if (!ov || gpus.length === 0) {
    cards.push({ title: "GPUs", value: "No GPU data", sub: "Metrics unavailable", status: "unknown" });
  } else {
    const known = gpus.filter((g) => g.utilization_pct != null);
    const idle = known.filter((g) => (g.utilization_pct ?? 100) < 20).length;
    const busy = known.length - idle;
    const queued = ov.queued_total;
    let status: MetricStatus = "ok";
    let sub = `utilisation unavailable`;
    if (known.length > 0) {
      sub = `${idle} idle · ${busy} busy`;
      status = idle === 0 && queued > 0 ? "warn" : "ok";
    } else {
      status = "neutral";
    }
    cards.push({
      title: "GPUs",
      value: `${gpus.length} present`,
      sub,
      status,
      to: status === "warn" ? "/monitoring" : undefined,
      linkLabel: "View GPUs",
    });
  }

  // 5. Job queue
  if (!ov) {
    cards.push({ title: "Job queue", value: "Unknown", sub: "Metrics unavailable", status: "unknown" });
  } else {
    const jbs = ov.jobs_by_status ?? {};
    const running = Number(jbs.running ?? 0);
    const blocked = Number(jbs.waiting_for_gpu ?? 0) + Number(jbs.waiting_for_two_gpus ?? 0);
    const oldest = ov.oldest_queued_seconds;
    const stuck = oldest > 1800 && ov.queued_total > 0;
    const status: MetricStatus = blocked > 0 || stuck ? "warn" : ov.queued_total === 0 ? "ok" : "neutral";
    const subParts = [`${running} running`];
    if (ov.queued_total > 0) subParts.push(`oldest ${age(oldest)}`);
    if (blocked > 0) subParts.push(`${blocked} blocked on GPU`);
    cards.push({
      title: "Job queue",
      value: `${ov.queued_total} queued`,
      sub: subParts.join(" · "),
      status,
      to: blocked > 0 || stuck ? "/jobs" : undefined,
      linkLabel: "View jobs",
    });
  }

  // 6. Failed jobs
  if (!ov) {
    cards.push({ title: "Failed jobs", value: "Unknown", sub: "Metrics unavailable", status: "unknown" });
  } else {
    const failed = Number(ov.jobs_by_status?.failed ?? 0);
    cards.push({
      title: "Failed jobs",
      value: String(failed),
      sub: failed > 0 ? "Review and re-run as needed" : "No failures recorded",
      status: failed > 0 ? "warn" : "ok",
      to: failed > 0 ? "/jobs" : undefined,
      linkLabel: "View failures",
    });
  }

  // 7. Backups
  if (!ov) {
    cards.push({ title: "Backups", value: "Unknown", sub: "Metrics unavailable", status: "unknown" });
  } else {
    const a = ov.backups.age_seconds;
    const status: MetricStatus = a == null ? "unknown" : a > 172800 ? "bad" : a > 90000 ? "warn" : "ok";
    cards.push({
      title: "Backups",
      value: a == null ? "None found" : `${age(a)} old`,
      sub: ov.backups.latest ? `latest ${ov.backups.latest}` : `${ov.backups.count} on NAS`,
      status,
      to: status === "warn" || status === "bad" ? "/monitoring" : undefined,
      linkLabel: "Check backups",
    });
  }

  // 8. Active alerts
  if (!ov) {
    cards.push({ title: "Active alerts", value: "Unknown", sub: "Metrics unavailable", status: "unknown" });
  } else if (!ov.alerts.available) {
    cards.push({
      title: "Active alerts",
      value: "Unavailable",
      sub: "Prometheus unreachable",
      status: "unknown",
    });
  } else {
    const { critical: crit, warning: warn } = ov.alerts.firing;
    const status: MetricStatus = crit > 0 ? "bad" : warn > 0 ? "warn" : "ok";
    cards.push({
      title: "Active alerts",
      value: crit > 0 || warn > 0 ? `${crit} crit · ${warn} warn` : "None firing",
      sub: crit > 0 || warn > 0 ? "Firing alerts need attention" : "All clear",
      status,
      to: crit > 0 || warn > 0 ? "/monitoring" : undefined,
      linkLabel: "View alerts",
    });
  }

  // 9. Licence approvals (dataset imports awaiting sign-off)
  if (pendingLicences == null) {
    cards.push({ title: "Licence approvals", value: "Unknown", sub: "Could not load imports", status: "unknown" });
  } else {
    cards.push({
      title: "Licence approvals",
      value: String(pendingLicences),
      sub: pendingLicences > 0 ? "Dataset imports awaiting approval" : "Nothing awaiting approval",
      status: pendingLicences > 0 ? "warn" : "ok",
      to: pendingLicences > 0 ? "/datasets" : undefined,
      linkLabel: "Review imports",
    });
  }

  return cards;
}
