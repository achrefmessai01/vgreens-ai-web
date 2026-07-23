const TONE: Record<string, string> = {
  succeeded: "ok", validated: "ok", online: "ok", ready: "ok", alive: "ok", frozen: "ok", completed: "ok", active: "active",
  failed: "bad", rejected: "bad", offline: "bad",
  cancelled: "muted", inactive: "muted", baseline_only: "muted", thresholds_not_configured: "muted",
  running: "run", validating: "run", staging: "run", auditing: "run", normalising: "run", freezing: "run", downloading: "run", quarantined: "run",
  queued: "info", submitted: "info", candidate: "info",
  waiting_for_gpu: "warning", waiting_for_two_gpus: "warning", awaiting_license_approval: "warning",
};
export function Badge({ status }: { status: string }) {
  const tone = TONE[status] ?? "neutral";
  return <span className={`badge ${tone}`}>{status.replace(/_/g, " ")}</span>;
}
