import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateJobBody, type DatasetSummary } from "../api";
import { handleAuthLost, roleAtLeast } from "../auth";
import { useAuth } from "../AuthContext";
import { PageHeader, ConfirmDialog } from "../ui";

type JobType = "training" | "processing";

export default function SubmitPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = roleAtLeast(user?.role, "admin");

  const [jobType, setJobType] = useState<JobType>("training");
  const [model, setModel] = useState("");
  const [image, setImage] = useState("");
  const [dsName, setDsName] = useState("");
  const [dsVer, setDsVer] = useState("");
  const [tenant, setTenant] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [priority, setPriority] = useState("0");
  const [gpuCount, setGpuCount] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [models, setModels] = useState<string[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);

  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // suggestions only — typos still validated by the API
    api.models().then(setModels).catch(() => {});
    api.datasets().then(setDatasets).catch(() => {});
  }, []);

  // reset GPU choice when leaving training
  useEffect(() => { if (jobType !== "training") setGpuCount(1); }, [jobType]);

  const trainingNeedsDataset = jobType === "training" && !dsName.trim();
  const valid = !!model.trim() && !!image.trim() && !trainingNeedsDataset;

  const body = useMemo<CreateJobBody>(() => {
    const b: CreateJobBody = {
      job_type: jobType,
      model_name: model.trim(),
      docker_image: image.trim(),
      priority: Number(priority) || 0,
    };
    if (dsName.trim()) b.dataset_name = dsName.trim();
    if (dsVer.trim()) b.dataset_version = dsVer.trim();
    if (tenant.trim()) b.tenant = tenant.trim();
    if (configPath.trim()) b.config_path = configPath.trim();
    if (jobType === "training") b.gpu_count = gpuCount;
    return b;
  }, [jobType, model, image, dsName, dsVer, tenant, configPath, priority, gpuCount]);

  async function doSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createJob(body);
      navigate(`/jobs/${res.job_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "auth") return handleAuthLost();
      setError(err instanceof Error ? err.message : "Submit failed.");
      setBusy(false);
      setReview(false);
    }
  }

  return (
    <div>
      <PageHeader title="Submit job" description="Queue a training or processing run on the platform." />

      <form className="panel form" onSubmit={(e) => { e.preventDefault(); if (valid) setReview(true); }}>
        <div className="seg">
          {(["training", "processing"] as JobType[]).map((t) => (
            <button type="button" key={t}
              className={jobType === t ? "seg-btn active" : "seg-btn"}
              onClick={() => setJobType(t)}>
              {t}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: "-4px 0 4px", fontSize: 13 }}>
          {jobType === "training"
            ? "Trains a new model version from a frozen dataset. The result is validated before it can be promoted."
            : "Runs the currently promoted model over a batch of images."}
        </p>

        <Field label="Model name" required hint="Registry model this job trains or serves.">
          <input className="input" list="model-options" value={model} autoFocus
            onChange={(e) => setModel(e.target.value)} placeholder="e.g. strawberry_detection" />
          <datalist id="model-options">
            {models.map((m) => <option key={m} value={m} />)}
          </datalist>
        </Field>

        <Field label="Docker image" required hint="Image implementing the job contract (usually from CI).">
          <input className="input" value={image} onChange={(e) => setImage(e.target.value)}
            placeholder="e.g. registry.vgreens.lan/vgreens-models/strawberry:v3" />
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
          </Field>
        )}

        <button type="button" className="link" style={{ alignSelf: "flex-start" }}
          onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "− Hide advanced options" : "+ Advanced options"}
        </button>

        {showAdvanced && (
          <>
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

        {trainingNeedsDataset && <div className="hint muted">Training jobs need a dataset name.</div>}
        {error && <div className="error-box" role="alert">{error}</div>}

        <div className="form-actions">
          <button className="btn ghost" type="button" onClick={() => navigate("/jobs")} disabled={busy}>Cancel</button>
          <button className="btn primary" type="submit" disabled={!valid}>Review & submit</button>
        </div>
      </form>

      {review && (
        <ConfirmDialog
          title="Confirm job submission"
          danger={gpuCount === 2}
          confirmLabel={busy ? "Submitting…" : `Queue ${jobType} job`}
          busy={busy}
          error={error}
          onCancel={() => { if (!busy) setReview(false); }}
          onConfirm={doSubmit}
          body={
            <>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", marginBottom: 8 }}>
                <b>Type</b><span>{jobType}</span>
                <b>Model</b><span className="mono">{body.model_name}</span>
                <b>Image</b><span className="mono" style={{ wordBreak: "break-all" }}>{body.docker_image}</span>
                {body.dataset_name && <><b>Dataset</b><span className="mono">{body.dataset_name}{body.dataset_version ? `:${body.dataset_version}` : ""}</span></>}
                {jobType === "training" && <><b>GPUs</b><span>{gpuCount}</span></>}
              </div>
              {gpuCount === 2 && (
                <div className="error-box">
                  Two-GPU training uses <b>both</b> GPUs. No GPU stays free for production inference until it finishes.
                </div>
              )}
            </>
          }
        />
      )}
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
