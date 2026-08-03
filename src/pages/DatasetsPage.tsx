import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type DatasetImport, type DatasetSummary } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { Badge, PageHeader, EmptyState, Skeleton, Toolbar, SearchInput } from "../ui";
import { fmt } from "../lib/format";
import "../styles/datasets.css";

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
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return datasets;
    return datasets.filter((d) => d.dataset_name.toLowerCase().includes(q));
  }, [datasets, query]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Datasets" }]}
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

      {error && <div className="error-box wide" role="alert">{error}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2>Frozen datasets</h2>
        </div>
        <Toolbar
          start={
            <SearchInput
              value={query}
              onChange={setQuery}
              label="Filter datasets by name"
              placeholder="Filter datasets…"
            />
          }
          end={
            !firstLoad && datasets.length > 0 ? (
              <span className="ds-result-count">
                {filtered.length} of {datasets.length}
              </span>
            ) : undefined
          }
        />
        {firstLoad ? (
          <div className="ds-skel-rows">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : datasets.length === 0 ? (
          <EmptyState title="No frozen datasets yet">
            <p className="muted">Import one to get started{canOperate ? "." : " (operator role required)."}</p>
            {canOperate && <Link to="/datasets/new" className="btn primary">New import</Link>}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches">
            <p className="muted">No datasets match “{query}”.</p>
          </EmptyState>
        ) : (
          <table className="table">
            <thead><tr><th>Dataset</th><th>Versions</th><th>Latest frozen</th></tr></thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.dataset_name} className="row-link" onClick={() => navigate(`/datasets/${d.dataset_name}`)}>
                  <td>
                    <Link
                      to={`/datasets/${d.dataset_name}`}
                      className="ds-name-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.dataset_name}
                    </Link>
                  </td>
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
          <div className="ds-skel-rows">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : imports.length === 0 ? (
          <EmptyState title="No imports yet">
            <p className="muted">Imports appear here as they move through the pipeline.</p>
          </EmptyState>
        ) : (
          <table className="table">
            <thead><tr><th>Import</th><th>Dataset</th><th>Source</th><th>State</th><th>Created</th></tr></thead>
            <tbody>
              {imports.map((im) => (
                <tr key={im.import_id} className="row-link" onClick={() => navigate(`/datasets/imports/${im.import_id}`)}>
                  <td className="mono">{im.import_id}</td>
                  <td>{im.dataset_name}</td>
                  <td className="muted">{im.source_type}</td>
                  <td><Badge status={im.state} /></td>
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
