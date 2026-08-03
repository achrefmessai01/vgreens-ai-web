import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export function PageHeader({ title, description, actions, breadcrumbs }:
  { title: string; description?: string; actions?: ReactNode; breadcrumbs?: Crumb[] }) {
  return (
    <div className="page-header">
      <div className="ph-main">
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
        <h1>{title}</h1>
        {description && <div className="ph-desc">{description}</div>}
      </div>
      {actions && <div className="row ph-actions" style={{ gap: 8 }}>{actions}</div>}
    </div>
  );
}
