import type { ReactNode } from "react";
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><div className="es-title">{title}</div>{children}</div>;
}
