export default function StatusBadge({ status }: { status: string }) {
  const cls =
    ["succeeded", "validated", "online", "ready", "alive", "frozen"].includes(status) ? "ok"
    : ["failed", "rejected", "offline"].includes(status) ? "bad"
    : ["cancelled"].includes(status) ? "muted"
    : ["running", "staging", "auditing", "normalising", "freezing", "downloading",
       "quarantined"].includes(status) ? "run"
    : "neutral";
  return <span className={`badge ${cls}`}>{status}</span>;
}
