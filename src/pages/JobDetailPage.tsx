import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Job, type JobEvent, type JobResult, type JobLogs } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { duration, fmt, fmtBytes } from "../lib/format";

const ACTIVE = ["queued", "running"];

export default function JobDetailPage() {
  const { id = "" } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [result, setResult] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [logs, setLogs] = useState<JobLogs | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, ev, r] = await Promise.allSettled([
        api.jobDetail(id),
        api.jobEvents(id),
        api.jobResult(id),
      ]);
      if (j.status === "rejected") {
        if (j.reason instanceof ApiError && j.reason.code === "auth") return handleAuthLost();
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

  useEffect(() => {
    load();
  }, [load]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
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

  async function cancel() {
    if (!window.confirm(`Cancel job ${id}? This asks the worker to stop.`)) return;
    setCancelling(true);
    setNotice(null);
    try {
      await api.cancelJob(id);
      setNotice("Cancellation requested.");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setCancelling(false);
    }
  }

  const canCancel = job && ACTIVE.includes(job.status);

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <Link to="/jobs" className="link">← Jobs</Link>
          <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 4 }}>
            <h1 className="mono" style={{ margin: 0 }}>{id}</h1>
            <button className="btn ghost sm-btn" onClick={copyId} title="Copy job id">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="dash-meta">
          {canCancel && (
            <button className="btn danger" onClick={cancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel job"}
            </button>
          )}
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {notice && <div className="notice-box wide">{notice}</div>}
      {error && <div className="error-box wide">{error}</div>}

      {job && (
        <>
          <section className="panel">
            <h2>Overview</h2>
            <div className="kv">
              <Row k="Status" v={<StatusBadge status={job.status} />} />
              <Row k="Type" v={job.job_type} />
              <Row k="Model" v={job.model_name} />
              <Row k="Dataset" v={job.dataset_name ? `${job.dataset_name}:${job.dataset_version ?? "?"}` : "—"} />
              <Row k="Tenant" v={job.tenant ?? "—"} />
              <Row k="Worker" v={job.worker_id ?? "—"} />
              <Row k="Image" v={<span className="mono">{job.docker_image ?? "—"}</span>} />
              <Row k="Created" v={fmt(job.created_at)} />
              <Row k="Started" v={fmt(job.started_at)} />
              <Row k="Finished" v={fmt(job.finished_at)} />
              <Row k="Duration" v={duration(job.started_at, job.finished_at)} />
              {job.error && <Row k="Error" v={<span className="err-text">{job.error}</span>} />}
            </div>
          </section>

          {result && (result.available || job.status === "succeeded") && (
            <section className="panel">
              <h2>Results</h2>

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
                    <div className="kv" style={{ marginTop: 12 }}>
                      <Row k="Registered version" v={
                        job.model_name
                          ? <Link className="link mono" to={`/models/${job.model_name}`}>{result.result_version}</Link>
                          : <span className="mono">{result.result_version}</span>
                      } />
                    </div>
                  )}
                </>
              )}

              {job.job_type === "processing" && result.report && (
                <>
                  <div className="kv">
                    <Row k="Images" v={String(result.report.images ?? "—")} />
                    <Row k="Total detections" v={String(result.report.total_detections ?? "—")} />
                    <Row k="Conf threshold" v={String(result.report.conf_threshold ?? "—")} />
                  </div>
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
                <pre className="code-block">{logs.lines.join("\n")}</pre>
              ) : (
                <p className="muted">No logs available.</p>
              )}
            </section>
          )}

          <section className="panel">
            <h2>Timeline</h2>
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
                        <span className="muted tl-ts">{fmt(e.ts)}</span>
                      </div>
                      {(e.message || e.detail) && <div className="tl-msg">{e.message || e.detail}</div>}
                      {e.worker_id && <div className="muted tl-worker">worker {e.worker_id}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv-row">
      <div className="kv-k">{k}</div>
      <div className="kv-v">{v}</div>
    </div>
  );
}
