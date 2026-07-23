import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type DatasetImport, type DatasetSummary } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import { PageHeader, EmptyState, Skeleton } from "../ui";
import { fmt } from "../lib/format";

export default function DatasetsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canOperate = roleAtLeast(user?.role, "operator");

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [imports, setImports] = useState<DatasetImport[]>([]);
  const [awaiting, setAwaiting] = useState<DatasetImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ds, imp, waiting] = await Promise.all([
        api.datasets(),
        api.datasetImports({ limit: 15 }),
        api.datasetImports({ state: "awaiting_license_approval", limit: 50 }),
      ]);
      setDatasets(ds);
      setImports(imp);
      setAwaiting(waiting);
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load datasets.");
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Datasets"
        description="Imported, audited, and frozen datasets available for training."
        actions={
          <>
            <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "…" : "Refresh"}</button>
            {canOperate && <Link to="/datasets/new" className="btn primary">New import</Link>}
          </>
        }
      />

      {awaiting.length > 0 && (
        <div className="warn-box wide">
          <span>{awaiting.length} import{awaiting.length > 1 ? "s" : ""} awaiting licence approval.</span>
          <button className="btn sm-btn" onClick={() => navigate(`/datasets/imports/${awaiting[0].import_id}`)}>
            Review →
          </button>
        </div>
      )}

      {error && <div className="error-box wide">{error}</div>}

      <section className="panel">
        <h2>Frozen datasets</h2>
        {firstLoad ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : datasets.length === 0 ? (
          <EmptyState title="No frozen datasets yet">
            <p className="muted">Import one to get started{canOperate ? "." : " (operator role required)."}</p>
            {canOperate && <Link to="/datasets/new" className="btn primary">New import</Link>}
          </EmptyState>
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
        {firstLoad ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : imports.length === 0 ? (
          <EmptyState title="No imports yet" />
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
