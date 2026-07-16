export default function StatusBadge({ status }: { status: string }) {
  const cls =
    ["succeeded", "validated", "online", "ready", "alive"].includes(status) ? "ok"
    : ["failed", "rejected", "offline"].includes(status) ? "bad"
    : ["running"].includes(status) ? "run"
    : "neutral";
  return <span className={`badge ${cls}`}>{status}</span>;
}
