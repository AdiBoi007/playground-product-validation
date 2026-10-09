import type { Task } from "./types";
import type { ValidationDossier, ValidationObservation } from "./validation";

/** Simulation configuration describes an experimental policy, not measured human traits. */
export type TwinMode = "functional" | "behavioural";
export type TwinStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled" | "timed-out";
export type TwinOutcome =
  "success" | "failure" | "blocked" | "abandoned" | "assisted" | "unknown";
export type TwinSeverity = "critical" | "high" | "medium" | "low";
export interface TwinPersona {
  id: string;
  name: string;
  goal: string;
  device: "desktop" | "mobile";
  experience: "first-time" | "familiar" | "expert";
  technicalProficiency: "low" | "medium" | "high";
  motivation: string;
  privacySensitivity: "low" | "medium" | "high";
  timeBudgetSeconds: number;
  exploration: "low" | "medium" | "high";
  seed: number;
  previousKnowledge?: string;
  budget?: string;
}
export interface TwinStep {
  id: string;
  type:
    | "navigate"
    | "click"
    | "fill"
    | "select"
    | "press"
    | "scroll"
    | "back"
    | "wait"
    | "assert";
  description: string;
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  milliseconds?: number;
  assertionId?: string;
}
export interface TwinAssertion {
  id: string;
  type:
    "url-contains" | "text-visible" | "selector-visible" | "selector-hidden";
  value: string;
  description: string;
}
export interface TwinTask extends Task {
  successCriteria: string;
  steps?: TwinStep[];
  assertions?: TwinAssertion[];
}
export interface TwinRunSettings {
  runCount: number;
  concurrency: number;
  maxSteps: number;
  maxDurationSeconds: number;
  maxModelTokens: number;
  maxCostUsd: number;
  model: string;
  seed: number;
}
export interface TwinExperimentSpec {
  mode: TwinMode;
  targetUrl: string;
  allowedOrigins: string[];
  authorizationConfirmed: boolean;
  productVersion: string;
  objective: string;
  tasks: TwinTask[];
  personas: TwinPersona[];
  settings: TwinRunSettings;
  approvedAt: string;
  authorizedWritePaths?: string[];
  policyVersion?: string;
  evaluatorVersion?: string;
}
export interface TwinAssertionResult {
  assertionId: string;
  passed: boolean | null;
  observed: string;
  eventId?: string;
}
export interface TwinTaskResult {
  taskId: string;
  outcome: TwinOutcome;
  durationSeconds: number | null;
  reason: string;
  eventIds: string[];
  assertions: TwinAssertionResult[];
}
export interface TwinBrowserEvent {
  id: string;
  taskId?: string;
  at: string;
  elapsedMs: number;
  type:
    | "navigation"
    | "action"
    | "observation"
    | "assertion"
    | "console-error"
    | "network-error"
    | "policy-block"
    | "audit"
    | "stop";
  url: string;
  summary: string;
  action?: TwinStep;
  screenshotId?: string;
  data?: Record<string, string | number | boolean | null>;
}
export interface TwinArtifact {
  id: string;
  type: "screenshot" | "trace" | "video" | "audit" | "har";
  name: string;
  url: string;
  mimeType: string;
  createdAt: string;
  eventId?: string;
  sizeBytes?: number;
}
export interface TwinUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  modelCalls: number;
  model: string;
}
export interface TwinRun {
  id: string;
  personaId: string;
  status: TwinStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  taskResults: TwinTaskResult[];
  events: TwinBrowserEvent[];
  artifacts: TwinArtifact[];
  usage: TwinUsage;
  error?: string;
  retryOfRunId?: string;
}
export interface TwinIssue {
  id: string;
  title: string;
  category:
    | "usability"
    | "accessibility"
    | "trust"
    | "conversion"
    | "performance"
    | "technical";
  severity: TwinSeverity;
  basis: "observed" | "inferred";
  description: string;
  affectedUrl: string;
  taskIds: string[];
  sourceRunIds: string[];
  sourceEventIds: string[];
  artifactIds: string[];
  reproductionSteps: string[];
  proposedFix: string;
  requiresHumanVerification: boolean;
  ruleId?: string;
}
export interface TwinJob {
  id: string;
  sandboxId: string;
  status: TwinStatus;
  createdAt: string;
  updatedAt: string;
  spec: TwinExperimentSpec;
  runs: TwinRun[];
  issues: TwinIssue[];
  error?: string;
  parentJobId?: string;
}
/** A reviewer explicitly confirms comparable task/version conditions before creating a match. */
export interface TwinHumanMatch {
  id: string;
  jobId: string;
  runId: string;
  taskId: string;
  observationId: string;
  reviewedAt: string;
  reviewerNote: string;
}
/** Absence of a human issue is not a false positive without an explicit evidence review. */
export interface TwinIssueReview {
  id: string;
  jobId: string;
  issueId?: string;
  humanIssueId?: string;
  verdict: "confirmed" | "not-substantiated" | "missed" | "inconclusive";
  humanObservationIds: string[];
  reviewedAt: string;
  reviewerNote: string;
}
export interface TwinWorkspace {
  spec?: TwinExperimentSpec;
  jobIds: string[];
  activeJobId?: string;
  calibrationMatches?: TwinHumanMatch[];
  issueReviews?: TwinIssueReview[];
}
export type MarketTwinLink = TwinWorkspace;

export interface TwinAnalyticsFilter {
  device?: TwinPersona["device"];
  personaId?: string;
  outcome?: TwinOutcome;
  taskId?: string;
}
export interface TwinTaskAnalytics {
  taskId: string;
  title: string;
  attempts: number;
  measuredAttempts: number;
  success: number;
  failure: number;
  blocked: number;
  abandoned: number;
  assisted: number;
  unknown: number;
  successRate: number | null;
  medianSeconds: number | null;
  sourceRunIds: string[];
  sourceEventIds: string[];
}
export interface TwinAnalytics {
  label: "Simulated browser evidence";
  mode: TwinMode;
  requestedRuns: number;
  recordedRuns: number;
  browserRuns: number;
  completedRuns: number;
  statuses: Record<TwinStatus, number>;
  attempts: number;
  measuredAttempts: number;
  success: number;
  failure: number;
  blocked: number;
  abandoned: number;
  assisted: number;
  unknown: number;
  successRate: number | null;
  medianSeconds: number | null;
  durationSeconds: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  uniqueIssues: number;
  severities: Record<TwinSeverity, number>;
  tasks: TwinTaskAnalytics[];
  funnel: {
    taskId: string;
    title: string;
    reachedRuns: number;
    successfulRuns: number;
    sourceRunIds: string[];
  }[];
  timeDistribution: {
    runId: string;
    taskId: string;
    personaId: string;
    seconds: number;
    eventIds: string[];
  }[];
  cohort: {
    personaId: string;
    name: string;
    device: TwinPersona["device"];
    attempts: number;
    successRate: number | null;
    runIds: string[];
  }[];
  limitations: string[];
}
export interface TwinComparison {
  previousJobId: string;
  currentJobId: string;
  previousProductVersion: string;
  currentProductVersion: string;
  comparable: boolean;
  differences: string[];
  previous: TwinAnalytics;
  current: TwinAnalytics;
  successRateChange: number | null;
  medianSecondsChange: number | null;
  limitation: string;
}
export interface TwinCalibration {
  label: "Reviewed human comparison";
  matchedAttempts: number;
  humanParticipants: number;
  agreement: number | null;
  agreements: number;
  disagreements: number;
  confusion: {
    bothSuccess: number;
    bothNotSuccess: number;
    syntheticSuccessHumanNot: number;
    humanSuccessSyntheticNot: number;
  };
  taskAgreement: {
    taskId: string;
    matches: number;
    agreement: number | null;
    sourceMatchIds: string[];
  }[];
  confirmedIssues: number;
  falsePositives: number;
  missedIssues: number;
  inconclusiveIssues: number;
  issuePrecision: number | null;
  severityAgreement: number | null;
  invalidMatchIds: string[];
  invalidReviewIds: string[];
  limitations: string[];
}
export interface TwinReproducibility {
  repeatedConditions: number;
  comparedPairs: number;
  agreeingPairs: number;
  outcomeAgreement: number | null;
  groups: {
    personaId: string;
    taskId: string;
    runIds: string[];
    comparedPairs: number;
    agreeingPairs: number;
    outcomeAgreement: number | null;
  }[];
  limitation: string;
}

