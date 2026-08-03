import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "../ui";

/** Operational status for a metric. `neutral` shows no flag (informational). */
export type MetricStatus = "ok" | "warn" | "bad" | "unknown" | "neutral";

const STATUS_LABEL: Record<Exclude<MetricStatus, "neutral">, string> = {
  ok: "OK",
  warn: "Attention",
  bad: "Action needed",
  unknown: "Unknown",
};

export interface MetricCardProps {
  /** Short, uppercase-styled label — the operational question it answers. */
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  status?: MetricStatus;
  /** Internal route to drill into when the metric needs attention. */
  to?: string;
  linkLabel?: string;
}

/** Compact presentational card for a single operational metric. Status is
 *  conveyed with text + shape + colour so it never relies on colour alone. */
export function MetricCard({
  title,
  value,
  sub,
  status = "neutral",
  to,
  linkLabel = "View details",
}: MetricCardProps) {
  return (
    <div className={`metric-card mc-${status}`}>
      <div className="mc-top">
        <span className="mc-title">{title}</span>
        {status !== "neutral" && (
          <span className={`mc-flag mc-flag-${status}`}>
            <span className="mc-shape" aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
      <div className="mc-value">{value}</div>
      {sub != null && sub !== "" && <div className="mc-sub">{sub}</div>}
      {to && (
        <Link className="mc-link" to={to}>
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/** Loading placeholder that matches the MetricCard footprint. */
export function MetricCardSkeleton() {
  return (
    <div className="metric-card mc-neutral is-loading" aria-hidden="true">
      <Skeleton width="55%" height={11} />
      <Skeleton width="45%" height={26} style={{ marginTop: 6 }} />
      <Skeleton width="70%" height={11} style={{ marginTop: 4 }} />
    </div>
  );
}
