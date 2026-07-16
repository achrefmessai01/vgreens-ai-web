# vgreens-ai-web

Internal web UI for the vGreens AI platform. A **client over the Job API** —
it holds no state and enforces no rules of its own; the API is the security
boundary. Independent of vGreensLab.

Stack: React + Vite + TypeScript. Builds to static files served behind the
reverse proxy in production.

## Develop

```bash
cp .env.example .env.local        # then set VITE_DEV_API_TARGET to your API
npm install
npm run dev                       # http://localhost:5173
```

The dev server proxies `/api` → `VITE_DEV_API_TARGET`, so there's no CORS and
the app code is identical in dev and prod. Sign in by pasting the same bearer
token the CLI uses (stored only in your browser's localStorage).

## Build

```bash
npm run build                     # -> dist/  (static, deploy behind /  with /api proxied to the API)
npm run preview                   # serve the build locally
```

## Config

| Var | Where | Meaning |
|-----|-------|---------|
| `VITE_API_BASE_URL` | build-time | Base path the browser calls. Default `/api`. |
| `VITE_DEV_API_TARGET` | dev only | Where the vite proxy forwards `/api`. |

## Auth note

The MVP uses the API's existing static bearer token. Real users, sessions, and
roles are added in Milestone 4 (production access) at the reverse-proxy / API
layer — not in this frontend.

## Status

Milestone 3.1: read-only Dashboard (health, version, workers, GPUs, recent
jobs). Later steps add jobs list/detail, submit training/processing, and models.
