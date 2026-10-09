import type { Sandbox, SandboxAnalysis, SandboxAttachment } from "./sandbox.js";
import type {
  Campaign,
  EvidenceAsset,
  Report,
  Task,
  TaskResult,
  WorkspaceData,
} from "./types.js";
import { TESTER_SLOTS, evidenceSources } from "./model.js";

export interface ValidationBrief {
  inputType:
    | "idea"
    | "website"
    | "figma"
    | "web-app"
    | "mobile-app"
    | "screenshots"
    | "documents";
  focus: string;
  audience: string;
  assumption: string;
  decision: string;
  desiredOutcome: string;
  targetUrl: string;
  successThreshold: number;
  productDescription?: string;
}
export interface ValidationPlan {
  tasks: Task[];
  method: "ai" | "template";
  createdAt: string;
  approvedAt?: string;
}
export interface SandboxValidation {
  brief: ValidationBrief;
  plan?: ValidationPlan;
  campaignId?: string;
  briefAssets?: { name: string; mimeType: string; dataUrl: string }[];
  briefDocuments?: SandboxAttachment[];
}
export type ValidationOutcome =
  "success" | "partial" | "blocked" | "failure" | "abandoned" | "assisted";
export type ValidationSeverity = "critical" | "high" | "medium" | "low";
export interface ValidationObservation {
  id: string;
  submissionId: string;
  testerId: string;
  participant: string;
  device: "desktop" | "mobile" | "both" | "unknown";
  taskId: string;
  taskTitle: string;
  outcome: ValidationOutcome;
  answer: string;
  observation: string;
  severity: ValidationSeverity | "none";
  durationSeconds: number | null;
  evidence: EvidenceAsset[];
  consentConfirmed: boolean;
  recordedAt: string;
  submittedVia?: "workspace" | "portable";
}
export interface ValidationTaskAnalytics {
  taskId: string;
  title: string;
  instructions: string;
  successCriteria: string;
  attempts: number;
  success: number;
  failure: number;
  abandoned: number;
  assisted: number;
  partial: number;
  blocked: number;
  successRate: number | null;
  medianSeconds: number | null;
  sourceIds: string[];
}
export interface ValidationIssue {
  id: string;
  title: string;
  severity: ValidationSeverity;
  description: string;
  recommendation: string;
  sourceIds: string[];
  taskIds: string[];
  affectedParticipants: number;
  basis: "reviewed-finding" | "proposed-finding" | "observed-feedback";
  effort: "Not estimated";
}
export interface ValidationMetrics {
  participants: number;
  expectedParticipants: number;
  approvedSubmissions: number;
  submittedParticipants: number;
  attempts: number;
  success: number;
  failure: number;
  abandoned: number;
  assisted: number;
  partial: number;
  blocked: number;
  successRate: number | null;
  failureRate: number | null;
  medianSeconds: number | null;
  timedAttempts: number;
  timeDistribution: {
    sourceId: string;
    taskId: string;
    participant: string;
    seconds: number;
  }[];
  severities: Record<ValidationSeverity, number>;
}
export interface ValidationVerdict {
  status: "Ship" | "Modify" | "Retest" | "Insufficient Evidence";
  reason: string;
  criteria: {
    minimumParticipants: number;
    approvedParticipants: number;
    successThreshold: number;
    actualSuccessRate: number | null;
    reportPublished: boolean;
    noCriticalIssues: boolean;
    successCriteriaDefined: boolean;
    taskThresholdsMet: boolean;
  };
}
export interface ValidationComparison {
  previousCampaignId: string;
  previousRound: number;
  currentRound: number;
  previousParticipants: number;
  currentParticipants: number;
  previousSuccessRate: number | null;
  currentSuccessRate: number | null;
  successRateChange: number | null;
  previousMedianSeconds: number | null;
  currentMedianSeconds: number | null;
  comparable: boolean;
  limitation: string;
}
export interface ValidationDossier {
  sandboxId: string;
  title: string;
  generatedAt: string;
  brief: ValidationBrief;
  plan?: ValidationPlan;
  campaign?: Campaign;
  report?: Report;
  research?: SandboxAnalysis;
  observations: ValidationObservation[];
  metrics: ValidationMetrics;
  tasks: ValidationTaskAnalytics[];
  issues: ValidationIssue[];
  verdict: ValidationVerdict;
  comparison?: ValidationComparison;
  limitations: string[];
  executiveSummary: string;
  nextExperiments: {
    title: string;
    instructions: string;
    successCriteria: string;
    sourceIds: string[];
  }[];
}

