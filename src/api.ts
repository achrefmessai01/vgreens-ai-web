// Thin fetch client over the Job API. Auth is the HttpOnly session cookie
// (credentials: "include"); maps HTTP status to typed errors; returns parsed JSON.
const BASE = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: "auth" | "not_found" | "conflict" | "server" | "network" | "generic",
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the API. Check the URL / VPN.");
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(res.status, "auth", "Authentication required.");
  }
  if (res.status === 404) throw new ApiError(404, "not_found", await msg(res, "Not found."));
  if (res.status === 409) throw new ApiError(409, "conflict", await msg(res, "Conflict."));
  if (res.status >= 500) throw new ApiError(res.status, "server", await msg(res, "Server error."));
  if (!res.ok) throw new ApiError(res.status, "generic", await msg(res, `HTTP ${res.status}`));
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawRequest(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function msg(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail || body?.message || fallback;
  } catch {
    return fallback;
  }
}

// ---- typed views over what the API returns (partial; extend as needed) ----
export interface Job {
  job_id: string;
  job_type: "training" | "processing";
  status: string;
  model_name: string;
  dataset_name?: string | null;
  dataset_version?: string | null;
  tenant?: string | null;
  worker_id?: string | null;
  docker_image?: string | null;
  config_path?: string | null;
  error?: string | null;
  output_path?: string | null;
  result_version?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface JobArtifact {
  path: string;
  size_bytes: number;
}

export interface JobResult {
  job_id: string;
  job_type: "training" | "processing";
  status: string;
  output_path: string | null;
  result_version: string | null;
  available: boolean;
  metrics: Record<string, number | string> | null;
  report: Record<string, unknown> | null;
  evaluation_report_md: string | null;
  artifacts: JobArtifact[];
}

export interface JobLogs {
  available: boolean;
  lines: string[];
  total_lines: number;
}

export interface JobEvent {
  id?: number;
  job_id?: string;
  ts?: string;
  event?: string;
  status?: string;
  message?: string;
  detail?: string;
  worker_id?: string | null;
}

export interface Worker {
  name: string;
  online?: boolean;
  last_seen?: string | null;
  seconds_since_heartbeat?: number | null;
  current_job?: string | null;
}

export interface Gpu {
  index: number;
  name?: string;
  utilization_pct?: number;
  memory_used_mb?: number;
  memory_total_mb?: number;
  temperature_c?: number;
}

export interface Health {
  status: string;
  checks?: Record<string, unknown>;
}

export interface Version {
  version: string;
  api_level?: string;
  git_commit?: string;
}

export interface JobsPage {
  jobs: Job[];
  total: number;
}

export interface JobFilters {
  status?: string;
  job_type?: string;
  model?: string;
  limit: number;
  offset: number;
}

export interface ModelVersion {
  version: string;
  status: string | null;
  reason?: string | null;
  metrics: Record<string, number | string>;
  active: boolean;
}

export interface ModelSummary {
  model: string;
  active_version: string | null;
  version_count: number;
  versions: ModelVersion[];
}

export interface CreateJobBody {
  job_type: "training" | "processing";
  model_name: string;
  docker_image?: string;          // optional: API resolves from the model registry when omitted
  model_version?: string;         // optional explicit model version to reuse the image from
  dataset_name?: string;
  dataset_version?: string;
  tenant?: string;
  config_path?: string;
  priority?: number;
  gpu_count?: number;
}

export interface DatasetSummary {
  dataset_name: string;
  versions: number;
  latest_frozen_at?: string | null;
}

export interface DatasetVersion {
  dataset_name: string;
  version: string;
  task?: string | null;
  image_count?: number | null;
  class_count?: number | null;
  licence_status?: string | null;
  content_digest?: string | null;
  nas_path?: string | null;
  frozen_at?: string | null;
  frozen_by?: string | null;
}

export interface DatasetImportEvent {
  ts?: string;
  state?: string;
  detail?: string | null;
}

export interface DatasetImport {
  import_id: string;
  dataset_name: string;
  source_type: string;
  source_params?: Record<string, unknown>;
  state: string;
  requested_version?: string | null;
  resolved_version?: string | null;
  licence_name?: string | null;
  licence_status?: string | null;
  requested_by?: string | null;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  events?: DatasetImportEvent[];
}

export interface CreateDatasetImportBody {
  source_type: "roboflow" | "local" | "nas";
  dataset_name: string;
  source: Record<string, unknown>;
  requested_version?: string;
  idempotency_key?: string;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name?: string | null;
  email?: string | null;
  role: string;
  active: number | boolean;
  created_at?: string | null;
  last_login?: string | null;
}

export interface TokenMeta {
  id: string;
  name?: string | null;
  owner?: string | null;
  scopes?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  last_used?: string | null;
  revoked: number | boolean;
}

export interface AuditEvent {
  ts?: string | null;
  actor?: string | null;
  action?: string | null;
  target?: string | null;
  result?: string | null;
  reason?: string | null;
  source?: string | null;
}

export interface AlertInfo {
  name: string;
  severity: string;
  component?: string;
  state: string;
  summary?: string;
  runbook?: string;
}

export interface SystemOverview {
  nas_mounted: boolean;
  workers: { online: number; total: number };
  gpus: Gpu[];
  queues: { type: string; depth: number; oldest_seconds: number }[];
  queued_total: number;
  oldest_queued_seconds: number;
  jobs_by_status: Record<string, number>;
  backups: { latest: string | null; count: number; age_seconds: number | null; size_bytes?: number };
  alerts: { available: boolean; firing: { critical: number; warning: number }; list: AlertInfo[] };
}

// ---- LIVE monitoring (Phase 1): the SSE snapshot payload -------------------
export interface MonitorGpu extends Gpu {
  power_w?: number | null;
  assigned_worker?: string | null;
  current_job?: { job_id: string; model_name?: string | null; requested_by?: string | null } | null;
}

export interface MonitorRecentJob {
  job_id: string;
  job_type?: string | null;
  model_name?: string | null;
  status: string;
  requested_by?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
  output_path?: string | null;
  result_version?: string | null;
  error?: string | null;
}

export interface MonitorRecentError {
  job_id: string;
  model_name?: string | null;
  created_at?: string | null;
  error?: string | null;
}

export interface MonitorStorage {
  nas_mounted: boolean;
  nas_path: string;
  nas_total_bytes?: number | null;
  nas_free_bytes?: number | null;
  nvme_path: string;
  nvme_total_bytes?: number | null;
  nvme_free_bytes?: number | null;
}

export interface MonitorSnapshot {
  overview: SystemOverview;
  gpus: MonitorGpu[];
  workers: Worker[];
  recent_jobs: MonitorRecentJob[];
  recent_errors: MonitorRecentError[];
  storage: MonitorStorage;
  generated_at: string;
  error?: string;   // present only if the server hit an error building this frame
}

export type TimeseriesRange = "1h" | "6h" | "24h";
export interface Timeseries {
  range: string;
  step: number;
  available: boolean;
  // each series is an array of [unix_seconds, value|null]
  series: Record<string, [number, number | null][]>;
}

export const api = {
  // auth (session cookie)
  me: () => request<{ username: string; role: string; via?: string }>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ username: string; role: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<unknown>("/auth/logout", { method: "POST" }),

  // admin: users + tokens (admin role only; API enforces)
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  adminCreateUser: (body: { username: string; password: string; role: string;
    display_name?: string; email?: string }) =>
    request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateUser: (id: number, body: { role?: string; active?: boolean }) =>
    request<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminResetPassword: (id: number, new_password: string) =>
    request<unknown>(`/admin/users/${id}/reset-password`, {
      method: "POST", body: JSON.stringify({ new_password }),
    }),
  adminTokens: () => request<TokenMeta[]>("/admin/tokens"),
  adminCreateToken: (body: { name: string; owner?: string; scopes?: string }) =>
    request<{ id: string; name: string; owner: string; scopes: string; token: string }>(
      "/admin/tokens", { method: "POST", body: JSON.stringify(body) }),
  adminRevokeToken: (id: string) =>
    request<unknown>(`/admin/tokens/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminGetUser: (id: number) =>
    request<AdminUser & { active_sessions: number; active_tokens: number; active_jobs: number }>(`/admin/users/${id}`),
  adminDisableUser: (id: number) => request<unknown>(`/admin/users/${id}/disable`, { method: "POST" }),
  adminEnableUser: (id: number) => request<unknown>(`/admin/users/${id}/enable`, { method: "POST" }),
  adminForceLogout: (id: number) => request<unknown>(`/admin/users/${id}/force-logout`, { method: "POST" }),
  adminAnonymiseUser: (id: number) => request<unknown>(`/admin/users/${id}/anonymise`, { method: "POST" }),
  adminDeleteUser: (id: number) => request<unknown>(`/admin/users/${id}`, { method: "DELETE" }),
  audit: (limit = 50) => request<AuditEvent[]>(`/audit?limit=${limit}`),

  health: () => request<Health>("/health/ready"),
  version: () => request<Version>("/version"),
  workers: () => request<Worker[]>("/workers"),
  gpus: () => request<Gpu[]>("/gpus"),
  systemOverview: () => request<SystemOverview>("/system/overview"),
  // LIVE monitoring: initial snapshot (fetch) + SSE stream URL (EventSource).
  monitorSnapshot: () => request<MonitorSnapshot>("/system/snapshot"),
  monitorStreamUrl: (): string => `${BASE}/system/stream`,
  systemAlerts: () => request<{ available: boolean; alerts: AlertInfo[] }>("/system/alerts"),
  systemTimeseries: (range: TimeseriesRange = "1h") =>
    request<Timeseries>(`/system/timeseries?range=${range}`),
  probe: () => request<Version>("/version"),

  jobs: (limit = 10) => request<Job[]>(`/jobs?limit=${limit}`),

  async jobsQuery(f: JobFilters): Promise<JobsPage> {
    const q = new URLSearchParams();
    if (f.status) q.set("status", f.status);
    if (f.job_type) q.set("job_type", f.job_type);
    if (f.model) q.set("model", f.model);
    q.set("limit", String(f.limit));
    q.set("offset", String(f.offset));
    const res = await rawRequest(`/jobs?${q.toString()}`);
    const header = res.headers.get("X-Total-Count");
    const jobs = (await res.json()) as Job[];
    const total = header != null ? Number(header) : jobs.length;
    return { jobs, total: Number.isFinite(total) ? total : jobs.length };
  },

  createJob: (body: CreateJobBody) =>
    request<{ job_id: string; status: string }>("/jobs", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  models: async (): Promise<string[]> => {
    const r = await request<{ models: string[] }>("/models");
    return r.models ?? [];
  },
  modelSummary: (model: string) => request<ModelSummary>(`/models/${encodeURIComponent(model)}`),
  promoteModel: (model: string, version: string, reason?: string) =>
    request<{ active_version: string }>(`/models/${encodeURIComponent(model)}/promote`, {
      method: "POST",
      body: JSON.stringify({ version, reason: reason || undefined }),
    }),
  rollbackModel: (model: string, to?: string, reason?: string) =>
    request<{ active_version: string }>(`/models/${encodeURIComponent(model)}/rollback`, {
      method: "POST",
      body: JSON.stringify({ to: to || undefined, reason: reason || undefined }),
    }),
  deleteModel: (model: string, force = false) =>
    request<{ model: string; deleted: boolean; archived_to: string; was_active: boolean; forced: boolean }>(
      `/models/${encodeURIComponent(model)}?force=${force}`, { method: "DELETE" }),

  jobDetail: (id: string) => request<Job>(`/jobs/${encodeURIComponent(id)}`),
  jobEvents: (id: string) => request<JobEvent[]>(`/jobs/${encodeURIComponent(id)}/events`),
  jobResult: (id: string) => request<JobResult>(`/jobs/${encodeURIComponent(id)}/result`),
  jobLogs: (id: string, tail = 200) =>
    request<JobLogs>(`/jobs/${encodeURIComponent(id)}/logs?tail=${tail}`),
  // A plain download URL (streamed file) — build an <a href> from this; do NOT fetch as JSON.
  artifactDownloadUrl: (id: string, path: string) =>
    `${BASE}/jobs/${encodeURIComponent(id)}/artifacts/download?path=${encodeURIComponent(path)}`,
  cancelJob: (id: string) =>
    request<unknown>(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),

  // ---- Dataset Factory ----
  datasets: async (): Promise<DatasetSummary[]> => {
    const r = await request<{ datasets: DatasetSummary[] }>("/datasets");
    return r.datasets ?? [];
  },
  datasetVersions: (name: string) =>
    request<DatasetVersion[]>(`/datasets/${encodeURIComponent(name)}/versions`),
  datasetImports: (params: { state?: string; dataset_name?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.state) q.set("state", params.state);
    if (params.dataset_name) q.set("dataset_name", params.dataset_name);
    q.set("limit", String(params.limit ?? 50));
    return request<DatasetImport[]>(`/datasets/imports?${q.toString()}`);
  },
  datasetImport: (id: string) =>
    request<DatasetImport>(`/datasets/imports/${encodeURIComponent(id)}`),
  createDatasetImport: (body: CreateDatasetImportBody) =>
    request<{ import_id: string; state: string }>("/datasets/imports", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  approveLicense: (id: string, reason?: string, licence_name?: string) =>
    request<unknown>(`/datasets/imports/${encodeURIComponent(id)}/approve-license`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || undefined, licence_name: licence_name || undefined }),
    }),
  rejectLicense: (id: string, reason?: string) =>
    request<unknown>(`/datasets/imports/${encodeURIComponent(id)}/reject-license`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || undefined }),
    }),
  cancelDatasetImport: (id: string) =>
    request<unknown>(`/datasets/imports/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};
