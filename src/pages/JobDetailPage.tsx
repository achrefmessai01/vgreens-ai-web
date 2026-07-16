import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Job, type JobEvent } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { duration, fmt } from "../lib/format";

const ACTIVE = ["queued", "running"];

export default function JobDetailPage() {
  const { id = "" } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, ev] = await Promise.allSettled([api.jobDetail(id), api.jobEvents(id)]);
      if (j.status === "rejected") {
        if (j.reason instanceof ApiError && j.reason.code === "auth") return handleAuthLost();
        throw j.reason;
      }
      setJob(j.value);
      setEvents(ev.status === "fulfilled" ? ev.value : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
          <h1 className="mono" style={{ marginTop: 4 }}>{id}</h1>
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

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv-row">
      <div className="kv-k">{k}</div>
      <div className="kv-v">{v}</div>
    </div>
  );
}