const STATUSES: TwinStatus[] = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed-out",
];
const OUTCOMES: TwinOutcome[] = [
  "success",
  "failure",
  "blocked",
  "abandoned",
  "assisted",
  "unknown",
];
const SEVERITIES: TwinSeverity[] = ["critical", "high", "medium", "low"];
const LEVELS = ["low", "medium", "high"] as const;
const STEP_TYPES: TwinStep["type"][] = [
  "navigate",
  "click",
  "fill",
  "select",
  "press",
  "scroll",
  "back",
  "wait",
  "assert",
];
const ASSERTION_TYPES: TwinAssertion["type"][] = [
  "url-contains",
  "text-visible",
  "selector-visible",
  "selector-hidden",
];
const EVENT_TYPES: TwinBrowserEvent["type"][] = [
  "navigation",
  "action",
  "observation",
  "assertion",
  "console-error",
  "network-error",
  "policy-block",
  "audit",
  "stop",
];
const ARTIFACT_TYPES: TwinArtifact["type"][] = [
  "screenshot",
  "trace",
  "video",
  "audit",
  "har",
];
const ISSUE_CATEGORIES: TwinIssue["category"][] = [
  "usability",
  "accessibility",
  "trust",
  "conversion",
  "performance",
  "technical",
];
type ObjectValue = Record<string, unknown>;
function record(value: unknown, label: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as ObjectValue;
}
function text(
  value: unknown,
  label: string,
  max = 6000,
  required = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error(
      `${label} must contain ${required ? "non-empty " : ""}text of ${max} characters or fewer.`,
    );
  return value.trim();
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`,
    );
  return value;
}
function nullableNumber(
  value: unknown,
  label: string,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  return value === null ? null : number(value, label, 0, max);
}
function array(value: unknown, label: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error(`${label} needs ${min} to ${max} entries.`);
  return value;
}
function strings(
  value: unknown,
  label: string,
  max: number,
  min = 0,
): string[] {
  const result = array(value, label, max, min).map((entry) =>
    text(entry, label, 2000),
  );
  if (new Set(result).size !== result.length)
    throw new Error(`${label} contains duplicate entries.`);
  return result;
}
function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (!options.includes(value as T))
    throw new Error(`${label} has an unsupported value.`);
  return value as T;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be true or false.`);
  return value;
}
function date(value: unknown, label: string, allowEmpty = false): string {
  const result = text(value, label, 50, !allowEmpty);
  if (result && !Number.isFinite(Date.parse(result)))
    throw new Error(`${label} must be a valid date.`);
  return result;
}
function idsUnique(values: { id: string }[], label: string) {
  if (new Set(values.map((value) => value.id)).size !== values.length)
    throw new Error(`${label} IDs must be unique.`);
}
function httpUrl(value: unknown, label: string, allowEmpty = false): string {
  const result = text(value, label, 2000, !allowEmpty);
  if (!result && allowEmpty) return result;
  if (hasControlCharacter(result))
    throw new Error(`${label} contains unsupported control characters.`);
  try {
    const parsed = new URL(result);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error();
    return parsed.href;
  } catch {
    throw new Error(`${label} must be an HTTP(S) URL without credentials.`);
  }
}
function origin(value: unknown): string {
  const raw = text(value, "Allowed origin", 2000);
  const url = new URL(httpUrl(raw, "Allowed origin"));
  if (
    url.hostname.includes("*") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (raw !== url.origin && raw !== `${url.origin}/`)
  )
    throw new Error(
      "Allowed origins must be exact HTTP(S) origins without paths, wildcards or queries.",
    );
  return url.origin;
}
function artifactUrl(value: unknown): string {
  const raw = text(value, "Artifact URL", 4000);
  if (
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("\\") &&
    !hasControlCharacter(raw)
  )
    return raw;
  return httpUrl(raw, "Artifact URL");
}
function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}
function optionalText(
  source: ObjectValue,
  key: string,
  max = 6000,
): string | undefined {
  return source[key] === undefined
    ? undefined
    : text(source[key], key, max, false);
}
function parseStep(value: unknown, draft = false): TwinStep {
  const source = record(value, "Browser step");
  const result: TwinStep = {
    id: text(source.id, "Step ID", 200),
    type: choice(source.type, STEP_TYPES, "Browser action"),
    description: text(source.description, "Step description", 3000, !draft),
  };
  for (const key of [
    "selector",
    "value",
    "url",
    "key",
    "assertionId",
  ] as const) {
    if (source[key] !== undefined)
      result[key] = text(source[key], `Step ${key}`, 2000, false);
  }
  if (source.milliseconds !== undefined)
    result.milliseconds = number(
      source.milliseconds,
      "Wait duration",
      0,
      10000,
      true,
    );
  if (!draft) {
    if (["click", "fill", "select"].includes(result.type) && !result.selector)
      throw new Error("Click, fill and select steps require a selector.");
    if (["fill", "select"].includes(result.type) && result.value === undefined)
      throw new Error("Fill and select steps require a value.");
    if (result.type === "press" && !result.key)
      throw new Error("Press steps require a key.");
    if (result.type === "navigate" && !result.url)
      throw new Error("Navigation steps require a URL.");
    if (result.type === "assert" && !result.assertionId)
      throw new Error("Assertion steps require an assertion ID.");
  }
  if (result.url) {
    if (
      result.url.startsWith("/") &&
      !result.url.startsWith("//") &&
      !result.url.includes("\\")
    ) {
      // Relative navigation remains on the approved target; the worker enforces network policy.
    } else result.url = httpUrl(result.url, "Step URL");
  }
  return result;
}
function parsePersona(value: unknown): TwinPersona {
  const source = record(value, "Synthetic profile");
  const result: TwinPersona = {
    id: text(source.id, "Profile ID", 200),
    name: text(source.name, "Profile name", 300),
    goal: text(source.goal, "Profile goal", 4000),
    device: choice(source.device, ["desktop", "mobile"], "Profile device"),
    experience: choice(
      source.experience,
      ["first-time", "familiar", "expert"],
      "Profile experience",
    ),
    technicalProficiency: choice(
      source.technicalProficiency,
      LEVELS,
      "Technical proficiency",
    ),
    motivation: text(source.motivation, "Profile motivation", 1000),
    privacySensitivity: choice(
      source.privacySensitivity,
      LEVELS,
      "Privacy policy",
    ),
    timeBudgetSeconds: number(
      source.timeBudgetSeconds,
      "Profile time budget",
      5,
      600,
      true,
    ),
    exploration: choice(source.exploration, LEVELS, "Exploration policy"),
    seed: number(source.seed, "Profile seed", 0, 2147483647, true),
  };
  for (const key of ["previousKnowledge", "budget"] as const)
    if (source[key] !== undefined)
      result[key] = text(source[key], key, 2000, false);
  return result;
}

