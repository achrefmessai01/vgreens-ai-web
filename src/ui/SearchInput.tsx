import { useId } from "react";

/** Labelled, clearable search field. The label is visually hidden but present
 *  for screen readers; pass `aria-label` friendly text via `label`. */
export function SearchInput({
  value,
  onChange,
  label = "Search",
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`search-input ${className}`.trim()}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <svg className="search-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        className="input sm search-field"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
