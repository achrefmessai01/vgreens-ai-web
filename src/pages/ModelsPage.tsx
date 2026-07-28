import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type ModelSummary } from "../api";
import { handleAuthLost } from "../auth";
import { PageHeader, EmptyState, Skeleton } from "../ui";

export default function ModelsPage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await api.models();
      const summaries = await Promise.all(names.map((n) => api.modelSummary(n).catch(() => null)));
      setModels(summaries.filter((s): s is ModelSummary => s !== null));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load models.");
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = models.filter((m) => m.model.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Models"
        description="Registered models and their promoted (active) versions."
        actions={
          <>
            <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            <button className="btn primary" onClick={() => navigate("/models/onboard")}>Onboard model</button>
          </>
        }
      />

      {error && <div className="error-box wide">{error}</div>}

      {!firstLoad && models.length > 0 && (
        <div className="filters">
          <label>
            Model
            <input className="input sm" placeholder="filter by name" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      )}

      <section className="panel">
        {firstLoad ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : models.length === 0 ? (
          <EmptyState title="No models registered">
            <p className="muted">Models appear here after a training job produces a validated version.</p>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No models match">
            <p className="muted">No model name contains “{q.trim()}”.</p>
          </EmptyState>
        ) : (
          <table className="table">
            <thead><tr><th>Model</th><th>Active version</th><th>Versions</th></tr></thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.model} className="row-link" onClick={() => navigate(`/models/${m.model}`)}>
                  <td>{m.model}</td>
                  <td>{m.active_version
                    ? <span className="badge ok mono">{m.active_version}</span>
                    : <span className="muted">none</span>}</td>
                  <td className="muted">{m.version_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
