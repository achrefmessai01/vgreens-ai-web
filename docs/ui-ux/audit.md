# vGreens AI — UI/UX Audit (Phase 1)

Scope: enterprise-grade UI/UX redesign of the React/Vite web app. Problems below are
based on the actual source in `src/` as of this audit. Phase-1 fixes are marked **Done**;
everything else is **Planned** for later phases.

## Cross-cutting findings

- **Duplicate page title** — `Layout.tsx` rendered the current page name in the top bar
  (`<span className="cur">{title}</span>` from a `TITLES` map) while every page also renders
  its own `<h1>` via `PageHeader`. Every route showed its title twice. **Fixed globally** in
  Phase 1: the top bar now carries only global controls (brand, health, theme, user menu);
  page identity lives in `PageHeader` + breadcrumbs.
- **Bare user row in top bar** — username + role badge + a naked "Sign out" button. Replaced
  with a polished `UserMenu` dropdown (Profile / Theme / Sign out). **Done.**
- **No shared overflow/drawer/toast/search primitives** — pages hand-rolled action rows,
  permanent forms and `window.prompt`/`window.alert` flows. Added reusable `Breadcrumbs`,
  `OverflowMenu`, `Drawer`, `Toast`/`ToastProvider`/`useToast`, `SearchInput`, `Toolbar`.
  **Done** (rolled out to Administration; other pages Planned).
- **No automated tests** — there is no unit-test runner installed. Adding a test harness
  (e.g. Vitest + Testing Library) is **Planned** for a later phase; not introduced in Phase 1.
- **`PageHeader` rollout** — the extended `PageHeader` (breadcrumb + title + description +
  action slot) is applied to Administration in Phase 1. Dashboard and Jobs already use the
  old `PageHeader`; they and all remaining pages should adopt the breadcrumb variant in a
  later phase. **Planned.**

## Route-by-route

| Route | Component | Problem | Severity | Proposed improvement | Status |
|---|---|---|---|---|---|
| `/` (Overview/Dashboard) | `components/Dashboard.tsx` | Title duplicated in top bar; no breadcrumb; quick-action buttons are an undifferentiated row; 15s polling with no visible loading skeleton on refresh. | Medium | Remove top-bar title (done); add breadcrumb via `PageHeader`; group primary vs secondary quick actions; skeletons on first load. | Planned (title fix Done) |
| `/jobs` | `pages/JobsPage.tsx` | Title duplicated in top bar; "Refresh"/"Auto"/"Submit" crowd the header; filters use bare `.filters` block, not a `Toolbar`; free-text model filter has no clear button. | Medium | Remove top-bar title (done); move filters into `Toolbar` + `SearchInput`; keep pagination (already good). | Planned (title fix Done) |
| `/jobs/:id` | `pages/JobDetailPage.tsx` | Title duplicated in top bar; destructive "Cancel job" likely always visible; long log/artifact sections need clearer empty/error states. | Medium | Remove top-bar title (done); confirm destructive actions via `ConfirmDialog`; consistent empty/error states. | Planned (title fix Done) |
| `/submit` | `pages/SubmitPage.tsx` | Title duplicated in top bar; large form with limited inline validation and success feedback. | Medium | Remove top-bar title (done); inline field validation + success `Toast`; group fields. | Planned (title fix Done) |
| `/datasets` | `pages/DatasetsPage.tsx` | Title duplicated in top bar; list lacks search/filter; empty/loading states to verify. | Medium | Remove top-bar title (done); add `SearchInput`/`Toolbar`; skeleton + `EmptyState`. | Planned (title fix Done) |
| `/datasets/:name` | `pages/DatasetDetailPage.tsx` | Title duplicated in top bar; version table + actions need consistent treatment. | Low | Remove top-bar title (done); `PageHeader` breadcrumb "Datasets / <name>". | Planned (title fix Done) |
| `/datasets/new` | `pages/DatasetImportPage.tsx` | Title duplicated in top bar; multi-source import form needs stronger validation and progress feedback. | Medium | Remove top-bar title (done); inline validation + `Toast`; breadcrumb. | Planned (title fix Done) |
| `/datasets/imports/:id` | `pages/DatasetImportDetailPage.tsx` | Title duplicated in top bar; licence approve/reject are destructive-ish actions; timeline/empty states. | Medium | Remove top-bar title (done); confirm licence decisions; consistent states; breadcrumb. | Planned (title fix Done) |
| `/models` | `pages/ModelsPage.tsx` | Title duplicated in top bar; no search across models; onboarding entry point placement. | Low | Remove top-bar title (done); `SearchInput`; breadcrumb + primary action. | Planned (title fix Done) |
| `/models/:model` | `pages/ModelDetailPage.tsx` | Title duplicated in top bar; promote/rollback/delete are always-visible destructive buttons. | High | Remove top-bar title (done); move destructive/version actions into `OverflowMenu` + `ConfirmDialog`. | Planned (title fix Done) |
| `/models/onboard` | `pages/OnboardModelPage.tsx` | Title duplicated in top bar; onboarding form validation/feedback. | Medium | Remove top-bar title (done); inline validation + `Toast`; breadcrumb "Models / Onboard". | Planned (title fix Done) |
| `/monitoring` | `pages/MonitoringPage.tsx` | Title duplicated in top bar; heavy Recharts page needs clear loading + range controls in a `Toolbar`. | Low | Remove top-bar title (done); `Toolbar` for range; skeletons for charts. | Planned (title fix Done) |
| `/admin` (Administration) | `pages/AdminPage.tsx` | Bare `<h1>Administration</h1>` (not `PageHeader`); duplicate top-bar title; permanent "create user" and "create token" forms below tables; role change is an always-visible inline `<select>` per row; row of 5+ action buttons incl. always-visible Delete/Anonymise; `window.prompt` for password reset; lone floating "Refresh"; no search/filter/pagination; weak empty/loading/error states; success shown as a persistent notice box. | High | Full redesign (see below). | **Done** |
| Login | `components/Login.tsx` | Not inside the shell (correct); solid already — show/hide password, aria-label, error box. Minor: no caps-lock hint, no branding polish. | Low | Keep; optional polish (caps-lock hint, layout) later. | Planned |

