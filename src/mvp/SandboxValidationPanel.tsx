import { authHeaders } from "./auth-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Download,
  Loader2,
  Plus,
  Play,
  Check,
  X,
} from "lucide-react";
import type { Sandbox } from "./sandbox";
import type {
  SandboxValidation,
  ValidationBrief,
  ValidationObservation,
} from "./validation";
import { buildValidationDossier } from "./validation";
import type { Task } from "./types";
import { useMvp } from "./store";
import { campaignCounts, money, validProductUrl } from "./model";
import { extractSandboxFile } from "./sandbox-files";
import { exportValidationDossier } from "./validation-export";
import type { ValidationExportFormat } from "./validation-export";
import {
  buildParticipantMissionHtml,
  participantMissionFilename,
} from "./human-handoff";
import "./validation.css";

const focuses = [
  "Onboarding",
  "Usability",
  "Demand",
  "Pricing",
  "Conversion",
  "Accessibility",
  "Trust",
  "Feature desirability",
  "Overall experience",
];
const formats: ValidationExportFormat[] = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "csv",
  "json",
  "jsonl",
  "html",
  "markdown",
];
const initialBrief = (sandbox: Sandbox): ValidationBrief =>
  sandbox.validation?.brief || {
    inputType: sandbox.analysis?.product.url ? "website" : "idea",
    productDescription:
      sandbox.analysis?.product.description || sandbox.initialInput,
    focus: "Onboarding",
    audience: sandbox.analysis?.product.audience || "",
    assumption: sandbox.analysis?.assumptions[0]?.question || "",
    decision: "",
    desiredOutcome: "",
    targetUrl: sandbox.analysis?.product.url || "",
    successThreshold: 80,
  };

async function screenshot(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Use a PNG, JPEG or WebP screenshot under 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot read screenshots.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (dataUrl.length > 600000) dataUrl = canvas.toDataURL("image/jpeg", 0.5);
    if (dataUrl.length > 600000) throw new Error("Use a smaller screenshot.");
    return { name: file.name, mimeType: "image/jpeg", dataUrl };
  } finally {
    bitmap.close();
  }
}

