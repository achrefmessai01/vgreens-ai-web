import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, ApiError, type Timeseries, type TimeseriesRange } from "../api";
import { handleAuthLost } from "../auth";

const RANGES: TimeseriesRange[] = ["1h", "6h", "24h"];

type ChartCfg = { key: string; title: string; unit: string; mul: number; digits: number };
const CHARTS: ChartCfg[] = [
  { key: "queue_depth", title: "Queue depth", unit: "jobs", mul: 1, digits: 0 },
  { key: "oldest_queued_seconds", title: "Oldest queued", unit: "min", mul: 1 / 60, digits: 1 },
  { key: "api_request_rate", title: "API requests", unit: "req/s", mul: 1, digits: 2 },
  { key: "api_p95_seconds", title: "API p95 latency", unit: "ms", mul: 1000, digits: 0 },
  { key: "api_error_ratio", title: "API error ratio", unit: "%", mul: 100, digits: 1 },
  { key: "gpu_workers_online", title: "GPU workers online", unit: "", mul: 1, digits: 0 },
];

function hhmm(t: number) {
  return new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Trends() {
  const [range, setRange] = useState<TimeseriesRange>("1h");
  const [ts, setTs] = useState<Timeseries | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTs(await api.systemTimeseries(range));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return handleAuthLost();
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [range]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Trends</h2>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r} className={range === r ? "seg-btn active" : "seg-btn"} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="card bad">Trends unavailable: {error}</div>
      ) : ts && !ts.available ? (
        <div className="card neutral">Trends unavailable — Prometheus is unreachable. Point-in-time data above may still be current.</div>
      ) : !ts ? (
        <div className="card">Loading trends…</div>
      ) : (
        <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {CHARTS.map((c) => (
            <MiniChart key={c.key} cfg={c} points={ts.series[c.key] ?? []} />
          ))}
        </div>
      )}
    </section>
  );
}

function MiniChart({ cfg, points }: { cfg: ChartCfg; points: [number, number | null][] }) {
  const data = points.map(([t, v]) => ({ t, v: v == null ? null : v * cfg.mul }));
  const last = [...data].reverse().find((d) => d.v != null)?.v;
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{cfg.title}</div>
        <div className="muted mono" style={{ fontSize: 12 }}>
          {last == null ? "—" : `${last.toFixed(cfg.digits)}${cfg.unit ? " " + cfg.unit : ""}`}
        </div>
      </div>
      <div style={{ height: 120, marginTop: 6 }}>
        {data.length === 0 ? (
          <div className="muted" style={{ fontSize: 12, paddingTop: 40, textAlign: "center" }}>no data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" tickFormatter={hhmm} tick={{ fontSize: 10, fill: "var(--muted)" }}
                stroke="var(--border)" minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--border)" width={44}
                allowDecimals={cfg.digits > 0} />
              <Tooltip
                contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t: number) => hhmm(Number(t))}
                formatter={(v: number | string) => [`${Number(v).toFixed(cfg.digits)}${cfg.unit ? " " + cfg.unit : ""}`, cfg.title]} />
              <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
