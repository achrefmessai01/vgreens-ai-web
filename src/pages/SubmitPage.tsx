import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateJobBody } from "../api";
import { handleAuthLost } from "../auth";

type JobType = "training" | "processing";

export default function SubmitPage() {
  const navigate = useNavigate();
  const [jobType, setJobType] = useState<JobType>("training");
  const [model, setModel] = useState("");
  const [image, setImage] = useState("");
  const [dsName, setDsName] = useState("");
  const [dsVer, setDsVer] = useState("");
  const [tenant, setTenant] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [priority, setPriority] = useState("0");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // client-side guardrails mirroring the API contract
  const trainingNeedsDataset = jobType === "training" && !dsName.trim();
  const valid = model.trim() && image.trim() && !trainingNeedsDataset;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const body: CreateJobBody = {
      job_type: jobType,
      model_name: model.trim(),
      docker_image: image.trim(),
      priority: Number(priority) || 0,
    };
    if (dsName.trim()) body.dataset_name = dsName.trim();
    if (dsVer.trim()) body.dataset_version = dsVer.trim();
    if (tenant.trim()) body.tenant = tenant.trim();
    if (configPath.trim()) body.config_path = configPath.trim();

    try {
      const res = await api.createJob(body);
      navigate(`/jobs/${res.job_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "auth") return handleAuthLost();
      setError(err instanceof Error ? err.message : "Submit failed.");
      setBusy(false);
    }
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <h1>Submit job</h1>
      </div>

      <form className="panel form" onSubmit={submit}>
        <div className="seg">
          {(["training", "processing"] as JobType[]).map((t) => (
            <button
              type="button"
              key={t}
              className={jobType === t ? "seg-btn active" : "seg-btn"}
              onClick={() => setJobType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <Field label="Model name" required hint="Registry model this job trains or serves.">
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. strawberry_detection" autoFocus />
        </Field>

        <Field label="Docker image" required hint="Image implementing the job contract.">
          <input className="input" value={image} onChange={(e) => setImage(e.target.value)}
            placeholder="e.g. vgreens/strawberry-train:v3" />
        </Field>

        <div className="form-2">
          <Field label="Dataset name" required={jobType === "training"}
            hint={jobType === "training" ? "Required for training." : "Optional."}>
            <input className="input" value={dsName} onChange={(e) => setDsName(e.target.value)}
              placeholder="e.g. knaup" />
          </Field>
          <Field label="Dataset version" hint="Frozen version tag.">
            <input className="input" value={dsVer} onChange={(e) => setDsVer(e.target.value)}
              placeholder="e.g. v2" />
          </Field>
        </div>

        <div className="form-2">
          <Field label="Tenant" hint="Optional.">
            <input className="input" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Priority" hint="Higher runs first.">
            <input className="input" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </Field>
        </div>

        <Field label="Config path" hint="Optional path to a job.yaml on the NAS.">
          <input className="input" value={configPath} onChange={(e) => setConfigPath(e.target.value)}
            placeholder="optional" />
        </Field>

        {trainingNeedsDataset && <div className="hint muted">Training jobs need a dataset name.</div>}
        {error && <div className="error-box">{error}</div>}

        <div className="form-actions">
          <button className="btn ghost" type="button" onClick={() => navigate("/jobs")} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={busy || !valid}>
            {busy ? "Submitting…" : `Queue ${jobType} job`}
          </button>
        </div>
      </form>
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