const INPUT_TYPES = [
  "idea",
  "website",
  "figma",
  "web-app",
  "mobile-app",
  "screenshots",
  "documents",
] as const;
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} could not be read.`);
  return value as Record<string, unknown>;
}
function boundedText(value: unknown, label: string, max = 5000): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${label} must be text of ${max} characters or fewer.`);
  return value.trim();
}
function timestamp(value: unknown, label: string): string {
  const result = boundedText(value, label, 50);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error(`${label} must be a valid date.`);
  return result;
}
export function validateSandboxValidation(value: unknown): SandboxValidation {
  const item = object(value, "Validation workspace");
  const source = object(item.brief, "Validation brief");
  if (!INPUT_TYPES.includes(source.inputType as ValidationBrief["inputType"]))
    throw new Error("Choose a supported product input type.");
  if (
    typeof source.successThreshold !== "number" ||
    !Number.isFinite(source.successThreshold) ||
    source.successThreshold < 1 ||
    source.successThreshold > 100
  )
    throw new Error(
      "Task success threshold must be between 1 and 100 percent.",
    );
  const targetUrl = boundedText(source.targetUrl, "Product URL", 2000);
  if (targetUrl) {
    try {
      const url = new URL(targetUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new Error("Enter an HTTP(S) product URL without credentials.");
    }
  }
  const brief: ValidationBrief = {
    inputType: source.inputType as ValidationBrief["inputType"],
    focus: boundedText(source.focus, "Validation focus"),
    audience: boundedText(source.audience, "Target audience"),
    assumption: boundedText(source.assumption, "Biggest assumption"),
    decision: boundedText(source.decision, "Decision"),
    desiredOutcome: boundedText(source.desiredOutcome, "Desired outcome"),
    targetUrl,
    successThreshold: source.successThreshold,
  };
  if (source.productDescription !== undefined)
    brief.productDescription = boundedText(
      source.productDescription,
      "Product description",
      30000,
    );
  let plan: ValidationPlan | undefined;
  if (item.plan !== undefined) {
    const saved = object(item.plan, "Test plan");
    if (!["ai", "template"].includes(saved.method as string))
      throw new Error("Choose a supported test design method.");
    if (
      !Array.isArray(saved.tasks) ||
      saved.tasks.length < 1 ||
      saved.tasks.length > 8
    )
      throw new Error("A test plan needs one to eight tasks.");
    const tasks = saved.tasks.map((value) => {
      const task = object(value, "Test task");
      const result: Task = {
        id: boundedText(task.id, "Task ID", 200),
        title: boundedText(task.title, "Task title", 300),
        instructions: boundedText(task.instructions, "Task instructions", 6000),
        question: boundedText(task.question, "Task question", 3000),
      };
      if (
        !result.id ||
        !result.title ||
        !result.instructions ||
        !result.question
      )
        throw new Error(
          "Each task needs an ID, title, instructions and question.",
        );
      if (task.successCriteria !== undefined)
        result.successCriteria = boundedText(
          task.successCriteria,
          "Success criteria",
          3000,
        );
      return result;
    });
    if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
      throw new Error("Every test task needs a unique ID.");
    plan = {
      tasks,
      method: saved.method as ValidationPlan["method"],
      createdAt: timestamp(saved.createdAt, "Plan creation date"),
    };
    if (saved.approvedAt !== undefined)
      plan.approvedAt = timestamp(saved.approvedAt, "Plan approval date");
  }
  let briefAssets: SandboxValidation["briefAssets"];
  if (item.briefAssets !== undefined) {
    if (!Array.isArray(item.briefAssets) || item.briefAssets.length > 3)
      throw new Error("Attach up to three product screenshots.");
    briefAssets = item.briefAssets.map((value) => {
      const asset = object(value, "Product screenshot");
      const name = boundedText(asset.name, "Screenshot name", 200);
      const mimeType = boundedText(asset.mimeType, "Screenshot type", 50);
      if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType))
        throw new Error("Product screenshots must be PNG, JPEG or WebP.");
      const dataUrl = boundedText(asset.dataUrl, "Screenshot data", 630000);
      const match =
        /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          dataUrl,
        );
      if (
        !match ||
        match[1] !== mimeType ||
        (match[2].length * 3) / 4 > 450 * 1024
      )
        throw new Error(
          "Each product screenshot must be a valid image of 450 KB or less.",
        );
      let bytes = "";
      try {
        bytes = atob(match[2]);
      } catch {
        throw new Error("Product screenshot data could not be decoded.");
      }
      const hasImageHeader =
        mimeType === "image/png"
          ? bytes.startsWith("\x89PNG\r\n\x1a\n")
          : mimeType === "image/jpeg"
            ? bytes.startsWith("\xff\xd8\xff")
            : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
      if (!hasImageHeader)
        throw new Error(
          "Product screenshot content does not match its image type.",
        );
      return { name, mimeType, dataUrl };
    });
  }
  const result: SandboxValidation = { brief };
  if (plan) result.plan = plan;
  if (briefAssets) result.briefAssets = briefAssets;
  if (item.briefDocuments !== undefined) {
    if (!Array.isArray(item.briefDocuments) || item.briefDocuments.length > 3)
      throw new Error("Attach up to three validation documents.");
    result.briefDocuments = item.briefDocuments.map((value) => {
      const attachment = object(value, "Validation document");
      const name = boundedText(attachment.name, "Document name", 200);
      const text = boundedText(attachment.text, "Document text", 30000);
      if (!name || !text)
        throw new Error("Validation documents need a name and readable text.");
      const document: SandboxAttachment = { name, text };
      if (attachment.mimeType !== undefined)
        document.mimeType = boundedText(
          attachment.mimeType,
          "Document type",
          100,
        );
      return document;
    });
  }
  if (item.campaignId !== undefined) {
    const campaignId = boundedText(item.campaignId, "Linked campaign ID", 200);
    if (!campaignId) throw new Error("A linked campaign needs an ID.");
    result.campaignId = campaignId;
  }
  return result;
}

