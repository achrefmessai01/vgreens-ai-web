import "../styles/models.css";
import { useMemo, useState } from "react";
import { PageHeader } from "../ui";

const TASKS = ["object_detection", "classification", "segmentation", "custom"] as const;
type Task = (typeof TASKS)[number];

// Detection/segmentation use RF-DETR (Apache-2.0); classification & other tasks
// use custom_python. Ultralytics/YOLO is not offered (AGPL-3.0, commercially risky).
const PRESETS: Record<string, { task: Task }> = {
  rfdetr_detection: { task: "object_detection" },
  rfdetr_segmentation: { task: "segmentation" },
  cnn_classification: { task: "classification" },
  custom_python: { task: "custom" },
};
const PRESET_FOR_TASK: Record<Task, string> = {
  object_detection: "rfdetr_detection",
  classification: "cnn_classification",
  segmentation: "rfdetr_segmentation",
  custom: "custom_python",
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const STEPS = ["Basics", "Preset & dataset", "Training config", "Review"] as const;

export default function OnboardModelPage() {
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<Set<number>>(new Set());

  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [task, setTask] = useState<Task>("object_detection");
  const [preset, setPreset] = useState<string>("rfdetr_detection");
  const [dsName, setDsName] = useState("");
  const [dsVer, setDsVer] = useState("v1");
  const [gpu, setGpu] = useState(1);
  const [epochs, setEpochs] = useState("50");
  const [imageSize, setImageSize] = useState("640");
  const [batchSize, setBatchSize] = useState("16");
  const [gradAccum, setGradAccum] = useState("");
  const [effBatch, setEffBatch] = useState("");
  const [deps, setDeps] = useState("");
  const [metric, setMetric] = useState("mAP50");
  const [bar, setBar] = useState("");
  const [ns, setNs] = useState("vgreens-models");
  const [copied, setCopied] = useState<string | null>(null);

  const mName = slug(name);
  const repo = `vgreens-model-${mName.replace(/_/g, "-") || "…"}`;

  function onTask(t: Task) { setTask(t); setPreset(PRESET_FOR_TASK[t]); }

  const depList = deps.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  // ---- generation logic ----
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
      `  epochs: ${Number(epochs) || 50}`,
      `  image_size: ${Number(imageSize) || 640}`,
      `  batch_size: ${Number(batchSize) || 16}`,
      ...(gradAccum.trim() ? [`  grad_accumulation_steps: ${Number(gradAccum)}`] : []),
      ...(effBatch.trim() ? [`  effective_batch: ${Number(effBatch)}`] : []),
      `  gpu_count: ${gpu}`,
      "validation:",
      thresholdsBlock,
      "processing:",
      "  confidence_threshold: 0.25",
      ...(depList.length ? ["dependencies:", ...depList.map((d) => `  - ${d}`)] : []),
      "repository:",
      `  namespace: ${ns.trim() || "vgreens-models"}`,
      `  name: ${repo}`,
      "",
    ].join("\n");
  }, [mName, task, owner, preset, dsName, dsVer, gpu, epochs, imageSize, batchSize, gradAccum, effBatch, deps, metric, bar, ns, repo]);

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

  // ---- per-step validation ----
  const nEpochs = Number(epochs), nImg = Number(imageSize), nBatch = Number(batchSize);
  const errBasics = !mName ? "Enter a model name (lowercase_underscore)." : null;
  const errDataset = !slug(dsName) ? "Enter a dataset name." : null;
  const errEpochs = !(Number.isFinite(nEpochs) && nEpochs >= 1) ? "Epochs must be 1 or more." : null;
  const errImg = !(Number.isFinite(nImg) && nImg >= 32) ? "Image size must be 32 or more." : null;
  const errBatch = !(Number.isFinite(nBatch) && nBatch >= 1) ? "Batch size must be 1 or more." : null;

  const stepValid = [!errBasics, !errDataset, !errEpochs && !errImg && !errBatch, true];
  const ready = !errBasics && !errDataset;
  const show = (s: number) => tried.has(s);

  function goNext() {
    if (!stepValid[step]) { setTried((t) => new Set(t).add(step)); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goStep(target: number) {
    if (target <= step) { setStep(target); return; }
    // only allow forward jumps if every intervening step is valid
    for (let i = step; i < target; i++) {
      if (!stepValid[i]) { setStep(i); setTried((t) => new Set(t).add(i)); return; }
    }
    setStep(target);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Models", to: "/models" }, { label: "Onboard model" }]}
        title="Onboard a model"
        description="A guided builder for a valid model.yaml plus the commands to scaffold, build and train a new model."
      />

      {/* stepper */}
      <nav className="stepper" aria-label="Onboarding steps">
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: "contents" }}>
            {i > 0 && <span className={`step-line ${i <= step ? "done" : ""}`} aria-hidden="true" />}
            <button
              type="button"
              className={`step-btn ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
              aria-current={i === step ? "step" : undefined}
              onClick={() => goStep(i)}
            >
              <span className="step-num">{i < step ? "✓" : i + 1}</span>
              <span className="step-label">{label}</span>
            </button>
          </div>
        ))}
      </nav>

      <section className="panel">
        {step === 0 && (
          <form className="form" style={{ maxWidth: "100%" }} onSubmit={(e) => e.preventDefault()}>
            <div className="form-2">
              <Field label="Model name" required hint="lowercase_underscore" error={show(0) ? errBasics : null}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. leaf_health" autoFocus />
              </Field>
              <Field label="Owner" hint="Optional.">
                <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="you@v-greens.com" />
              </Field>
            </div>
            {mName && <p className="hint muted">Registry repository: <span className="mono">{repo}</span></p>}
          </form>
        )}

        {step === 1 && (
          <form className="form" style={{ maxWidth: "100%" }} onSubmit={(e) => e.preventDefault()}>
            <div className="form-2">
              <Field label="Task">
                <select className="input" value={task} onChange={(e) => onTask(e.target.value as Task)}>
                  {TASKS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Preset" hint="RF-DETR (Apache-2.0) generates working detection code; segmentation & classification start from the custom_python scaffold.">
                <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {Object.keys(PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
            <div className="form-2">
              <Field label="Dataset name" required error={show(1) ? errDataset : null}>
                <input className="input" value={dsName} onChange={(e) => setDsName(e.target.value)} placeholder="e.g. leaf_health" />
              </Field>
              <Field label="Dataset version">
                <input className="input" value={dsVer} onChange={(e) => setDsVer(e.target.value)} placeholder="v1" />
              </Field>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="form" style={{ maxWidth: "100%" }} onSubmit={(e) => e.preventDefault()}>
            <div className="form-3">
              <Field label="Epochs" hint="Lower = faster (e.g. 3 for a quick run)." error={show(2) ? errEpochs : null}>
                <input className="input" type="number" min="1" value={epochs} onChange={(e) => setEpochs(e.target.value)} />
              </Field>
              <Field label="Image size" hint="Smaller = faster (e.g. 320)." error={show(2) ? errImg : null}>
                <input className="input" type="number" min="32" step="32" value={imageSize} onChange={(e) => setImageSize(e.target.value)} />
              </Field>
              <Field label="Batch size" hint="Images per step — cap by VRAM." error={show(2) ? errBatch : null}>
                <input className="input" type="number" min="1" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} />
              </Field>
            </div>
            <div className="form-2">
              <Field label="Grad accumulation steps" hint="Optional. Effective batch = batch × steps.">
                <input className="input" type="number" min="1" value={gradAccum} onChange={(e) => setGradAccum(e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Effective batch" hint="Optional. If set, steps are derived to reach it (≈16 is typical).">
                <input className="input" type="number" min="1" value={effBatch} onChange={(e) => setEffBatch(e.target.value)} placeholder="optional, e.g. 16" />
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
            <Field label="Extra dependencies" hint="Optional — one pip requirement per line (e.g. timm==1.0.9). Installed into the model image at build time; needed for custom models with their own libraries.">
              <textarea className="input" rows={3} value={deps} onChange={(e) => setDeps(e.target.value)} placeholder={"torch==2.3.1\ntimm==1.0.9"} style={{ resize: "vertical", fontFamily: "var(--mono, monospace)" }} />
            </Field>
          </form>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 12px" }}>Review</h2>
              <dl className="review-grid">
                <dt>Model</dt><dd className="mono">{mName || "—"}</dd>
                <dt>Owner</dt><dd>{owner.trim() || <span className="muted">none</span>}</dd>
                <dt>Task</dt><dd>{task}</dd>
                <dt>Preset</dt><dd className="mono">{preset}</dd>
                <dt>Dataset</dt><dd className="mono">{slug(dsName) || "—"} · {dsVer.trim() || "v1"}</dd>
                <dt>Training</dt><dd>{Number(epochs) || 50} epochs · {Number(imageSize) || 640}px · batch {Number(batchSize) || 16} · {gpu} GPU{gpu === 1 ? "" : "s"}</dd>
                <dt>Promotion gate</dt><dd>{bar.trim() ? <span className="mono">{metric} ≥ {Number(bar)}</span> : <span className="muted">none yet</span>}</dd>
                <dt>Repository</dt><dd className="mono">{ns.trim() || "vgreens-models"}/{repo}</dd>
              </dl>
            </div>

            <div className="warn-box wide" style={{ margin: 0 }}>
              Repo creation and CI run through the <b>vgreens-ai</b> CLI (they need git + your GitLab token), so this
              wizard prepares the spec and commands — it doesn't touch GitLab from the browser.
            </div>

            <section className="panel" style={{ margin: 0 }}>
              <div className="panel-head">
                <h2>model.yaml</h2>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost sm-btn" onClick={() => copy(yaml, "yaml")}>{copied === "yaml" ? "Copied" : "Copy"}</button>
                  <button className="btn primary sm-btn" onClick={download} disabled={!ready}>Download model.yaml</button>
                </div>
              </div>
              <pre className="code-block">{yaml}</pre>
            </section>

            <section className="panel" style={{ margin: 0 }}>
              <div className="panel-head">
                <h2>Commands</h2>
                <button className="btn ghost sm-btn" onClick={() => copy(commands, "cmd")}>{copied === "cmd" ? "Copied" : "Copy"}</button>
              </div>
              <pre className="code-block">{commands}</pre>
            </section>
          </div>
        )}

        {/* wizard navigation */}
        <div className="wizard-nav">
          <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</button>
          <div className="wn-end">
            {step < STEPS.length - 1
              ? <button className="btn primary" onClick={goNext} disabled={!stepValid[step]}>Next →</button>
              : <button className="btn primary" onClick={download} disabled={!ready}>Download model.yaml</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{label} {required && <span className="req">*</span>}</label>
      {children}
      {error ? <div className="field-error" role="alert">{error}</div>
        : hint && <div className="field-hint muted">{hint}</div>}
    </div>
  );
}
