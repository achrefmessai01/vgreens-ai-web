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

  jobDetail: (id: string) => request<Job>(`/jobs/${encodeURIComponent(id)}`),
  jobEvents: (id: string) => request<JobEvent[]>(`/jobs/${encodeURIComponent(id)}/events`),
  cancelJob: (id: string) =>
    request<unknown>(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};