export function defaultTwinSettings(
  mode: TwinMode = "functional",
): TwinRunSettings {
  return {
    runCount: 20,
    concurrency: 2,
    maxSteps: 20,
    maxDurationSeconds: 120,
    maxModelTokens: mode === "functional" ? 0 : 20000,
    maxCostUsd: mode === "functional" ? 0 : 0.25,
    model: "gpt-6-luna",
    seed: 1,
  };
}
export function buildDefaultTwinPersonas(
  goal: string,
  count = 10,
  seed = 1,
): TwinPersona[] {
  number(count, "Profile count", 1, 30, true);
  number(seed, "Profile seed", 0, 2147483647, true);
  return Array.from({ length: count }, (_, index) => ({
    id: `profile-${index + 1}`,
    name: `${index % 2 ? "Mobile" : "Desktop"} profile ${index + 1}`,
    goal: goal.trim() || "Complete the approved product task",
    device: index % 2 ? "mobile" : "desktop",
    experience:
      index % 3 === 0 ? "first-time" : index % 3 === 1 ? "familiar" : "expert",
    technicalProficiency: LEVELS[index % 3],
    motivation:
      index % 2
        ? "Find a quick way to complete the task"
        : "Understand the workflow before proceeding",
    privacySensitivity: LEVELS[(index + 1) % 3],
    timeBudgetSeconds: index % 2 ? 60 : 120,
    exploration: LEVELS[(index + 2) % 3],
    seed: (seed + index) % 2147483648,
    previousKnowledge:
      index % 3 === 0
        ? "No prior product knowledge"
        : "Familiar with common web interfaces",
    budget: "Synthetic test data only; no purchases",
  }));
}
export function validateTwinExperimentSpec(
  value: unknown,
  options: { requireApproval?: boolean } = {},
): TwinExperimentSpec {
  const approved = options.requireApproval !== false;
  const source = record(value, "Market Twin experiment");
  const mode = choice(
    source.mode,
    ["functional", "behavioural"],
    "Experiment mode",
  );
  const targetUrl = httpUrl(source.targetUrl, "Target URL", !approved);
  const allowedOrigins = array(
    source.allowedOrigins,
    "Allowed origins",
    10,
    approved ? 1 : 0,
  ).map(origin);
  if (new Set(allowedOrigins).size !== allowedOrigins.length)
    throw new Error("Allowed origins must be unique.");
  if (targetUrl && !allowedOrigins.includes(new URL(targetUrl).origin))
    throw new Error(
      "The target URL must belong to an explicitly allowed origin.",
    );
  const authorizationConfirmed = boolean(
    source.authorizationConfirmed,
    "Target authorization",
  );
  if (approved && !authorizationConfirmed)
    throw new Error(
      "Confirm that you are authorized to test the target before execution.",
    );
  const settingsValue = record(source.settings, "Run settings");
  const settings: TwinRunSettings = {
    runCount: number(settingsValue.runCount, "Browser run count", 1, 100, true),
    concurrency: number(
      settingsValue.concurrency,
      "Browser concurrency",
      1,
      4,
      true,
    ),
    maxSteps: number(settingsValue.maxSteps, "Maximum steps", 1, 100, true),
    maxDurationSeconds: number(
      settingsValue.maxDurationSeconds,
      "Run time limit",
      5,
      600,
      true,
    ),
    maxModelTokens: number(
      settingsValue.maxModelTokens,
      "Model token limit",
      0,
      100000,
      true,
    ),
    maxCostUsd: number(settingsValue.maxCostUsd, "Model cost limit", 0, 1),
    model: text(settingsValue.model, "Model", 200),
    seed: number(settingsValue.seed, "Experiment seed", 0, 2147483647, true),
  };
  if (
    approved &&
    mode === "behavioural" &&
    (settings.maxModelTokens < 100 || settings.maxCostUsd <= 0)
  )
    throw new Error(
      "Behavioural execution requires a positive bounded token and cost budget.",
    );
  const tasks = array(source.tasks, "Test tasks", 8, approved ? 1 : 0).map(
    (entry): TwinTask => {
      const task = record(entry, "Test task");
      const assertions =
        task.assertions === undefined
          ? []
          : array(task.assertions, "Success assertions", 20).map(
              (entry): TwinAssertion => {
                const assertion = record(entry, "Success assertion");
                return {
                  id: text(assertion.id, "Assertion ID", 200),
                  type: choice(
                    assertion.type,
                    ASSERTION_TYPES,
                    "Assertion type",
                  ),
                  value: text(
                    assertion.value,
                    "Assertion value",
                    2000,
                    !!approved,
                  ),
                  description: text(
                    assertion.description,
                    "Assertion description",
                    3000,
                    approved,
                  ),
                };
              },
            );
      const steps =
        task.steps === undefined
          ? []
          : array(task.steps, "Functional steps", 100).map((entry) =>
              parseStep(entry, !approved),
            );
      idsUnique(assertions, "Assertion");
      idsUnique(steps, "Step");
      if (approved && !assertions.length)
        throw new Error(
          "Every approved task needs at least one observable success assertion.",
        );
      if (approved && mode === "functional" && !steps.length)
        throw new Error("Functional tasks require executable browser steps.");
      const assertionIds = new Set(assertions.map((assertion) => assertion.id));
      for (const step of steps) {
        if (step.assertionId && !assertionIds.has(step.assertionId))
          throw new Error(
            "Browser steps must reference assertions belonging to their task.",
          );
        if (
          step.url &&
          !step.url.startsWith("/") &&
          !allowedOrigins.includes(new URL(step.url).origin)
        )
          throw new Error(
            "Browser navigation must stay within explicitly allowed origins.",
          );
      }
      return {
        id: text(task.id, "Task ID", 200),
        title: text(task.title, "Task title", 300, approved),
        instructions: text(
          task.instructions,
          "Task instructions",
          6000,
          approved,
        ),
        question: text(task.question, "Task question", 3000, false),
        successCriteria: text(
          task.successCriteria,
          "Measurable success criteria",
          4000,
          approved,
        ),
        steps,
        assertions,
      };
    },
  );
  idsUnique(tasks, "Task");
  const personas = array(source.personas, "Synthetic profiles", 30, 1).map(
    parsePersona,
  );
  idsUnique(personas, "Profile");
  const result: TwinExperimentSpec = {
    mode,
    targetUrl,
    allowedOrigins,
    authorizationConfirmed,
    productVersion: text(
      source.productVersion,
      "Product version",
      300,
      approved,
    ),
    objective: text(source.objective, "Validation objective", 4000, approved),
    tasks,
    personas,
    settings,
    approvedAt: date(source.approvedAt, "Experiment approval", !approved),
  };
  if (source.authorizedWritePaths !== undefined)
    result.authorizedWritePaths = strings(
      source.authorizedWritePaths,
      "Authorized write paths",
      10,
    ).map((path) => {
      if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        path.includes("\\") ||
        path.includes("?") ||
        path.includes("#") ||
        path.includes("*") ||
        path.split("/").includes("..") ||
        hasControlCharacter(path) ||
        /%(?:2e|2f|5c|25)/i.test(path) ||
        new URL(path, "https://authorized.example").pathname !== path
      )
        throw new Error(
          "Authorized write paths must be exact relative URL paths without wildcards, queries or traversal.",
        );
      return path;
    });
  for (const key of ["policyVersion", "evaluatorVersion"] as const)
    if (source[key] !== undefined) result[key] = text(source[key], key, 200);
  return result;
}

