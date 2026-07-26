import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../ui";

const TASKS = ["object_detection", "classification", "segmentation", "custom"] as const;
type Task = (typeof TASKS)[number];

const PRESETS: Record<string, { task: Task }> = {
  ultralytics_detection: { task: "object_detection" },
  ultralytics_classification: { task: "classification" },
  ultralytics_segmentation: { task: "segmentation" },
  custom_python: { task: "custom" },
};
const PRESET_FOR_TASK: Record<Task, string> = {
  object_detection: "ultralytics_detection",
  classification: "ultralytics_classification",
  segmentation: "ultralytics_segmentation",
  custom: "custom_python",
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export default function OnboardModelPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [task, setTask] = useState<Task>("object_detection");
  const [preset, setPreset] = useState<string>("ultralytics_detection");
  const [dsName, setDsName] = useState("");
  const [dsVer, setDsVer] = useState("v1");
  const [gpu, setGpu] = useState(1);
  const [metric, setMetric] = useState("mAP50");
  const [bar, setBar] = useState("");
  const [ns, setNs] = useState("vgreens-models");
  const [copied, setCopied] = useState<string | null>(null);

  const mName = slug(name);
  const repo = `vgreens-model-${mName.replace(/_/g, "-") || "…"}`;

  function onTask(t: Task) { setTask(t); setPreset(PRESET_FOR_TASK[t]); }

  const yaml = useMemo(() => {
    const thresholdsBlock = bar.trim()
      ? `  thresholds:\n    ${metric}: ${Number(bar)}`
      : "  thresholds: {}";
    return [
      "schema_version: 1",
      "model:",
      `  name: ${mName || "your_model"}`,
      `  task: ${task}`,
      `  owner: ${owner.trim() || '""'}`,
      "template:",
      `  preset: ${preset}`,
      "dataset:",
      `  name: ${slug(dsName) || "your_dataset"}`,
      `  version: ${dsVer.trim() || "v1"}`,
      "training:",
      "  epochs: 50",
      "  image_size: 640",
      "  batch_size: 16",
      `  gpu_count: ${gpu}`,
      "validation:",
      thresholdsBlock,
      "processing:",
      "  confidence_threshold: 0.25",
      "repository:",
      `  namespace: ${ns.trim() || "vgreens-models"}`,
      `  name: ${repo}`,
      "",
    ].join("\n");
  }, [mName, task, owner, preset, dsName, dsVer, gpu, metric, bar, ns, repo]);

  const commands = useMemo(() => [
    "# 1 — save the spec below as model.yaml, then scaffold + create the GitLab repo",
    "vgreens-ai model onboard --spec model.yaml --create-repo",
    "",
    "# 2 — CI lints, tests, builds the image and (on main) auto-submits training.",
    "#      Watch the pipeline in GitLab, then follow the run:",
    `vgreens-ai job list --model ${mName || "your_model"}`,
    "",
    "# 3 — once a version is validated, promote it (admin):",
    `vgreens-ai model promote --model ${mName || "your_model"} --version <v>`,
  ].join("\n"), [mName]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500); }
    catch { /* clipboard unavailable */ }
  }

  function download() {
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "model.yaml"; a.click();
    URL.revokeObjectURL(url);
  }

  const ready = !!mName && !!slug(dsName);

  return (
    <div>
      <button className="link" style={{ display: "inline-block", marginBottom: 8 }} onClick={() => navigate("/models")}>← Models</button>
      <PageHeader
        title="Onboard a model"
        description="Generate a valid model.yaml and the commands to scaffold, build, and train a new custom model."
      />

      <div className="warn-box wide">
        Repo creation and CI run through the <b>vgreens-ai</b> CLI (they need git + your GitLab token), so this
        wizard prepares the spec and commands — it doesn't touch GitLab from the browser.
      </div>

      <div className="tiles" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <form className="panel form" onSubmit={(e) => e.preventDefault()}>
          <div className="form-2">
            <Field label="Model name" required hint="lowercase_underscore">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. leaf_health" autoFocus />
            </Field>
            <Field label="Owner" hint="Optional.">
              <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="you@v-greens.com" />
            </Field>
          </div>

          <div className="form-2">
            <Field label="Task">
              <select className="input" value={task} onChange={(e) => onTask(e.target.value as Task)}>
                {TASKS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Preset" hint="Ultralytics presets generate working code; custom_python is a skeleton.">
              <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {Object.keys(PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          <div className="form-2">
            <Field label="Dataset name" required>
              <input className="input" value={dsName} onChange={(e) => setDsName(e.target.value)} placeholder="e.g. leaf_health" />
            </Field>
            <Field label="Dataset version">
              <input className="input" value={dsVer} onChange={(e) => setDsVer(e.target.value)} placeholder="v1" />
            </Field>
          </div>

          <div className="form-2">
            <Field label="Primary metric" hint="e.g. mAP50, accuracy">
              <input className="input" value={metric} onChange={(e) => setMetric(e.target.value)} />
            </Field>
            <Field label={`Min ${metric || "metric"} to promote`} hint="Blank = no gate yet.">
              <input className="input" type="number" step="0.01" value={bar} onChange={(e) => setBar(e.target.value)} placeholder="optional" />
            </Field>
          </div>

          <div className="form-2">
            <Field label="GPUs">
              <div className="seg">
                {[1, 2].map((n) => (
                  <button type="button" key={n} className={gpu === n ? "seg-btn active" : "seg-btn"} onClick={() => setGpu(n)}>
                    {n === 1 ? "1 GPU" : "2 GPUs"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="GitLab namespace">
              <input className="input" value={ns} onChange={(e) => setNs(e.target.value)} />
            </Field>
          </div>

          <div className="field">
            <label className="field-label">Repository</label>
            <input className="input mono" value={repo} readOnly />
          </div>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="panel">
            <div className="panel-head">
              <h2>model.yaml</h2>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost sm-btn" onClick={() => copy(yaml, "yaml")}>{copied === "yaml" ? "Copied" : "Copy"}</button>
                <button className="btn sm-btn" onClick={download} disabled={!ready}>Download</button>
              </div>
            </div>
            <pre className="code-block">{yaml}</pre>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Commands</h2>
              <button className="btn ghost sm-btn" onClick={() => copy(commands, "cmd")}>{copied === "cmd" ? "Copied" : "Copy"}</button>
            </div>
            <pre className="code-block">{commands}</pre>
          </section>
        </div>
      </div>
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
