import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

// First-login onboarding wizard for AI engineers.
//
// Persistence (MVP): completion is stored in localStorage, keyed per user
// (`vg-onboarded:<username>`). This is per-browser only — a user who switches
// browser or clears storage will see it again. A future improvement is to persist
// a `onboarded` flag in the user profile via the API; the key/flag is isolated
// here so that swap is a one-function change.
const key = (username: string) => `vg-onboarded:${username}`;

export function markOnboarded(username: string) {
  try { localStorage.setItem(key(username), "1"); } catch { /* ignore */ }
}
export function hasOnboarded(username: string): boolean {
  try { return localStorage.getItem(key(username)) === "1"; } catch { return false; }
}
// Let any component (e.g. the Getting-Started page) reopen the wizard.
export function openOnboarding() {
  window.dispatchEvent(new CustomEvent("vg-open-onboarding"));
}

interface Step { icon: string; title: string; body: string; }
const STEPS: Step[] = [
  { icon: "👋", title: "Welcome to the vGreens AI Platform",
    body: "Run your AI training and processing jobs on the shared GPU server instead of your laptop. Submit a job, and the platform queues it, runs it in a container on a GPU, stores the outputs, and shows it live." },
  { icon: "🔄", title: "How a job flows",
    body: "Prepare code → submit (CLI or web) → Job API records it → RabbitMQ queue → a GPU worker runs it in Docker with the NVIDIA runtime → outputs are written to the NAS → you watch it live and, if good, promote the model." },
  { icon: "📦", title: "Prepare your job",
    body: "You provide a Docker image (built by CI from your model repo), a frozen dataset (name:version), a job config, and — automatically — an output path on the NAS. The container only sees /data, /config/job.yaml and /out." },
  { icon: "🖥️", title: "Choose GPU resources",
    body: "Pick 1 GPU (leaves the other free) or 2 GPUs (admin only). Requesting 2 GPUs exposes both to the container, but they are only used if your training code runs distributed (DDP). Onboarded models do this automatically; custom images must launch their own multi-process training." },
  { icon: "📡", title: "Monitor execution",
    body: "The Monitoring page updates live — GPU usage, memory and temperature, queued and active jobs, worker, queue, NAS and Docker status, and the latest errors — with no manual refresh. Each job also has logs you can read." },
  { icon: "🗂️", title: "Find your outputs",
    body: "Every job writes to a unique NAS folder the platform chooses. Training produces model.pt, eval/metrics.json and an evaluation report; processing produces report.json. You retrieve everything by job id." },
  { icon: "🏷️", title: "Validate & promote models",
    body: "A training run registers a candidate version with its metrics. If it clears the thresholds it becomes promotable. An admin promotes one version to ‘active’; processing serves the active model. Rollback restores the previous version if needed." },
  { icon: "🚀", title: "You’re ready",
    body: "That’s the whole loop. Start your first job, open the full tutorial, or watch the platform live." },
];

export default function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const username = user?.username ?? "";
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  // Open on first login; also allow manual reopen via the custom event.
  useEffect(() => {
    if (username && !hasOnboarded(username)) setOpen(true);
    const reopen = () => { setI(0); setOpen(true); };
    window.addEventListener("vg-open-onboarding", reopen);
    return () => window.removeEventListener("vg-open-onboarding", reopen);
  }, [username]);

  const finish = useCallback((completed: boolean) => {
    if (completed && username) markOnboarded(username);
    setOpen(false);
  }, [username]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = (path: string) => { finish(true); nav(path); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Getting started"
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center",
               background: "rgba(15,45,30,0.55)", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) finish(false); }}>
      <div className="card" style={{ width: "min(560px, 96vw)", padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", borderBottom: "1px solid var(--line, #e5e7eb)" }}>
          <strong style={{ fontSize: 13, letterSpacing: 1, color: "var(--muted,#6b7280)" }}>
            GETTING STARTED · {i + 1} / {STEPS.length}
          </strong>
          <button className="btn ghost" onClick={() => finish(false)} aria-label="Skip onboarding">Skip</button>
        </div>

        <div style={{ padding: "26px 26px 8px" }}>
          <div aria-hidden style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>{step.icon}</div>
          <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>{step.title}</h2>
          <p style={{ margin: 0, color: "var(--muted,#374151)", lineHeight: 1.55, fontSize: 15 }}>{step.body}</p>
        </div>

        {/* progress dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "18px 0 6px" }}>
          {STEPS.map((_, k) => (
            <span key={k} aria-hidden style={{ width: k === i ? 20 : 8, height: 8, borderRadius: 4,
              background: k === i ? "var(--accent,#1B7F4B)" : "var(--line,#d1d5db)", transition: "width .2s" }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center",
                      padding: "12px 18px 18px" }}>
          <button className="btn" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>Back</button>
          {last ? (
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => go("/monitoring")}>View monitoring</button>
              <button className="btn" onClick={() => go("/getting-started")}>Open tutorial</button>
              <button className="btn primary" onClick={() => go("/submit")}>Create first job</button>
            </div>
          ) : (
            <button className="btn primary" onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
