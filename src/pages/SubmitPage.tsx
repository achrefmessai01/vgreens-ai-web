import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, type CreateJobBody, type DatasetSummary, type DatasetVersion,
         type ImageSuggestion, type JobPlan, type JobTemplate } from "../api";
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
  // Image selection: "auto" reuses the model's registry image; "select" builds
  // <model>:<tag> against the registry; "custom" is a raw override (advanced).
  const [imageMode, setImageMode] = useState<"auto" | "select" | "custom">("auto");
  const [imageTag, setImageTag] = useState("latest");
  const [customImage, setCustomImage] = useState("");
  const [sugg, setSugg] = useState<ImageSuggestion | null>(null);
  const [dsName, setDsName] = useState("");
  const [dsVer, setDsVer] = useState("");
  const [tenant, setTenant] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [priority, setPriority] = useState("0");
  const [gpuCount, setGpuCount] = useState(1);

  const [models, setModels] = useState<string[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dsVersions, setDsVersions] = useState<DatasetVersion[]>([]);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);

  // Config generator (#5) — hyperparameters -> a job.yaml the user can copy/save.
  const [cfg, setCfg] = useState({ epochs: "50", batch_size: "16", learning_rate: "0.001", image_size: "640", optimizer: "adamw" });
  const [genYaml, setGenYaml] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  // Pre-flight plan (#6/#14/#15) — fetched when entering the Review step.
  const [plan, setPlan] = useState<JobPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    // suggestions only — typos still validated by the API
    api.models().then(setModels).catch(() => {});
    api.datasets().then(setDatasets).catch(() => {});
    api.templates().then(setTemplates).catch(() => {});
  }, []);

  // Clone / prefill: JobsPage & JobDetail navigate here with a CreateJobBody in
  // location.state to re-run an existing job (#10).
  useEffect(() => {
    const pre = (location.state as { prefill?: CreateJobBody } | null)?.prefill;
    if (!pre) return;
    setJobType(pre.job_type);
    setModel(pre.model_name || "");
    if (pre.docker_image) { setImageMode("custom"); setCustomImage(pre.docker_image); }
    setDsName(pre.dataset_name || "");
    setDsVer(pre.dataset_version || "");
    setTenant(pre.tenant || "");
    setConfigPath(pre.config_path || "");
    setPriority(String(pre.priority ?? 0));
    setGpuCount(pre.gpu_count ?? 1);
    toast.info("Prefilled from an existing job — review and submit.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setJobType(t.job_type);
    if (t.docker_image) { setImageMode("custom"); setCustomImage(t.docker_image); }
    if (t.dataset_name) setDsName(t.dataset_name);
    if (t.gpu_count) setGpuCount(t.gpu_count);
    try {
      const d = t.defaults ? JSON.parse(t.defaults) : {};
      if (d.tenant) setTenant(String(d.tenant));
    } catch { /* ignore malformed defaults */ }
    toast.info(`Applied template "${t.name}".`);
  }

  async function generateConfig() {
    setGenBusy(true);
    try {
      const r = await api.generateConfig({
        epochs: Number(cfg.epochs) || undefined,
        batch_size: Number(cfg.batch_size) || undefined,
        learning_rate: Number(cfg.learning_rate) || undefined,
        image_size: Number(cfg.image_size) || undefined,
        optimizer: cfg.optimizer || undefined,
        gpus: gpuCount,
      });
      setGenYaml(r.yaml);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate config.");
    } finally {
      setGenBusy(false);
    }
  }

  // reset GPU choice when leaving training
  useEffect(() => { if (jobType !== "training") setGpuCount(1); }, [jobType]);

  // Dataset browser (#4): when the chosen name is a known dataset, load its
  // frozen versions so the engineer picks from a list (with metadata) rather
  // than typing a path/version.
  useEffect(() => {
    const name = dsName.trim();
    if (!name || !datasets.some((d) => d.dataset_name === name)) { setDsVersions([]); return; }
    let live = true;
    api.datasetVersions(name).then((v) => { if (live) setDsVersions(v); }).catch(() => { if (live) setDsVersions([]); });
    return () => { live = false; };
  }, [dsName, datasets]);

  // Fetch safe image suggestions for the chosen model (default + recent + registry
  // base/namespace). No registry token is ever sent to the browser.
  useEffect(() => {
    const m = model.trim();
    if (!m) { setSugg(null); return; }
    let live = true;
    api.imageSuggest(m, jobType)
      .then((s) => { if (live) setSugg(s); })
      .catch(() => { if (live) setSugg(null); });
    return () => { live = false; };
  }, [model, jobType]);

  // Split a full image ref into { repo, tag }. The tag is the part after the
  // LAST ':' only when it comes after the last '/' (so a registry host with a
  // port, e.g. registry.vgreens.lan:9443/ns/name, isn't mistaken for a tag).
  function splitImage(full: string): { repo: string; tag: string } {
    const slash = full.lastIndexOf("/");
    const colon = full.lastIndexOf(":");
    return colon > slash
      ? { repo: full.slice(0, colon), tag: full.slice(colon + 1) }
      : { repo: full, tag: "" };
  }

  // The real image repository for this model comes from the image the platform
  // has on record (its latest build / recent runs) — NOT from the model name,
  // which often differs from the GitLab project slug. Strip the tag off that.
  const knownRepo = useMemo(() => {
    const known = sugg?.default_image || sugg?.recent_images?.[0] || "";
    return known ? splitImage(known).repo : "";
  }, [sugg]);

  // The docker_image ref that will be submitted. Blank => the API resolves it.
  const imageRef = useMemo(() => {
    if (imageMode === "custom") return customImage.trim();
    if (imageMode === "select") {
      // full, correct ref built from the known repo + chosen tag
      return knownRepo ? `${knownRepo}:${imageTag.trim() || "latest"}` : "";
    }
    return ""; // auto
  }, [imageMode, customImage, imageTag, knownRepo]);

  // What will actually run (full ref, used verbatim by the API).
  const resolvedImage = useMemo(() => imageRef.trim(), [imageRef]);

  // Tags seen for THIS repo in recent runs (quick re-use chips).
  const recentTags = useMemo(() => {
    if (!sugg || !knownRepo) return [];
    const tags: string[] = [];
    for (const img of sugg.recent_images) {
      const { repo, tag } = splitImage(img);
      if (repo === knownRepo && tag && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
  }, [sugg, knownRepo]);

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
    // Optional: only send an image if one was chosen. Blank -> the API resolves
    // it from the model registry (training: latest version; processing: active).
    // Short refs like "<model>:<tag>" are expanded to the full URL server-side.
    if (imageRef) b.docker_image = imageRef;
    if (dsName.trim()) b.dataset_name = dsName.trim();
    if (dsVer.trim()) b.dataset_version = dsVer.trim();
    if (tenant.trim()) b.tenant = tenant.trim();
    if (configPath.trim()) b.config_path = configPath.trim();
    if (jobType === "training") b.gpu_count = gpuCount;
    return b;
  }, [jobType, model, imageRef, dsName, dsVer, tenant, configPath, priority, gpuCount]);

  // When the Review step opens, run a pre-flight plan (checks + command preview
  // + GPU advice). Advisory only — the user can still submit.
  useEffect(() => {
    if (step !== STEPS.length - 1 || !model.trim()) return;
    let live = true;
    setPlanBusy(true); setPlan(null);
    api.planJob(body)
      .then((p) => { if (live) setPlan(p); })
      .catch(() => { if (live) setPlan(null); })
      .finally(() => { if (live) setPlanBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
                setModel(""); setImageMode("auto"); setImageTag("latest");
                setCustomImage(""); setSugg(null); setDsName(""); setDsVer("");
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
              {templates.length > 0 && (
                <Field label="Start from a template"
                  hint="Optional — prefills the job from a saved preset. You can still change anything.">
                  <select className="input" defaultValue=""
                    onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}>
                    <option value="">— none —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.job_type}{t.gpu_count > 1 ? `, ${t.gpu_count} GPU` : ""})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
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

              <Field label="Docker image"
                hint="Pick how the container image is chosen. You no longer need to paste a full registry URL — choose a tag and it is resolved for you.">
                <div className="seg">
                  {([
                    ["auto", "Auto (latest build)"],
                    ["select", "Choose tag"],
                    ["custom", "Custom URL"],
                  ] as [typeof imageMode, string][]).map(([m, lbl]) => (
                    <button type="button" key={m}
                      className={imageMode === m ? "seg-btn active" : "seg-btn"}
                      onClick={() => setImageMode(m)}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {imageMode === "auto" && (
                  <p className="field-hint muted" style={{ marginTop: 8 }}>
                    Uses the newest image CI built for this model (training) or the
                    active/promoted version (processing) — resolved server-side.
                    {sugg?.default_image
                      ? <> Current: <span className="mono">{sugg.default_image}</span></>
                      : <> No image recorded yet for this model — build it via CI first, then it resolves here.</>}
                  </p>
                )}

                {imageMode === "select" && (
                  <div style={{ marginTop: 8 }}>
                    {knownRepo ? (
                      <>
                        <div className="form-2">
                          <Field label="Repository" hint="The model's registry repo — detected, not typed.">
                            <input className="input mono" value={knownRepo} readOnly disabled />
                          </Field>
                          <Field label="Tag" hint="e.g. latest, or a commit SHA like b4fb86fe">
                            <input className="input" list="tag-options" value={imageTag}
                              onChange={(e) => setImageTag(e.target.value)} placeholder="latest" />
                            <datalist id="tag-options">
                              {recentTags.map((t) => <option key={t} value={t} />)}
                            </datalist>
                          </Field>
                        </div>
                        {recentTags.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span className="muted" style={{ fontSize: 12 }}>Recent:</span>
                            {recentTags.map((t) => (
                              <button type="button" key={t} className="seg-btn"
                                style={{ padding: "2px 10px", fontSize: 12 }}
                                onClick={() => setImageTag(t)}>{t}</button>
                            ))}
                          </div>
                        )}
                        <p className="field-hint muted" style={{ marginTop: 8 }}>
                          Resolves to <span className="mono">{resolvedImage || "…"}</span>
                        </p>
                      </>
                    ) : (
                      <p className="field-hint muted" style={{ marginTop: 8 }}>
                        No image is on record for this model yet, so the repository can't be
                        auto-detected. Build it once via CI (then use <b>Auto</b>), or paste the
                        full reference under <b>Custom URL</b>.
                      </p>
                    )}
                  </div>
                )}

                {imageMode === "custom" && (
                  <div style={{ marginTop: 8 }}>
                    <input className="input mono" value={customImage}
                      onChange={(e) => setCustomImage(e.target.value)}
                      placeholder="e.g. registry.vgreens.lan/vgreens-models/strawberry:v3" />
                    <p className="field-hint muted" style={{ marginTop: 6 }}>
                      Advanced — a full image reference used exactly as typed.
                      {resolvedImage && <> Resolves to <span className="mono">{resolvedImage}</span></>}
                    </p>
                  </div>
                )}
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
                <Field label="Dataset version"
                  hint={dsVersions.length ? "Pick a frozen version (blank = latest)." : "Frozen version tag (latest if blank)."}>
                  {dsVersions.length > 0 ? (
                    <select className="input" value={dsVer} onChange={(e) => setDsVer(e.target.value)}>
                      <option value="">latest ({dsVersions[0]?.version})</option>
                      {dsVersions.map((v) => (
                        <option key={v.version} value={v.version}>
                          {v.version}
                          {v.image_count != null ? ` · ${v.image_count} imgs` : ""}
                          {v.class_count != null ? ` · ${v.class_count} classes` : ""}
                          {v.frozen_at ? ` · ${String(v.frozen_at).slice(0, 10)}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" value={dsVer} onChange={(e) => setDsVer(e.target.value)} placeholder="e.g. v2" />
                  )}
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
                <Field label="Priority" hint="Higher priority runs first when several jobs are queued.">
                  <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="-10">Low</option>
                    <option value="0">Normal</option>
                    <option value="10">High</option>
                    <option value="20">Urgent</option>
                  </select>
                </Field>
              </div>
              <Field label="Config path" hint="Optional path to a job.yaml on the NAS.">
                <input className="input" value={configPath} onChange={(e) => setConfigPath(e.target.value)} placeholder="optional" />
              </Field>

              {jobType === "training" && (
                <Field label="Config generator"
                  hint="Build a job.yaml from hyperparameters — copy it into your model repo or the NAS job-config path.">
                  <div className="form-2">
                    {([["epochs", "Epochs"], ["batch_size", "Batch size"],
                       ["learning_rate", "Learning rate"], ["image_size", "Image size"]] as [keyof typeof cfg, string][]).map(([k, lbl]) => (
                      <Field key={k} label={lbl}>
                        <input className="input" value={cfg[k]}
                          onChange={(e) => setCfg((c) => ({ ...c, [k]: e.target.value }))} />
                      </Field>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" className="btn" disabled={genBusy} onClick={generateConfig}>
                      {genBusy ? "Generating…" : "Generate config.yaml"}
                    </button>
                    {genYaml && (
                      <button type="button" className="btn ghost"
                        onClick={() => { navigator.clipboard?.writeText(genYaml); toast.success("Config copied"); }}>
                        Copy
                      </button>
                    )}
                  </div>
                  {genYaml && (
                    <pre className="code-block mono" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{genYaml}</pre>
                  )}
                </Field>
              )}
            </>
          )}

          {/* ---- Step 3: Review ---- */}
          {step === 3 && (
            <>
              <div className="review-grid">
                <b>Type</b><span>{jobType}</span>
                <b>Model</b><span className="mono">{body.model_name}</span>
                <b>Image</b><span className="mono">{resolvedImage || "auto (from model registry)"}</span>
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

              {/* Pre-flight checks + GPU advice + command preview (#6/#14/#15) */}
              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Pre-flight</h3>
                {planBusy && <p className="muted">Running checks…</p>}
                {!planBusy && plan && (
                  <>
                    <ul className="preflight-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {plan.checks.map((c) => (
                        <li key={c.name} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 13 }}>
                          <span aria-hidden="true">
                            {c.status === "ok" ? "✅" : c.status === "warning" ? "⚠️" : "❌"}
                          </span>
                          <span><b>{c.name}</b> — {c.detail}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.gpu_advice && (
                      <p className="field-hint muted" style={{ marginTop: 8 }}>
                        Recommended GPUs: <b>{plan.gpu_advice.recommended_gpu}</b> — {plan.gpu_advice.reason}
                      </p>
                    )}
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 13 }}>Command preview</summary>
                      <pre className="code-block mono" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{plan.command_preview}</pre>
                    </details>
                    <p className="field-hint muted" style={{ marginTop: 4 }}>
                      Outputs will be saved under <span className="mono">{plan.output_path_preview}</span>
                    </p>
                  </>
                )}
              </div>

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
