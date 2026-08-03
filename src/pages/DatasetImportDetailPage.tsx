import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type DatasetImport } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { Badge, PageHeader, ConfirmDialog, OverflowMenu, Skeleton, useToast } from "../ui";
import { fmt } from "../lib/format";
import "../styles/datasets.css";

const ACTIVE = ["submitted", "downloading", "staging", "quarantined", "auditing", "normalising", "freezing"];

/** Canonical lifecycle for the stepper. `staging` is folded into Downloading. */
const FLOW: { key: string; label: string; desc: string }[] = [
  { key: "submitted", label: "Submitted", desc: "Import request accepted and queued." },
  { key: "downloading", label: "Downloading", desc: "Fetching source files from the origin." },
  { key: "quarantined", label: "Quarantined", desc: "Files isolated and scanned before processing." },
  { key: "auditing", label: "Auditing", desc: "Inspecting contents, structure and licence metadata." },
  { key: "awaiting_license_approval", label: "Awaiting licence approval", desc: "External dataset paused for a licence decision." },
  { key: "normalising", label: "Normalising", desc: "Converting to the standard on-disk layout." },
  { key: "freezing", label: "Freezing", desc: "Computing checksums and writing the immutable version." },
  { key: "frozen", label: "Frozen", desc: "Immutable, checksummed, and available for training." },
];
const ALIAS: Record<string, string> = { staging: "downloading" };

const TERMINAL: Record<string, { label: string; desc: string }> = {
  rejected: { label: "Rejected", desc: "The licence was rejected — this import will not be frozen." },
  failed: { label: "Failed", desc: "The pipeline hit an error and stopped." },
  cancelled: { label: "Cancelled", desc: "The import was cancelled before completing." },
};

type Tone = "info" | "warning" | "success" | "danger";
interface Guidance { tone: Tone; title: string; action: string; who: string; why: string; }

