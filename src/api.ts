// Thin fetch client over the Job API. Mirrors the CLI's client: adds the bearer
// token, maps HTTP status to typed errors, and returns parsed JSON.
import { clearToken, getToken } from "./auth";

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
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the API. Check the URL / VPN.");
  }

  if (res.status === 401 || res.status === 403) {
    clearToken();
    throw new ApiError(res.status, "auth", "Authentication failed. Sign in again.");
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
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
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
  worker_id: string;
  status?: string;
  last_seen?: string | null;
  current_job?: string | null;
}

export interface Gpu {
  index: number;
  name?: string;
  utilization?: number;
  memory_used?: number;
  memory_total?: number;
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
  docker_image: string;
  dataset_name?: string;
  dataset_version?: string;
  tenant?: string;
  config_path?: string;
  priority?: number;
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

export const api = {
  health: () => request<Health>("/health/ready"),
  version: () => request<Version>("/version"),
  workers: () => request<Worker[]>("/workers"),
  gpus: () => request<Gpu[]>("/gpus"),
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

  jobDetail: (id: string) => request<Job>(`/jobs/${encodeURIComponent(id)}`),
  jobEvents: (id: string) => request<JobEvent[]>(`/jobs/${encodeURIComponent(id)}/events`),
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
