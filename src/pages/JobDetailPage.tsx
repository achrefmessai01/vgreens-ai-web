import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Job, type JobEvent, type JobResult, type JobLogs,
         type JobProgress, type JobExplanation, type CreateJobBody } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import { PageHeader, EmptyState, Skeleton, ConfirmDialog, useToast } from "../ui";
import { duration, fmt, relTime, fmtBytes } from "../lib/format";
import "../styles/jobs.css";

const ACTIVE = ["queued", "running"];

function fmtEta(s: number | null): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function shortId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

type Tab = "formatted" | "raw";

export default function JobDetailPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOperator = roleAtLeast(user?.role, "operator");

  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [result, setResult] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("formatted");

  // cancel flow
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // lazy logs
  const [logs, setLogs] = useState<JobLogs | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  // live progress (#7) + failure explanation (#9) + promote flow (#13)
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [explanation, setExplanation] = useState<JobExplanation | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [j, ev, r] = await Promise.allSettled([
        api.jobDetail(id),
        api.jobEvents(id),
        api.jobResult(id),
      ]);
      if (j.status === "rejected") {
        if (j.reason instanceof ApiError && j.reason.code === "auth") return handleAuthLost();
        if (j.reason instanceof ApiError && j.reason.code === "not_found") { setNotFound(true); setJob(null); return; }
        throw j.reason;
      }
      setJob(j.value);
      setEvents(ev.status === "fulfilled" ? ev.value : []);
      setResult(r.status === "fulfilled" ? r.value : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Job ID copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function loadLogs() {
    setShowLogs(true);
    setLogsLoading(true);
    setLogsError(null);
    try {
      setLogs(await api.jobLogs(id));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setLogsError(e instanceof Error ? e.message : "Failed to load logs.");
    } finally {
      setLogsLoading(false);
    }
  }

  // Live training progress: poll while running (#7).
  useEffect(() => {
    if (!job || job.job_type !== "training" || !ACTIVE.includes(job.status)) return;
    let live = true;
    const tick = () => api.jobProgress(id).then((p) => { if (live) setProgress(p); }).catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => { live = false; clearInterval(t); };
  }, [id, job]);

  // Failure explanation (#9): fetch once when the job has failed.
  useEffect(() => {
    if (!job || job.status !== "failed") { setExplanation(null); return; }
    let live = true;
    api.jobExplain(id).then((e) => { if (live) setExplanation(e); }).catch(() => {});
    return () => { live = false; };
  }, [id, job]);

  // Live logs (#8): stream via SSE while running, else one-shot tail.
  function loadLive() {
    setShowLogs(true);
    setLiveLines([]);
    esRef.current?.close();
    const es = new EventSource(api.jobLogStreamUrl(id), { withCredentials: true });
    esRef.current = es;
    es.onmessage = (ev) => setLiveLines((prev) => [...prev.slice(-800), ev.data]);
    es.addEventListener("end", () => { es.close(); esRef.current = null; });
    es.onerror = () => { es.close(); esRef.current = null; };
  }
  useEffect(() => () => { esRef.current?.close(); }, []);

  function cloneJob() {
    if (!job) return;
    const prefill: CreateJobBody = {
      job_type: job.job_type,
      model_name: job.model_name,
      docker_image: job.docker_image ?? undefined,
      dataset_name: job.dataset_name ?? undefined,
      dataset_version: job.dataset_version ?? undefined,
      tenant: job.tenant ?? undefined,
      config_path: job.config_path ?? undefined,
    };
    navigate("/submit", { state: { prefill } });
  }

  async function promoteResult() {
    if (!job?.model_name || !job.result_version) return;
    setPromoteBusy(true);
    try {
      await api.promoteModel(job.model_name, job.result_version, "promoted from job detail");
      toast.success(`Promoted ${job.model_name} ${job.result_version}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      toast.error(e instanceof Error ? e.message : "Promote failed.");
    } finally {
      setPromoteBusy(false);
    }
  }

  async function doCancel() {
    setCancelBusy(true);
    setCancelError(null);
    try {
      await api.cancelJob(id);
      toast.success("Cancellation requested.");
      setConfirmCancel(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      const m = e instanceof Error ? e.message : "Cancel failed.";
      setCancelError(m);
      toast.error(m);
    } finally {
      setCancelBusy(false);
    }
  }

  const canCancel = job && ACTIVE.includes(job.status);
  const crumbs = [{ label: "Jobs", to: "/jobs" }, { label: shortId(id) }];

  return (
    <div>
      <PageHeader
        title={id}
        breadcrumbs={crumbs}
        actions={
          <>
            <button className="btn ghost" onClick={copyId} title="Copy job id">Copy ID</button>
            {isOperator && job && (
              <button className="btn ghost" onClick={cloneJob} title="Re-run this job with tweaks">Clone</button>
            )}
            {isOperator && job?.job_type === "training" && job.status === "succeeded" && job.result_version && (
              <button className="btn" onClick={promoteResult} disabled={promoteBusy}
                title="Promote this trained version to active">
                {promoteBusy ? "Promoting…" : "Promote model"}
              </button>
            )}
            {job && (job.status === "succeeded" || job.status === "failed") && (
              <a className="btn ghost" href={api.jobReportUrl(id)} target="_blank" rel="noreferrer"
                title="Open the standard job report (JSON)">Report</a>
            )}
            {canCancel && (
              <button className="btn danger" onClick={() => { setCancelError(null); setConfirmCancel(true); }}>
                Cancel job
              </button>
            )}
            <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "…" : "Refresh"}</button>
          </>
        }
      />

      {error && (
        <div className="error-box wide" role="alert">
          {error}{" "}
          <button className="btn ghost sm-btn" style={{ marginLeft: 8 }} onClick={load}>Retry</button>
        </div>
      )}

      {notFound && !loading && (
        <EmptyState title="Job not found">
          <p className="muted">This job may have been removed, or the id is incorrect.</p>
          <Link className="btn" to="/jobs">Back to jobs</Link>
        </EmptyState>
      )}

      {loading && !job ? (
        <DetailSkeleton />
      ) : job ? (
        <>
          <div className="tabs" role="tablist" aria-label="Job detail views">
            <button role="tab" aria-selected={tab === "formatted"} className={`tab ${tab === "formatted" ? "active" : ""}`}
              onClick={() => setTab("formatted")}>Formatted</button>
            <button role="tab" aria-selected={tab === "raw"} className={`tab ${tab === "raw" ? "active" : ""}`}
              onClick={() => setTab("raw")}>Raw JSON</button>
          </div>

          {tab === "raw" ? (
            <section className="panel">
              <h2>Raw response</h2>
              <pre className="code-block raw-json">{JSON.stringify({ job, events, result, logs }, null, 2)}</pre>
            </section>
          ) : (
            <>
              {/* (a) identity + status */}
              <div className="job-hero">
                <span className="hero-status"><StatusBadge status={job.status} /></span>
                <div className="hero-sep" aria-hidden="true" />
                <div className="hero-fact"><span className="hf-k">Type</span><span className="hf-v">{job.job_type}</span></div>
                <div className="hero-fact"><span className="hf-k">Model</span><span className="hf-v">{job.model_name}</span></div>
                <div className="hero-fact">
                  <span className="hf-k">Created</span>
                  <span className="hf-v" title={fmt(job.created_at)}>{relTime(job.created_at)}</span>
                </div>
                <div className="hero-fact"><span className="hf-k">Duration</span><span className="hf-v">{duration(job.started_at, job.finished_at)}</span></div>
              </div>

              {job.error && (
                <section className="panel warn">
                  <h2>Error</h2>
                  <pre className="err-text" style={{ margin: 0 }}>{job.error}</pre>
                </section>
              )}

              {/* Failure explanation assistant (#9) */}
              {job.status === "failed" && explanation && (
                <section className="panel warn">
                  <h2>What went wrong</h2>
                  <p style={{ margin: "0 0 8px" }}>{explanation.cause}</p>
                  {explanation.suggestions.length > 0 && (
                    <>
                      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Suggested fixes</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {explanation.suggestions.map((s, i) => <li key={i} style={{ fontSize: 13 }}>{s}</li>)}
                      </ul>
                    </>
                  )}
                </section>
              )}

              {/* Live training progress (#7) */}
              {job.job_type === "training" && progress?.available && (
                <section className="panel">
                  <h2>Training progress</h2>
                  {(() => {
                    const cur = Number(progress.current_epoch ?? 0);
                    const total = Number(progress.total_epochs ?? 0);
                    const pct = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;
                    const latest = progress.latest || {};
                    const metrics = Object.entries(latest).filter(
                      ([k]) => !["epoch", "total_epochs", "ts", "stage", "world_size"].includes(k));
                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <span>Epoch {cur}/{total || "?"}</span>
                          <span className="muted">ETA {fmtEta(progress.eta_seconds)}</span>
                        </div>
                        <div style={{ height: 8, background: "var(--surface-2, #e5e7eb)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent, #16a34a)", transition: "width .4s" }} />
                        </div>
                        {metrics.length > 0 && (
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
                            {metrics.map(([k, v]) => (
                              <span key={k}><span className="muted">{k}:</span> <b className="mono">{String(v)}</b></span>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              )}

              {/* Live logs while the job runs (#8) — SSE tail of container.log */}
              {ACTIVE.includes(job.status) && (
                <section className="panel">
                  <h2>Live logs</h2>
                  {esRef.current === null && liveLines.length === 0 ? (
                    <button className="btn ghost sm-btn" onClick={loadLive}>Stream live logs</button>
                  ) : (
                    <pre className="code-block raw-json" style={{ maxHeight: 320, overflow: "auto" }}>
                      {liveLines.join("\n") || "waiting for output…"}
                    </pre>
                  )}
                </section>
              )}

              {/* (b) lifecycle timeline */}
              <section className="panel">
                <h2>Lifecycle</h2>
                {events.length === 0 ? (
                  <p className="muted">No events recorded.</p>
                ) : (
                  <ol className="timeline">
                    {events.map((e, i) => (
                      <li key={e.id ?? i}>
                        <div className="tl-dot" />
                        <div className="tl-body">
                          <div className="tl-top">
                            <StatusBadge status={e.status || e.event || "event"} />
                            <span className="muted tl-ts" title={fmt(e.ts)}>{relTime(e.ts)}</span>
                          </div>
                          {(e.message || e.detail) && <div className="tl-msg">{e.message || e.detail}</div>}
                          {e.worker_id && <div className="muted tl-worker">worker {e.worker_id}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* (c) allocation + input configuration */}
              <div className="jobs-cols">
                <section className="panel">
                  <h2>Allocation</h2>
                  <DefinitionList items={[
                    { k: "Worker", v: job.worker_id ?? "—" },
                    { k: "Tenant", v: job.tenant ?? "—" },
                    { k: "Image", v: <span className="mono">{job.docker_image ?? "—"}</span> },
                    { k: "Output path", v: job.output_path ? <span className="mono">{job.output_path}</span> : "—" },
                    { k: "Started", v: fmt(job.started_at) },
                    { k: "Finished", v: fmt(job.finished_at) },
                  ]} />
                </section>
                <section className="panel">
                  <h2>Input configuration</h2>
                  <DefinitionList items={[
                    { k: "Model", v: job.model_name },
                    { k: "Dataset", v: job.dataset_name ? `${job.dataset_name}:${job.dataset_version ?? "?"}` : "—" },
                    { k: "Config path", v: job.config_path ? <span className="mono">{job.config_path}</span> : "—" },
                    { k: "Result version", v: job.result_version ? <span className="mono">{job.result_version}</span> : "—" },
                    { k: "Created", v: fmt(job.created_at) },
                  ]} />
                </section>
              </div>

              {/* (d) results / outputs */}
              {result && (result.available || job.status === "succeeded") && (
                <section className="panel">
                  <h2>Results & outputs</h2>

                  {job.job_type === "training" && result.metrics && (
                    <>
                      <table className="table">
                        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                        <tbody>
                          {Object.entries(result.metrics).map(([k, v]) => (
                            <tr key={k}>
                              <td>{k}</td>
                              <td className="mono">{typeof v === "number" ? Number(v.toFixed(4)) : v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {result.result_version && (
                        <div className="dl" style={{ marginTop: 12 }}>
                          <div className="dl-row">
                            <div className="dl-k">Registered version</div>
                            <div className="dl-v">
                              {job.model_name
                                ? <Link className="link mono" to={`/models/${job.model_name}`}>{result.result_version}</Link>
                                : <span className="mono">{result.result_version}</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {job.job_type === "processing" && result.report && (
                    <>
                      <DefinitionList items={[
                        { k: "Images", v: String(result.report.images ?? "—") },
                        { k: "Total detections", v: String(result.report.total_detections ?? "—") },
                        { k: "Conf threshold", v: String(result.report.conf_threshold ?? "—") },
                      ]} />
                      {isRecord(result.report.by_class) && Object.keys(result.report.by_class).length > 0 && (
                        <table className="table" style={{ marginTop: 12 }}>
                          <thead><tr><th>Class</th><th>Detections</th></tr></thead>
                          <tbody>
                            {Object.entries(result.report.by_class).map(([k, v]) => (
                              <tr key={k}><td>{k}</td><td className="mono">{String(v)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}

                  {result.artifacts.length > 0 && (
                    <>
                      <h3 style={{ margin: "16px 0 8px" }}>Artifacts</h3>
                      <table className="table">
                        <thead><tr><th>Path</th><th>Size</th><th></th></tr></thead>
                        <tbody>
                          {result.artifacts.map((a) => (
                            <tr key={a.path}>
                              <td className="mono">{a.path}</td>
                              <td className="muted">{fmtBytes(a.size_bytes)}</td>
                              <td style={{ textAlign: "right" }}>
                                <a className="link" href={api.artifactDownloadUrl(id, a.path)} download>Download</a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  <h3 style={{ margin: "16px 0 8px" }}>Logs</h3>
                  {!showLogs ? (
                    <button className="btn ghost sm-btn" onClick={loadLogs}>View logs</button>
                  ) : logsLoading ? (
                    <p className="muted">Loading logs…</p>
                  ) : logsError ? (
                    <div className="error-box">{logsError}</div>
                  ) : logs && logs.available && logs.lines.length > 0 ? (
                    <pre className="code-block raw-json">{logs.lines.join("\n")}</pre>
                  ) : (
                    <p className="results-empty">No logs available.</p>
                  )}
                </section>
              )}

              {/* (e) related links */}
              {(job.model_name || job.dataset_name) && (
                <section className="panel">
                  <h2>Related</h2>
                  <div className="related-links">
                    {job.model_name && (
                      <Link className="related-chip" to={`/models/${job.model_name}`}>
                        <span className="rc-k">Model</span><span className="mono">{job.model_name}</span>
                      </Link>
                    )}
                    {job.dataset_name && (
                      <Link className="related-chip" to={`/datasets/${job.dataset_name}`}>
                        <span className="rc-k">Dataset</span><span className="mono">{job.dataset_name}{job.dataset_version ? `:${job.dataset_version}` : ""}</span>
                      </Link>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      ) : null}

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel job?"
          danger
          confirmLabel="Cancel job"
          busy={cancelBusy}
          error={cancelError}
          body={<>This asks the worker to stop <b className="mono">{shortId(id)}</b>. This can’t be undone.</>}
          onCancel={() => { if (!cancelBusy) { setConfirmCancel(false); setCancelError(null); } }}
          onConfirm={doCancel}
        />
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="job-hero">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={30} width={110} />)}
      </div>
      <section className="panel">
        <Skeleton height={14} width={120} style={{ marginBottom: 14 }} />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={16} style={{ marginBottom: 10 }} />)}
      </section>
      <div className="jobs-cols">
        {Array.from({ length: 2 }).map((_, i) => (
          <section className="panel" key={i}>
            <Skeleton height={14} width={100} style={{ marginBottom: 14 }} />
            {Array.from({ length: 5 }).map((__, r) => <Skeleton key={r} height={14} style={{ marginBottom: 10 }} />)}
          </section>
        ))}
      </div>
    </>
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function DefinitionList({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="dl">
      {items.map((it) => (
        <div className="dl-row" key={it.k}>
          <dt className="dl-k">{it.k}</dt>
          <dd className="dl-v" style={{ margin: 0 }}>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
