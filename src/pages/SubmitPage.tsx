import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type CreateJobBody, type DatasetSummary } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { PageHeader, useToast } from "../ui";
import "../styles/jobs.css";

type JobType = "training" | "processing";

const STEPS = ["Basics", "Model & data", "Configuration", "Review"];

export default function SubmitPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = roleAtLeast(user?.role, "admin");

  const [step, setStep] = useState(0);

  const [jobType, setJobType] = useState<JobType>("training");
  const [model, setModel] = useState("");
  const [image, setImage] = useState("");
  const [dsName, setDsName] = useState("");
  const [dsVer, setDsVer] = useState("");
  const [tenant, setTenant] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [priority, setPriority] = useState("0");
  const [gpuCount, setGpuCount] = useState(1);

  const [models, setModels] = useState<string[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    // suggestions only — typos still validated by the API
    api.models().then(setModels).catch(() => {});
    api.datasets().then(setDatasets).catch(() => {});
  }, []);

  // reset GPU choice when leaving training
  useEffect(() => { if (jobType !== "training") setGpuCount(1); }, [jobType]);

  const trainingNeedsDataset = jobType === "training" && !dsName.trim();
  // Version may be left blank — the API resolves the latest frozen version.
  const step1Valid = !!model.trim() && !trainingNeedsDataset;

  // which steps may advance
  const canAdvance = (s: number): boolean => {
    if (s === 1) return step1Valid;
    return true; // basics + configuration have no required fields
  };
  const highestReachable = (): number => {
    // can't jump past the first invalid step
    if (!step1Valid) return 1;
    return STEPS.length - 1;
  };

  const body = useMemo<CreateJobBody>(() => {
    const b: CreateJobBody = {
      job_type: jobType,
      model_name: model.trim(),
      priority: Number(priority) || 0,
    };
    // Optional: only send an image if typed. Blank -> the API resolves it from
    // the model registry (training: latest version; processing: active version).
    if (image.trim()) b.docker_image = image.trim();
    if (dsName.trim()) b.dataset_name = dsName.trim();
    if (dsVer.trim()) b.dataset_version = dsVer.trim();
    if (tenant.trim()) b.tenant = tenant.trim();
    if (configPath.trim()) b.config_path = configPath.trim();
    if (jobType === "training") b.gpu_count = gpuCount;
    return b;
  }, [jobType, model, image, dsName, dsVer, tenant, configPath, priority, gpuCount]);

  function goTo(s: number) {
    if (s <= step || s <= highestReachable()) setStep(Math.max(0, Math.min(STEPS.length - 1, s)));
  }
  function next() { if (canAdvance(step)) setStep((s) => Math.min(STEPS.length - 1, s + 1)); }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  async function doSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createJob(body);
      toast.success(`Job queued — ${res.job_id.slice(0, 12)}`);
      setCreatedId(res.job_id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "auth") return handleAuthLost();
      const m = err instanceof Error ? err.message : "Submit failed.";
      setError(m);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  // ---- success state ------------------------------------------------------
  if (createdId) {
    return (
      <div>
        <PageHeader title="Submit job" breadcrumbs={[{ label: "Jobs", to: "/jobs" }, { label: "Submit" }]} />
        <section className="panel">
          <div className="submit-done">
            <div className="sd-ic" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>Job queued</h2>
            <p className="muted">Your {jobType} job is on the queue and will start when a worker is free.</p>
            <div className="sd-id"><span className="mono">{createdId}</span></div>
            <div className="sd-actions">
              <Link className="btn primary" to={`/jobs/${createdId}`}>View job</Link>
              <button className="btn" onClick={() => {
                setCreatedId(null); setStep(0); setError(null);
                setModel(""); setImage(""); setDsName(""); setDsVer("");
                setTenant(""); setConfigPath(""); setPriority("0"); setGpuCount(1);
              }}>Submit another</button>
              <button className="btn ghost" onClick={() => navigate("/jobs")}>Back to jobs</button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div>
      <PageHeader
        title="Submit job"
        breadcrumbs={[{ label: "Jobs", to: "/jobs" }, { label: "Submit" }]}
        description="Queue a training or processing run on the platform."
      />

      <section className="panel">
        <ol className="stepper" aria-label="Submission steps">
          {STEPS.map((label, i) => {
            const state = i === step ? "active" : i < step ? "done" : "";
            const clickable = i <= step || i <= highestReachable();
            return (
              <li className={`step ${state}`} key={label} aria-current={i === step ? "step" : undefined}>
                <button
                  type="button"
                  className={`step-btn ${clickable ? "clickable" : ""}`}
                  disabled={!clickable}
                  onClick={() => goTo(i)}
                >
                  <span className="step-index" aria-hidden="true">{i < step ? "✓" : i + 1}</span>
                  <span className="step-label">{label}</span>
                </button>
                {i < STEPS.length - 1 && <span className="step-line" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        <form className="wizard-body" onSubmit={(e) => {
          e.preventDefault();
          if (isLast) { if (!busy) doSubmit(); } else next();
        }}>
          {/* ---- Step 0: Basics ---- */}
          {step === 0 && (
            <>
              <Field label="Job type" hint={jobType === "training"
                ? "Trains a new model version from a frozen dataset. The result is validated before it can be promoted."
                : "Runs the currently promoted model over a batch of images."}>
                <div className="seg">
                  {(["training", "processing"] as JobType[]).map((t) => (
                    <button type="button" key={t}
                      className={jobType === t ? "seg-btn active" : "seg-btn"}
                      onClick={() => setJobType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* ---- Step 1: Model & data ---- */}
          {step === 1 && (
            <>
              <Field label="Model name" required hint="Registry model this job trains or serves.">
                <input className="input" list="model-options" value={model} autoFocus
                  onChange={(e) => setModel(e.target.value)} placeholder="e.g. strawberry_detection" />
                <datalist id="model-options">
                  {models.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>

              <Field label="Docker image" hint="Optional — leave blank to reuse the model's registry image (training: latest version; processing: active version). Set only to override.">
                <input className="input" value={image} onChange={(e) => setImage(e.target.value)}
                  placeholder="auto (from model registry) — or override, e.g. registry.vgreens.lan/vgreens-models/strawberry:v3" />
              </Field>

              <div className="form-2">
                <Field label="Dataset name" required={jobType === "training"}
                  hint={jobType === "training" ? "Required for training." : "Optional for processing."}>
                  <input className="input" list="dataset-options" value={dsName}
                    onChange={(e) => setDsName(e.target.value)} placeholder="e.g. knaup" />
                  <datalist id="dataset-options">
                    {datasets.map((d) => <option key={d.dataset_name} value={d.dataset_name} />)}
                  </datalist>
                </Field>
                <Field label="Dataset version" hint="Frozen version tag (latest if blank).">
                  <input className="input" value={dsVer} onChange={(e) => setDsVer(e.target.value)} placeholder="e.g. v2" />
                </Field>
              </div>

              {trainingNeedsDataset && <div className="field-error">Training jobs need a dataset name.</div>}
            </>
          )}

          {/* ---- Step 2: Configuration ---- */}
          {step === 2 && (
            <>
              {jobType === "training" && (
                <Field label="GPUs"
                  hint={isAdmin
                    ? "Two-GPU training uses BOTH GPUs — no GPU stays free for production. Admin only."
                    : "Single GPU. Two-GPU training requires an admin."}>
                  <div className="seg">
                    {[1, 2].map((n) => (
                      <button type="button" key={n}
                        className={gpuCount === n ? "seg-btn active" : "seg-btn"}
                        disabled={n === 2 && !isAdmin}
                        title={n === 2 && !isAdmin ? "Admin only" : undefined}
                        onClick={() => setGpuCount(n)}>
                        {n === 1 ? "1 GPU" : "2 GPUs"}
                      </button>
                    ))}
                  </div>
                  {gpuCount === 2 && (
                    <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#8a6d1a", lineHeight: 1.45 }}>
                      Note: both GPUs are exposed to the container, but they are only used if the
                      training code runs distributed (DDP). Onboarded models do this automatically;
                      a custom image must launch its own multi-process training or it will use only
                      1&nbsp;GPU. See <a href="#/getting-started">Getting started</a>.
                    </p>
                  )}
                </Field>
              )}

              <div className="form-2">
                <Field label="Tenant" hint="Optional grouping label.">
                  <input className="input" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="optional" />
                </Field>
                <Field label="Priority" hint="Higher runs first.">
                  <input className="input" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
                </Field>
              </div>
              <Field label="Config path" hint="Optional path to a job.yaml on the NAS.">
                <input className="input" value={configPath} onChange={(e) => setConfigPath(e.target.value)} placeholder="optional" />
              </Field>
            </>
          )}

          {/* ---- Step 3: Review ---- */}
          {step === 3 && (
            <>
              <div className="review-grid">
                <b>Type</b><span>{jobType}</span>
                <b>Model</b><span className="mono">{body.model_name}</span>
                <b>Image</b><span className="mono">{body.docker_image || "auto (from model registry)"}</span>
                <b>Dataset</b><span className="mono">{body.dataset_name ? `${body.dataset_name}${body.dataset_version ? `:${body.dataset_version}` : ""}` : "—"}</span>
                {jobType === "training" && <><b>GPUs</b><span>{gpuCount}</span></>}
                <b>Tenant</b><span>{body.tenant || "—"}</span>
                <b>Priority</b><span>{body.priority}</span>
                {body.config_path && <><b>Config path</b><span className="mono">{body.config_path}</span></>}
              </div>
              {jobType === "training" && gpuCount === 2 && (
                <div className="error-box" role="alert">
                  Two-GPU training uses <b>both</b> GPUs. No GPU stays free for production inference until it finishes.
                </div>
              )}
              {error && <div className="error-box" role="alert">{error}</div>}
            </>
          )}

          <div className="wizard-actions">
            <div>
              {step > 0
                ? <button className="btn ghost" type="button" onClick={back} disabled={busy}>← Back</button>
                : <button className="btn ghost" type="button" onClick={() => navigate("/jobs")} disabled={busy}>Cancel</button>}
            </div>
            <div>
              {isLast
                ? <button className="btn primary" type="submit" disabled={busy || !step1Valid}>
                    {busy ? "Submitting…" : `Queue ${jobType} job`}
                  </button>
                : <button className="btn primary" type="submit" disabled={!canAdvance(step)}>Next →</button>}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="field-hint muted">{hint}</div>}
    </div>
  );
}
