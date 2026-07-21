import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type DatasetImport } from "../api";
import { handleAuthLost } from "../auth";
import StatusBadge from "../components/StatusBadge";
import { fmt } from "../lib/format";

const ACTIVE = ["submitted", "downloading", "staging", "quarantined", "auditing", "normalising", "freezing"];

export default function DatasetImportDetailPage() {
  const { id = "" } = useParams();
  const [imp, setImp] = useState<DatasetImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setImp(await api.datasetImport(id));
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Failed to load import.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);   // live while it progresses
    return () => clearInterval(t);
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    if (!window.confirm(ok + "?")) return;
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActing(false);
    }
  }

  const state = imp?.state ?? "";
  const awaiting = state === "awaiting_license_approval";
  const cancellable = ACTIVE.includes(state) || awaiting;

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <Link to="/datasets" className="link">← Datasets</Link>
          <h1 className="mono" style={{ marginTop: 4 }}>{id}</h1>
        </div>
        <div className="dash-meta">
          {imp && <StatusBadge status={state} />}
          {cancellable && (
            <button className="btn danger" disabled={acting}
              onClick={() => act(() => api.cancelDatasetImport(id), "Cancel this import")}>Cancel</button>
          )}
        </div>
      </div>

      {notice && <div className="notice-box wide">{notice}</div>}
      {error && <div className="error-box wide">{error}</div>}

      {awaiting && (
        <section className="panel" style={{ borderColor: "var(--amber)" }}>
          <h2>Licence approval required</h2>
          <p className="muted">
            This is an external dataset. Approving records you as the approver and re-queues the
            import to freeze. Only approve if the licence permits internal use.
          </p>
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn primary" disabled={acting}
              onClick={() => act(() => api.approveLicense(id, "approved via web", imp?.licence_name || undefined),
                "Approve the licence")}>Approve licence</button>
            <button className="btn danger" disabled={acting}
              onClick={() => act(() => api.rejectLicense(id, "rejected via web"), "Reject the licence")}>
              Reject
            </button>
          </div>
        </section>
      )}

      {imp && (
        <>
          <section className="panel">
            <h2>Overview</h2>
            <div className="kv">
              <Row k="Dataset" v={imp.dataset_name} />
              <Row k="Source" v={imp.source_type} />
              <Row k="State" v={<StatusBadge status={state} />} />
              <Row k="Resolved version" v={imp.resolved_version ?? "—"} />
              <Row k="Licence" v={`${imp.licence_name ?? "—"} (${imp.licence_status ?? "—"})`} />
              <Row k="Requested by" v={imp.requested_by ?? "—"} />
              <Row k="Created" v={fmt(imp.created_at)} />
              <Row k="Source params" v={<span className="mono">{JSON.stringify(imp.source_params ?? {})}</span>} />
              {imp.error && <Row k="Error" v={<span className="err-text">{imp.error}</span>} />}
            </div>
          </section>

          <section className="panel">
            <h2>Timeline</h2>
            {(imp.events ?? []).length === 0 ? (
              <p className="muted">No events.</p>
            ) : (
              <ol className="timeline">
                {(imp.events ?? []).map((e, i) => (
                  <li key={i}>
                    <div className="tl-dot" />
                    <div className="tl-body">
                      <div className="tl-top">
                        <StatusBadge status={e.state || "event"} />
                        <span className="muted tl-ts">{fmt(e.ts)}</span>
                      </div>
                      {e.detail && <div className="tl-msg">{e.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {loading && !imp && <p className="muted">Loading…</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv-row"><div className="kv-k">{k}</div><div className="kv-v">{v}</div></div>
  );
}