export function defaultValidationBrief(sandbox: Sandbox): ValidationBrief {
  return {
    inputType: sandbox.analysis?.product.url ? "website" : "idea",
    focus: "",
    audience: sandbox.analysis?.product.audience ?? "",
    assumption: "",
    decision: "",
    desiredOutcome: "",
    targetUrl: sandbox.analysis?.product.url ?? "",
    successThreshold: 80,
    productDescription:
      sandbox.analysis?.product.description || sandbox.initialInput,
  };
}
export function validationOutcome(result: TaskResult): ValidationOutcome {
  if (result.executionOutcome === "failed") return "failure";
  if (result.executionOutcome === "abandoned") return "abandoned";
  if (result.executionOutcome === "assisted") return "assisted";
  return result.outcome;
}
const severityOf = (
  severity: TaskResult["severity"],
): ValidationSeverity | "none" =>
  severity === "blocker"
    ? "critical"
    : severity === "major"
      ? "high"
      : severity === "minor"
        ? "low"
        : "none";
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function countOutcomes(observations: ValidationObservation[]) {
  const count = (outcome: ValidationOutcome) =>
    observations.filter((entry) => entry.outcome === outcome).length;
  const success = count("success"),
    blocked = count("blocked");
  return {
    attempts: observations.length,
    success,
    failure: count("failure") + blocked + count("partial"),
    abandoned: count("abandoned"),
    assisted: count("assisted"),
    partial: count("partial"),
    blocked,
  };
}
function campaignObservations(
  data: WorkspaceData,
  campaign: Campaign,
): ValidationObservation[] {
  const sources = evidenceSources(data, campaign.id).filter((source) =>
    campaign.tasks.some((task) => task.id === source.taskId),
  );
  const participants = [
    ...new Set(sources.map((source) => source.testerId)),
  ].sort();
  return sources.map((source) => {
    const submission = data.submissions.find(
      (entry) => entry.id === source.submissionId,
    )!;
    const value = source.result.durationSeconds;
    return {
      id: source.id,
      submissionId: source.submissionId,
      testerId: source.testerId,
      participant: `Participant ${participants.indexOf(source.testerId) + 1}`,
      device:
        data.profiles.find((profile) => profile.id === source.testerId)
          ?.device ?? "unknown",
      taskId: source.taskId,
      taskTitle: source.taskTitle,
      outcome: validationOutcome(source.result),
      answer: source.result.answer,
      observation: source.result.observation,
      severity: severityOf(source.result.severity),
      durationSeconds:
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 86400
          ? value
          : null,
      evidence: source.result.evidence,
      consentConfirmed: submission.consentConfirmed === true,
      recordedAt: submission.participantSubmittedAt ?? submission.createdAt,
      submittedVia: submission.submittedVia ?? "workspace",
    };
  });
}
function campaignMetrics(
  data: WorkspaceData,
  campaign: Campaign | undefined,
  observations: ValidationObservation[],
  issues: ValidationIssue[],
): ValidationMetrics {
  const counts = countOutcomes(observations);
  const timeDistribution = observations.flatMap((entry) =>
    entry.durationSeconds === null
      ? []
      : [
          {
            sourceId: entry.id,
            taskId: entry.taskId,
            participant: entry.participant,
            seconds: entry.durationSeconds,
          },
        ],
  );
  return {
    ...counts,
    participants: new Set(observations.map((entry) => entry.testerId)).size,
    expectedParticipants: TESTER_SLOTS,
    approvedSubmissions: campaign
      ? data.submissions.filter(
          (submission) =>
            submission.campaignId === campaign.id &&
            submission.status === "approved",
        ).length
      : 0,
    submittedParticipants: campaign
      ? new Set(
          data.submissions
            .filter((submission) => submission.campaignId === campaign.id)
            .map((submission) => submission.testerId),
        ).size
      : 0,
    successRate: counts.attempts
      ? Math.round((counts.success / counts.attempts) * 1000) / 10
      : null,
    failureRate: counts.attempts
      ? Math.round((counts.failure / counts.attempts) * 1000) / 10
      : null,
    medianSeconds: median(timeDistribution.map((entry) => entry.seconds)),
    timedAttempts: timeDistribution.length,
    timeDistribution,
    severities: {
      critical: issues.filter((issue) => issue.severity === "critical").length,
      high: issues.filter((issue) => issue.severity === "high").length,
      medium: issues.filter((issue) => issue.severity === "medium").length,
      low: issues.filter((issue) => issue.severity === "low").length,
    },
  };
}
const priority: Record<ValidationSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
export function buildValidationDossier(
  sandbox: Sandbox,
  data: WorkspaceData,
): ValidationDossier {
  const brief = sandbox.validation?.brief ?? defaultValidationBrief(sandbox);
  const campaign = data.campaigns.find(
    (entry) =>
      entry.id === sandbox.validation?.campaignId &&
      entry.founderId === sandbox.founderId,
  );
  const report = campaign
    ? (data.reports.find(
        (entry) =>
          entry.campaignId === campaign.id && entry.status === "published",
      ) ?? data.reports.find((entry) => entry.campaignId === campaign.id))
    : undefined;
  const observations = campaign ? campaignObservations(data, campaign) : [];
  const byId = new Map(observations.map((entry) => [entry.id, entry]));
  const anonymousText = (value: string) => {
    let result = value;
    for (const entry of observations) {
      const name = data.profiles.find(
        (profile) => profile.id === entry.testerId,
      )?.name;
      if (name && name.length >= 2)
        result = result.split(name).join(entry.participant);
    }
    return result;
  };
  const issues: ValidationIssue[] = (report?.findings ?? []).flatMap(
    (finding) => {
      const sourceIds = finding.sourceIds.filter((id) => byId.has(id));
      if (!sourceIds.length) return [];
      const severity = severityOf(finding.severity) as ValidationSeverity;
      return [
        {
          ...finding,
          title: anonymousText(finding.title),
          description: anonymousText(finding.description),
          recommendation: anonymousText(finding.recommendation),
          severity,
          sourceIds,
          taskIds: finding.taskIds.filter((id) =>
            sourceIds.some((sourceId) => byId.get(sourceId)?.taskId === id),
          ),
          affectedParticipants: new Set(
            sourceIds.map((id) => byId.get(id)?.testerId),
          ).size,
          basis:
            report?.status === "published"
              ? ("reviewed-finding" as const)
              : ("proposed-finding" as const),
          effort: "Not estimated" as const,
        },
      ];
    },
  );
  for (const task of campaign?.tasks ?? []) {
    const uncovered = observations.filter(
      (entry) =>
        entry.taskId === task.id &&
        (entry.outcome !== "success" || entry.severity !== "none") &&
        !issues.some((issue) => issue.sourceIds.includes(entry.id)),
    );
    if (!uncovered.length) continue;
    const severity: ValidationSeverity = uncovered.some(
      (entry) => entry.severity === "critical",
    )
      ? "critical"
      : uncovered.some((entry) => entry.severity === "high")
        ? "high"
        : uncovered.some((entry) => entry.severity === "low")
          ? "low"
          : "medium";
    issues.push({
      id: `observed:${task.id}`,
      title: `Friction in: ${task.title}`,
      severity,
      description: uncovered
        .map((entry) => `${entry.participant}: ${entry.observation}`)
        .join("\n\n"),
      recommendation: `Review the cited observations for “${task.title}”, change the part of the flow participants struggled with, and repeat this task against the same success criteria.`,
      sourceIds: uncovered.map((entry) => entry.id),
      taskIds: [task.id],
      affectedParticipants: new Set(uncovered.map((entry) => entry.testerId))
        .size,
      basis: "observed-feedback",
      effort: "Not estimated",
    });
  }
  issues.sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity] ||
      b.affectedParticipants - a.affectedParticipants,
  );
  const metrics = campaignMetrics(data, campaign, observations, issues);
  const tasks = (campaign?.tasks ?? sandbox.validation?.plan?.tasks ?? []).map(
    (task): ValidationTaskAnalytics => {
      const entries = observations.filter((entry) => entry.taskId === task.id),
        counts = countOutcomes(entries);
      return {
        ...counts,
        taskId: task.id,
        title: task.title,
        instructions: task.instructions,
        successCriteria: task.successCriteria ?? "Not defined",
        successRate: counts.attempts
          ? Math.round((counts.success / counts.attempts) * 1000) / 10
          : null,
        medianSeconds: median(
          entries.flatMap((entry) =>
            entry.durationSeconds === null ? [] : [entry.durationSeconds],
          ),
        ),
        sourceIds: entries.map((entry) => entry.id),
      };
    },
  );
  const successCriteriaDefined = Boolean(
    campaign?.tasks.length &&
    campaign.tasks.every((task) => task.successCriteria?.trim()),
  );
  const taskThresholdsMet =
    tasks.length > 0 &&
    tasks.every(
      (task) =>
        task.successRate !== null && task.successRate >= brief.successThreshold,
    );
  const criteria = {
    minimumParticipants: TESTER_SLOTS,
    approvedParticipants: metrics.participants,
    successThreshold: brief.successThreshold,
    actualSuccessRate: metrics.successRate,
    reportPublished: report?.status === "published",
    noCriticalIssues:
      !issues.some((issue) => issue.severity === "critical") &&
      !observations.some((entry) => entry.severity === "critical"),
    successCriteriaDefined,
    taskThresholdsMet,
  };
  let verdict: ValidationVerdict;
  const completeEvidence = Boolean(
    campaign &&
    metrics.participants >= TESTER_SLOTS &&
    metrics.attempts >= campaign.tasks.length * TESTER_SLOTS &&
    criteria.reportPublished &&
    successCriteriaDefined,
  );
  if (!completeEvidence)
    verdict = {
      status: "Insufficient Evidence",
      reason: !campaign
        ? "Not yet tested. Approve the mission and link a human testing campaign."
        : metrics.participants < TESTER_SLOTS
          ? `${metrics.participants} of ${TESTER_SLOTS} participants have QA-approved evidence. Complete the cohort before a validation decision.`
          : !successCriteriaDefined
            ? "Define measurable success criteria before interpreting this campaign as validation."
            : !criteria.reportPublished
              ? "Review and publish the evidence report before a validation decision."
              : "Some approved task outcomes are missing; complete and review the mission evidence.",
      criteria,
    };
  else if (
    !criteria.noCriticalIssues ||
    issues.some((issue) => issue.severity === "high") ||
    !taskThresholdsMet
  )
    verdict = {
      status: "Modify",
      reason: `The tested flow has significant friction or a task below the ${brief.successThreshold}% unassisted success threshold. Address the cited issues before another round.`,
      criteria,
    };
  else if (
    issues.length ||
    metrics.assisted ||
    metrics.partial ||
    metrics.abandoned ||
    brief.successThreshold < 80
  )
    verdict = {
      status: "Retest",
      reason:
        brief.successThreshold < 80
          ? "Use a success threshold of at least 80% and retest before recommending Ship."
          : "The tested flow meets the success threshold, but observed friction remains. Change the cited steps and retest against the same criteria.",
      criteria,
    };
  else
    verdict = {
      status: "Ship",
      reason: `All tasks reached the ${brief.successThreshold}% unassisted success threshold with ${metrics.participants} QA-approved participants and no observed issues. This supports the tested flow for this cohort only.`,
      criteria,
    };
  const limitations = [
    "Participant outcomes describe this recruited cohort; they do not establish market demand or population-wide conversion.",
    "Reported task times come from participant timers or manual entries, not instrumented product telemetry.",
    "This dashboard groups feedback by test task; issue groupings should be reviewed before product decisions.",
  ];
  if (!observations.length)
    limitations.unshift(
      "Not yet tested. Research and AI recommendations are not behavioural validation evidence.",
    );
  else if (metrics.participants <= TESTER_SLOTS)
    limitations.unshift(
      `Small sample: ${metrics.participants} QA-approved participant${metrics.participants === 1 ? "" : "s"}. Treat the results as directional evidence for this cohort.`,
    );
  if (metrics.timedAttempts < metrics.attempts)
    limitations.push(
      `${metrics.attempts - metrics.timedAttempts} task attempts have no recorded timing and are excluded from time statistics.`,
    );
  if (
    observations.some(
      (entry) =>
        entry.evidence.some(
          (asset) => asset.kind === "image" || asset.kind === "video",
        ) && !entry.consentConfirmed,
    )
  )
    limitations.push(
      "Some legacy media has no recorded participant consent; do not share it until consent is confirmed.",
    );
  if (report?.status === "draft")
    limitations.push(
      "The synthesis report is a draft awaiting operations review.",
    );
  if (observations.some((entry) => entry.submittedVia === "portable"))
    limitations.push(
      "Portable mission responses were imported by a coordinator. Participant identity and consent were confirmed by that coordinator; identity and reported timestamps are not independently authenticated.",
    );
  let comparison: ValidationComparison | undefined;
  const previous = campaign?.parentCampaignId
    ? data.campaigns.find(
        (entry) =>
          entry.id === campaign.parentCampaignId &&
          entry.founderId === sandbox.founderId,
      )
    : undefined;
  if (campaign && previous) {
    const previousObservations = campaignObservations(data, previous),
      previousMetrics = campaignMetrics(
        data,
        previous,
        previousObservations,
        [],
      );
    const sameMission =
      previous.audience.trim() === campaign.audience.trim() &&
      previous.tasks.length === campaign.tasks.length &&
      previous.tasks.every((task) =>
        campaign.tasks.some(
          (next) =>
            next.id === task.id &&
            next.successCriteria === task.successCriteria &&
            next.instructions === task.instructions &&
            next.question === task.question,
        ),
      );
    const comparable =
      sameMission &&
      previousMetrics.participants >= TESTER_SLOTS &&
      metrics.participants >= TESTER_SLOTS;
    comparison = {
      previousCampaignId: previous.id,
      previousRound: previous.round,
      currentRound: campaign.round,
      previousParticipants: previousMetrics.participants,
      currentParticipants: metrics.participants,
      previousSuccessRate: previousMetrics.successRate,
      currentSuccessRate: metrics.successRate,
      successRateChange:
        comparable &&
        previousMetrics.successRate !== null &&
        metrics.successRate !== null
          ? Math.round(
              (metrics.successRate - previousMetrics.successRate) * 10,
            ) / 10
          : null,
      previousMedianSeconds: previousMetrics.medianSeconds,
      currentMedianSeconds: metrics.medianSeconds,
      comparable,
      limitation: comparable
        ? "Directional comparison between rounds using the same tasks and audience. This is not a controlled causal experiment; returning participants may improve through familiarity."
        : "Comparison needs five reviewed participants in each round with the same audience, tasks and success criteria.",
    };
    limitations.push(comparison.limitation);
    if (
      previousMetrics.timedAttempts !== previousMetrics.attempts ||
      metrics.timedAttempts !== metrics.attempts
    )
      limitations.push(
        `Timing coverage differs or is incomplete: ${previousMetrics.timedAttempts}/${previousMetrics.attempts} attempts in the previous round and ${metrics.timedAttempts}/${metrics.attempts} in this round have recorded times.`,
      );
    const mix = (entries: ValidationObservation[]) => {
      const devices = new Map(
        entries.map((entry) => [entry.testerId, entry.device]),
      );
      return JSON.stringify(
        ["desktop", "mobile", "both", "unknown"].map(
          (device) =>
            [...devices.values()].filter((value) => value === device).length,
        ),
      );
    };
    if (mix(previousObservations) !== mix(observations))
      limitations.push(
        "The participant device mix differs between rounds; device differences may explain part of the outcome change.",
      );
  }
  return {
    sandboxId: sandbox.id,
    title: sandbox.title,
    generatedAt: new Date().toISOString(),
    brief,
    plan: sandbox.validation?.plan,
    campaign,
    report: report
      ? {
          ...report,
          summary: anonymousText(report.summary),
          findings: report.findings.map((finding) => ({
            ...finding,
            title: anonymousText(finding.title),
            description: anonymousText(finding.description),
            recommendation: anonymousText(finding.recommendation),
          })),
        }
      : undefined,
    research: sandbox.analysis,
    observations,
    metrics,
    tasks,
    issues,
    verdict,
    comparison,
    limitations,
    executiveSummary: observations.length
      ? `${verdict.status}: ${metrics.success} of ${metrics.attempts} QA-approved task attempts succeeded without assistance across ${metrics.participants} participants. ${issues.length} evidence-backed issue${issues.length === 1 ? "" : "s"}. ${verdict.reason}`
      : `Not yet tested. ${verdict.reason}`,
    nextExperiments: issues.map((issue) => ({
      title: `Retest: ${issue.title}`,
      instructions: issue.recommendation,
      successCriteria: `${brief.successThreshold}% of participants complete the affected tasks without help.`,
      sourceIds: issue.sourceIds,
    })),
  };
}
