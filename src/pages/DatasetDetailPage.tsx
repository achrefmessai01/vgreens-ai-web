import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type DatasetVersion } from "../api";
import { handleAuthLost } from "../auth";
import { fmt } from "../lib/format";

export default function DatasetDetailPage() {
  const { name = "" } = useParams();
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVersions(await api.datasetVersions(name));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load versions.");
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <Link to="/datasets" className="link">← Datasets</Link>
          <h1 style={{ marginTop: 4 }}>{name}</h1>
        </div>
        <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "…" : "Refresh"}</button>
      </div>

      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        <h2>Frozen versions</h2>
        {versions.length === 0 && !loading ? (
          <p className="muted">No frozen versions.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Version</th><th>Task</th><th>Images</th><th>Classes</th><th>Licence</th><th>Digest</th><th>Frozen</th></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td className="mono">{v.version}</td>
                  <td className="muted">{v.task ?? "—"}</td>
                  <td>{v.image_count ?? "—"}</td>
                  <td>{v.class_count ?? "—"}</td>
                  <td className="muted">{v.licence_status ?? "—"}</td>
                  <td className="mono" title={v.content_digest ?? ""}>{(v.content_digest ?? "").slice(0, 12) || "—"}</td>
                  <td className="muted">{fmt(v.frozen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
