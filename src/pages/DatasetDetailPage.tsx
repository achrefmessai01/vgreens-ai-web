import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type DatasetVersion } from "../api";
import { handleAuthLost } from "../auth";
import { Badge, PageHeader, EmptyState, Skeleton } from "../ui";
import { fmt } from "../lib/format";
import "../styles/datasets.css";

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
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Datasets", to: "/datasets" }, { label: name }]}
        title={name}
        description="Frozen, immutable versions of this dataset."
        actions={<button className="btn ghost" onClick={load} disabled={loading}>{loading ? "…" : "Refresh"}</button>}
      />

      {error && <div className="error-box wide" role="alert">{error}</div>}

      {loading && versions.length === 0 ? (
        <section className="panel">
          <div className="ds-skel-rows">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={18} />)}
          </div>
        </section>
      ) : versions.length === 0 ? (
        <EmptyState title="No frozen versions">
          <p className="muted">Versions appear here once an import for this dataset has been frozen.</p>
        </EmptyState>
      ) : (
        <section>
          {versions.map((v) => <VersionCard key={v.version} v={v} />)}
        </section>
      )}
    </div>
  );
}

function VersionCard({ v }: { v: DatasetVersion }) {
  const dist = classDistribution(v);
  const maxN = dist ? Math.max(...dist.map(([, n]) => n)) : 0;

  return (
    <div className="ds-ver-card">
      <div className="ds-ver-head">
        <div className="ds-ver-title">
          <h3>{v.version}</h3>
          {v.licence_status && <Badge status={v.licence_status} />}
        </div>
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>Frozen {fmt(v.frozen_at)}</span>
      </div>

      <div className="ds-kv-grid">
        <KV k="Task" v={v.task ?? "—"} />
        <KV k="Images" v={num(v.image_count)} />
        <KV k="Classes" v={num(v.class_count)} />
        <KV k="Licence" v={v.licence_status ?? "—"} />
        <KV k="Frozen by" v={v.frozen_by ?? "—"} />
        <KV k="Frozen at" v={fmt(v.frozen_at)} />
        <KV
          k="Checksum (content digest)"
          v={v.content_digest ? <span className="ds-mono-wrap" title={v.content_digest}>{v.content_digest}</span> : "—"}
        />
        <KV
          k="NAS path"
          v={v.nas_path ? <span className="ds-mono-wrap">{v.nas_path}</span> : "—"}
        />
      </div>

      {dist && dist.length > 0 && (
        <div className="ds-classdist">
          <div className="ds-classdist-title">Class distribution</div>
          <ul className="ds-classdist-list">
            {dist.map(([cls, n]) => (
              <li className="ds-classrow" key={cls}>
                <span className="ds-class-name" title={cls}>{cls}</span>
                <span className="ds-class-bar" aria-hidden="true">
                  <span className="ds-class-fill" style={{ width: `${maxN ? Math.round((n / maxN) * 100) : 0}%` }} />
                </span>
                <span className="ds-class-n">{n.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="ds-raw">
        <summary>Raw manifest</summary>
        <pre className="code-block">{JSON.stringify(v, null, 2)}</pre>
      </details>
    </div>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="ds-kv">
      <span className="ds-kv-k">{k}</span>
      <span className="ds-kv-v">{v}</span>
    </div>
  );
}

function num(n?: number | null): string {
  return n == null ? "—" : n.toLocaleString();
}

/** Pull a class-distribution map from the version if the API included one
 *  (fields are not part of the typed view, so read defensively). */
function classDistribution(v: DatasetVersion): [string, number][] | null {
  const raw = v as unknown as Record<string, unknown>;
  const cand = raw.class_distribution ?? raw.class_counts ?? raw.classes;
  if (cand && typeof cand === "object" && !Array.isArray(cand)) {
    const entries = Object.entries(cand as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === "number")
      .sort((a, b) => b[1] - a[1]);
    return entries.length ? entries : null;
  }
  return null;
}
