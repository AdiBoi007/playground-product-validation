import type {
  Command,
  EvidenceAsset,
  Finding,
  Task,
  TaskResult,
  ParticipantFeedback,
} from "../../src/mvp/types.js";
import { HttpError } from "./http.js";

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Invalid action input.");
  return value as Obj;
};
function string(value: unknown, max = 4000): string {
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(400, "Invalid or oversized text field.");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new HttpError(400, "Invalid boolean field.");
  return value;
}
function enumValue<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw new HttpError(400, "Invalid selection.");
  return value as T;
}
function array<T>(
  value: unknown,
  max: number,
  parse: (value: unknown) => T,
): T[] {
  if (!Array.isArray(value) || value.length > max)
    throw new HttpError(400, "Invalid or oversized collection.");
  return value.map((entry) => parse(entry));
}
function task(value: unknown): Task {
  const item = object(value);
  return {
    id: string(item.id, 100),
    title: string(item.title, 160),
    instructions: string(item.instructions, 4000),
    question: string(item.question, 2000),
    ...(item.successCriteria === undefined
      ? {}
      : { successCriteria: string(item.successCriteria, 3000) }),
  };
}
function evidence(value: unknown, allowEmbeddedImage = false): EvidenceAsset {
  const item = object(value);
  const url = string(item.url, allowEmbeddedImage ? 4_300_000 : 8000);
  if (
    allowEmbeddedImage &&
    item.kind === "image" &&
    /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)
  )
    return {
      id: string(item.id, 300),
      name: string(item.name, 200),
      kind: "image",
      url,
    };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, "Evidence needs a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new HttpError(
      400,
      "Upload screenshots or provide an HTTP(S) recording link.",
    );
  return {
    id: string(item.id, 300),
    name: string(item.name, 200),
    kind: enumValue(item.kind, ["image", "video", "link"]),
    url,
  };
}
function result(value: unknown, allowEmbeddedImage = false): TaskResult {
  const item = object(value);
  if (
    item.durationSeconds !== undefined &&
    (typeof item.durationSeconds !== "number" ||
      !Number.isFinite(item.durationSeconds) ||
      item.durationSeconds < 0 ||
      item.durationSeconds > 86_400)
  )
    throw new HttpError(
      400,
      "Task duration must be between 0 and 86,400 seconds.",
    );
  return {
    taskId: string(item.taskId, 100),
    outcome: enumValue(item.outcome, ["success", "partial", "blocked"]),
    answer: string(item.answer, 8000),
    observation: string(item.observation, 10000),
    severity: enumValue(item.severity, ["none", "blocker", "major", "minor"]),
    evidence: array(item.evidence, 6, (value) =>
      evidence(value, allowEmbeddedImage),
    ),
    ...(item.durationSeconds === undefined
      ? {}
      : { durationSeconds: item.durationSeconds as number }),
    ...(item.executionOutcome === undefined
      ? {}
      : {
          executionOutcome: enumValue(item.executionOutcome, [
            "failed",
            "abandoned",
            "assisted",
          ] as const),
        }),
  };
}
export function parseFinding(value: unknown): Finding {
  const item = object(value);
  return {
    id: string(item.id, 100),
    title: string(item.title, 160),
    severity: enumValue(item.severity, ["blocker", "major", "minor"]),
    description: string(item.description, 10000),
    recommendation: string(item.recommendation, 5000),
    sourceIds: array(item.sourceIds, 100, (id) => string(id, 250)),
    taskIds: array(item.taskIds, 8, (id) => string(id, 100)),
  };
}
const campaignFields = [
  "title",
  "url",
  "audience",
  "objective",
  "assumption",
  "tasks",
  "tasksApproved",
] as const;
function campaignPatch(input: unknown, partial: boolean) {
  const value = object(input);
  const patch: Record<string, unknown> = {};
  for (const key of campaignFields) {
    if (partial && !(key in value)) continue;
    patch[key] =
      key === "tasks"
        ? array(value[key], 8, task)
        : key === "tasksApproved"
          ? bool(value[key])
          : string(
              value[key],
              key === "title" ? 120 : key === "url" ? 2000 : 4000,
            );
  }
  return patch;
}

