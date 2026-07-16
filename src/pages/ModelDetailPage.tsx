import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type ModelSummary } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { metricStr } from "../lib/format";

export default function ModelDetailPage() {
  const { model = "" } = useParams();
  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await api.modelSummary(model));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load model.");
    } finally {
      setLoading(false);
    }
  }, [model]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<{ active_version: string }>, ok: (v: string) => string) {
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      setNotice(ok(res.active_version));
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      // 409 = conflict (e.g. version not validated) — show the API's message
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActing(false);
    }
  }

  function promote(version: string) {
    if (!window.confirm(`Promote ${model} ${version} to active?`)) return;
    const reason = window.prompt("Reason (recorded in the audit log):", "") ?? undefined;
    act(() => api.promoteModel(model, version, reason), (v) => `Promoted — active is now ${v}.`);
  }

  function rollback() {
    const to = window.prompt("Roll back to which version? Leave blank for the previous active:", "") ?? "";
    const reason = window.prompt("Reason (recorded in the audit log):", "") ?? undefined;
    act(() => api.rollbackModel(model, to.trim() || undefined, reason), (v) => `Rolled back — active is now ${v}.`);
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <Link to="/models" className="link">← Models</Link>
          <h1 style={{ marginTop: 4 }}>{model}</h1>
        </div>
        <div className="dash-meta">
          <button className="btn" onClick={rollback} disabled={acting || !summary?.active_version}>
            Rollback…
          </button>
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {notice && <div className="notice-box wide">{notice}</div>}
      {error && <div className="error-box wide">{error}</div>}

      {summary && (
        <>
          <section className="panel">
            <div className="kv">
              <div className="kv-row"><div className="kv-k">Active version</div>
                <div className="kv-v mono">{summary.active_version ?? <span className="muted">none</span>}</div></div>
              <div className="kv-row"><div className="kv-k">Versions</div>
                <div className="kv-v">{summary.version_count}</div></div>
            </div>
          </section>

          <section className="panel">
            <h2>Versions</h2>
            {summary.versions.length === 0 ? (
              <p className="muted">No versions.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Version</th><th>Status</th><th>Metrics</th><th></th></tr></thead>
                <tbody>
                  {summary.versions.map((v) => (
                    <tr key={v.version}>
                      <td className="mono">
                        {v.version} {v.active && <span className="badge ok" style={{ marginLeft: 6 }}>active</span>}
                      </td>
                      <td><StatusBadge status={v.status ?? "unknown"} /></td>
                      <td className="mono metrics-cell">{metricStr(v.metrics)}</td>
                      <td style={{ textAlign: "right" }}>
                        {v.status === "validated" && !v.active && (
                          <button className="btn primary sm-btn" disabled={acting} onClick={() => promote(v.version)}>
                            Promote
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint muted" style={{ marginTop: 10 }}>
              Only <strong>validated</strong> versions can be promoted — the API enforces this
              (a rejected or unvalidated version is refused with a conflict).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