function parseHumanMatch(value: unknown): TwinHumanMatch {
  const source = record(value, "Human task comparison");
  return {
    id: text(source.id, "Match ID", 200),
    jobId: text(source.jobId, "Comparison job ID", 200),
    runId: text(source.runId, "Comparison run ID", 200),
    taskId: text(source.taskId, "Comparison task ID", 200),
    observationId: text(source.observationId, "Human observation ID", 300),
    reviewedAt: date(source.reviewedAt, "Comparison review date"),
    reviewerNote: text(source.reviewerNote, "Comparison review note", 3000),
  };
}
function parseIssueReview(value: unknown): TwinIssueReview {
  const source = record(value, "Human issue review");
  const result: TwinIssueReview = {
    id: text(source.id, "Issue review ID", 200),
    jobId: text(source.jobId, "Issue review job ID", 200),
    verdict: choice(
      source.verdict,
      ["confirmed", "not-substantiated", "missed", "inconclusive"],
      "Human issue review verdict",
    ),
    humanObservationIds: strings(
      source.humanObservationIds,
      "Issue review observations",
      100,
      1,
    ),
    reviewedAt: date(source.reviewedAt, "Issue review date"),
    reviewerNote: text(source.reviewerNote, "Issue review note", 3000),
  };
  if (source.issueId !== undefined)
    result.issueId = text(source.issueId, "Synthetic issue ID", 200);
  if (source.humanIssueId !== undefined)
    result.humanIssueId = text(source.humanIssueId, "Human issue ID", 200);
  if (result.verdict === "missed" && !result.humanIssueId)
    throw new Error("A missed finding must identify a reviewed human issue.");
  if (result.verdict !== "missed" && !result.issueId)
    throw new Error(
      "A synthetic issue review must identify the finding being checked.",
    );
  return result;
}
export function validateTwinWorkspace(value: unknown): TwinWorkspace {
  const source = record(value, "Market Twin workspace");
  const result: TwinWorkspace = {
    jobIds: strings(source.jobIds, "Simulation history", 500),
  };
  if (source.spec !== undefined)
    result.spec = validateTwinExperimentSpec(source.spec, {
      requireApproval: false,
    });
  if (source.activeJobId !== undefined) {
    result.activeJobId = text(source.activeJobId, "Active simulation ID", 200);
    if (!result.jobIds.includes(result.activeJobId))
      throw new Error(
        "The active simulation must belong to this workspace history.",
      );
  }
  if (source.calibrationMatches !== undefined) {
    result.calibrationMatches = array(
      source.calibrationMatches,
      "Human task comparisons",
      1000,
    ).map(parseHumanMatch);
    idsUnique(result.calibrationMatches, "Human comparison");
    if (
      result.calibrationMatches.some(
        (match) => !result.jobIds.includes(match.jobId),
      )
    )
      throw new Error(
        "Human comparisons must reference a simulation in this workspace.",
      );
  }
  if (source.issueReviews !== undefined) {
    result.issueReviews = array(
      source.issueReviews,
      "Human issue reviews",
      1000,
    ).map(parseIssueReview);
    idsUnique(result.issueReviews, "Issue review");
    if (
      result.issueReviews.some(
        (review) => !result.jobIds.includes(review.jobId),
      )
    )
      throw new Error(
        "Human issue reviews must reference a simulation in this workspace.",
      );
  }
  return result;
}
export const validateMarketTwinLink = validateTwinWorkspace;