export function SandboxValidationPanel({
  sandbox,
  disabled,
  onSave,
  onBusy,
}: {
  sandbox: Sandbox;
  disabled: boolean;
  onSave: (validation: SandboxValidation) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const { data, user, command, checkout, busy: workspaceBusy } = useMvp();
  const [brief, setBrief] = useState(() => initialBrief(sandbox));
  const [tasks, setTasks] = useState<Task[]>(
    sandbox.validation?.plan?.tasks || [],
  );
  const [assets, setAssets] = useState(sandbox.validation?.briefAssets || []);
  const [documents, setDocuments] = useState(
    sandbox.validation?.briefDocuments || [],
  );
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [clarifications, setClarifications] = useState<
    { field: string; question: string }[]
  >([]);
  const [section, setSection] = useState(() => {
    const campaignId = sandbox.validation?.campaignId;
    if (
      campaignId &&
      data.submissions.some(
        (submission) =>
          submission.campaignId === campaignId &&
          submission.status === "approved",
      )
    )
      return "analytics";
    if (sandbox.validation?.plan?.approvedAt) return "execution";
    return sandbox.validation?.plan?.tasks.length ? "experiment" : "brief";
  });
  const [outcome, setOutcome] = useState("all");
  const [device, setDevice] = useState("all");
  const [participant, setParticipant] = useState("all");
  const [selectedEvidence, setSelectedEvidence] = useState<string[] | null>(
    null,
  );
  const [retestUrl, setRetestUrl] = useState("");
  const [changes, setChanges] = useState("");
  const [campaignToLink, setCampaignToLink] = useState("");
  const orphanCampaign = useRef("");
  const orphanRetest = useRef("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  const dossier = useMemo(
    () => buildValidationDossier(sandbox, data),
    [sandbox, data],
  );
  const campaign = dossier.campaign;
  const locked = Boolean(
    campaign?.tasksApproved || campaign?.payment === "paid",
  );
  const unavailable = disabled || workspaceBusy || Boolean(working);
  const validation = (): SandboxValidation => ({
    ...sandbox.validation,
    brief,
    briefAssets: assets,
    briefDocuments: documents,
  });
  const changeBrief = (key: keyof ValidationBrief, value: string | number) => {
    setBrief((current) => ({ ...current, [key]: value }));
    setClarifications([]);
  };
  const run = async (name: string, action: () => Promise<void>) => {
    if (unavailable) return;
    setWorking(name);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This action could not be completed.",
      );
    } finally {
      setWorking("");
      onBusy(false);
    }
  };
  const design = () =>
    run("Designing experiment", async () => {
      const abort = new AbortController();
      controller.current = abort;
      await onSave(validation());
      abort.signal.throwIfAborted();
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          brief,
          analysis: sandbox.analysis,
          briefAssets: assets,
          briefDocuments: documents,
        }),
      });
      const result = await response.json();
      abort.signal.throwIfAborted();
      if (!response.ok)
        throw new Error(result.error || "Experiment design is unavailable.");
      if (result.clarifications?.length) {
        setClarifications(result.clarifications);
        return;
      }
      if (!Array.isArray(result.tasks) || !result.tasks.length)
        throw new Error("No test tasks were returned.");
      setTasks(result.tasks);
      await onSave({
        ...validation(),
        plan: {
          tasks: result.tasks,
          method: "ai",
          createdAt: result.createdAt,
        },
      });
      setSection("experiment");
    });
  const approve = () =>
    run("Approving experiment", async () => {
      if (!validProductUrl(brief.targetUrl))
        throw new Error(
          "Add a product or prototype URL before assigning a human test.",
        );
      if (
        !tasks.length ||
        tasks.some(
          (task) =>
            !task.title.trim() ||
            !task.instructions.trim() ||
            !task.question.trim() ||
            !task.successCriteria?.trim(),
        )
      )
        throw new Error(
          "Each task needs instructions, a question and measurable success criteria.",
        );
      let campaignId = orphanCampaign.current;
      if (campaign) {
        await command({
          type: "update-campaign",
          campaignId: campaign.id,
          patch: {
            tasks,
            tasksApproved: true,
            url: brief.targetUrl,
            audience: brief.audience,
            objective: brief.desiredOutcome,
            assumption: brief.assumption || brief.decision,
          },
        });
        campaignId = campaign.id;
      } else if (!campaignId) {
        const result = await command({
          type: "create-campaign",
          campaign: {
            title:
              `${sandbox.analysis?.product.name || sandbox.title} — ${brief.focus}`.slice(
                0,
                120,
              ),
            url: brief.targetUrl,
            audience: brief.audience,
            objective: brief.desiredOutcome,
            assumption: brief.assumption || brief.decision,
            tasks,
            tasksApproved: true,
          },
        });
        campaignId = result.entityId!;
        orphanCampaign.current = campaignId;
      }
      await onSave({
        ...validation(),
        campaignId,
        plan: {
          tasks,
          method: sandbox.validation?.plan?.method || "ai",
          createdAt:
            sandbox.validation?.plan?.createdAt || new Date().toISOString(),
          approvedAt: new Date().toISOString(),
        },
      });
      orphanCampaign.current = "";
      setSection("execution");
    });
  const retest = () =>
    run("Creating retest", async () => {
      if (
        !campaign ||
        !validProductUrl(retestUrl) ||
        changes.trim().length < 10
      )
        throw new Error("Add the changed product URL and what changed.");
      let nextId = orphanRetest.current;
      if (!nextId) {
        const result = await command({
          type: "retest",
          campaignId: campaign.id,
          url: retestUrl,
          changes,
        });
        nextId = result.entityId!;
        orphanRetest.current = nextId;
      }
      const nextBrief = { ...brief, targetUrl: retestUrl };
      await onSave({
        ...validation(),
        brief: nextBrief,
        campaignId: nextId,
        plan: {
          tasks: campaign.tasks,
          method: sandbox.validation?.plan?.method || "ai",
          createdAt: new Date().toISOString(),
        },
      });
      setBrief(nextBrief);
      orphanRetest.current = "";
      setTasks(campaign.tasks);
      setSection("experiment");
      setChanges("");
    });
  const filtered = dossier.observations.filter(
    (item) =>
      (outcome === "all" || item.outcome === outcome) &&
      (device === "all" || item.device === device) &&
      (participant === "all" || item.participant === participant),
  );
  const visibleEvidence =
    selectedEvidence !== null
      ? filtered.filter((item) => selectedEvidence.includes(item.id))
      : filtered;
  const recordedTimes = filtered.filter(
    (item) => item.durationSeconds !== null,
  );
  const longestTime = Math.max(
    0,
    ...recordedTimes.map((item) => item.durationSeconds!),
  );
  const bucketWidth = Math.max(1, Math.ceil((Math.floor(longestTime) + 1) / 5));
  const timingBuckets = Array.from(
    {
      length: Math.min(
        5,
        Math.ceil((Math.floor(longestTime) + 1) / bucketWidth),
      ),
    },
    (_, index) => {
      const start = index * bucketWidth,
        end = start + bucketWidth;
      return {
        start,
        end,
        items: recordedTimes.filter(
          (item) =>
            item.durationSeconds! >= start && item.durationSeconds! < end,
        ),
      };
    },
  );
  const inspect = (sourceIds: string[]) => {
    setSelectedEvidence(sourceIds);
    requestAnimationFrame(() =>
      document
        .getElementById("sv-evidence")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const counts = campaign ? campaignCounts(data, campaign.id) : null;
  const stages = ["brief", "experiment", "execution", "analytics", "report"];
  const saveDraft = () =>
    run("Saving brief", () =>
      onSave({
        ...validation(),
        plan: tasks.length
          ? {
              tasks,
              method: sandbox.validation?.plan?.method || "ai",
              createdAt:
                sandbox.validation?.plan?.createdAt || new Date().toISOString(),
            }
          : undefined,
      }),
    );

  return (
    <section className="sv-panel" aria-label="Product validation">
      <nav className="sv-stage-nav" aria-label="Validation workflow">
        {stages.map((item, index) => (
          <button
            type="button"
            key={item}
            aria-pressed={section === item}
            onClick={() => setSection(item)}
          >
            <span aria-hidden="true">{index + 1}</span>
            {item === "brief"
              ? "Brief"
              : item === "experiment"
                ? "Experiment"
                : item === "execution"
                  ? "Run test"
                  : item === "analytics"
                    ? "Evidence & analytics"
                    : "Report & retest"}
          </button>
        ))}
      </nav>
      {working && (
        <div className="sv-working" role="status">
          <Loader2 size={16} className="sb-spin" />
          {working}
          {working === "Designing experiment" && (
            <button
              className="mvp-btn"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="mvp-error">
          {error}
        </div>
      )}
      {section === "brief" && (
        <div className="sv-card">
          <div className="sv-card-heading">
            <div>
              <h2>What do you need to validate?</h2>
              <p>Define the decision and the people who will test it.</p>
            </div>
            <span className="sv-badge">
              {locked ? `Round ${campaign!.round} brief` : "Validation brief"}
            </span>
          </div>
          <div className="sv-form-grid">
            <label>
              Product input
              <select
                value={brief.inputType}
                disabled={locked || unavailable}
                onChange={(e) => changeBrief("inputType", e.target.value)}
              >
                {[
                  ["idea", "Idea"],
                  ["website", "Website"],
                  ["figma", "Figma prototype"],
                  ["web-app", "Web application"],
                  ["mobile-app", "Mobile app"],
                  ["screenshots", "Screenshots"],
                  ["documents", "Documents"],
                ].map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Validation focus
              <select
                value={brief.focus}
                disabled={locked || unavailable}
                onChange={(e) => changeBrief("focus", e.target.value)}
              >
                {focuses.map((focus) => (
                  <option key={focus}>{focus}</option>
                ))}
              </select>
            </label>
            <label className="sv-wide">
              Product or prototype URL
              <input
                type="url"
                value={brief.targetUrl}
                disabled={locked || unavailable}
                placeholder="https://…"
                onChange={(e) => changeBrief("targetUrl", e.target.value)}
              />
            </label>
            <label className="sv-wide">
              Product description
              <textarea
                value={brief.productDescription || ""}
                disabled={locked || unavailable}
                maxLength={4000}
                onChange={(e) =>
                  changeBrief("productDescription", e.target.value)
                }
                placeholder="What it does, or mobile app/store details"
              />
            </label>
            <label>
              Target users
              <textarea
                value={brief.audience}
                disabled={locked || unavailable}
                maxLength={1500}
                onChange={(e) => changeBrief("audience", e.target.value)}
                placeholder="Who, experience, device and eligibility"
              />
            </label>
            <label>
              Biggest assumption
              <textarea
                value={brief.assumption}
                disabled={locked || unavailable}
                maxLength={2000}
                onChange={(e) => changeBrief("assumption", e.target.value)}
              />
            </label>
            <label>
              Decision to make
              <textarea
                value={brief.decision}
                disabled={locked || unavailable}
                maxLength={2000}
                onChange={(e) => changeBrief("decision", e.target.value)}
                placeholder="Ship onboarding or change the first-use flow?"
              />
            </label>
            <label>
              Desired outcome
              <textarea
                value={brief.desiredOutcome}
                disabled={locked || unavailable}
                maxLength={2000}
                onChange={(e) => changeBrief("desiredOutcome", e.target.value)}
                placeholder="New users finish onboarding without help"
              />
            </label>
            <label>
              Required task success (%)
              <input
                type="number"
                min={1}
                max={100}
                value={brief.successThreshold}
                disabled={locked || unavailable}
                onChange={(e) =>
                  changeBrief("successThreshold", Number(e.target.value))
                }
              />
            </label>
          </div>
          {!locked && (
            <>
              <div className="sv-input-assets">
                <label className="mvp-btn">
                  Add product screenshots
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    disabled={unavailable}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      void run("Reading screenshots", async () => {
                        if (assets.length + files.length > 3)
                          throw new Error("Use up to three screenshots.");
                        setAssets([
                          ...assets,
                          ...(await Promise.all(files.map(screenshot))),
                        ]);
                      });
                    }}
                  />
                </label>
                <label className="mvp-btn">
                  Attach PDF or text brief
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    multiple
                    disabled={unavailable}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      void run("Reading documents", async () => {
                        if (documents.length + files.length > 3)
                          throw new Error("Use up to three documents.");
                        setDocuments([
                          ...documents,
                          ...(await Promise.all(
                            files.map((file) => extractSandboxFile(file)),
                          )),
                        ]);
                      });
                    }}
                  />
                </label>
              </div>
              <div className="sv-assets">
                {assets.map((asset, index) => (
                  <div key={`${asset.name}:${index}`}>
                    <img src={asset.dataUrl} alt={asset.name} />
                    <span>{asset.name}</span>
                    <button
                      aria-label={`Remove screenshot ${asset.name}`}
                      onClick={() =>
                        setAssets(assets.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="sv-document-list">
                {documents.map((file, index) => (
                  <span key={`${file.name}:${index}`}>
                    {file.name}
                    <button
                      aria-label={`Remove document ${file.name}`}
                      onClick={() =>
                        setDocuments(documents.filter((_, i) => i !== index))
                      }
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              {clarifications.length > 0 && (
                <div className="sv-clarifications" role="alert">
                  <strong>Complete the brief</strong>
                  {clarifications.map((item) => (
                    <p key={item.field}>{item.question}</p>
                  ))}
                </div>
              )}
              <div className="sv-actions">
                <button
                  className="mvp-btn"
                  disabled={unavailable}
                  onClick={saveDraft}
                >
                  Save brief
                </button>
                <button
                  className="mvp-btn mvp-btn-dark"
                  disabled={unavailable}
                  onClick={design}
                >
                  Design experiment <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {section === "experiment" && (
        <div className="sv-card">
          <div className="sv-card-heading">
            <div>
              <h2>Test mission</h2>
              <p>
                Review the tasks and success criteria before assigning anyone.
              </p>
            </div>
            {sandbox.validation?.plan && (
              <span className="sv-badge">
                {locked ? "Approved mission" : "AI-generated draft"}
              </span>
            )}
          </div>
          {!tasks.length ? (
            <div className="sv-empty">
              <p>No experiment designed yet.</p>
              <button className="mvp-btn" onClick={() => setSection("brief")}>
                Complete brief
              </button>
            </div>
          ) : (
            <>
              {tasks.map((task, index) => (
                <div className="sv-task-editor" key={task.id}>
                  <h3>Task {index + 1}</h3>
                  <label>
                    Task title
                    <input
                      value={task.title}
                      maxLength={160}
                      disabled={locked || unavailable}
                      onChange={(e) =>
                        setTasks(
                          tasks.map((t, i) =>
                            i === index ? { ...t, title: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Instructions
                    <textarea
                      value={task.instructions}
                      maxLength={4000}
                      disabled={locked || unavailable}
                      onChange={(e) =>
                        setTasks(
                          tasks.map((t, i) =>
                            i === index
                              ? { ...t, instructions: e.target.value }
                              : t,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="sv-form-grid">
                    <label>
                      Completion criteria
                      <textarea
                        value={task.successCriteria || ""}
                        maxLength={3000}
                        disabled={locked || unavailable}
                        onChange={(e) =>
                          setTasks(
                            tasks.map((t, i) =>
                              i === index
                                ? { ...t, successCriteria: e.target.value }
                                : t,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Follow-up question
                      <textarea
                        value={task.question}
                        maxLength={2000}
                        disabled={locked || unavailable}
                        onChange={(e) =>
                          setTasks(
                            tasks.map((t, i) =>
                              i === index
                                ? { ...t, question: e.target.value }
                                : t,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  {!locked && (
                    <button
                      className="sv-text-button"
                      disabled={unavailable}
                      onClick={() =>
                        setTasks(tasks.filter((_, i) => i !== index))
                      }
                    >
                      Remove task
                    </button>
                  )}
                </div>
              ))}
              {!locked && (
                <div className="sv-actions">
                  <button
                    className="mvp-btn"
                    disabled={unavailable || tasks.length >= 8}
                    onClick={() =>
                      setTasks([
                        ...tasks,
                        {
                          id: crypto.randomUUID(),
                          title: "",
                          instructions: "",
                          question: "",
                          successCriteria: "",
                        },
                      ])
                    }
                  >
                    <Plus size={15} />
                    Add task
                  </button>
                  <button
                    className="mvp-btn"
                    disabled={unavailable}
                    onClick={saveDraft}
                  >
                    Save draft
                  </button>
                  <button
                    className="mvp-btn mvp-btn-dark"
                    disabled={unavailable}
                    onClick={approve}
                  >
                    <Check size={16} />
                    Approve & create test
                  </button>
                </div>
              )}
            </>
          )}
          {!campaign && (
            <details className="sv-link-existing">
              <summary>Use an existing test</summary>
              <label>
                Existing test
                <select
                  value={campaignToLink}
                  disabled={unavailable}
                  onChange={(e) => setCampaignToLink(e.target.value)}
                >
                  <option value="">Select a test</option>
                  {data.campaigns
                    .filter((item) => item.founderId === user?.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · round {item.round}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="mvp-btn"
                disabled={unavailable || !campaignToLink}
                onClick={() =>
                  void run("Linking test", async () => {
                    const linked = data.campaigns.find(
                      (item) => item.id === campaignToLink,
                    );
                    if (!linked)
                      throw new Error("This test is no longer available.");
                    const nextBrief = {
                      ...brief,
                      audience: linked.audience,
                      assumption: linked.assumption || brief.assumption,
                      desiredOutcome: linked.objective,
                      targetUrl: linked.url,
                    };
                    await onSave({
                      ...validation(),
                      brief: nextBrief,
                      campaignId: campaignToLink,
                      plan: {
                        tasks: linked.tasks,
                        method: "template",
                        createdAt: new Date().toISOString(),
                        ...(linked.tasksApproved
                          ? { approvedAt: new Date().toISOString() }
                          : {}),
                      },
                    });
                    setBrief(nextBrief);
                    setTasks(linked.tasks);
                    setSection("execution");
                  })
                }
              >
                Link test
              </button>
            </details>
          )}
        </div>
      )}
      {section === "execution" && (
        <div className="sv-card">
          <div className="sv-card-heading">
            <div>
              <h2>Run the experiment</h2>
              <p>
                {campaign
                  ? `Round ${campaign.round} · ${campaign.title}`
                  : "Approve a mission to begin."}
              </p>
            </div>
            <span className="sv-badge">Human testing · 5 participants</span>
          </div>
          {campaign ? (
            <>
              <div className="sv-metrics">
                <Metric label="Invited" value={counts!.invited} />
                <Metric label="Accepted" value={counts!.accepted} />
                <Metric label="Submitted" value={counts!.submitted} />
                <Metric label="QA approved" value={counts!.approved} />
              </div>
              <p className="sv-limitation">
                Tester invitations and execution are coordinated in this device
                workspace. Recruitment and live payments are not connected.
              </p>
              {campaign.payment === "unpaid" && (
                <div className="sv-package">
                  <strong>
                    {money(campaign.priceCents, campaign.currency)} · 5 testers
                    · one approved mission and report
                  </strong>
                  <p>
                    Simulated checkout; no charge. Timing depends on participant
                    availability.
                  </p>
                  <button
                    className="mvp-btn mvp-btn-dark"
                    disabled={unavailable || !campaign.tasksApproved}
                    onClick={() =>
                      void run("Starting test", () => checkout(campaign.id))
                    }
                  >
                    <Play size={15} />
                    Start simulated checkout
                  </button>
                  {!campaign.tasksApproved && (
                    <button
                      className="sv-text-button"
                      disabled={unavailable}
                      onClick={() => setSection("experiment")}
                    >
                      Review & approve mission first
                    </button>
                  )}
                </div>
              )}
              <div className="sv-actions">
                <Link className="mvp-btn" to={`/campaigns/${campaign.id}`}>
                  Campaign & invitations <ArrowRight size={15} />
                </Link>
                <Link
                  className="mvp-btn"
                  to={`/admin?campaign=${campaign.id}&tab=matching`}
                >
                  Match testers & review evidence
                </Link>
                <Link className="mvp-btn" to="/tester">
                  Tester assignments
                </Link>
              </div>
              <table className="sv-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Device / experience</th>
                    <th>Status</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assignments
                    .filter((a) => a.campaignId === campaign.id)
                    .map((assignment, index) => {
                      const profile = data.profiles.find(
                        (p) => p.id === assignment.testerId,
                      );
                      return (
                        <tr key={assignment.id}>
                          <td>Participant {index + 1}</td>
                          <td>
                            {profile?.device} ·{" "}
                            {profile?.expertise.join(", ") ||
                              "Profile incomplete"}
                          </td>
                          <td>{assignment.status}</td>
                          <td>
                            <Link to={`/tester/assignments/${assignment.id}`}>
                              Open assignment
                            </Link>
                            <button
                              className="sv-text-button"
                              disabled={
                                unavailable ||
                                campaign.payment !== "paid" ||
                                !campaign.tasksApproved ||
                                !["invited", "accepted", "revision"].includes(
                                  assignment.status,
                                )
                              }
                              onClick={() =>
                                void run(
                                  "Preparing participant mission",
                                  async () => {
                                    const blob = new Blob(
                                      [
                                        buildParticipantMissionHtml(
                                          campaign,
                                          assignment,
                                          profile?.name,
                                        ),
                                      ],
                                      { type: "text/html;charset=utf-8" },
                                    );
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement("a");
                                    link.href = url;
                                    link.download =
                                      participantMissionFilename(assignment);
                                    link.click();
                                    setTimeout(
                                      () => URL.revokeObjectURL(url),
                                      1000,
                                    );
                                  },
                                )
                              }
                            >
                              Download mission
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {!counts!.invited && (
                <p>
                  No real testers assigned yet. Add participant profiles and
                  review their fit in Operations.
                </p>
              )}
            </>
          ) : (
            <button
              className="mvp-btn"
              onClick={() => setSection("experiment")}
            >
              Review mission
            </button>
          )}
        </div>
      )}
      {section === "analytics" && (
        <>
          <div className="sv-card">
            <div className="sv-card-heading">
              <div>
                <h2>Validation dashboard</h2>
                <p>
                  {dossier.metrics.participants} QA-approved participants ·
                  observed outcomes
                </p>
              </div>
              <span
                className={`sv-verdict sv-verdict-${dossier.verdict.status.replaceAll(" ", "").toLowerCase()}`}
              >
                {dossier.verdict.status}
              </span>
            </div>
            <div className="sv-metrics">
              <Metric
                label="Task success"
                value={
                  dossier.metrics.successRate === null
                    ? "Not yet tested"
                    : `${dossier.metrics.successRate}%`
                }
              />
              <Metric
                label="Testers reviewed"
                value={`${dossier.metrics.participants} / ${dossier.metrics.expectedParticipants}`}
              />
              <Metric
                label="Critical findings"
                value={
                  dossier.metrics.attempts
                    ? dossier.metrics.severities.critical
                    : "Not yet tested"
                }
              />
              <Metric
                label="Median task time"
                value={
                  dossier.metrics.medianSeconds === null
                    ? dossier.metrics.attempts
                      ? "Not recorded"
                      : "Not yet tested"
                    : `${dossier.metrics.medianSeconds}s`
                }
              />
            </div>
            <p>{dossier.verdict.reason}</p>
            <p className="sv-limitation">
              Overall metrics use the full reviewed cohort. Filters below apply
              to charts and evidence.
            </p>
            <div className="sv-filters">
              <label>
                Outcome
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  {[
                    "all",
                    "success",
                    "failure",
                    "partial",
                    "blocked",
                    "abandoned",
                    "assisted",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Device
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  {["all", "desktop", "mobile", "both"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Participant
                <select
                  value={participant}
                  onChange={(event) => setParticipant(event.target.value)}
                >
                  <option value="all">all</option>
                  {[
                    ...new Set(
                      dossier.observations.map((item) => item.participant),
                    ),
                  ].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <button
                className="sv-text-button"
                onClick={() => setSelectedEvidence(null)}
              >
                Show all evidence
              </button>
            </div>
            <h3>Task completion</h3>
            <div className="sv-task-bars">
              {dossier.tasks.map((task) => {
                const observations = filtered.filter(
                  (item) => item.taskId === task.taskId,
                );
                const successful = observations.filter(
                  (item) => item.outcome === "success",
                ).length;
                return (
                  <button
                    key={task.taskId}
                    className="sv-task-bar"
                    title={`${successful} successful / ${observations.length} observed; click for evidence`}
                    onClick={() => inspect(observations.map((item) => item.id))}
                  >
                    <span>{task.title}</span>
                    <span className="sv-bar-track">
                      <span
                        style={{
                          width: `${observations.length ? (successful / observations.length) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <strong>
                      {observations.length
                        ? `${successful}/${observations.length}`
                        : "Not yet tested"}
                    </strong>
                  </button>
                );
              })}
            </div>
            <p className="sv-limitation">
              Per-task completion across the tested cohort. These are not
              instrumented conversion funnels.
            </p>
            <h3>Recorded time on task</h3>
            {recordedTimes.length ? (
              <>
                <div
                  className="sv-histogram"
                  aria-label="Task time distribution"
                >
                  {timingBuckets.map((bucket) => (
                    <button
                      key={bucket.start}
                      aria-label={`${bucket.items.length} task attempts, ${bucket.start} to under ${bucket.end} seconds. View evidence.`}
                      title={`${bucket.items.length} recorded attempts · ${bucket.start} to under ${bucket.end} seconds`}
                      onClick={() =>
                        inspect(bucket.items.map((item) => item.id))
                      }
                    >
                      <strong>{bucket.items.length}</strong>
                      <span className="sv-histogram-track">
                        <span
                          style={{
                            height: `${(bucket.items.length / Math.max(1, ...timingBuckets.map((item) => item.items.length))) * 100}%`,
                          }}
                        />
                      </span>
                      <span>
                        {bucket.start}–{bucket.end}s
                      </span>
                    </button>
                  ))}
                </div>
                <p className="sv-limitation">
                  {recordedTimes.length} recorded task attempts. Select a time
                  range to inspect its observations.
                </p>
              </>
            ) : (
              <p>
                {dossier.metrics.attempts
                  ? "No recorded times match these filters."
                  : "Not yet tested. Testers can time each task or enter its actual duration."}
              </p>
            )}
            <div className="sv-severities">
              {Object.entries(dossier.metrics.severities).map(
                ([severity, count]) => (
                  <span
                    key={severity}
                    className={`sv-badge sv-severity-${severity}`}
                  >
                    {severity} ·{" "}
                    {dossier.metrics.attempts ? count : "Not yet tested"}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="sv-card">
            <h2>Priority findings</h2>
            {dossier.issues.length ? (
              dossier.issues.map((issue) => (
                <article className="sv-issue" key={issue.id}>
                  <div>
                    <h3>{issue.title}</h3>
                    <span className={`sv-badge sv-severity-${issue.severity}`}>
                      {issue.severity}
                    </span>
                  </div>
                  <p>{issue.description}</p>
                  <p>
                    <strong>Recommended change:</strong> {issue.recommendation}
                  </p>
                  <button
                    className="sv-text-button"
                    onClick={() => inspect(issue.sourceIds)}
                  >
                    {issue.affectedParticipants} affected participants · inspect{" "}
                    {issue.sourceIds.length} observations
                  </button>
                </article>
              ))
            ) : (
              <p>
                {dossier.metrics.attempts
                  ? "No reviewed issues recorded."
                  : "Not yet tested"}
              </p>
            )}
          </div>
          <div className="sv-card" id="sv-evidence">
            <h2>Underlying evidence</h2>
            {visibleEvidence.length ? (
              [...new Set(visibleEvidence.map((item) => item.participant))].map(
                (name) => {
                  const entries = visibleEvidence.filter(
                    (item) => item.participant === name,
                  );
                  return (
                    <details
                      className="sv-participant-results"
                      key={name}
                      open={selectedEvidence !== null}
                    >
                      <summary>
                        <strong>{name}</strong>
                        <span>
                          {entries.length} observations · {entries[0].device}
                        </span>
                      </summary>
                      {entries.map((item) => (
                        <Evidence key={item.id} item={item} />
                      ))}
                    </details>
                  );
                },
              )
            ) : (
              <p>
                {dossier.metrics.attempts
                  ? "No observations match this filter."
                  : "Not yet tested. Reviewed task observations will appear here."}
              </p>
            )}
          </div>
        </>
      )}
      {section === "report" && (
        <>
          <div className="sv-card">
            <div className="sv-card-heading">
              <div>
                <h2>Validation dossier</h2>
                <p>
                  Research, test methodology, results, findings and next
                  experiments.
                </p>
              </div>
              <span className="sv-badge">
                {dossier.report?.status || "Evidence in progress"}
              </span>
            </div>
            <h3>{dossier.verdict.status}</h3>
            <p>{dossier.executiveSummary}</p>
            <ul className="sv-limits">
              {dossier.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>Export report</h3>
            <div className="sv-exports">
              {formats.map((format) => (
                <button
                  className="mvp-btn"
                  key={format}
                  disabled={unavailable}
                  onClick={() =>
                    void run(`Exporting ${format.toUpperCase()}`, () =>
                      exportValidationDossier(format, dossier),
                    )
                  }
                >
                  <Download size={17} />
                  {format === "html" ? "Web report" : format.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="sv-limitation">
              Web report downloads an interactive HTML file. Exports use
              anonymous participant labels; approved, consented media is
              included.
            </p>
            {campaign && (
              <Link
                className="sv-text-button"
                to={
                  dossier.report?.status === "published"
                    ? `/campaigns/${campaign.id}/results`
                    : `/admin?campaign=${campaign.id}&tab=report`
                }
              >
                {dossier.report?.status === "published"
                  ? "Open published report"
                  : "Review & publish report in Operations"}
              </Link>
            )}
            {campaign &&
              dossier.metrics.participants > 0 &&
              dossier.report?.status !== "published" && (
                <Link
                  className="mvp-btn"
                  to={`/admin?campaign=${campaign.id}&tab=report`}
                >
                  Analyse approved evidence <ArrowRight size={15} />
                </Link>
              )}
          </div>
          <div className="sv-card">
            <h2>Next experiments</h2>
            {dossier.nextExperiments.length ? (
              dossier.nextExperiments.map((experiment, index) => (
                <article className="sv-issue" key={index}>
                  <h3>{experiment.title}</h3>
                  <p>{experiment.instructions}</p>
                  <p>
                    <strong>Success criteria:</strong>{" "}
                    {experiment.successCriteria}
                  </p>
                  <button
                    className="sv-text-button"
                    disabled={
                      unavailable ||
                      (locked && dossier.report?.status !== "published")
                    }
                    onClick={() => {
                      if (campaign) {
                        setRetestUrl(campaign.url);
                        setChanges(
                          `${experiment.instructions}\nSuccess criteria: ${experiment.successCriteria}`,
                        );
                      } else {
                        setBrief({
                          ...brief,
                          desiredOutcome: experiment.instructions,
                          decision: experiment.title,
                        });
                        setSection("brief");
                      }
                    }}
                  >
                    {campaign ? "Use in retest" : "Use in next brief"}
                  </button>
                </article>
              ))
            ) : (
              <p>Complete the first test to identify the next experiment.</p>
            )}
          </div>
          {campaign && (
            <div className="sv-card">
              <h2>Retest changed product</h2>
              <p>
                Preserve this round, test the changed version and compare
                observed outcomes.
              </p>
              {dossier.comparison && (
                <div className="sv-comparison">
                  <strong>
                    Round {dossier.comparison.previousRound} →{" "}
                    {dossier.comparison.currentRound}
                  </strong>
                  <p>
                    Task success:{" "}
                    {dossier.comparison.previousSuccessRate === null
                      ? "Not yet tested"
                      : `${dossier.comparison.previousSuccessRate}%`}
                    {" → "}
                    {dossier.comparison.currentSuccessRate === null
                      ? "Not yet tested"
                      : `${dossier.comparison.currentSuccessRate}%`}
                  </p>
                  <p>
                    Median task time:{" "}
                    {dossier.comparison.previousMedianSeconds === null
                      ? "Not recorded"
                      : `${dossier.comparison.previousMedianSeconds}s`}{" "}
                    →{" "}
                    {dossier.comparison.currentMedianSeconds === null
                      ? "Not recorded"
                      : `${dossier.comparison.currentMedianSeconds}s`}
                  </p>
                  <p>{dossier.comparison.limitation}</p>
                </div>
              )}
              <div className="sv-form-grid">
                <label>
                  Changed product URL
                  <input
                    type="url"
                    value={retestUrl}
                    onChange={(e) => setRetestUrl(e.target.value)}
                    placeholder={campaign.url}
                  />
                </label>
                <label>
                  Changes to test
                  <textarea
                    value={changes}
                    onChange={(e) => setChanges(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="mvp-btn mvp-btn-dark"
                disabled={unavailable || dossier.report?.status !== "published"}
                onClick={retest}
              >
                Create next round <ArrowRight size={15} />
              </button>
              {dossier.report?.status !== "published" && (
                <p className="sv-limitation">
                  Publish the reviewed report before creating the next round.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Evidence({ item }: { item: ValidationObservation }) {
  return (
    <article className="sv-evidence-item" id={`evidence-${item.id}`}>
      <header>
        <strong>
          {item.participant} · {item.taskTitle}
        </strong>
        <span className="sv-badge">{item.outcome}</span>
      </header>
      <p>{item.answer}</p>
      <p>{item.observation}</p>
      <small>
        QA-approved human observation ·{" "}
        {item.durationSeconds === null
          ? "Time not recorded"
          : `${item.durationSeconds}s`}{" "}
        · {item.device}
      </small>
      <div className="sv-evidence-assets">
        {item.consentConfirmed &&
          item.evidence.map((asset) =>
            asset.kind === "image" ? (
              <a
                key={asset.id}
                href={asset.url}
                target="_blank"
                rel="noreferrer"
              >
                <img src={asset.url} alt={asset.name} />
              </a>
            ) : (
              <a
                key={asset.id}
                href={asset.url}
                target="_blank"
                rel="noreferrer"
              >
                {asset.name}
              </a>
            ),
          )}
      </div>
    </article>
  );
}
