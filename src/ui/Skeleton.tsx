import type { CSSProperties } from "react";
export function Skeleton({ height = 16, width = "100%", style }:
  { height?: number | string; width?: number | string; style?: CSSProperties }) {
  return <span className="skeleton" style={{ height, width, ...style }} />;
}
