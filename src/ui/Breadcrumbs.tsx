import { Fragment } from "react";
import { Link } from "react-router-dom";

export interface Crumb {
  label: string;
  to?: string;
}

/** Breadcrumb trail, e.g. "Administration / Users". The last item is the
 *  current page (rendered as plain, current text). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="crumbs-nav" aria-label="Breadcrumb">
      <ol className="crumbs-list">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li className="crumb">
                {c.to && !last ? (
                  <Link className="crumb-link" to={c.to}>{c.label}</Link>
                ) : (
                  <span className="crumb-cur" aria-current={last ? "page" : undefined}>{c.label}</span>
                )}
              </li>
              {!last && <li className="crumb-sep" aria-hidden="true">/</li>}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
