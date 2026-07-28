export function fmt(ts?: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
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
