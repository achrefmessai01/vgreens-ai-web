# vGreens AI — Web Design System

This document is the reference for the vGreens AI internal web application's design system: the tokens, primitives, patterns, theming, accessibility, and the security posture the UI is built to respect. It reflects the codebase as of the D1–D10 redesign.

## Principles

The interface is an operator console for an internal MLOps platform, not a marketing site. It favours density, legibility, and speed over decoration. Four rules drive every decision. The UI is a **thin client over the Job API** — it never talks to the database, broker, Docker, the NAS registry, or Prometheus directly; every read and write goes through a curated API endpoint. **Role gating in the browser is convenience, not security** — the API enforces every rule, and the UI simply hides actions a role can't perform. **Human gates stay explicit** — two-GPU training, licence approval, and model promotion always require a deliberate confirmation. And **degraded is never shown as healthy** — when a dependency (Prometheus, the NAS) is unreachable, the UI shows "unknown" or "degraded" rather than implying everything is fine.

## Tokens

All tokens are CSS custom properties declared in `src/styles.css`. Scales are theme-independent; colours are redefined per theme. Components must consume tokens rather than hard-coding values, so the light/dark themes and any future re-skin stay consistent.

**Spacing** uses a 4px base: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 24, `--space-6` 32, `--space-7` 48.

**Radii and elevation:** `--radius-sm` 8px, `--radius` 12px, `--radius-lg` 16px; `--shadow-1` for subtle lift, `--shadow-2` for overlays and modals.

**Typography** is a single system font stack with a size scale: `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 14 (body), `--fs-lg` 16, `--fs-xl` 20, `--fs-2xl` 24. Monospace (`ui-monospace, Menlo`) is reserved for IDs, digests, code, and metrics.

**Interaction:** `--transition` is a shared 120ms ease; `--focus-ring` is the keyboard focus outline (a 3px green glow) applied via `:focus-visible`.

### Colour

Colours are semantic, never literal — components reference `--primary`, `--text`, `--border`, and the status hues, so switching themes only swaps the palette.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0f1512` | `#f5f8f6` | app background |
| `--panel` | `#16201b` | `#ffffff` | cards, panels, sidebar |
| `--panel-2` | `#1c2822` | `#eef3f0` | insets, skeleton base |
| `--border` | `#26332c` | `#d9e2dc` | hairlines, dividers |
| `--text` | `#e6efe9` | `#14211b` | primary text |
| `--muted` | `#8fa398` | `#5f6f66` | secondary text |
| `--green` | `#35c281` | `#12904f` | success / ok |
| `--amber` | `#e0b341` | `#9a6b06` | warning / degraded |
| `--red` | `#e06a5a` | `#c0392b` | error / danger |
| `--cyan` | `#4fb6c9` | `#1f7f92` | info accents |
| `--primary` | `#1f6b4b` | `#12904f` | primary buttons, active nav, chart lines |
| `--primary-fg` | `#ffffff` | `#ffffff` | text on primary |

## Theming

Theme is controlled by a `data-theme` attribute on `<html>`, managed by `ThemeContext` (`src/ThemeContext.tsx`) and persisted to `localStorage` under `vg-theme`. Dark is the default. The toggle lives in the app header. Because every colour is a token, no component needs theme-aware logic — they inherit the active palette. `color-scheme` is set per theme so native form controls and scrollbars match.

## Primitives

Reusable building blocks live in `src/ui/` and are exported from `src/ui/index.ts`. Pages compose these rather than restyling raw elements.

**Button** — `.btn` with `.primary` (filled, primary action), `.ghost` (quiet, secondary), `.danger` (destructive), and `.sm-btn` (compact, for table rows).

**Card / Panel** — `.panel` is the standard content container; `.card` is a smaller surface used for tiles and stats. `.panel-head` lays out a panel title with a right-aligned action.

**PageHeader** — the title block at the top of every page: a title, an optional description, and an optional actions slot (refresh, primary CTA, live status). Standardises page framing.

**Badge** — a status pill that maps a status string to a tone (`ok`, `bad`, `run`, `info`, `warning`, `active`, `neutral`). `StatusBadge` wraps it for job/worker/import states so the same status always reads the same colour across the app.

**Skeleton** — a shimmer placeholder shown on first load instead of a spinner, so layout doesn't jump. Respects `prefers-reduced-motion`.

**EmptyState** — a titled empty message with an optional call-to-action, used whenever a list has no rows.

**ConfirmDialog** — the modal used for every destructive or high-consequence action. Supports a danger style, an optional typed-confirmation phrase (e.g. type the username to delete), a busy state, and inline error display. This is where human gates surface.

## Patterns

**App shell** (`src/components/Layout.tsx`) — a collapsible grouped sidebar (Platform / Operations / Administration, role-filtered), a header with breadcrumb, a live health pill, the theme toggle, and the signed-in user. Collapse state persists in `localStorage`.

**Filter chips** — `.chip` / `.chip-active` for quick single-select filters (e.g. job status), used alongside dropdowns for secondary filters.

**Segmented control** — `.seg` / `.seg-btn` for small mutually-exclusive choices (job type, GPU count, chart range).

**Wizards / review-before-submit** — forms that queue work (Submit job, Import dataset, Onboard model) collect input, then present a review/confirm step. Two-GPU training shows an explicit "both GPUs will be used" warning before it can be queued.

**Live regions** — lists with active items (Jobs, Datasets, Monitoring) auto-refresh on an interval, and only while there is something in flight, to keep the API load low.

**Callouts** — `.notice-box` (success/info, green), `.warn-box` (amber, e.g. "N imports awaiting licence approval"), `.error-box` (red). `.code-block` renders generated YAML and CLI commands with copy/download.

**Charts** — the Monitoring page uses Recharts line charts fed exclusively by the curated `GET /system/timeseries` endpoint (a fixed allowlist of recording-rule queries; the browser can only pick a time window, never supply PromQL).

## Accessibility

The app targets keyboard and screen-reader usability. There is a skip-to-content link, a single `<main id="main">` landmark, and a `<nav aria-label="Primary">` around the sidebar. Active navigation is announced via `aria-current` (from `NavLink`). All interactive elements show the `--focus-ring` on `:focus-visible`. Icon-only controls (theme toggle, sidebar collapse) carry `aria-label`s, and the collapse button exposes `aria-expanded`. The health pill is an `aria-live="polite"` status region. A global `prefers-reduced-motion` guard disables transitions, animations, and the skeleton shimmer for users who ask for it.

## Performance

Routes are code-split with `React.lazy` (`src/App.tsx`), so each page ships as its own chunk and the heavy charting library (Recharts) is only downloaded when a user opens Monitoring. A `Suspense` boundary in the shell shows a lightweight fallback during chunk loads. Auto-refreshing views poll only while work is active and share a single fetch per tick.

## Security posture (frontend)

The UI hides actions a role cannot perform, but treats that purely as UX — the API is the source of truth and rejects anything unauthorized regardless of what the browser shows. Session cookies are HttpOnly; no tokens are ever stored in `localStorage`. Destructive admin actions (disable, anonymise, delete) go through `ConfirmDialog` with typed confirmation and map the API's conflict codes (active sessions/tokens/jobs, last-admin) to plain-English guidance. The browser never queries Prometheus, the database, or the broker directly; monitoring data comes only from curated `/system/*` endpoints, and a monitoring outage renders as degraded/unknown, never as healthy.
