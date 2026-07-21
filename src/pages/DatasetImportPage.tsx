import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateDatasetImportBody } from "../api";
import { handleAuthLost } from "../auth";

type Source = "roboflow" | "local" | "nas";

export default function DatasetImportPage() {
  const navigate = useNavigate();
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

  const valid = name.trim() && (source === "roboflow"
    ? workspace.trim() && project.trim() && rfVersion.trim()
    : path.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
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
      navigate(`/datasets/imports/${res.import_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "auth") return handleAuthLost();
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  }

  return (
    <div className="dash">
      <div className="dash-head"><h1>Import dataset</h1></div>

      <form className="panel form" onSubmit={submit}>
        <div className="seg">
          {(["roboflow", "local", "nas"] as Source[]).map((s) => (
            <button type="button" key={s} className={source === s ? "seg-btn active" : "seg-btn"}
              onClick={() => setSource(s)}>{s}</button>
          ))}
        </div>

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

        <Field label="Version" hint="Optional. Leave blank for automatic vN.">
          <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="auto" />
        </Field>

        {source === "roboflow" && (
          <div className="hint muted">External sources pause for licence approval after the audit.</div>
        )}
        {error && <div className="error-box">{error}</div>}

        <div className="form-actions">
          <button className="btn ghost" type="button" onClick={() => navigate("/datasets")} disabled={busy}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy || !valid}>
            {busy ? "Submitting…" : "Start import"}
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
      <label className="field-label">{label} {required && <span className="req">*</span>}</label>
      {children}
      {hint && <div className="field-hint muted">{hint}</div>}
    </div>
  );
}
