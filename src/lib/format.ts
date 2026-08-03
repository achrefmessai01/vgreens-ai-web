export function fmt(ts?: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

/** Relative "time ago" label, e.g. "3h ago". Returns "—" when absent. */
export function relTime(ts?: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 0) return "just now";
  if (secs < 45) return "just now";
  if (secs < 90) return "1 min ago";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function metricStr(metrics: Record<string, number | string> | undefined): string {
  if (!metrics) return "—";
  const keys = Object.keys(metrics);
  if (keys.length === 0) return "—";
  return keys
    .map((k) => {
      const v = metrics[k];
      return `${k}=${typeof v === "number" ? Number(v.toFixed(4)) : v}`;
    })
    .join("  ");
}

export function fmtBytes(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Number(kb.toFixed(1))} KB`;
  return `${Number((kb / 1024).toFixed(1))} MB`;
}

export function duration(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return "—";
  const secs = Math.round((b - a) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