function guidanceFor(state: string): Guidance {
  if (state === "awaiting_license_approval")
    return {
      tone: "warning",
      title: "Licence approval required",
      action: "Approve or reject the dataset's licence.",
      who: "An administrator.",
      why: "External data can only enter training once its licence is confirmed to permit internal use.",
    };
  if (state === "frozen")
    return {
      tone: "success",
      title: "Frozen and ready",
      action: "Select this version when submitting a training job.",
      who: "Any operator or admin.",
      why: "The version is immutable and checksummed, so training runs are reproducible.",
    };
  if (state === "rejected")
    return {
      tone: "danger",
      title: "Licence rejected",
      action: "Start a new import once the licence situation is resolved.",
      who: "An operator or admin.",
      why: "Rejected imports are never frozen, keeping unlicensed data out of training.",
    };
  if (state === "failed")
    return {
      tone: "danger",
      title: "Import failed",
      action: "Review the error below, correct the source, then start a new import.",
      who: "An operator or admin.",
      why: "The pipeline stops on error so nothing partial is frozen.",
    };
  if (state === "cancelled")
    return {
      tone: "info",
      title: "Import cancelled",
      action: "Start a new import if you still need this dataset.",
      who: "An operator or admin.",
      why: "No version was frozen for this import.",
    };
  return {
    tone: "info",
    title: "Import in progress",
    action: "No action needed — this stage runs automatically. The page refreshes live.",
    who: "Automated pipeline.",
    why: "Each stage validates the data before it can be frozen for training.",
  };
}

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
  const toast = useToast();
  const canApprove = roleAtLeast(user?.role, "admin");
  const canOperate = roleAtLeast(user?.role, "operator");

  const [imp, setImp] = useState<DatasetImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    const t = setInterval(load, 5000); // live while it progresses
    return () => clearInterval(t);
  }, [load]);

  async function confirmRun() {
    if (!dialog) return;
    setDialogBusy(true); setDialogError(null);
    try {
      await dialog.action();
      const ok = dialog.ok;
      setDialog(null);
      toast.success(ok);
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
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Datasets", to: "/datasets" }, { label: "Imports" }, { label: id }]}
        title={id}
        description={imp ? `${imp.source_type} import for “${imp.dataset_name}”.` : "Dataset import."}
        actions={
          <>
            {imp && <Badge status={state} />}
            <button className="btn ghost" onClick={load}>Refresh</button>
            {cancellable && canOperate && (
              <OverflowMenu
                groups={[{
                  danger: true,
                  items: [{
                    label: "Cancel import",
                    danger: true,
                    onSelect: () => setDialog({
                      title: "Cancel this import?",
                      body: <>Cancelling stops the pipeline. No dataset version will be frozen for this import.</>,
                      confirmLabel: "Cancel import",
                      danger: true,
                      ok: "Import cancelled.",
                      action: () => api.cancelDatasetImport(id),
                    }),
                  }],
                }]}
              />
            )}
          </>
        }
      />

      {error && <div className="error-box wide" role="alert">{error}</div>}

      {loading && !imp && (
        <section className="panel">
          <div className="ds-skel-rows">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={18} />)}
          </div>
        </section>
      )}

      {imp && (
        <>
          <GuidanceCallout g={guidanceFor(state)} />

          {imp.error && (
            <div className="ds-callout tone-danger">
              <span className="ds-callout-ic" aria-hidden="true"><CalloutIcon tone="danger" /></span>
              <div>
                <h3>Error detail</h3>
                <p className="err-text">{imp.error}</p>
              </div>
            </div>
          )}

          <section className="panel">
            <h2>Lifecycle</h2>
            <Stepper state={state} events={imp.events ?? []} />
          </section>

          {awaiting && (
            <section className="panel warn">
              <h2>Licence decision</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                This external dataset is paused after the audit. Approving records you as the approver and
                re-queues it to freeze; rejecting stops it permanently. Only approve if the licence permits
                internal use.
              </p>
              {!canApprove ? (
                <div className="ds-callout tone-warning" style={{ marginBottom: 0 }}>
                  <span className="ds-callout-ic" aria-hidden="true"><CalloutIcon tone="warning" /></span>
                  <div><p>Licence approval requires the <b>admin</b> role. Ask an administrator to review this import.</p></div>
                </div>
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
                        ok: "Licence approved — re-queued to freeze.",
                        action: () => api.approveLicense(id, reason || "approved via web", imp?.licence_name || undefined),
                        body: <>The dataset will proceed to freeze and become usable for training. You are recorded as the approver.</>,
                      })}>Approve licence</button>
                    <button className="btn danger"
                      onClick={() => setDialog({
                        title: "Reject this licence?",
                        confirmLabel: "Reject import",
                        danger: true,
                        ok: "Licence rejected — import rejected.",
                        action: () => api.rejectLicense(id, reason || "rejected via web"),
                        body: <>The import will be rejected and will not be frozen. This cannot be undone.</>,
                      })}>Reject</button>
                  </div>
                </>
              )}
            </section>
          )}

          <section className="panel">
            <h2>Details</h2>
            <div className="ds-kv-grid">
              <KV k="Dataset" v={imp.dataset_name} />
              <KV k="Source" v={imp.source_type} />
              <KV k="State" v={<Badge status={state} />} />
              <KV k="Resolved version" v={imp.resolved_version ?? "—"} />
              <KV k="Licence" v={`${imp.licence_name ?? "—"} (${imp.licence_status ?? "—"})`} />
              <KV k="Requested by" v={imp.requested_by ?? "—"} />
              <KV k="Created" v={fmt(imp.created_at)} />
              <KV k="Updated" v={fmt(imp.updated_at)} />
              <KV k="Source params" v={<span className="ds-mono-wrap">{JSON.stringify(imp.source_params ?? {})}</span>} />
            </div>
          </section>

          <section className="panel">
            <h2>Event history</h2>
            {(imp.events ?? []).length === 0 ? (
              <p className="muted">No events recorded.</p>
            ) : (
              <ol className="timeline">
                {(imp.events ?? []).map((e, i) => (
                  <li key={i}>
                    <div className="tl-dot" />
                    <div className="tl-body">
                      <div className="tl-top">
                        <Badge status={e.state || "event"} />
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

/* ---- stepper ------------------------------------------------------------- */

function canonicalIndex(state: string): number {
  const key = ALIAS[state] ?? state;
  return FLOW.findIndex((f) => f.key === key);
}

function Stepper({ state, events }: { state: string; events: { state?: string }[] }) {
  const terminal = state in TERMINAL;
  const currentIndex = canonicalIndex(state);

  let reached = currentIndex;
  for (const e of events) {
    const idx = canonicalIndex(e.state ?? "");
    if (idx > reached) reached = idx;
  }

  const status = (i: number): "done" | "current" | "pending" => {
    if (terminal) return i <= reached ? "done" : "pending";
    if (state === "frozen") return "done";
    if (i < currentIndex) return "done";
    if (i === currentIndex) return "current";
    return "pending";
  };

  return (
    <ol className="ds-stepper">
      {FLOW.map((f, i) => {
        const st = status(i);
        const tag =
          st === "current" ? (f.key === "awaiting_license_approval" ? "Action needed" : "In progress") : null;
        return (
          <li key={f.key} className={`ds-step is-${st}`}>
            <span className="ds-step-node" aria-hidden="true">
              {st === "done" ? <CheckIcon /> : i + 1}
            </span>
            <div className="ds-step-body">
              <div className="ds-step-label">
                {f.label}
                {tag && <span className="ds-step-tag">{tag}</span>}
                <span className="sr-only">{`: ${st}`}</span>
              </div>
              {st !== "pending" && <div className="ds-step-desc">{f.desc}</div>}
            </div>
          </li>
        );
      })}
      {terminal && (
        <li className="ds-step is-error">
          <span className="ds-step-node" aria-hidden="true"><XIcon /></span>
          <div className="ds-step-body">
            <div className="ds-step-label">
              {TERMINAL[state].label}
              <span className="ds-step-tag">Stopped</span>
            </div>
            <div className="ds-step-desc">{TERMINAL[state].desc}</div>
          </div>
        </li>
      )}
    </ol>
  );
}

/* ---- small pieces -------------------------------------------------------- */

function GuidanceCallout({ g }: { g: Guidance }) {
  return (
    <div className={`ds-callout tone-${g.tone}`}>
      <span className="ds-callout-ic" aria-hidden="true"><CalloutIcon tone={g.tone} /></span>
      <div>
        <h3>{g.title}</h3>
        <p>{g.action}</p>
        <div className="ds-facts">
          <span className="ds-fact"><span className="ds-fact-k">Who: </span><span className="ds-fact-v">{g.who}</span></span>
          <span className="ds-fact"><span className="ds-fact-k">Why it matters: </span><span className="ds-fact-v">{g.why}</span></span>
        </div>
      </div>
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

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function CalloutIcon({ tone }: { tone: Tone }) {
  if (tone === "success")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 12.5 11 15l4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (tone === "danger")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v5M12 15.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (tone === "warning")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 9v4M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5M12 7.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
