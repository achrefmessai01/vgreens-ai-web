import type { ReactNode } from "react";

/** A thin wrapper for table/section header controls (search, filters, actions).
 *  `start` sits on the left and grows; `end` is right-aligned. */
export function Toolbar({
  start,
  end,
  className = "",
}: {
  start?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`toolbar ${className}`.trim()}>
      <div className="toolbar-start">{start}</div>
      {end && <div className="toolbar-end">{end}</div>}
    </div>
  );
}