/** Construct a fresh whitelisted command: never spread client profile / campaign objects. */
export function parseCommand(input: unknown): Command {
  const value = object(input);
  const type = string(value.type, 40);
  const campaignId = () => string(value.campaignId, 100);
  switch (type) {
    case "import-participant-feedback": {
      const feedback = object(value.feedback),
        mission = object(feedback.mission);
      if (
        feedback.kind !== "playground-participant-feedback" ||
        feedback.schemaVersion !== 1
      )
        throw new HttpError(400, "Unsupported participant feedback file.");
      return {
        type,
        identityConfirmed: bool(value.identityConfirmed),
        feedback: {
          kind: "playground-participant-feedback",
          schemaVersion: 1,
          assignmentId: string(feedback.assignmentId, 100),
          campaignId: string(feedback.campaignId, 100),
          testerId: string(feedback.testerId, 100),
          mission: {
            campaignId: string(mission.campaignId, 100),
            title: string(mission.title, 160),
            url: string(mission.url, 2000),
            audience: string(mission.audience, 4000),
            objective: string(mission.objective, 4000),
            tasks: array(mission.tasks, 8, task),
          },
          results: array(feedback.results, 8, (value) => result(value, true)),
          overallFeedback: string(feedback.overallFeedback, 10000),
          consentConfirmed: bool(feedback.consentConfirmed),
          submittedAt: string(feedback.submittedAt, 50),
        } as ParticipantFeedback,
      };
    }
    case "update-profile": {
      const profile = object(value.profile);
      return {
        type,
        profile: {
          name: string(profile.name, 100),
          expertise: array(profile.expertise, 20, (tag) => string(tag, 50)),
          device: enumValue(profile.device, ["desktop", "mobile", "both"]),
          availability: enumValue(profile.availability, ["available", "busy"]),
          bio: string(profile.bio, 2000),
        },
      };
    }
    case "create-campaign":
      return {
        type,
        campaign: campaignPatch(value.campaign, false) as Extract<
          Command,
          { type: "create-campaign" }
        >["campaign"],
      };
    case "update-campaign":
      return {
        type,
        campaignId: campaignId(),
        patch: campaignPatch(value.patch, true),
      };
    case "record-payment":
      throw new HttpError(
        403,
        "Payments are confirmed by Stripe, not a client action.",
      );
    case "invite-tester":
      return {
        type,
        campaignId: campaignId(),
        testerId: string(value.testerId, 100),
      };
    case "respond-invite":
      return {
        type,
        assignmentId: string(value.assignmentId, 100),
        accept: bool(value.accept),
      };
    case "submit-feedback":
      return {
        type,
        assignmentId: string(value.assignmentId, 100),
        results: array(value.results, 8, result),
        overallFeedback: string(value.overallFeedback, 10000),
        ...(value.consentConfirmed === undefined
          ? {}
          : { consentConfirmed: bool(value.consentConfirmed) }),
      };
    case "review-submission":
      return {
        type,
        submissionId: string(value.submissionId, 100),
        decision: enumValue(value.decision, ["approved", "revision"]),
        note: string(value.note, 4000),
      };
    case "record-payout":
      return {
        type,
        payoutId: string(value.payoutId, 100),
        reference: string(value.reference, 500),
      };
    case "synthesize-report":
      return { type, campaignId: campaignId() };
    case "update-report":
      return {
        type,
        reportId: string(value.reportId, 100),
        summary: string(value.summary, 10000),
        findings: array(value.findings, 32, parseFinding),
        ...(value.method === undefined
          ? {}
          : { method: enumValue(value.method, ["structured", "ai"] as const) }),
      };
    case "publish-report":
      return { type, reportId: string(value.reportId, 100) };
    case "retest":
      return {
        type,
        campaignId: campaignId(),
        url: string(value.url, 2000),
        changes: string(value.changes, 10000),
      };
    default:
      throw new HttpError(400, "Unknown action.");
  }
}
