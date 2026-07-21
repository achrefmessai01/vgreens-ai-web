import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type DatasetImport, type DatasetSummary } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { fmt } from "../lib/format";

export default function DatasetsPage() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [imports, setImports] = useState<DatasetImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ds, imp] = await Promise.all([api.datasets(), api.datasetImports({ limit: 15 })]);
      setDatasets(ds);
      setImports(imp);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load datasets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="dash">
      <div className="dash-head">
        <h1>Datasets</h1>
        <div className="dash-meta">
          <Link to="/datasets/new" className="btn primary">New import</Link>
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        <h2>Frozen datasets</h2>
        {datasets.length === 0 && !loading ? (
          <p className="muted">No frozen datasets yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Dataset</th><th>Versions</th><th>Latest frozen</th></tr></thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.dataset_name} className="row-link" onClick={() => navigate(`/datasets/${d.dataset_name}`)}>
                  <td>{d.dataset_name}</td>
                  <td className="muted">{d.versions}</td>
                  <td className="muted">{fmt(d.latest_frozen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Recent imports</h2>
        {imports.length === 0 && !loading ? (
          <p className="muted">No imports yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Import</th><th>Dataset</th><th>Source</th><th>State</th><th>Created</th></tr></thead>
            <tbody>
              {imports.map((im) => (
                <tr key={im.import_id} className="row-link" onClick={() => navigate(`/datasets/imports/${im.import_id}`)}>
                  <td className="mono">{im.import_id}</td>
                  <td>{im.dataset_name}</td>
                  <td className="muted">{im.source_type}</td>
                  <td><StatusBadge status={im.state} /></td>
                  <td className="muted">{fmt(im.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
