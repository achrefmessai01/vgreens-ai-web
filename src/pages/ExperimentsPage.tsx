import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Job, type CompareRun } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { PageHeader, useToast } from "../ui";
import { fmt, duration } from "../lib/format";
import "../styles/jobs.css";

/** Experiment comparison (#11): pick training runs and compare their metrics
 *  side by side, so the platform behaves like a real MLOps tool. */
export default function ExperimentsPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [runs, setRuns] = useState<CompareRun[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.jobsQuery({ job_type: "training", limit: 50, offset: 0 })
      .then((p) => setJobs(p.jobs))
      .catch((e) => { if (e instanceof ApiError && e.code === "auth") handleAuthLost(); })
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 6 ? [...s, id] : s);
  }

  async function compare() {
    if (selected.length < 2) { toast.info("Pick at least two runs to compare."); return; }
    setBusy(true);
    try {
      const r = await api.compareJobs(selected);
      setRuns(r.runs.filter((x) => x.found));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      toast.error(e instanceof Error ? e.message : "Compare failed.");
    } finally {
      setBusy(false);
    }
  }

  // Union of metric keys across the compared runs, for the comparison table rows.
  const metricKeys = useMemo(() => {
    const keys = new Set<string>();
    (runs || []).forEach((r) => Object.keys(r.metrics || {}).forEach((k) => {
      if (typeof (r.metrics as Record<string, unknown>)[k] === "number") keys.add(k);
    }));
    return [...keys];
  }, [runs]);

  return (
    <div>
      <PageHeader title="Experiments"
        breadcrumbs={[{ label: "Jobs", to: "/jobs" }, { label: "Experiments" }]}
        description="Compare training runs side by side — metrics, dataset and duration." />

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Training runs</h2>
          <button className="btn primary" onClick={compare} disabled={busy || selected.length < 2}>
            {busy ? "Comparing…" : `Compare (${selected.length})`}
          </button>
        </div>
        {loading ? <p className="muted">Loading…</p> : jobs.length === 0 ? (
          <p className="muted">No training jobs yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th></th><th>Job</th><th>Model</th><th>Status</th><th>Dataset</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id}>
                  <td><input type="checkbox" checked={selected.includes(j.job_id)}
                    onChange={() => toggle(j.job_id)} aria-label={`select ${j.job_id}`} /></td>
                  <td><Link className="link mono" to={`/jobs/${j.job_id}`}>{j.job_id}</Link></td>
                  <td>{j.model_name}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td className="mono">{j.dataset_name ? `${j.dataset_name}${j.dataset_version ? `:${j.dataset_version}` : ""}` : "—"}</td>
                  <td className="muted">{fmt(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {runs && runs.length > 0 && (
        <section className="panel">
          <h2>Comparison</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Field</th>
                  {runs.map((r) => <th key={r.job_id} className="mono">{r.job_id.slice(0, 12)}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr><td>Model</td>{runs.map((r) => <td key={r.job_id}>{r.model_name}</td>)}</tr>
                <tr><td>Status</td>{runs.map((r) => <td key={r.job_id}><StatusBadge status={r.status || "?"} /></td>)}</tr>
                <tr><td>Dataset</td>{runs.map((r) => <td key={r.job_id} className="mono">{r.dataset_name ? `${r.dataset_name}:${r.dataset_version ?? "?"}` : "—"}</td>)}</tr>
                <tr><td>GPUs</td>{runs.map((r) => <td key={r.job_id}>{r.gpu_count ?? "—"}</td>)}</tr>
                <tr><td>Duration</td>{runs.map((r) => <td key={r.job_id}>{duration(r.started_at, r.finished_at)}</td>)}</tr>
                <tr><td>Version</td>{runs.map((r) => <td key={r.job_id} className="mono">{r.result_version ?? "—"}</td>)}</tr>
                {metricKeys.map((k) => {
                  const vals = runs.map((r) => Number((r.metrics as Record<string, number>)?.[k]));
                  const best = Math.max(...vals.filter((v) => !Number.isNaN(v)));
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      {runs.map((r) => {
                        const v = (r.metrics as Record<string, number>)?.[k];
                        const isBest = typeof v === "number" && v === best && vals.filter((x) => x === best).length === 1;
                        return <td key={r.job_id} className="mono" style={isBest ? { fontWeight: 700, color: "var(--accent, #16a34a)" } : undefined}>
                          {v === undefined ? "—" : (typeof v === "number" ? Number(v.toFixed(4)) : String(v))}
                          {isBest ? " ★" : ""}
                        </td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="field-hint muted" style={{ marginTop: 8 }}>★ marks the best value in each metric row.</p>
        </section>
      )}
    </div>
  );
}