export function validateTwinJob(value: unknown): TwinJob {
  const source = record(value, "Simulation job");
  const spec = validateTwinExperimentSpec(source.spec);
  const taskById = new Map(spec.tasks.map((task) => [task.id, task]));
  const personaIds = new Set(spec.personas.map((persona) => persona.id));
  const runs = array(source.runs, "Browser runs", 100).map((entry): TwinRun => {
    const run = record(entry, "Browser run");
    const personaId = text(run.personaId, "Run profile ID", 200);
    if (!personaIds.has(personaId))
      throw new Error(
        "Browser runs must identify a configured synthetic profile.",
      );
    const artifacts = array(run.artifacts, "Browser artifacts", 500).map(
      (entry): TwinArtifact => {
        const artifact = record(entry, "Browser artifact");
        const result: TwinArtifact = {
          id: text(artifact.id, "Artifact ID", 200),
          type: choice(artifact.type, ARTIFACT_TYPES, "Artifact type"),
          name: text(artifact.name, "Artifact name", 300),
          url: artifactUrl(artifact.url),
          mimeType: text(artifact.mimeType, "Artifact content type", 100),
          createdAt: date(artifact.createdAt, "Artifact capture time"),
        };
        if (artifact.eventId !== undefined)
          result.eventId = text(artifact.eventId, "Artifact event ID", 200);
        if (artifact.sizeBytes !== undefined)
          result.sizeBytes = number(
            artifact.sizeBytes,
            "Artifact size",
            0,
            200000000,
            true,
          );
        return result;
      },
    );
    idsUnique(artifacts, "Artifact");
    const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
    const events = array(run.events, "Browser events", 5000).map(
      (entry): TwinBrowserEvent => {
        const event = record(entry, "Browser event");
        const eventUrl = text(event.url, "Event URL", 2000, false);
        const result: TwinBrowserEvent = {
          id: text(event.id, "Event ID", 200),
          at: date(event.at, "Event time"),
          elapsedMs: number(event.elapsedMs, "Event elapsed time", 0, 3600000),
          type: choice(event.type, EVENT_TYPES, "Event type"),
          url:
            eventUrl === "about:blank" || !eventUrl
              ? eventUrl
              : httpUrl(eventUrl, "Event URL"),
          summary: text(event.summary, "Event observation", 12000, false),
        };
        if (event.taskId !== undefined) {
          result.taskId = text(event.taskId, "Event task ID", 200);
          if (!taskById.has(result.taskId))
            throw new Error(
              "Browser events must reference tasks in the approved experiment.",
            );
        }
        if (event.action !== undefined) result.action = parseStep(event.action);
        if (event.screenshotId !== undefined) {
          result.screenshotId = text(event.screenshotId, "Screenshot ID", 200);
          if (
            !artifactIds.has(result.screenshotId) ||
            artifacts.find((artifact) => artifact.id === result.screenshotId)
              ?.type !== "screenshot"
          )
            throw new Error(
              "Screenshots must reference captured screenshot artifacts from the same run.",
            );
        }
        if (event.data !== undefined) {
          const data = record(event.data, "Event details");
          if (Object.keys(data).length > 50)
            throw new Error("Event details exceed the field limit.");
          result.data = {};
          for (const [key, value] of Object.entries(data)) {
            text(key, "Event detail key", 200);
            if (!(
              value === null ||
              typeof value === "boolean" ||
              (typeof value === "number" && Number.isFinite(value)) ||
              (typeof value === "string" && value.length <= 30000)
            ))
              throw new Error(
                "Event details must contain bounded scalar values.",
              );
            result.data[key] = value as string | number | boolean | null;
          }
        }
        return result;
      },
    );
    idsUnique(events, "Browser event");
    const eventById = new Map(events.map((event) => [event.id, event]));
    for (const artifact of artifacts)
      if (artifact.eventId && !eventById.has(artifact.eventId))
        throw new Error(
          "Artifacts must reference captured events from the same run.",
        );
    const taskResults = array(run.taskResults, "Task results", 8).map(
      (entry): TwinTaskResult => {
        const item = record(entry, "Browser task result");
        const taskId = text(item.taskId, "Task result ID", 200);
        const task = taskById.get(taskId);
        if (!task)
          throw new Error(
            "Task results must reference approved experiment tasks.",
          );
        const eventIds = strings(item.eventIds, "Task result evidence", 5000);
        if (
          eventIds.some(
            (id) =>
              !eventById.has(id) ||
              (eventById.get(id)?.taskId &&
                eventById.get(id)?.taskId !== taskId),
          )
        )
          throw new Error(
            "Task results must cite captured events belonging to that task and run.",
          );
        const assertions = array(
          item.assertions,
          "Observed success assertions",
          20,
        ).map((entry): TwinAssertionResult => {
          const assertion = record(entry, "Observed assertion");
          const assertionId = text(
            assertion.assertionId,
            "Assertion result ID",
            200,
          );
          if (!task.assertions?.some((expected) => expected.id === assertionId))
            throw new Error(
              "Assertion results must belong to their approved task.",
            );
          const result: TwinAssertionResult = {
            assertionId,
            passed:
              assertion.passed === null
                ? null
                : boolean(assertion.passed, "Assertion result"),
            observed: text(
              assertion.observed,
              "Assertion observation",
              6000,
              false,
            ),
          };
          if (assertion.eventId !== undefined) {
            result.eventId = text(
              assertion.eventId,
              "Assertion evidence event",
              200,
            );
            if (!eventIds.includes(result.eventId))
              throw new Error(
                "Assertion results must cite their task's captured events.",
              );
          }
          return result;
        });
        if (
          new Set(assertions.map((assertion) => assertion.assertionId)).size !==
          assertions.length
        )
          throw new Error("Assertion results must be unique within a task.");
        const outcome = choice(item.outcome, OUTCOMES, "Task outcome");
        if (outcome !== "unknown" && !eventIds.length)
          throw new Error(
            "Observed task outcomes require captured browser evidence.",
          );
        if (
          outcome === "success" &&
          (!task.assertions?.length ||
            assertions.length !== task.assertions.length ||
            assertions.some((assertion) => assertion.passed !== true))
        )
          throw new Error(
            "Successful browser tasks require every configured success assertion to pass.",
          );
        return {
          taskId,
          outcome,
          durationSeconds: nullableNumber(
            item.durationSeconds,
            "Task duration",
            3600,
          ),
          reason: text(item.reason, "Task outcome explanation", 6000, false),
          eventIds,
          assertions,
        };
      },
    );
    if (
      new Set(taskResults.map((result) => result.taskId)).size !==
      taskResults.length
    )
      throw new Error(
        "A browser run can record only one final outcome per task.",
      );
    const usageValue = record(run.usage, "Actual model usage");
    const result: TwinRun = {
      id: text(run.id, "Run ID", 200),
      personaId,
      status: choice(run.status, STATUSES, "Browser run status"),
      createdAt: date(run.createdAt, "Run creation time"),
      taskResults,
      events,
      artifacts,
      usage: {
        inputTokens: nullableNumber(
          usageValue.inputTokens,
          "Actual input tokens",
        ),
        outputTokens: nullableNumber(
          usageValue.outputTokens,
          "Actual output tokens",
        ),
        costUsd: nullableNumber(usageValue.costUsd, "Actual model cost", 100),
        modelCalls: number(
          usageValue.modelCalls,
          "Actual model calls",
          0,
          10000,
          true,
        ),
        model: text(usageValue.model, "Usage model", 200, false),
      },
    };
    if (run.startedAt !== undefined)
      result.startedAt = date(run.startedAt, "Run start time");
    if (run.finishedAt !== undefined)
      result.finishedAt = date(run.finishedAt, "Run finish time");
    if (
      result.startedAt &&
      result.finishedAt &&
      Date.parse(result.finishedAt) < Date.parse(result.startedAt)
    )
      throw new Error("Run finish time cannot precede its start time.");
    const error = optionalText(run, "error", 6000);
    if (error !== undefined) result.error = error;
    if (run.retryOfRunId !== undefined)
      result.retryOfRunId = text(run.retryOfRunId, "Retried run ID", 200);
    return result;
  });
  idsUnique(runs, "Browser run");
  idsUnique(
    runs.flatMap((run) => run.events),
    "Job event",
  );
  idsUnique(
    runs.flatMap((run) => run.artifacts),
    "Job artifact",
  );
  const runById = new Map(runs.map((run) => [run.id, run]));
  const eventRunIds = new Map(
    runs.flatMap((run) =>
      run.events.map((event) => [event.id, run.id] as const),
    ),
  );
  const artifactRunIds = new Map(
    runs.flatMap((run) =>
      run.artifacts.map((artifact) => [artifact.id, run.id] as const),
    ),
  );
  const issues = array(source.issues, "Simulation findings", 2000).map(
    (entry): TwinIssue => {
      const item = record(entry, "Simulation finding");
      const sourceRunIds = strings(
        item.sourceRunIds,
        "Finding browser runs",
        100,
        1,
      );
      const sourceEventIds = strings(
        item.sourceEventIds,
        "Finding event evidence",
        5000,
        1,
      );
      const artifactIds = strings(
        item.artifactIds,
        "Finding artifact evidence",
        500,
      );
      const taskIds = strings(item.taskIds, "Finding tasks", 8);
      if (
        sourceRunIds.some((id) => !runById.has(id)) ||
        sourceEventIds.some(
          (id) => !sourceRunIds.includes(eventRunIds.get(id) || ""),
        ) ||
        artifactIds.some(
          (id) => !sourceRunIds.includes(artifactRunIds.get(id) || ""),
        ) ||
        taskIds.some((id) => !taskById.has(id))
      )
        throw new Error(
          "Every finding must reference actual task, browser run, event and artifact evidence in this job.",
        );
      const result: TwinIssue = {
        id: text(item.id, "Finding ID", 200),
        title: text(item.title, "Finding title", 300),
        category: choice(item.category, ISSUE_CATEGORIES, "Finding category"),
        severity: choice(item.severity, SEVERITIES, "Finding severity"),
        basis: choice(
          item.basis,
          ["observed", "inferred"],
          "Finding evidence classification",
        ),
        description: text(item.description, "Finding description", 12000),
        affectedUrl: httpUrl(item.affectedUrl, "Affected URL"),
        taskIds,
        sourceRunIds,
        sourceEventIds,
        artifactIds,
        reproductionSteps: strings(
          item.reproductionSteps,
          "Reproduction steps",
          100,
          1,
        ),
        proposedFix: text(item.proposedFix, "Proposed change", 6000),
        requiresHumanVerification: boolean(
          item.requiresHumanVerification,
          "Human verification requirement",
        ),
      };
      if (result.basis === "inferred" && !result.requiresHumanVerification)
        throw new Error(
          "Inferred behavioural findings require human verification.",
        );
      if (item.ruleId !== undefined)
        result.ruleId = text(item.ruleId, "Audit rule ID", 300);
      return result;
    },
  );
  idsUnique(issues, "Finding");
  const result: TwinJob = {
    id: text(source.id, "Job ID", 200),
    sandboxId: text(source.sandboxId, "Sandbox ID", 200),
    status: choice(source.status, STATUSES, "Job status"),
    createdAt: date(source.createdAt, "Job creation time"),
    updatedAt: date(source.updatedAt, "Job update time"),
    spec,
    runs,
    issues,
  };
  const error = optionalText(source, "error", 6000);
  if (error !== undefined) result.error = error;
  if (source.parentJobId !== undefined)
    result.parentJobId = text(
      source.parentJobId,
      "Previous experiment ID",
      200,
    );
  return result;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentage(numerator: number, denominator: number): number | null {
  return denominator
    ? Math.round((numerator / denominator) * 10000) / 100
    : null;
}
function outcomes(results: TwinTaskResult[]) {
  const counts = {
    success: 0,
    failure: 0,
    blocked: 0,
    abandoned: 0,
    assisted: 0,
    unknown: 0,
  };
  for (const result of results) counts[result.outcome]++;
  const measuredAttempts = results.length - counts.unknown;
  return {
    ...counts,
    attempts: results.length,
    measuredAttempts,
    successRate: percentage(counts.success, measuredAttempts),
    medianSeconds: median(
      results.flatMap((result) =>
        result.durationSeconds === null ? [] : [result.durationSeconds],
      ),
    ),
  };
}
function hasBrowserEvidence(run: TwinRun): boolean {
  return Boolean(run.startedAt || run.events.length);
}
/** A task result counts only if it has evidence from its own stored browser run. */
function observedResults(run: TwinRun): TwinTaskResult[] {
  const events = new Set(run.events.map((event) => event.id));
  return run.taskResults.filter(
    (result) =>
      result.eventIds.length > 0 &&
      result.eventIds.every((id) => events.has(id)),
  );
}
function usageSum(
  runs: TwinRun[],
  field: "inputTokens" | "outputTokens" | "costUsd",
): number | null {
  if (!runs.length || runs.some((run) => run.usage[field] === null))
    return null;
  const total = runs.reduce((sum, run) => sum + (run.usage[field] ?? 0), 0);
  return field === "costUsd" ? Math.round(total * 1000000) / 1000000 : total;
}
export function buildTwinAnalytics(
  job: TwinJob,
  filter: TwinAnalyticsFilter = {},
): TwinAnalytics {
  const personas = new Map(
    job.spec.personas.map((persona) => [persona.id, persona]),
  );
  const runResults = job.runs
    .filter(
      (run) =>
        (!filter.device ||
          personas.get(run.personaId)?.device === filter.device) &&
        (!filter.personaId || run.personaId === filter.personaId),
    )
    .map((run) => ({
      run,
      results: observedResults(run).filter(
        (result) =>
          (!filter.outcome || result.outcome === filter.outcome) &&
          (!filter.taskId || result.taskId === filter.taskId),
      ),
    }))
    .filter(
      (item) => (!filter.outcome && !filter.taskId) || item.results.length > 0,
    );
  const runs = runResults.map((item) => item.run);
  const browserRuns = runs.filter(hasBrowserEvidence);
  const allResults = runResults.flatMap((item) => item.results);
  const counts = outcomes(allResults);
  const statuses = Object.fromEntries(
    STATUSES.map((status) => [
      status,
      runs.filter((run) => run.status === status).length,
    ]),
  ) as Record<TwinStatus, number>;
  const tasks = job.spec.tasks
    .filter((task) => !filter.taskId || task.id === filter.taskId)
    .map((task): TwinTaskAnalytics => {
      const entries = runResults.flatMap(({ run, results }) =>
        results
          .filter((result) => result.taskId === task.id)
          .map((result) => ({ run, result })),
      );
      return {
        taskId: task.id,
        title: task.title,
        ...outcomes(entries.map((entry) => entry.result)),
        sourceRunIds: entries.map((entry) => entry.run.id),
        sourceEventIds: [
          ...new Set(entries.flatMap((entry) => entry.result.eventIds)),
        ],
      };
    });
  const selectedRunIds = new Set(browserRuns.map((run) => run.id));
  const selectedTaskIds = new Set(tasks.map((task) => task.taskId));
  const issues = job.issues.filter(
    (issue) =>
      issue.sourceRunIds.some((runId) => selectedRunIds.has(runId)) &&
      (!filter.taskId ||
        issue.taskIds.some((taskId) => selectedTaskIds.has(taskId))),
  );
  const severities = Object.fromEntries(
    SEVERITIES.map((severity) => [
      severity,
      issues.filter((issue) => issue.severity === severity).length,
    ]),
  ) as Record<TwinSeverity, number>;
  const starts = browserRuns.flatMap((run) =>
    run.startedAt ? [Date.parse(run.startedAt)] : [],
  );
  const finishes = browserRuns.flatMap((run) =>
    run.finishedAt ? [Date.parse(run.finishedAt)] : [],
  );
  const durationSeconds =
    starts.length && finishes.length === browserRuns.length
      ? Math.max(0, (Math.max(...finishes) - Math.min(...starts)) / 1000)
      : null;
  const limitations = [
    job.spec.mode === "functional"
      ? "Functional completion establishes whether the specified browser workflow executes. It does not measure human usability or demand."
      : "These are configured synthetic agents executing browser tasks. Their completion rate is not a real-human conversion rate or a measure of demand.",
    "Profile settings are experimental policies, not validated psychological measurements or a representative population sample.",
  ];
  if (!allResults.length)
    limitations.push(
      "Not yet tested: no task outcomes with captured browser evidence are available.",
    );
  if (counts.unknown)
    limitations.push(
      `${counts.unknown} observed task outcomes are unknown and excluded from the success-rate denominator.`,
    );
  const missingTimes = allResults.filter(
    (result) => result.durationSeconds === null,
  ).length;
  if (missingTimes)
    limitations.push(
      `${missingTimes} observed task attempts have no measured duration.`,
    );
  if (browserRuns.some((run) => run.usage.costUsd === null))
    limitations.push(
      "Actual provider cost is unavailable for at least one executed run; total cost is unknown.",
    );
  if (browserRuns.length > 0 && browserRuns.length < 20)
    limitations.push(
      "Fewer than 20 executed browser runs: these results describe this small configured experiment.",
    );
  if (Object.values(filter).some(Boolean))
    limitations.push(
      "Charts and counts use the selected evidence filters; requested runs describe the complete experiment configuration.",
    );
  return {
    label: "Simulated browser evidence",
    mode: job.spec.mode,
    requestedRuns: job.spec.settings.runCount,
    recordedRuns: runs.length,
    browserRuns: browserRuns.length,
    completedRuns: statuses.completed,
    statuses,
    ...counts,
    durationSeconds,
    costUsd: usageSum(browserRuns, "costUsd"),
    inputTokens: usageSum(browserRuns, "inputTokens"),
    outputTokens: usageSum(browserRuns, "outputTokens"),
    uniqueIssues: issues.length,
    severities,
    tasks,
    funnel: tasks.map((task) => {
      const reached = browserRuns.filter(
        (run) =>
          run.events.some((event) => event.taskId === task.taskId) ||
          observedResults(run).some((result) => result.taskId === task.taskId),
      );
      const successful = runResults.filter(({ results }) =>
        results.some(
          (result) =>
            result.taskId === task.taskId && result.outcome === "success",
        ),
      );
      return {
        taskId: task.taskId,
        title: task.title,
        reachedRuns: reached.length,
        successfulRuns: successful.length,
        sourceRunIds: reached.map((run) => run.id),
      };
    }),
    timeDistribution: runResults.flatMap(({ run, results }) =>
      results.flatMap((result) =>
        result.durationSeconds === null
          ? []
          : [
              {
                runId: run.id,
                taskId: result.taskId,
                personaId: run.personaId,
                seconds: result.durationSeconds,
                eventIds: result.eventIds,
              },
            ],
      ),
    ),
    cohort: job.spec.personas
      .filter(
        (persona) =>
          (!filter.device || persona.device === filter.device) &&
          (!filter.personaId || persona.id === filter.personaId),
      )
      .map((persona) => {
        const entries = runResults.filter(
          (item) => item.run.personaId === persona.id,
        );
        return {
          personaId: persona.id,
          name: persona.name,
          device: persona.device,
          attempts: entries.reduce(
            (sum, entry) => sum + entry.results.length,
            0,
          ),
          successRate: outcomes(entries.flatMap((entry) => entry.results))
            .successRate,
          runIds: entries.map((entry) => entry.run.id),
        };
      }),
    limitations,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Repeated outcome consistency describes observed simulator runs, not human prediction accuracy. */
export function buildTwinReproducibility(job: TwinJob): TwinReproducibility {
  const grouped = new Map<
    string,
    {
      personaId: string;
      taskId: string;
      entries: { runId: string; outcome: TwinOutcome }[];
    }
  >();
  for (const run of job.runs)
    for (const result of observedResults(run)) {
      if (result.outcome === "unknown") continue;
      const key = `${run.personaId}:${result.taskId}`;
      const group = grouped.get(key) || {
        personaId: run.personaId,
        taskId: result.taskId,
        entries: [],
      };
      group.entries.push({ runId: run.id, outcome: result.outcome });
      grouped.set(key, group);
    }
  const groups = [...grouped.values()]
    .filter((group) => group.entries.length > 1)
    .map((group) => {
      let comparedPairs = 0;
      let agreeingPairs = 0;
      for (let left = 0; left < group.entries.length; left++)
        for (let right = left + 1; right < group.entries.length; right++) {
          comparedPairs++;
          if (group.entries[left].outcome === group.entries[right].outcome)
            agreeingPairs++;
        }
      return {
        personaId: group.personaId,
        taskId: group.taskId,
        runIds: group.entries.map((entry) => entry.runId),
        comparedPairs,
        agreeingPairs,
        outcomeAgreement: percentage(agreeingPairs, comparedPairs),
      };
    });
  const comparedPairs = groups.reduce(
    (sum, group) => sum + group.comparedPairs,
    0,
  );
  const agreeingPairs = groups.reduce(
    (sum, group) => sum + group.agreeingPairs,
    0,
  );
  return {
    repeatedConditions: groups.length,
    comparedPairs,
    agreeingPairs,
    outcomeAgreement: percentage(agreeingPairs, comparedPairs),
    groups,
    limitation: comparedPairs
      ? "This is outcome consistency among repeated runs of the same configured profile and task. Shared environments, dependent pairs and model nondeterminism limit interpretation; it does not measure predictive accuracy."
      : "Not yet measured: no recorded profile/task condition has two known outcomes to compare.",
  };
}
function taskCondition(task: TwinTask) {
  return {
    id: task.id,
    instructions: task.instructions,
    successCriteria: task.successCriteria,
    steps: task.steps || [],
    assertions: task.assertions || [],
  };
}
/** Version/target may change for a retest; tasks, policies and execution budgets must stay comparable. */
export function compareTwinJobs(
  currentJob: TwinJob,
  previousJob: TwinJob,
): TwinComparison {
  const differences: string[] = [];
  const currentSpec = currentJob.spec;
  const previousSpec = previousJob.spec;
  if (currentSpec.mode !== previousSpec.mode)
    differences.push("Execution mode changed.");
  if (currentSpec.objective !== previousSpec.objective)
    differences.push("Validation objective changed.");
  if (
    canonical(currentSpec.tasks.map(taskCondition)) !==
    canonical(previousSpec.tasks.map(taskCondition))
  )
    differences.push(
      "Task instructions, executable steps or success assertions changed.",
    );
  if (canonical(currentSpec.personas) !== canonical(previousSpec.personas))
    differences.push("Synthetic profiles or profile seeds changed.");
  if (canonical(currentSpec.settings) !== canonical(previousSpec.settings))
    differences.push(
      "Run count, concurrency, budgets, model or experiment seed changed.",
    );
  if ((currentSpec.policyVersion || "") !== (previousSpec.policyVersion || ""))
    differences.push("Behavioural policy version changed.");
  if (
    (currentSpec.evaluatorVersion || "") !==
    (previousSpec.evaluatorVersion || "")
  )
    differences.push("Finding evaluator version changed.");
  if (
    canonical(currentSpec.authorizedWritePaths || []) !==
    canonical(previousSpec.authorizedWritePaths || [])
  )
    differences.push("Authorized test write paths changed.");
  const comparable = !differences.length;
  const previous = buildTwinAnalytics(previousJob);
  const current = buildTwinAnalytics(currentJob);
  const change = (now: number | null, before: number | null) =>
    comparable && now !== null && before !== null
      ? Math.round((now - before) * 100) / 100
      : null;
  return {
    previousJobId: previousJob.id,
    currentJobId: currentJob.id,
    previousProductVersion: previousSpec.productVersion,
    currentProductVersion: currentSpec.productVersion,
    comparable,
    differences,
    previous,
    current,
    successRateChange: change(current.successRate, previous.successRate),
    medianSecondsChange: change(current.medianSeconds, previous.medianSeconds),
    limitation: comparable
      ? "Changes describe recorded runs of a comparable configured experiment. They do not establish a causal effect on real customers; product environment and model nondeterminism may still differ."
      : "Experiment conditions changed. Results are shown separately; a before/after improvement claim is not supported.",
  };
}

function humanBinaryOutcome(
  observation: ValidationObservation,
): boolean | null {
  if (observation.outcome === "success") return true;
  if (
    ["failure", "partial", "blocked", "abandoned", "assisted"].includes(
      observation.outcome,
    )
  )
    return false;
  return null;
}
/** Calibration uses explicit reviewed pairs, never guessed persona/human identity or inferred issue absence. */
export function calibrateTwinAgainstHumans(
  job: TwinJob,
  dossier: ValidationDossier,
  matches: TwinHumanMatch[] = [],
  reviews: TwinIssueReview[] = [],
): TwinCalibration {
  const observationById = new Map(
    dossier.observations.map((observation) => [observation.id, observation]),
  );
  const runById = new Map(job.runs.map((run) => [run.id, run]));
  const issuesById = new Map(job.issues.map((issue) => [issue.id, issue]));
  const humanIssuesById = new Map(
    dossier.issues.map((issue) => [issue.id, issue]),
  );
  const invalidMatchIds: string[] = [];
  const invalidReviewIds: string[] = [];
  const taskPairs: {
    match: TwinHumanMatch;
    human: ValidationObservation;
    syntheticSuccess: boolean;
    humanSuccess: boolean;
  }[] = [];
  const seenMatches = new Set<string>();
  const pairedHumanObservations = new Set<string>();
  const pairedSyntheticTasks = new Set<string>();
  const sameTarget = Boolean(
    dossier.campaign &&
    job.spec.targetUrl === new URL(dossier.campaign.url).href,
  );
  for (const value of matches) {
    let match: TwinHumanMatch;
    try {
      match = parseHumanMatch(value);
    } catch {
      invalidMatchIds.push(value.id || "unknown");
      continue;
    }
    const run = runById.get(match.runId);
    const result =
      run &&
      observedResults(run).find((result) => result.taskId === match.taskId);
    const human = observationById.get(match.observationId);
    const syntheticKey = `${match.runId}:${match.taskId}`;
    const humanSuccess = human ? humanBinaryOutcome(human) : null;
    const syntheticTask = job.spec.tasks.find(
      (task) => task.id === match.taskId,
    );
    const humanTask = dossier.campaign?.tasks.find(
      (task) => task.id === match.taskId,
    );
    if (
      !sameTarget ||
      match.jobId !== job.id ||
      !result ||
      result.outcome === "unknown" ||
      !human ||
      human.taskId !== match.taskId ||
      !syntheticTask ||
      !humanTask ||
      humanTask.successCriteria !== syntheticTask.successCriteria ||
      humanSuccess === null ||
      seenMatches.has(match.id) ||
      pairedHumanObservations.has(human.id) ||
      pairedSyntheticTasks.has(syntheticKey)
    ) {
      invalidMatchIds.push(match.id);
      continue;
    }
    seenMatches.add(match.id);
    pairedHumanObservations.add(human.id);
    pairedSyntheticTasks.add(syntheticKey);
    taskPairs.push({
      match,
      human,
      syntheticSuccess: result.outcome === "success",
      humanSuccess,
    });
  }
  const confusion = {
    bothSuccess: 0,
    bothNotSuccess: 0,
    syntheticSuccessHumanNot: 0,
    humanSuccessSyntheticNot: 0,
  };
  for (const pair of taskPairs) {
    if (pair.syntheticSuccess && pair.humanSuccess) confusion.bothSuccess++;
    else if (!pair.syntheticSuccess && !pair.humanSuccess)
      confusion.bothNotSuccess++;
    else if (pair.syntheticSuccess) confusion.syntheticSuccessHumanNot++;
    else confusion.humanSuccessSyntheticNot++;
  }
  const agreements = confusion.bothSuccess + confusion.bothNotSuccess;
  let confirmedIssues = 0;
  let falsePositives = 0;
  let missedIssues = 0;
  let inconclusiveIssues = 0;
  let severityAgreements = 0;
  let severityPairs = 0;
  const seenReviews = new Set<string>();
  const reviewedSyntheticIssues = new Set<string>();
  const reviewedMissedIssues = new Set<string>();
  for (const value of reviews) {
    let review: TwinIssueReview;
    try {
      review = parseIssueReview(value);
    } catch {
      invalidReviewIds.push(value.id || "unknown");
      continue;
    }
    const issue = review.issueId ? issuesById.get(review.issueId) : undefined;
    const humanIssue = review.humanIssueId
      ? humanIssuesById.get(review.humanIssueId)
      : undefined;
    const evidence = review.humanObservationIds.map((id) =>
      observationById.get(id),
    );
    const reviewedIssueKey = review.issueId || review.humanIssueId || "";
    const duplicate =
      review.verdict === "missed"
        ? reviewedMissedIssues.has(reviewedIssueKey)
        : reviewedSyntheticIssues.has(reviewedIssueKey);
    const badTask =
      issue &&
      issue.taskIds.length > 0 &&
      evidence.some(
        (observation) =>
          observation && !issue.taskIds.includes(observation.taskId),
      );
    const badHumanIssueEvidence =
      humanIssue &&
      review.humanObservationIds.some(
        (id) => !humanIssue.sourceIds.includes(id),
      );
    if (
      !sameTarget ||
      review.jobId !== job.id ||
      seenReviews.has(review.id) ||
      duplicate ||
      evidence.some((observation) => !observation) ||
      badTask ||
      badHumanIssueEvidence ||
      (review.verdict === "missed" ? !humanIssue || Boolean(issue) : !issue) ||
      (review.verdict === "confirmed" &&
        evidence.every(
          (observation) =>
            observation?.severity === "none" &&
            observation.outcome === "success",
        ))
    ) {
      invalidReviewIds.push(review.id);
      continue;
    }
    seenReviews.add(review.id);
    if (review.verdict === "missed") {
      reviewedMissedIssues.add(reviewedIssueKey);
      missedIssues++;
    } else reviewedSyntheticIssues.add(reviewedIssueKey);
    if (review.verdict === "confirmed") {
      confirmedIssues++;
      if (issue && humanIssue) {
        severityPairs++;
        if (issue.severity === humanIssue.severity) severityAgreements++;
      }
    }
    if (review.verdict === "not-substantiated") falsePositives++;
    if (review.verdict === "inconclusive") inconclusiveIssues++;
  }
  const humanParticipants = new Set(
    taskPairs.map((pair) => pair.human.testerId),
  ).size;
  const limitations = [
    "Agreement describes explicitly reviewed matched task outcomes, not population predictive accuracy, demand or willingness to pay.",
    "Success means unassisted completion; partial, blocked, failed, assisted and abandoned outcomes are grouped as not-success for this binary comparison.",
    "Issue false positives and misses require explicit reviewer decisions supported by human observations. Unreviewed issues are not counted as false positives.",
    "Product-version equivalence is reviewer-confirmed; human submissions do not contain an independently verified product version hash.",
  ];
  if (!taskPairs.length)
    limitations.push(
      "Not yet calibrated: no valid reviewed task pairs are available for this product and task.",
    );
  if (humanParticipants > 0 && humanParticipants < 20)
    limitations.push(
      `${humanParticipants} matched human participants are a small convenience sample. Repeated studies and held-out products are needed before claiming predictive accuracy.`,
    );
  if (invalidMatchIds.length || invalidReviewIds.length)
    limitations.push(
      "Invalid, duplicate or incomparable comparison references were excluded.",
    );
  return {
    label: "Reviewed human comparison",
    matchedAttempts: taskPairs.length,
    humanParticipants,
    agreement: percentage(agreements, taskPairs.length),
    agreements,
    disagreements: taskPairs.length - agreements,
    confusion,
    taskAgreement: job.spec.tasks.map((task) => {
      const pairs = taskPairs.filter((pair) => pair.match.taskId === task.id);
      return {
        taskId: task.id,
        matches: pairs.length,
        agreement: percentage(
          pairs.filter((pair) => pair.syntheticSuccess === pair.humanSuccess)
            .length,
          pairs.length,
        ),
        sourceMatchIds: pairs.map((pair) => pair.match.id),
      };
    }),
    confirmedIssues,
    falsePositives,
    missedIssues,
    inconclusiveIssues,
    issuePrecision: percentage(
      confirmedIssues,
      confirmedIssues + falsePositives,
    ),
    severityAgreement: percentage(severityAgreements, severityPairs),
    invalidMatchIds,
    invalidReviewIds,
    limitations,
  };
}
