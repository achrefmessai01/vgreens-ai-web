import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type ModelSummary } from "../api";
import { handleAuthLost } from "../auth";

export default function ModelsPage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await api.models();
      const summaries = await Promise.all(
        names.map((n) => api.modelSummary(n).catch(() => null))
      );
      setModels(summaries.filter((s): s is ModelSummary => s !== null));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load models.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="dash">
      <div className="dash-head">
        <h1>Models</h1>
        <button className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        {models.length === 0 && !loading ? (
          <p className="muted">No models registered.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Model</th><th>Active version</th><th>Versions</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model} className="row-link" onClick={() => navigate(`/models/${m.model}`)}>
                  <td>{m.model}</td>
                  <td className="mono">{m.active_version ?? <span className="muted">none</span>}</td>
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