## Administration redesign (Phase 1 — Done)

- `PageHeader` with breadcrumb **Administration / Users**, title **"Users & access"**,
  description, and a top-right **Create user** primary action.
- In-page **tabs**: Users · API tokens · Audit log (no new routes). Users is default.
- Users **`Toolbar`**: `SearchInput` (client-side filter on username/display name), **Role**
  filter, **Status** filter, and a **Refresh** button — replacing the lone floating Refresh.
- Users **table**: initials avatar + username + **You** chip for the current user; Role badge;
  Status badge (text + shape, not colour alone); Last sign-in (relative, exact in `title`);
  Sessions (opens detail drawer); Created (relative); Actions.
- The 5+ action buttons per row are replaced by a single **`OverflowMenu`** grouped as
  **Account** (Change role, Reset password) · **Sessions** (View sessions, Force logout) ·
  **Security** (Disable/Enable) · **Danger zone** (Anonymise, Delete).
- **Current-user protections (UX only; backend remains authoritative):** for the logged-in
  admin's own row, **Delete**, **Anonymise**, **Disable** and **Force logout** are *disabled
  (not hidden)* with explanatory tooltips; removing the **last active admin** role is disabled
  in the role drawer with a tooltip.
- **Create user** opens a right-side **`Drawer`** (no permanent form): Username, Display name
  (optional — supported by the API), Role, Temporary password (show/hide + strength hint),
  inline validation, disabled+loading submit, success `Toast`, and an inline alert using the
  API's real error message. *"Require password change"* and *"Account state"* are **omitted**
  because `adminCreateUser` does not accept those fields — added a note here rather than
  inventing an endpoint.
- **Role change** is initiated from the overflow menu → a small `Drawer`; granting/removing
  admin or changing the current user requires a `ConfirmDialog`.
- **Delete / Anonymise** use the existing `ConfirmDialog` with **type-to-confirm** (type the
  username) and copy explaining the backend's real semantics (delete requires no active
  sessions/tokens/jobs; anonymise renames to `deleted_user_<id>`, revokes sessions/tokens,
  scrambles the password, preserves audit history).
- **Pagination** with a result count ("Showing X–Y of N users").
- **Loading** (skeleton rows), **empty** ("No users match your filters") and **error** states.
- **API tokens** tab: table + **Create token** drawer with a one-time token reveal + copy
  button (persisted in the drawer, not a transient toast). **Audit log** tab: table with
  relative timestamps and empty state.

### Known Phase-1 limitations / later phases

- Sessions count is not present in `adminUsers()` list data, so the Sessions column links to
  a **detail drawer** that loads `adminGetUser` (active_sessions/tokens/jobs). Showing an
  inline count would require per-row fetches; deferred.
- All non-Administration pages still need the breadcrumb `PageHeader` and the
  `Toolbar`/`OverflowMenu`/`Drawer`/`Toast` treatment (see table above).
- Add a unit-test runner (Vitest + Testing Library) and cover the new primitives.
