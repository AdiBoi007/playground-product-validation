import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Download,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import type { Sandbox } from "./sandbox";
import type { ValidationDossier } from "./validation";
import type { ValidationExportFormat } from "./validation-export";
import type {
  TwinArtifact,
  TwinAssertion,
  TwinBrowserEvent,
  TwinExperimentSpec,
  TwinHumanMatch,
  TwinIssueReview,
  TwinJob,
  TwinPersona,
  TwinRun,
  TwinStep,
  TwinTask,
  TwinWorkspace,
} from "./twin";
import {
  buildDefaultTwinPersonas,
  buildTwinAnalytics,
  calibrateTwinAgainstHumans,
  compareTwinJobs,
  validateTwinExperimentSpec,
} from "./twin";
import {
  cancelTwinJob,
  createTwinJob,
  downloadTwinArtifact,
  getTwinArtifact,
  getTwinConfiguration,
  getTwinJob,
  retestTwinJob,
  retryTwinJob,
} from "./twin-client";
import type { TwinConfiguration } from "./twin-client";
import "./twin.css";

const terminal = new Set(["completed", "failed", "cancelled", "timed-out"]);
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
const stepNames: Record<TwinStep["type"], string> = {
  navigate: "Open page",
  click: "Click",
  fill: "Fill field",
  select: "Select option",
  press: "Press key",
  scroll: "Scroll",
  back: "Go back",
  wait: "Wait",
  assert: "Check assertion",
};
const assertionNames: Record<TwinAssertion["type"], string> = {
  "url-contains": "URL contains",
  "text-visible": "Text is visible",
  "selector-visible": "Element is visible",
  "selector-hidden": "Element is hidden",
};
const uid = () => crypto.randomUUID();
const rate = (value: number | null) =>
  value === null ? "Not yet run" : `${Math.round(value * 10) / 10}%`;
const seconds = (value: number | null) =>
  value === null ? "Not recorded" : `${Math.round(value * 10) / 10}s`;
const cash = (value: number | null) =>
  value === null ? "Not recorded" : `$${value.toFixed(4)}`;
const validOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

function initialSpec(sandbox: Sandbox): TwinExperimentSpec {
  if (sandbox.twin?.spec) return structuredClone(sandbox.twin.spec);
  const brief = sandbox.validation?.brief;
  const objective = brief?.desiredOutcome || brief?.decision || "";
  const targetUrl = brief?.targetUrl || sandbox.analysis?.product.url || "";
  return {
    mode: "functional",
    targetUrl,
    allowedOrigins: validOrigin(targetUrl) ? [validOrigin(targetUrl)] : [],
    authorizationConfirmed: false,
    productVersion: "",
    objective,
    tasks: (sandbox.validation?.plan?.tasks || []).map((task) => ({
      ...task,
      successCriteria: task.successCriteria || "",
      steps: [],
      assertions: [],
    })),
    personas: buildDefaultTwinPersonas(objective, 10, 1),
    settings: {
      runCount: 20,
      concurrency: 2,
      maxSteps: 25,
      maxDurationSeconds: 120,
      maxModelTokens: 0,
      maxCostUsd: 0,
      model: "gpt-6-luna",
      seed: 1,
    },
    approvedAt: "",
  };
}

