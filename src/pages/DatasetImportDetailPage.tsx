import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type DatasetImport } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import StatusBadge from "../components/StatusBadge";
import { ConfirmDialog } from "../ui";
import { fmt } from "../lib/format";

const ACTIVE = ["submitted", "downloading", "staging", "quarantined", "auditing", "normalising", "freezing"];

type DialogSpec = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  ok: string;
  action: () => Promise<unknown>;
};

export default function DatasetImportDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const canApprove = roleAtLeast(user?.role, "admin");

  const [imp, setImp] = useState<DatasetImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

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

  async function confirmRun() {
    if (!dialog) return;
    setDialogBusy(true); setDialogError(null);
    try {
      await dialog.action();
      const ok = dialog.ok;
      setDialog(null);
      setNotice(ok);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "auth") return handleAuthLost();
      setDialogError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setDialogBusy(false);
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
            <button className="btn danger"
              onClick={() => setDialog({
                title: "Cancel this import?",
                confirmLabel: "Cancel import",
                danger: true,
                ok: "import cancelled",
                action: () => api.cancelDatasetImport(id),
              })}>Cancel</button>
          )}
        </div>
      </div>

      {notice && <div className="notice-box wide">{notice}</div>}
      {error && <div className="error-box wide">{error}</div>}

      {awaiting && (
        <section className="panel warn">
          <h2>Licence approval required</h2>
          <p className="muted">
            This is an external dataset. Approving records you as the approver and re-queues the import
            to freeze. Only approve if the licence permits internal use.
          </p>
          {!canApprove ? (
            <div className="warn-box">Licence approval requires the admin role.</div>
          ) : (
            <>
              <div className="field" style={{ maxWidth: 520 }}>
                <label className="field-label">Reason / note (recorded in the audit trail)</label>
                <textarea className="input" rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. CC-BY 4.0, cleared for internal training" />
              </div>
              <div className="form-actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn primary"
                  onClick={() => setDialog({
                    title: "Approve this licence?",
                    confirmLabel: "Approve & re-queue",
                    ok: "licence approved — re-queued to freeze",
                    action: () => api.approveLicense(id, reason || "approved via web", imp?.licence_name || undefined),
                    body: <>The dataset will proceed to freeze and become usable for training. You are recorded as the approver.</>,
                  })}>Approve licence</button>
                <button className="btn danger"
                  onClick={() => setDialog({
                    title: "Reject this licence?",
                    confirmLabel: "Reject import",
                    danger: true,
                    ok: "licence rejected — import rejected",
                    action: () => api.rejectLicense(id, reason || "rejected via web"),
                    body: <>The import will be rejected and will not be frozen.</>,
                  })}>Reject</button>
              </div>
            </>
          )}
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

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          busy={dialogBusy}
          error={dialogError}
          onConfirm={confirmRun}
          onCancel={() => { if (!dialogBusy) { setDialog(null); setDialogError(null); } }}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv-row"><div className="kv-k">{k}</div><div className="kv-v">{v}</div></div>
  );
}
