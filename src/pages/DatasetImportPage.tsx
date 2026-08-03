import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateDatasetImportBody } from "../api";
import { handleAuthLost } from "../auth";
import { PageHeader, useToast } from "../ui";
import "../styles/datasets.css";

type Source = "roboflow" | "local" | "nas";

const SOURCE_HINT: Record<Source, string> = {
  roboflow: "Pull from Roboflow. External sources pause for licence approval after the audit.",
  local: "Import from an allowlisted directory or .zip already staged on the server.",
  nas: "Import from an allowlisted path on the shared NAS storage.",
};

const STEPS = ["Source type", "Source details", "Options", "Review"] as const;

export default function DatasetImportPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("roboflow");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  // roboflow
  const [workspace, setWorkspace] = useState("");
  const [project, setProject] = useState("");
  const [rfVersion, setRfVersion] = useState("1");
  // local / nas
  const [path, setPath] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailsValid = useMemo(() => {
    if (!name.trim()) return false;
    return source === "roboflow"
      ? Boolean(workspace.trim() && project.trim() && rfVersion.trim())
      : Boolean(path.trim());
  }, [name, source, workspace, project, rfVersion, path]);

  // per-step validation gates the "Next" button
  const stepValid = [true, detailsValid, true, detailsValid];
  const canNext = stepValid[step];

  function next() { if (canNext && step < STEPS.length - 1) setStep((s) => s + 1); }
  function back() { if (step > 0) setStep((s) => s - 1); }

  async function submit() {
    if (!detailsValid || busy) return;
    setBusy(true);
    setError(null);
    const body: CreateDatasetImportBody = {
      source_type: source,
      dataset_name: name.trim(),
      source: source === "roboflow"
        ? { workspace: workspace.trim(), project: project.trim(), rf_version: Number(rfVersion) }
        : { path: path.trim() },
    };
    if (version.trim()) body.requested_version = version.trim();
    try {
      const res = await api.createDatasetImport(body);
      toast.success(`Import ${res.import_id} started.`);
      navigate(`/datasets/imports/${res.import_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "auth") return handleAuthLost();
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Datasets", to: "/datasets" }, { label: "Import" }]}
        title="Import dataset"
        description="Bring a dataset in through the import → audit → licence → freeze pipeline."
      />

      <div className="panel ds-wizard">
        <ol className="ds-wiz-steps" aria-label="Import steps">
          {STEPS.map((label, i) => (
            <li key={label} className={`ds-wiz-step ${i < step ? "is-done" : ""} ${i === step ? "is-current" : ""}`}>
              <span className="ds-wiz-num" aria-hidden="true">{i < step ? "✓" : i + 1}</span>
              <span className="ds-wiz-caption">{label}</span>
              {i < STEPS.length - 1 && <span className="ds-wiz-line" aria-hidden="true" />}
            </li>
          ))}
        </ol>

        <div className="ds-wiz-panel">
          {step === 0 && (
            <>
              <h2 className="ds-wiz-heading">Where is the dataset coming from?</h2>
              <p className="ds-wiz-sub">Pick the source. This determines the fields you'll fill in next.</p>
              <div className="seg" role="radiogroup" aria-label="Source type">
                {(["roboflow", "local", "nas"] as Source[]).map((s) => (
                  <button type="button" key={s} role="radio" aria-checked={source === s}
                    className={source === s ? "seg-btn active" : "seg-btn"}
                    onClick={() => setSource(s)}>{s}</button>
                ))}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{SOURCE_HINT[source]}</p>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="ds-wiz-heading">Source details</h2>
              <p className="ds-wiz-sub">Identify the dataset and where to pull it from.</p>
              <Field label="Dataset name" required hint="Registry key, lowercase [a-z0-9_].">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. strawberry_disease" autoFocus />
              </Field>

              {source === "roboflow" ? (
                <>
                  <div className="form-2">
                    <Field label="Workspace" required>
                      <input className="input" value={workspace} onChange={(e) => setWorkspace(e.target.value)}
                        placeholder="e.g. strawberry-disease" />
                    </Field>
                    <Field label="Project" required>
                      <input className="input" value={project} onChange={(e) => setProject(e.target.value)}
                        placeholder="e.g. strawberry-disease-detection-dataset" />
                    </Field>
                  </div>
                  <Field label="Roboflow version" required hint="The version number on the dataset's Versions tab.">
                    <input className="input" type="number" value={rfVersion} onChange={(e) => setRfVersion(e.target.value)} />
                  </Field>
                </>
              ) : (
                <Field label="Path" required hint="Directory or .zip under an allowlisted root on the server/NAS.">
                  <input className="input" value={path} onChange={(e) => setPath(e.target.value)}
                    placeholder="/mnt/vgreens_storage/ai/import-test/…" />
                </Field>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="ds-wiz-heading">Options</h2>
              <p className="ds-wiz-sub">Optional settings. Leave defaults if unsure.</p>
              <Field label="Version" hint="Optional. Leave blank for an automatic vN.">
                <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="auto" />
              </Field>
              {source === "roboflow" && (
                <div className="ds-callout tone-warning">
                  <span className="ds-callout-ic" aria-hidden="true"><WarnIcon /></span>
                  <div>
                    <h3>Licence approval required</h3>
                    <p>External sources pause after the audit and wait for an admin to approve or reject the licence before freezing.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="ds-wiz-heading">Review &amp; submit</h2>
              <p className="ds-wiz-sub">Confirm the details before starting the import.</p>
              <div className="ds-review">
                <ReviewRow k="Source type" v={source} />
                <ReviewRow k="Dataset name" v={name.trim() || "—"} />
                {source === "roboflow" ? (
                  <>
                    <ReviewRow k="Workspace" v={workspace.trim() || "—"} />
                    <ReviewRow k="Project" v={project.trim() || "—"} />
                    <ReviewRow k="Roboflow version" v={rfVersion.trim() || "—"} />
                  </>
                ) : (
                  <ReviewRow k="Path" v={<span className="ds-mono-wrap">{path.trim() || "—"}</span>} />
                )}
                <ReviewRow k="Version" v={version.trim() || "auto"} />
              </div>
              {source === "roboflow" && (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  This external import will pause for licence approval after the audit.
                </p>
              )}
              {error && <div className="error-box" role="alert">{error}</div>}
            </>
          )}
        </div>

        <div className="ds-wiz-nav">
          <button className="btn ghost" type="button"
            onClick={() => (step === 0 ? navigate("/datasets") : back())} disabled={busy}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <div className="ds-wiz-nav-end">
            {step < STEPS.length - 1 ? (
              <button className="btn primary" type="button" onClick={next} disabled={!canNext}>Next</button>
            ) : (
              <button className="btn primary" type="button" onClick={submit} disabled={busy || !detailsValid}>
                {busy ? "Submitting…" : "Start import"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{label} {required && <span className="req">*</span>}</label>
      {children}
      {hint && <div className="field-hint muted">{hint}</div>}
    </div>
  );
}

function ReviewRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="ds-review-row">
      <span className="ds-review-k">{k}</span>
      <span className="ds-review-v">{v}</span>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 9v4M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