function ArtifactViewer({
  jobId,
  artifact,
  onError,
}: {
  jobId: string;
  artifact: TwinArtifact;
  onError: (message: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  async function show() {
    if (loading || imageUrl) return;
    setLoading(true);
    try {
      const blob = await getTwinArtifact(jobId, artifact.id);
      if (!/^image\/(png|jpeg|webp)$/.test(blob.type))
        throw new Error("This evidence file is not a supported screenshot.");
      setImageUrl(URL.createObjectURL(blob));
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Screenshot could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div>
      <div className="mt-actions">
        {artifact.type === "screenshot" && !imageUrl && (
          <button
            className="mt-link"
            onClick={() => void show()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={13} className="mt-spin" />
            ) : (
              <Play size={13} />
            )}{" "}
            View screenshot
          </button>
        )}
        <button
          className="mt-link"
          onClick={() =>
            void downloadTwinArtifact(jobId, artifact.id, artifact.name).catch(
              (error: Error) => onError(error.message),
            )
          }
        >
          <Download size={13} />{" "}
          {artifact.type === "trace"
            ? "Download replayable trace"
            : `Download ${artifact.type}`}
        </button>
      </div>
      {imageUrl && (
        <img
          className="mt-screenshot"
          src={imageUrl}
          alt={`Browser evidence: ${artifact.name}`}
        />
      )}
    </div>
  );
}

function Timeline({
  job,
  run,
  taskId,
  onError,
}: {
  job: TwinJob;
  run: TwinRun;
  taskId?: string;
  onError: (message: string) => void;
}) {
  const events = [...run.events]
    .filter((event) => !taskId || event.taskId === taskId)
    .sort((a, b) => a.elapsedMs - b.elapsedMs);
  return (
    <div className="mt-timeline">
      {events.map((event: TwinBrowserEvent) => (
        <div key={event.id} className="mt-event" id={`twin-event-${event.id}`}>
          <time title={event.at}>{(event.elapsedMs / 1000).toFixed(1)}s</time>
          <div>
            <h4>{event.type.replaceAll("-", " ")}</h4>
            <p>{event.summary}</p>
            <p className="mt-note">{event.url}</p>
            {event.screenshotId &&
              run.artifacts.find(
                (artifact) => artifact.id === event.screenshotId,
              ) && (
                <ArtifactViewer
                  jobId={job.id}
                  artifact={run.artifacts.find(
                    (artifact) => artifact.id === event.screenshotId,
                  )!}
                  onError={onError}
                />
              )}
          </div>
        </div>
      ))}
      {!events.length && (
        <p className="mt-empty">No browser events recorded.</p>
      )}
    </div>
  );
}

export function MarketTwinPanel({
  sandbox,
  dossier,
  disabled = false,
  onSave,
  onBusy,
  onExport,
}: {
  sandbox: Sandbox;
  dossier?: ValidationDossier;
  disabled?: boolean;
  onSave: (value: TwinWorkspace) => Promise<void>;
  onBusy?: (busy: boolean) => void;
  onExport?: (format: ValidationExportFormat, job: TwinJob) => Promise<void>;
}) {
  const [spec, setSpec] = useState(() => initialSpec(sandbox));
  const [section, setSection] = useState(
    sandbox.twin?.activeJobId ? "runs" : "setup",
  );
  const [configuration, setConfiguration] = useState<TwinConfiguration | null>(
    null,
  );
  const [configurationError, setConfigurationError] = useState("");
  const [job, setJob] = useState<TwinJob | null>(null);
  const [previousJob, setPreviousJob] = useState<TwinJob | null>(null);
  const [activeJobId, setActiveJobId] = useState(
    sandbox.twin?.activeJobId || "",
  );
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [approved, setApproved] = useState(false);
  const [origins, setOrigins] = useState(spec.allowedOrigins.join("\n"));
  const [writePaths, setWritePaths] = useState(
    (spec.authorizedWritePaths || []).join("\n"),
  );
  const [retestSource, setRetestSource] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [personaFilter, setPersonaFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [matchRunId, setMatchRunId] = useState("");
  const [matchTaskId, setMatchTaskId] = useState("");
  const [matchObservationId, setMatchObservationId] = useState("");
  const [matchNote, setMatchNote] = useState("");
  const [matchConfirmed, setMatchConfirmed] = useState(false);
  const [reviewIssueId, setReviewIssueId] = useState("");
  const [reviewHumanIssueId, setReviewHumanIssueId] = useState("");
  const [reviewVerdict, setReviewVerdict] =
    useState<TwinIssueReview["verdict"]>("inconclusive");
  const [reviewObservationIds, setReviewObservationIds] = useState<string[]>(
    [],
  );
  const [reviewNote, setReviewNote] = useState("");
  const orphanJob = useRef<TwinJob | null>(null);
  const mounted = useRef(true);
  const unavailable = disabled || Boolean(working);
  const currentWorkspace = useRef(sandbox.twin);
  currentWorkspace.current = sandbox.twin;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusy?.(false);
    };
  }, [onBusy]);

  useEffect(() => {
    const controller = new AbortController();
    void getTwinConfiguration(controller.signal)
      .then(setConfiguration)
      .catch((error: Error) => {
        if (!controller.signal.aborted) setConfigurationError(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await getTwinJob(activeJobId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(next);
        setPollError("");
        if (!terminal.has(next.status))
          timer = setTimeout(() => void refresh(), 2000);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPollError(
          error instanceof Error
            ? error.message
            : "Could not refresh browser runs.",
        );
        timer = setTimeout(() => void refresh(), 6000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!job?.parentJobId) return;
    const controller = new AbortController();
    void getTwinJob(job.parentJobId, controller.signal)
      .then(setPreviousJob)
      .catch(() => undefined);
    return () => controller.abort();
  }, [job?.parentJobId]);

  const analytics = useMemo(
    () => (job ? buildTwinAnalytics(job) : null),
    [job],
  );
  const filteredAnalytics = useMemo(
    () =>
      job
        ? buildTwinAnalytics(job, {
            ...(deviceFilter
              ? { device: deviceFilter as TwinPersona["device"] }
              : {}),
            ...(personaFilter ? { personaId: personaFilter } : {}),
            ...(taskFilter ? { taskId: taskFilter } : {}),
            ...(outcomeFilter
              ? {
                  outcome: outcomeFilter as
                    | "success"
                    | "failure"
                    | "blocked"
                    | "abandoned"
                    | "assisted"
                    | "unknown",
                }
              : {}),
          })
        : null,
    [job, deviceFilter, personaFilter, taskFilter, outcomeFilter],
  );
  const comparison = useMemo(
    () =>
      job && previousJob && job.parentJobId === previousJob.id
        ? compareTwinJobs(job, previousJob)
        : null,
    [job, previousJob],
  );
  const calibration = useMemo(
    () =>
      job && dossier
        ? calibrateTwinAgainstHumans(
            job,
            dossier,
            sandbox.twin?.calibrationMatches || [],
            sandbox.twin?.issueReviews || [],
          )
        : null,
    [
      job,
      dossier,
      sandbox.twin?.calibrationMatches,
      sandbox.twin?.issueReviews,
    ],
  );
  const selectedRun = job?.runs.find((run) => run.id === selectedRunId);
  const filteredRuns =
    job?.runs.filter((run) => {
      const persona = job.spec.personas.find(
        (entry) => entry.id === run.personaId,
      );
      return (
        (!deviceFilter || persona?.device === deviceFilter) &&
        (!personaFilter || run.personaId === personaFilter) &&
        (!taskFilter ||
          run.taskResults.some((result) => result.taskId === taskFilter)) &&
        (!outcomeFilter ||
          run.taskResults.some(
            (result) =>
              (!taskFilter || result.taskId === taskFilter) &&
              result.outcome === outcomeFilter,
          ))
      );
    }) || [];

  async function action(name: string, callback: () => Promise<void>) {
    if (unavailable) return;
    setError("");
    setWorking(name);
    onBusy?.(true);
    try {
      await callback();
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "This action could not be completed.",
        );
    } finally {
      if (mounted.current) setWorking("");
      onBusy?.(false);
    }
  }
  function changeSpec(value: Partial<TwinExperimentSpec>) {
    setSpec((current) => ({ ...current, ...value, approvedAt: "" }));
    setApproved(false);
  }
  function updateTask(id: string, value: Partial<TwinTask>) {
    changeSpec({
      tasks: spec.tasks.map((task) =>
        task.id === id ? { ...task, ...value } : task,
      ),
    });
  }
  function updatePersona(id: string, value: Partial<TwinPersona>) {
    changeSpec({
      personas: spec.personas.map((persona) =>
        persona.id === id ? { ...persona, ...value } : persona,
      ),
    });
  }
  function updateSettings(value: Partial<TwinExperimentSpec["settings"]>) {
    changeSpec({ settings: { ...spec.settings, ...value } });
  }
  function preparedSpec(approvedAt = ""): TwinExperimentSpec {
    return {
      ...spec,
      settings: {
        ...spec.settings,
        model: configuration?.model || spec.settings.model,
      },
      allowedOrigins: origins
        .split(/\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      authorizedWritePaths: writePaths
        .split(/\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      approvedAt,
    };
  }
  async function save(value: Partial<TwinWorkspace>) {
    const previous = currentWorkspace.current || { jobIds: [] };
    await onSave({ ...previous, ...value });
  }
  async function attach(next: TwinJob) {
    setJob(next);
    setActiveJobId(next.id);
    setSelectedRunId("");
    setSection("runs");
    orphanJob.current = next;
    await save({
      spec: next.spec,
      activeJobId: next.id,
      jobIds: [
        ...new Set([...(currentWorkspace.current?.jobIds || []), next.id]),
      ],
    });
    orphanJob.current = null;
  }
  async function start() {
    if (!configuration?.configured)
      throw new Error("Connect the browser worker before starting a run.");
    if (spec.mode === "behavioural" && !configuration.behaviouralConfigured)
      throw new Error("Behavioural testing needs the worker's model API key.");
    if (!approved)
      throw new Error(
        "Approve the tasks, assertions and test conditions before running.",
      );
    const approvedSpec = validateTwinExperimentSpec(
      preparedSpec(new Date().toISOString()),
    );
    if (orphanJob.current) return attach(orphanJob.current);
    const next = retestSource
      ? await retestTwinJob(retestSource, approvedSpec)
      : await createTwinJob(sandbox.id, approvedSpec);
    await attach(next);
  }
  function prepareRetest() {
    if (!job) return;
    setSpec({
      ...structuredClone(job.spec),
      productVersion: "",
      authorizationConfirmed: false,
      approvedAt: "",
    });
    setOrigins(job.spec.allowedOrigins.join("\n"));
    setWritePaths((job.spec.authorizedWritePaths || []).join("\n"));
    setApproved(false);
    setRetestSource(job.id);
    setSection("setup");
  }
  async function addMatch() {
    if (
      !job ||
      !matchRunId ||
      !matchTaskId ||
      !matchObservationId ||
      !matchConfirmed ||
      matchNote.trim().length < 5
    )
      throw new Error(
        "Select both outcomes, confirm comparable conditions and add a review note.",
      );
    const value: TwinHumanMatch = {
      id: uid(),
      jobId: job.id,
      runId: matchRunId,
      taskId: matchTaskId,
      observationId: matchObservationId,
      reviewerNote: matchNote.trim(),
      reviewedAt: new Date().toISOString(),
    };
    await save({
      calibrationMatches: [
        ...(currentWorkspace.current?.calibrationMatches || []),
        value,
      ],
    });
    setMatchNote("");
    setMatchConfirmed(false);
  }
  async function addIssueReview() {
    if (
      !job ||
      !reviewObservationIds.length ||
      reviewNote.trim().length < 5 ||
      (reviewVerdict === "missed" ? !reviewHumanIssueId : !reviewIssueId)
    )
      throw new Error(
        "Choose the finding, supporting human observations and a review note.",
      );
    const value: TwinIssueReview = {
      id: uid(),
      jobId: job.id,
      ...(reviewIssueId && reviewVerdict !== "missed"
        ? { issueId: reviewIssueId }
        : {}),
      ...(reviewHumanIssueId ? { humanIssueId: reviewHumanIssueId } : {}),
      verdict: reviewVerdict,
      humanObservationIds: reviewObservationIds,
      reviewerNote: reviewNote.trim(),
      reviewedAt: new Date().toISOString(),
    };
    await save({
      issueReviews: [...(currentWorkspace.current?.issueReviews || []), value],
    });
    setReviewNote("");
    setReviewObservationIds([]);
  }

  return (
    <section className="mt-panel" aria-label="Market Twin">
      <nav aria-label="Market Twin sections">
        {[
          ["setup", "Experiment"],
          ["runs", "Browser runs"],
          ["findings", "Findings"],
          ["human", "Human comparison"],
          ["report", "Report & retest"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
            disabled={Boolean(working)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="mt-error" role="alert">
          {error}
        </div>
      )}
      {configurationError && (
        <div className="mt-error" role="status">
          {configurationError}
        </div>
      )}
      {pollError && (
        <div className="mt-error" role="status">
          Results could not refresh: {pollError}. The worker keeps the
          experiment; refresh will retry.
        </div>
      )}
      {working && (
        <p className="mt-note" role="status">
          <Loader2 size={13} className="mt-spin" /> {working}
        </p>
      )}

      {section === "setup" && (
        <>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>
                  {retestSource ? "Retest experiment" : "Browser experiment"}
                </h2>
                <p>
                  Run approved tasks against your product. Browser outcomes are
                  simulated evidence.
                </p>
              </div>
              <span className="mt-badge">
                {configuration?.configured
                  ? "Worker connected"
                  : configuration === null && !configurationError
                    ? "Connecting"
                    : "Worker required"}
              </span>
            </div>
            <div className="mt-grid">
              <label>
                Execution mode
                <select
                  value={spec.mode}
                  disabled={unavailable}
                  onChange={(event) =>
                    changeSpec({
                      mode: event.target.value as TwinExperimentSpec["mode"],
                    })
                  }
                >
                  <option value="functional">
                    Functional — execute defined steps
                  </option>
                  <option value="behavioural">
                    Behavioural — goal-directed AI navigation
                  </option>
                </select>
              </label>
              <label>
                Product version
                <input
                  value={spec.productVersion}
                  placeholder="e.g. onboarding-v2"
                  disabled={unavailable}
                  onChange={(event) =>
                    changeSpec({ productVersion: event.target.value })
                  }
                />
              </label>
              <label className="mt-wide">
                Product URL
                <input
                  type="url"
                  value={spec.targetUrl}
                  placeholder="https://staging.yourproduct.com"
                  disabled={unavailable}
                  onChange={(event) => {
                    const url = event.target.value;
                    changeSpec({ targetUrl: url });
                    const origin = validOrigin(url);
                    if (origin) setOrigins(origin);
                  }}
                />
              </label>
              <label className="mt-wide">
                What should users accomplish?
                <textarea
                  value={spec.objective}
                  placeholder="Complete onboarding and create a first project."
                  disabled={unavailable}
                  onChange={(event) =>
                    changeSpec({ objective: event.target.value })
                  }
                />
              </label>
              <label>
                Allowed origins
                <textarea
                  value={origins}
                  placeholder="https://staging.yourproduct.com"
                  disabled={unavailable}
                  onChange={(event) => {
                    setOrigins(event.target.value);
                    setApproved(false);
                  }}
                />
              </label>
              <label>
                Approved test form paths
                <textarea
                  value={writePaths}
                  placeholder="/api/test-signups"
                  disabled={unavailable}
                  onChange={(event) => {
                    setWritePaths(event.target.value);
                    setApproved(false);
                  }}
                />
                <span className="mt-note">
                  Only worker-approved paths can write synthetic test data.
                </span>
              </label>
            </div>
            <label className="mt-checkbox">
              <input
                type="checkbox"
                checked={spec.authorizationConfirmed}
                disabled={unavailable}
                onChange={(event) =>
                  changeSpec({ authorizationConfirmed: event.target.checked })
                }
              />
              <span>
                I own these targets or have permission to test them using
                synthetic data.
              </span>
            </label>
            {spec.mode === "behavioural" && (
              <p className="mt-note">
                AI navigation uses your configured model key. Completion still
                requires the assertions below; it does not measure real customer
                demand.
              </p>
            )}
            <div className="mt-actions">
              <button
                className="mt-button"
                disabled={unavailable}
                onClick={() =>
                  void action("Saving experiment", () =>
                    save({ spec: preparedSpec() }),
                  )
                }
              >
                <Check size={14} /> Save draft
              </button>
              {retestSource && (
                <button
                  className="mt-link"
                  disabled={unavailable}
                  onClick={() => setRetestSource("")}
                >
                  Use as a new experiment
                </button>
              )}
            </div>
          </div>

          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Tasks & completion checks</h2>
                <p>
                  {spec.mode === "functional"
                    ? "Define browser actions and an observable success check for each task."
                    : "Set goals and observable success checks. Agents choose their own browser actions."}
                </p>
              </div>
              <button
                className="mt-link"
                disabled={unavailable || spec.tasks.length >= 8}
                onClick={() =>
                  changeSpec({
                    tasks: [
                      ...spec.tasks,
                      {
                        id: uid(),
                        title: "",
                        instructions: "",
                        question: "What prevented completion?",
                        successCriteria: "",
                        steps: [],
                        assertions: [],
                      },
                    ],
                  })
                }
              >
                <Plus size={14} /> Add task
              </button>
            </div>
            {!spec.tasks.length && (
              <p className="mt-empty">
                Add a task, or design a mission in Validation first.
              </p>
            )}
            {spec.tasks.map((task, taskIndex) => (
              <details className="mt-task" key={task.id} open={taskIndex === 0}>
                <summary>
                  {taskIndex + 1}. {task.title || "Untitled task"}
                  <span>
                    {task.steps?.length || 0} actions ·{" "}
                    {task.assertions?.length || 0} completion checks
                  </span>
                </summary>
                <div className="mt-grid">
                  <label>
                    Task title
                    <input
                      value={task.title}
                      disabled={unavailable}
                      onChange={(event) =>
                        updateTask(task.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Completion criterion
                    <input
                      value={task.successCriteria}
                      disabled={unavailable}
                      onChange={(event) =>
                        updateTask(task.id, {
                          successCriteria: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="mt-wide">
                    Instructions
                    <textarea
                      value={task.instructions}
                      disabled={unavailable}
                      onChange={(event) =>
                        updateTask(task.id, {
                          instructions: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="mt-subheading">
                  <h3>
                    {spec.mode === "functional"
                      ? "Browser actions"
                      : "Optional starting actions"}
                  </h3>
                  <button
                    className="mt-link"
                    disabled={unavailable}
                    onClick={() =>
                      updateTask(task.id, {
                        steps: [
                          ...(task.steps || []),
                          {
                            id: uid(),
                            type: "click",
                            description: "",
                            selector: "",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={13} /> Add action
                  </button>
                </div>
                {(task.steps || []).map((step, stepIndex) => (
                  <div className="mt-step" key={step.id}>
                    <label>
                      Action {stepIndex + 1}
                      <select
                        value={step.type}
                        disabled={unavailable}
                        onChange={(event) =>
                          updateTask(task.id, {
                            steps: task.steps?.map((entry) =>
                              entry.id === step.id
                                ? {
                                    id: entry.id,
                                    type: event.target
                                      .value as TwinStep["type"],
                                    description:
                                      stepNames[
                                        event.target.value as TwinStep["type"]
                                      ],
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {Object.entries(stepNames).map(([value, name]) => (
                          <option key={value} value={value}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {step.type === "navigate" ? (
                      <label>
                        Page URL
                        <input
                          value={step.url || ""}
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? {
                                      ...entry,
                                      url: event.target.value,
                                      description: `Open ${event.target.value}`,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    ) : step.type === "wait" ? (
                      <label>
                        Wait (milliseconds)
                        <input
                          type="number"
                          min="0"
                          max="5000"
                          value={step.milliseconds ?? 500}
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? {
                                      ...entry,
                                      milliseconds: Number(event.target.value),
                                      description: `Wait ${event.target.value}ms`,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    ) : step.type === "back" ? (
                      <label>
                        Description
                        <input
                          value={step.description || "Go back"}
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? {
                                      ...entry,
                                      description: event.target.value,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    ) : step.type === "assert" ? (
                      <label>
                        Completion check
                        <select
                          value={step.assertionId || ""}
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? {
                                      ...entry,
                                      assertionId: event.target.value,
                                      description: "Check task completion",
                                    }
                                  : entry,
                              ),
                            })
                          }
                        >
                          <option value="">Choose a check</option>
                          {(task.assertions || []).map((assertion) => (
                            <option key={assertion.id} value={assertion.id}>
                              {assertion.description || assertion.value}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        Element selector
                        <input
                          value={step.selector || ""}
                          placeholder='e.g. button:has-text("Create project")'
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? {
                                      ...entry,
                                      selector: event.target.value,
                                      description: `${stepNames[step.type]} ${event.target.value}`,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    {["fill", "select", "scroll"].includes(step.type) && (
                      <label>
                        {step.type === "scroll"
                          ? "Scroll distance"
                          : "Synthetic value"}
                        <input
                          value={step.value || ""}
                          placeholder={
                            step.type === "fill"
                              ? "playground-test@example.invalid"
                              : ""
                          }
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? { ...entry, value: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    {step.type === "press" && (
                      <label>
                        Key
                        <input
                          value={step.key || ""}
                          placeholder="Enter"
                          disabled={unavailable}
                          onChange={(event) =>
                            updateTask(task.id, {
                              steps: task.steps?.map((entry) =>
                                entry.id === step.id
                                  ? { ...entry, key: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    <button
                      className="mt-remove"
                      aria-label={`Remove action ${stepIndex + 1} from task ${taskIndex + 1}`}
                      disabled={unavailable}
                      onClick={() =>
                        updateTask(task.id, {
                          steps: task.steps?.filter(
                            (entry) => entry.id !== step.id,
                          ),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="mt-subheading">
                  <h3>Completion checks</h3>
                  <button
                    className="mt-link"
                    disabled={unavailable}
                    onClick={() =>
                      updateTask(task.id, {
                        assertions: [
                          ...(task.assertions || []),
                          {
                            id: uid(),
                            type: "text-visible",
                            value: "",
                            description: "",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={13} /> Add check
                  </button>
                </div>
                {(task.assertions || []).map((assertion, index) => (
                  <div className="mt-step" key={assertion.id}>
                    <label>
                      Check {index + 1}
                      <select
                        value={assertion.type}
                        disabled={unavailable}
                        onChange={(event) =>
                          updateTask(task.id, {
                            assertions: task.assertions?.map((entry) =>
                              entry.id === assertion.id
                                ? {
                                    ...entry,
                                    type: event.target
                                      .value as TwinAssertion["type"],
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {Object.entries(assertionNames).map(([value, name]) => (
                          <option key={value} value={value}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Expected value
                      <input
                        value={assertion.value}
                        placeholder={
                          assertion.type === "url-contains"
                            ? "/welcome"
                            : assertion.type.includes("selector")
                              ? '[data-testid="project-created"]'
                              : "Project created"
                        }
                        disabled={unavailable}
                        onChange={(event) =>
                          updateTask(task.id, {
                            assertions: task.assertions?.map((entry) =>
                              entry.id === assertion.id
                                ? {
                                    ...entry,
                                    value: event.target.value,
                                    description: `${assertionNames[assertion.type]}: ${event.target.value}`,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      className="mt-remove"
                      aria-label={`Remove check ${index + 1} from task ${taskIndex + 1}`}
                      disabled={unavailable}
                      onClick={() =>
                        updateTask(task.id, {
                          assertions: task.assertions?.filter(
                            (entry) => entry.id !== assertion.id,
                          ),
                          steps: task.steps?.filter(
                            (entry) => entry.assertionId !== assertion.id,
                          ),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="mt-link"
                  disabled={unavailable}
                  onClick={() =>
                    changeSpec({
                      tasks: spec.tasks.filter((entry) => entry.id !== task.id),
                    })
                  }
                >
                  Remove task
                </button>
              </details>
            ))}
          </div>

          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Simulated profiles</h2>
                <p>
                  Configurable goals, devices and constraints. These profiles
                  are not real participants.
                </p>
              </div>
              <span className="mt-badge">{spec.personas.length} profiles</span>
            </div>
            {spec.personas.map((persona, index) => (
              <details className="mt-profile" key={persona.id}>
                <summary>
                  {persona.name}
                  <span>
                    {persona.device} · {persona.experience} ·{" "}
                    {persona.timeBudgetSeconds}s limit
                  </span>
                </summary>
                <div className="mt-grid">
                  <label>
                    Profile name
                    <input
                      value={persona.name}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Device
                    <select
                      value={persona.device}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          device: event.target.value as TwinPersona["device"],
                        })
                      }
                    >
                      <option value="desktop">Desktop</option>
                      <option value="mobile">Mobile</option>
                    </select>
                  </label>
                  <label className="mt-wide">
                    Goal
                    <input
                      value={persona.goal}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, { goal: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Product experience
                    <select
                      value={persona.experience}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          experience: event.target
                            .value as TwinPersona["experience"],
                        })
                      }
                    >
                      <option value="first-time">First-time</option>
                      <option value="familiar">Familiar</option>
                      <option value="expert">Expert</option>
                    </select>
                  </label>
                  <label>
                    Technical proficiency
                    <select
                      value={persona.technicalProficiency}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          technicalProficiency: event.target
                            .value as TwinPersona["technicalProficiency"],
                        })
                      }
                    >
                      {["low", "medium", "high"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Motivation
                    <input
                      value={persona.motivation}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          motivation: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Time budget (seconds)
                    <input
                      type="number"
                      min="15"
                      max="1800"
                      value={persona.timeBudgetSeconds}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          timeBudgetSeconds: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Privacy sensitivity
                    <select
                      value={persona.privacySensitivity}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          privacySensitivity: event.target
                            .value as TwinPersona["privacySensitivity"],
                        })
                      }
                    >
                      {["low", "medium", "high"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Exploration
                    <select
                      value={persona.exploration}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          exploration: event.target
                            .value as TwinPersona["exploration"],
                        })
                      }
                    >
                      {["low", "medium", "high"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Previous knowledge
                    <input
                      value={persona.previousKnowledge || ""}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          previousKnowledge: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Budget constraint
                    <input
                      value={persona.budget || ""}
                      disabled={unavailable}
                      onChange={(event) =>
                        updatePersona(persona.id, {
                          budget: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  className="mt-link"
                  aria-label={`Remove profile ${index + 1}`}
                  disabled={unavailable || spec.personas.length <= 1}
                  onClick={() =>
                    changeSpec({
                      personas: spec.personas.filter(
                        (entry) => entry.id !== persona.id,
                      ),
                    })
                  }
                >
                  Remove profile
                </button>
              </details>
            ))}
            <div className="mt-actions">
              <button
                className="mt-button"
                disabled={unavailable || spec.personas.length >= 30}
                onClick={() => {
                  const generated = buildDefaultTwinPersonas(
                    spec.objective,
                    1,
                    spec.settings.seed + spec.personas.length,
                  )[0];
                  changeSpec({
                    personas: [
                      ...spec.personas,
                      {
                        ...generated,
                        id: uid(),
                        name: `Profile ${spec.personas.length + 1}`,
                      },
                    ],
                  });
                }}
              >
                <Plus size={14} /> Add profile
              </button>
              <button
                className="mt-link"
                disabled={unavailable}
                onClick={() =>
                  changeSpec({
                    personas: buildDefaultTwinPersonas(
                      spec.objective,
                      10,
                      spec.settings.seed,
                    ),
                  })
                }
              >
                Reset to 10 varied profiles
              </button>
            </div>
          </div>

          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Execution limits</h2>
                <p>
                  {spec.mode === "functional"
                    ? "Functional runs do not call the language model."
                    : "The worker enforces the model spend cap for the whole experiment."}
                </p>
              </div>
            </div>
            <div className="mt-budget">
              <label>
                Browser journeys
                <input
                  type="number"
                  min="1"
                  max={configuration?.limits?.maxRuns || 30}
                  value={spec.settings.runCount}
                  disabled={unavailable}
                  onChange={(event) =>
                    updateSettings({ runCount: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Concurrent browsers
                <input
                  type="number"
                  min="1"
                  max={configuration?.limits?.maxConcurrency || 3}
                  value={spec.settings.concurrency}
                  disabled={unavailable}
                  onChange={(event) =>
                    updateSettings({ concurrency: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Maximum actions per journey
                <input
                  type="number"
                  min="1"
                  max={configuration?.limits?.maxSteps || 40}
                  value={spec.settings.maxSteps}
                  disabled={unavailable}
                  onChange={(event) =>
                    updateSettings({ maxSteps: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Journey timeout (seconds)
                <input
                  type="number"
                  min="15"
                  max={configuration?.limits?.maxDurationSeconds || 180}
                  value={spec.settings.maxDurationSeconds}
                  disabled={unavailable}
                  onChange={(event) =>
                    updateSettings({
                      maxDurationSeconds: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Repeatable seed
                <input
                  type="number"
                  min="0"
                  value={spec.settings.seed}
                  disabled={unavailable}
                  onChange={(event) =>
                    updateSettings({ seed: Number(event.target.value) })
                  }
                />
              </label>
              {spec.mode === "behavioural" && (
                <>
                  <label>
                    Maximum model spend (USD)
                    <input
                      type="number"
                      min="0.01"
                      max={configuration?.limits?.maxCostUsd || 1}
                      step="0.01"
                      value={spec.settings.maxCostUsd}
                      disabled={unavailable}
                      onChange={(event) =>
                        updateSettings({
                          maxCostUsd: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Maximum model tokens
                    <input
                      type="number"
                      min="100"
                      max={configuration?.limits?.maxModelTokens || 20000}
                      step="100"
                      value={spec.settings.maxModelTokens}
                      disabled={unavailable}
                      onChange={(event) =>
                        updateSettings({
                          maxModelTokens: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Model
                    <input
                      value={configuration?.model || spec.settings.model}
                      readOnly
                    />
                  </label>
                </>
              )}
            </div>
            <label className="mt-checkbox">
              <input
                type="checkbox"
                checked={approved}
                disabled={unavailable}
                onChange={(event) => setApproved(event.target.checked)}
              />
              <span>
                I approve these tasks, completion checks, profiles and execution
                limits.
              </span>
            </label>
            <div className="mt-actions">
              <button
                className="mt-button mt-primary"
                disabled={
                  unavailable || !configuration?.configured || !approved
                }
                onClick={() =>
                  void action("Starting browser experiment", start)
                }
              >
                <Play size={14} />{" "}
                {orphanJob.current
                  ? "Save started experiment"
                  : retestSource
                    ? "Run retest"
                    : "Run browser experiment"}
              </button>
              <span className="mt-note">
                {spec.mode === "functional"
                  ? "Model cost: $0"
                  : `Model spend cap: $${spec.settings.maxCostUsd.toFixed(2)}`}
              </span>
            </div>
          </div>
        </>
      )}

      {section !== "setup" && !job && (
        <div className="mt-card">
          <div className="mt-heading">
            <div>
              <h2>{activeJobId ? "Loading experiment" : "Not yet run"}</h2>
              <p>
                {activeJobId
                  ? "Retrieving saved browser evidence."
                  : "Approve an experiment to collect browser evidence."}
              </p>
            </div>
          </div>
          <button className="mt-button" onClick={() => setSection("setup")}>
            Set up experiment <ArrowRight size={14} />
          </button>
        </div>
      )}

      {job && section === "runs" && (
        <>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>{job.spec.productVersion}</h2>
                <p>
                  {job.spec.mode === "functional"
                    ? "Functional browser execution"
                    : "Synthetic behavioural browser execution"}{" "}
                  · {job.spec.objective}
                </p>
              </div>
              <span className={`mt-badge mt-badge-${job.status}`}>
                {job.status.replaceAll("-", " ")}
              </span>
            </div>
            <div className="mt-metrics">
              <div>
                <strong>{analytics?.browserRuns || 0}</strong>
                <span>Browser runs started</span>
                <small>{job.spec.settings.runCount} requested</small>
              </div>
              <div>
                <strong>{analytics?.completedRuns || 0}</strong>
                <span>Runs completed</span>
              </div>
              <div>
                <strong>{analytics?.success ?? 0}</strong>
                <span>Asserted task successes</span>
                <small>{analytics?.attempts || 0} task attempts</small>
              </div>
              <div>
                <strong>{cash(analytics?.costUsd ?? null)}</strong>
                <span>Recorded model cost</span>
                <small>
                  {analytics?.inputTokens === null ||
                  analytics?.inputTokens === undefined
                    ? "Tokens not recorded"
                    : `${analytics.inputTokens + (analytics.outputTokens || 0)} tokens`}
                </small>
              </div>
            </div>
            <div
              className="mt-progress"
              role="progressbar"
              aria-label="Finished browser journeys"
              aria-valuemin={0}
              aria-valuemax={job.spec.settings.runCount}
              aria-valuenow={
                job.runs.filter((run) => terminal.has(run.status)).length
              }
            >
              <div
                style={{
                  width: `${Math.min(100, (job.runs.filter((run) => terminal.has(run.status)).length / job.spec.settings.runCount) * 100)}%`,
                }}
              />
            </div>
            {job.error && (
              <p className="mt-error" role="status">
                {job.error}
              </p>
            )}
            <div className="mt-actions">
              {!terminal.has(job.status) && (
                <button
                  className="mt-button"
                  disabled={unavailable}
                  onClick={() =>
                    void action("Cancelling browser experiment", async () => {
                      setJob(await cancelTwinJob(job.id));
                    })
                  }
                >
                  <Square size={13} /> Cancel remaining runs
                </button>
              )}
              {terminal.has(job.status) &&
                job.runs.some((run) =>
                  ["failed", "timed-out", "cancelled"].includes(run.status),
                ) && (
                  <button
                    className="mt-button"
                    disabled={unavailable}
                    onClick={() =>
                      void action("Retrying interrupted runs", async () => {
                        await attach(await retryTwinJob(job.id));
                      })
                    }
                  >
                    <RotateCcw size={14} /> Retry interrupted runs
                  </button>
                )}
              <button
                className="mt-link"
                onClick={() => setSection("findings")}
              >
                Inspect findings <ArrowRight size={13} />
              </button>
            </div>
          </div>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Run evidence</h2>
                <p>
                  Simulated profiles, recorded outcomes and replayable browser
                  traces.
                </p>
              </div>
            </div>
            <div className="mt-filter">
              <label>
                Device
                <select
                  value={deviceFilter}
                  onChange={(event) => setDeviceFilter(event.target.value)}
                >
                  <option value="">All devices</option>
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                </select>
              </label>
              <label>
                Profile
                <select
                  value={personaFilter}
                  onChange={(event) => setPersonaFilter(event.target.value)}
                >
                  <option value="">All profiles</option>
                  {job.spec.personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Task
                <select
                  value={taskFilter}
                  onChange={(event) => setTaskFilter(event.target.value)}
                >
                  <option value="">All tasks</option>
                  {job.spec.tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Outcome
                <select
                  value={outcomeFilter}
                  onChange={(event) => setOutcomeFilter(event.target.value)}
                >
                  <option value="">All outcomes</option>
                  {[
                    "success",
                    "failure",
                    "blocked",
                    "abandoned",
                    "assisted",
                    "unknown",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Profile / run</th>
                    <th>Status</th>
                    <th>Task outcomes</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((run, index) => {
                    const persona = job.spec.personas.find(
                      (entry) => entry.id === run.personaId,
                    );
                    return (
                      <tr key={run.id}>
                        <td>
                          {persona?.name || "Profile"}
                          <small>
                            {persona?.device} · run {index + 1}
                          </small>
                        </td>
                        <td>
                          <span className={`mt-badge mt-badge-${run.status}`}>
                            {run.status}
                          </span>
                        </td>
                        <td>
                          {run.taskResults.length
                            ? run.taskResults.map((result) => (
                                <div key={result.taskId}>
                                  {
                                    job.spec.tasks.find(
                                      (task) => task.id === result.taskId,
                                    )?.title
                                  }
                                  : {result.outcome}
                                  <small>
                                    {seconds(result.durationSeconds)}
                                  </small>
                                </div>
                              ))
                            : "Not yet run"}
                        </td>
                        <td>
                          <button
                            className="mt-link"
                            onClick={() => setSelectedRunId(run.id)}
                          >
                            View {run.events.length} events
                          </button>
                          {run.artifacts
                            .filter((artifact) => artifact.type === "trace")
                            .map((artifact) => (
                              <button
                                key={artifact.id}
                                className="mt-link"
                                onClick={() =>
                                  void downloadTwinArtifact(
                                    job.id,
                                    artifact.id,
                                    artifact.name,
                                  ).catch((error: Error) =>
                                    setError(error.message),
                                  )
                                }
                              >
                                <Download size={12} /> Trace
                              </button>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filteredRuns.length && (
              <p className="mt-empty">No runs match these filters.</p>
            )}
          </div>
          {selectedRun && (
            <div className="mt-card" id="twin-run-evidence">
              <div className="mt-heading">
                <div>
                  <h2>
                    {job.spec.personas.find(
                      (persona) => persona.id === selectedRun.personaId,
                    )?.name || "Browser journey"}
                  </h2>
                  <p>
                    Ordered browser actions and observations · {selectedRun.id}
                  </p>
                </div>
                <button
                  className="mt-remove"
                  aria-label="Close browser journey"
                  onClick={() => setSelectedRunId("")}
                >
                  <X size={16} />
                </button>
              </div>
              {selectedRun.error && (
                <p className="mt-error">{selectedRun.error}</p>
              )}
              {selectedRun.taskResults.map((result) => (
                <div className="mt-review" key={result.taskId}>
                  <h3>
                    {
                      job.spec.tasks.find((task) => task.id === result.taskId)
                        ?.title
                    }
                    : {result.outcome}
                  </h3>
                  <p className="mt-note">{result.reason}</p>
                  {result.assertions.map((assertion) => (
                    <p key={assertion.assertionId} className="mt-note">
                      {assertion.passed === null
                        ? "Not checked"
                        : assertion.passed
                          ? "Passed"
                          : "Failed"}{" "}
                      · {assertion.observed}
                    </p>
                  ))}
                </div>
              ))}
              <Timeline
                job={job}
                run={selectedRun}
                taskId={taskFilter || undefined}
                onError={setError}
              />
              {selectedRun.artifacts
                .filter((artifact) => artifact.type !== "screenshot")
                .map((artifact) => (
                  <ArtifactViewer
                    key={artifact.id}
                    jobId={job.id}
                    artifact={artifact}
                    onError={setError}
                  />
                ))}
              <p className="mt-note">
                Open downloaded traces with the Playwright trace viewer. Files
                can contain confidential product information.
              </p>
            </div>
          )}
        </>
      )}

      {job && section === "findings" && (
        <>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Simulation results</h2>
                <p>
                  {job.spec.mode === "functional"
                    ? "Measured workflow execution. These are software outcomes."
                    : "Measured outcomes from configured AI profiles. Human behaviour remains unvalidated."}
                </p>
              </div>
              <span className="mt-badge">Simulated browser evidence</span>
            </div>
            <div className="mt-metrics">
              <div>
                <strong>{rate(analytics?.successRate ?? null)}</strong>
                <span>Asserted task success</span>
                <small>
                  {analytics?.measuredAttempts || 0} measured attempts
                </small>
              </div>
              <div>
                <strong>{seconds(analytics?.medianSeconds ?? null)}</strong>
                <span>Median task duration</span>
              </div>
              <div>
                <strong>{analytics?.uniqueIssues ?? 0}</strong>
                <span>Evidence-linked issues</span>
              </div>
              <div>
                <strong>{seconds(analytics?.durationSeconds ?? null)}</strong>
                <span>Experiment elapsed time</span>
              </div>
            </div>
            <h3 className="mt-subheading">Task completion</h3>
            <div className="mt-task-chart">
              {(filteredAnalytics?.tasks || []).map((task) => (
                <button
                  key={task.taskId}
                  title={`${task.success} successes from ${task.measuredAttempts} measured attempts`}
                  onClick={() => {
                    setTaskFilter(task.taskId);
                    setSection("runs");
                  }}
                >
                  <span>{task.title}</span>
                  <div className="mt-chart-track">
                    <span style={{ width: `${task.successRate || 0}%` }} />
                  </div>
                  <small>
                    {task.successRate === null
                      ? "Not yet run"
                      : `${task.success}/${task.measuredAttempts}`}
                  </small>
                </button>
              ))}
            </div>
            <p className="mt-note">
              Source: recorded task assertions. Click a task to inspect the
              underlying runs.
            </p>
          </div>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Priority findings</h2>
                <p>Observed defects and inferred friction remain separate.</p>
              </div>
            </div>
            {!job.issues.length && (
              <p className="mt-empty">
                {job.status === "completed"
                  ? "No issues were recorded by this experiment. Coverage is limited to its tasks and checks."
                  : "No findings recorded yet."}
              </p>
            )}
            {job.issues.map((issue) => (
              <article className="mt-issue" key={issue.id}>
                <div className="mt-heading">
                  <h3>{issue.title}</h3>
                  <span className={`mt-badge mt-badge-${issue.severity}`}>
                    {issue.severity}
                  </span>
                </div>
                <p>{issue.description}</p>
                <dl>
                  <dt>Evidence basis</dt>
                  <dd>
                    {issue.basis === "observed"
                      ? "Observed browser finding"
                      : "AI inference"}{" "}
                    · {issue.category}
                  </dd>
                  <dt>Suggested change</dt>
                  <dd>{issue.proposedFix}</dd>
                  <dt>Observed in</dt>
                  <dd>
                    {issue.sourceRunIds.length} browser runs ·{" "}
                    {issue.sourceEventIds.length} events
                  </dd>
                  <dt>Affected page</dt>
                  <dd>{issue.affectedUrl}</dd>
                </dl>
                {issue.reproductionSteps.length > 0 && (
                  <details>
                    <summary className="mt-link">Reproduction steps</summary>
                    <ol>
                      {issue.reproductionSteps.map((step, index) => (
                        <li key={index} className="mt-note">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="mt-actions">
                  {issue.sourceRunIds.map((id, index) => (
                    <button
                      className="mt-link"
                      key={id}
                      onClick={() => {
                        setSelectedRunId(id);
                        setTaskFilter("");
                        setSection("runs");
                      }}
                    >
                      Inspect supporting run {index + 1}{" "}
                      <ArrowRight size={12} />
                    </button>
                  ))}
                  {issue.requiresHumanVerification && (
                    <button
                      className="mt-link"
                      onClick={() => {
                        setReviewIssueId(issue.id);
                        setSection("human");
                      }}
                    >
                      Requires human verification <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {job && section === "human" && (
        <>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Compare with human evidence</h2>
                <p>
                  Match reviewed observations from comparable tasks and product
                  versions.
                </p>
              </div>
              <span className="mt-badge">
                {dossier?.metrics.approvedSubmissions || 0} approved
                participants
              </span>
            </div>
            {!dossier?.observations.length ? (
              <>
                <p className="mt-empty">
                  No QA-approved human observations yet.
                </p>
                <div className="mt-actions">
                  <Link
                    className="mt-button"
                    to={
                      dossier?.campaign
                        ? `/founder/tests/${dossier.campaign.id}`
                        : "/founder/create"
                    }
                  >
                    Run a human campaign <ArrowRight size={14} />
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mt-metrics">
                  <div>
                    <strong>{calibration?.matchedAttempts || 0}</strong>
                    <span>Reviewed outcome pairs</span>
                  </div>
                  <div>
                    <strong>
                      {calibration?.agreement === null ||
                      calibration?.agreement === undefined
                        ? "Not reviewed"
                        : rate(calibration.agreement)}
                    </strong>
                    <span>Agreement on reviewed pairs</span>
                  </div>
                  <div>
                    <strong>{calibration?.confirmedIssues || 0}</strong>
                    <span>Human-confirmed issues</span>
                  </div>
                  <div>
                    <strong>{calibration?.falsePositives || 0}</strong>
                    <span>Reviewed false positives</span>
                  </div>
                </div>
                <p className="mt-note">
                  This comparison describes the reviewed sample. It does not
                  certify predictive accuracy.
                </p>
              </>
            )}
          </div>
          {!!dossier?.observations.length && (
            <>
              <div className="mt-card">
                <h2>Review an outcome pair</h2>
                <div className="mt-grid" style={{ marginTop: 20 }}>
                  <label>
                    Browser run
                    <select
                      value={matchRunId}
                      onChange={(event) => {
                        setMatchRunId(event.target.value);
                        setMatchTaskId("");
                      }}
                    >
                      <option value="">Choose a recorded run</option>
                      {job.runs
                        .filter((run) => run.taskResults.length)
                        .map((run, index) => (
                          <option key={run.id} value={run.id}>
                            {
                              job.spec.personas.find(
                                (persona) => persona.id === run.personaId,
                              )?.name
                            }{" "}
                            · run {index + 1}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Simulated task
                    <select
                      value={matchTaskId}
                      onChange={(event) => setMatchTaskId(event.target.value)}
                    >
                      <option value="">Choose a task outcome</option>
                      {job.runs
                        .find((run) => run.id === matchRunId)
                        ?.taskResults.map((result) => (
                          <option key={result.taskId} value={result.taskId}>
                            {
                              job.spec.tasks.find(
                                (task) => task.id === result.taskId,
                              )?.title
                            }
                            : {result.outcome}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="mt-wide">
                    Approved human observation
                    <select
                      value={matchObservationId}
                      onChange={(event) =>
                        setMatchObservationId(event.target.value)
                      }
                    >
                      <option value="">Choose a human outcome</option>
                      {dossier.observations.map((observation) => (
                        <option key={observation.id} value={observation.id}>
                          {observation.participant} · {observation.taskTitle}:{" "}
                          {observation.outcome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-wide">
                    Review note
                    <textarea
                      value={matchNote}
                      placeholder="Explain how the task, completion criterion and product version match."
                      onChange={(event) => setMatchNote(event.target.value)}
                    />
                  </label>
                </div>
                {dossier.observations.find(
                  (observation) => observation.id === matchObservationId,
                ) && (
                  <p className="mt-note">
                    Human observation:{" "}
                    {
                      dossier.observations.find(
                        (observation) => observation.id === matchObservationId,
                      )?.observation
                    }
                  </p>
                )}
                <label className="mt-checkbox">
                  <input
                    type="checkbox"
                    checked={matchConfirmed}
                    onChange={(event) =>
                      setMatchConfirmed(event.target.checked)
                    }
                  />
                  I reviewed the evidence and confirm comparable task and
                  product conditions.
                </label>
                <div className="mt-actions">
                  <button
                    className="mt-button"
                    disabled={unavailable}
                    onClick={() =>
                      void action("Saving reviewed outcome pair", addMatch)
                    }
                  >
                    <Check size={14} /> Save comparison
                  </button>
                </div>
              </div>
              <div className="mt-card">
                <h2>Review finding overlap</h2>
                <div className="mt-grid" style={{ marginTop: 20 }}>
                  <label>
                    Review verdict
                    <select
                      value={reviewVerdict}
                      onChange={(event) =>
                        setReviewVerdict(
                          event.target.value as TwinIssueReview["verdict"],
                        )
                      }
                    >
                      <option value="confirmed">
                        Confirmed by human evidence
                      </option>
                      <option value="not-substantiated">
                        Not substantiated after review
                      </option>
                      <option value="missed">
                        Human issue missed by simulation
                      </option>
                      <option value="inconclusive">Inconclusive</option>
                    </select>
                  </label>
                  <label>
                    Simulation finding
                    <select
                      value={reviewIssueId}
                      onChange={(event) => setReviewIssueId(event.target.value)}
                    >
                      <option value="">Choose a finding</option>
                      {job.issues.map((issue) => (
                        <option key={issue.id} value={issue.id}>
                          {issue.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-wide">
                    Human finding
                    <select
                      value={reviewHumanIssueId}
                      onChange={(event) =>
                        setReviewHumanIssueId(event.target.value)
                      }
                    >
                      <option value="">
                        Choose a human finding, if applicable
                      </option>
                      {dossier.issues.map((issue) => (
                        <option key={issue.id} value={issue.id}>
                          {issue.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-wide">
                    Review note
                    <textarea
                      value={reviewNote}
                      placeholder="What does the underlying evidence establish?"
                      onChange={(event) => setReviewNote(event.target.value)}
                    />
                  </label>
                </div>
                <h3 style={{ marginTop: 20 }}>
                  Supporting approved observations
                </h3>
                {dossier.observations.map((observation) => (
                  <label className="mt-checkbox" key={observation.id}>
                    <input
                      type="checkbox"
                      checked={reviewObservationIds.includes(observation.id)}
                      onChange={(event) =>
                        setReviewObservationIds((previous) =>
                          event.target.checked
                            ? [...previous, observation.id]
                            : previous.filter((id) => id !== observation.id),
                        )
                      }
                    />
                    {observation.participant} · {observation.taskTitle}:{" "}
                    {observation.outcome}
                  </label>
                ))}
                <div className="mt-actions">
                  <button
                    className="mt-button"
                    disabled={unavailable}
                    onClick={() =>
                      void action("Saving human finding review", addIssueReview)
                    }
                  >
                    <Check size={14} /> Save finding review
                  </button>
                </div>
              </div>
              <div className="mt-card">
                <h2>Reviewed evidence</h2>
                {(sandbox.twin?.calibrationMatches || [])
                  .filter((match) => match.jobId === job.id)
                  .map((match) => (
                    <div className="mt-review" key={match.id}>
                      <p className="mt-note">
                        Task comparison · {match.reviewerNote}
                      </p>
                      <button
                        className="mt-link"
                        disabled={unavailable}
                        onClick={() =>
                          void action("Removing comparison", () =>
                            save({
                              calibrationMatches: (
                                currentWorkspace.current?.calibrationMatches ||
                                []
                              ).filter((entry) => entry.id !== match.id),
                            }),
                          )
                        }
                      >
                        Remove comparison
                      </button>
                    </div>
                  ))}
                {(sandbox.twin?.issueReviews || [])
                  .filter((review) => review.jobId === job.id)
                  .map((review) => (
                    <div className="mt-review" key={review.id}>
                      <span className="mt-badge">
                        {review.verdict.replaceAll("-", " ")}
                      </span>
                      <p className="mt-note">{review.reviewerNote}</p>
                      <button
                        className="mt-link"
                        disabled={unavailable}
                        onClick={() =>
                          void action("Removing finding review", () =>
                            save({
                              issueReviews: (
                                currentWorkspace.current?.issueReviews || []
                              ).filter((entry) => entry.id !== review.id),
                            }),
                          )
                        }
                      >
                        Remove review
                      </button>
                    </div>
                  ))}
                {!!calibration?.invalidMatchIds.length && (
                  <p className="mt-note">
                    {calibration.invalidMatchIds.length} invalid or duplicated
                    comparisons were excluded.
                  </p>
                )}
                {calibration?.limitations.map((limitation) => (
                  <p className="mt-note" key={limitation}>
                    {limitation}
                  </p>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {job && section === "report" && (
        <>
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Experiment report</h2>
                <p>
                  {job.spec.productVersion} ·{" "}
                  {job.spec.mode === "functional"
                    ? "Functional execution"
                    : "Behavioural simulation"}
                </p>
              </div>
              <span className="mt-badge">Simulated</span>
            </div>
            <p className="mt-note">
              {analytics?.completedRuns || 0} completed browser runs;{" "}
              {analytics?.success || 0} asserted successes from{" "}
              {analytics?.measuredAttempts || 0} measured task attempts;{" "}
              {job.issues.length} evidence-linked findings.
            </p>
            {onExport && (
              <div className="mt-export-grid">
                {formats.map((format) => (
                  <button
                    key={format}
                    disabled={unavailable}
                    onClick={() =>
                      void action(
                        `Exporting ${format.toUpperCase()} report`,
                        () => onExport(format, job),
                      )
                    }
                  >
                    <Download size={15} />
                    {format === "html"
                      ? "Web report"
                      : format === "markdown"
                        ? "Markdown"
                        : format.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-note">
              Human results remain in the Validation report. Synthetic results
              are labelled in every export.
            </p>
            {analytics?.limitations.map((limitation) => (
              <p className="mt-note" key={limitation}>
                {limitation}
              </p>
            ))}
          </div>
          {comparison && (
            <div className="mt-card">
              <h2>Before & after</h2>
              <p className="mt-note">
                {comparison.previousProductVersion} →{" "}
                {comparison.currentProductVersion}
              </p>
              <div className="mt-metrics" style={{ marginTop: 20 }}>
                <div>
                  <strong>{rate(comparison.previous.successRate)}</strong>
                  <span>Previous task success</span>
                </div>
                <div>
                  <strong>{rate(comparison.current.successRate)}</strong>
                  <span>Current task success</span>
                </div>
                <div>
                  <strong>
                    {comparison.successRateChange === null
                      ? "Not comparable"
                      : `${comparison.successRateChange > 0 ? "+" : ""}${Math.round(comparison.successRateChange * 10) / 10} pp`}
                  </strong>
                  <span>Measured change</span>
                </div>
                <div>
                  <strong>{seconds(comparison.current.medianSeconds)}</strong>
                  <span>Current median duration</span>
                  <small>
                    Previous: {seconds(comparison.previous.medianSeconds)}
                  </small>
                </div>
              </div>
              <p className="mt-note">{comparison.limitation}</p>
              {!comparison.comparable &&
                comparison.differences.map((difference) => (
                  <p className="mt-note" key={difference}>
                    {difference}
                  </p>
                ))}
            </div>
          )}
          <div className="mt-card">
            <div className="mt-heading">
              <div>
                <h2>Retest a product change</h2>
                <p>
                  Keep the same tasks and profiles to compare versions. Review
                  the new target before running.
                </p>
              </div>
            </div>
            <button
              className="mt-button mt-primary"
              disabled={unavailable || !terminal.has(job.status)}
              onClick={prepareRetest}
            >
              <RotateCcw size={14} /> Prepare retest
            </button>
          </div>
          {(sandbox.twin?.jobIds.length || 0) > 1 && (
            <div className="mt-card">
              <h2>Experiment history</h2>
              <label style={{ marginTop: 18 }}>
                Saved experiment
                <select
                  value={activeJobId}
                  disabled={unavailable}
                  onChange={(event) => {
                    setJob(null);
                    setPreviousJob(null);
                    setActiveJobId(event.target.value);
                    void action("Selecting experiment", () =>
                      save({ activeJobId: event.target.value }),
                    );
                  }}
                >
                  <option value={activeJobId}>
                    {job.spec.productVersion} · {job.id.slice(0, 8)}
                  </option>
                  {sandbox.twin?.jobIds
                    .filter((id) => id !== activeJobId)
                    .map((id) => (
                      <option key={id} value={id}>
                        {id.slice(0, 12)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
        </>
      )}
    </section>
  );
}
