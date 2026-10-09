import { describe, expect, it } from "vitest";
import { emptyData } from "./model";
import { createSandbox, validateSandbox } from "./sandbox";
import {
  buildValidationDossier,
  validateSandboxValidation,
} from "./validation";
import type { Campaign, Submission, TaskResult, WorkspaceData } from "./types";
import type { Sandbox } from "./sandbox";

const date = "2026-10-09T01:00:00.000Z";
function fixture() {
  const data = emptyData();
  const campaign: Campaign = {
    id: "campaign",
    founderId: "founder",
    title: "Onboarding",
    url: "https://example.com",
    audience: "New independent designers",
    objective: "Can new users finish onboarding without help?",
    assumption: "The first action is clear",
    tasks: [
      {
        id: "task",
        title: "Complete onboarding",
        instructions:
          "Open the application and finish the first action without help.",
        question: "What happened?",
        successCriteria:
          "Reach the first completed action without moderator assistance.",
      },
    ],
    tasksApproved: true,
    payment: "paid",
    priceCents: 14900,
    currency: "usd",
    round: 1,
    changes: "",
    createdAt: date,
    updatedAt: date,
  };
  data.campaigns.push(campaign);
  const sandbox: Sandbox = {
    ...createSandbox("founder", "Can new users finish onboarding?"),
    validation: {
      brief: {
        inputType: "web-app",
        focus: "Onboarding",
        audience: campaign.audience,
        assumption: campaign.assumption,
        decision: "Ship or change onboarding",
        desiredOutcome: "New users complete onboarding independently",
        targetUrl: campaign.url,
        successThreshold: 80,
      },
      campaignId: campaign.id,
    },
  };
  return { data, sandbox, campaign };
}
function addParticipant(
  data: WorkspaceData,
  index: number,
  result: Partial<TaskResult> = {},
  status: Submission["status"] = "approved",
  campaignId = "campaign",
) {
  const testerId = `tester-${index}`;
  if (!data.profiles.some((profile) => profile.id === testerId))
    data.profiles.push({
      id: testerId,
      role: "tester",
      name: `Private Tester ${index}`,
      email: `private${index}@example.com`,
      expertise: ["design"],
      device: index % 2 ? "mobile" : "desktop",
      availability: "available",
      bio: "",
      createdAt: date,
    });
  const assignmentId = `${campaignId}:assignment-${index}`;
  data.assignments.push({
    id: assignmentId,
    campaignId,
    testerId,
    status:
      status === "approved"
        ? "approved"
        : status === "revision"
          ? "revision"
          : "submitted",
    invitedAt: date,
    acceptedAt: date,
  });
  data.submissions.push({
    id: `${campaignId}:submission-${index}`,
    assignmentId,
    campaignId,
    testerId,
    results: [
      {
        taskId: "task",
        outcome: "success",
        answer: "I completed the first action without any help.",
        observation: "The first-use instructions were understandable.",
        severity: "none",
        evidence: [
          {
            id: `evidence-${index}`,
            name: "Observation",
            kind: "link",
            url: `https://example.com/evidence/${index}`,
          },
        ],
        ...result,
      },
    ],
    overallFeedback: "The flow worked for my task.",
    status,
    qaNote: "Checked the task and evidence.",
    consentConfirmed: true,
    createdAt: date,
    updatedAt: date,
  });
}
function publish(data: WorkspaceData, campaignId = "campaign") {
  data.reports.push({
    id: `${campaignId}:report`,
    campaignId,
    summary: "All submissions reviewed against the mission criteria.",
    findings: [],
    status: "published",
    method: "structured",
    generatedAt: date,
    reviewedAt: date,
    reviewerId: "admin",
  });
}

describe("evidence-backed validation dossier", () => {
  it("preserves old sandboxes and reports untested metrics as null rather than zero", () => {
    const sandbox = createSandbox("founder", "Idea only");
    expect(validateSandbox(sandbox).validation).toBeUndefined();
    const dossier = buildValidationDossier(sandbox, emptyData());
    expect(dossier.metrics).toMatchObject({
      participants: 0,
      attempts: 0,
      successRate: null,
      failureRate: null,
      medianSeconds: null,
      timedAttempts: 0,
    });
    expect(dossier.verdict.status).toBe("Insufficient Evidence");
    expect(dossier.executiveSummary).toContain("Not yet tested");
  });
  it("uses only QA-approved observations and keeps measured zero distinct from missing time", () => {
    const { data, sandbox } = fixture();
    addParticipant(data, 1, { durationSeconds: 0, outcome: "blocked" });
    addParticipant(data, 2, { durationSeconds: 200 }, "revision");
    addParticipant(data, 3, { durationSeconds: 100 }, "submitted");
    addParticipant(data, 4);
    const dossier = buildValidationDossier(sandbox, data);
    expect(dossier.metrics).toMatchObject({
      participants: 2,
      submittedParticipants: 4,
      attempts: 2,
      success: 1,
      failure: 1,
      successRate: 50,
      medianSeconds: 0,
      timedAttempts: 1,
    });
    expect(dossier.observations).toHaveLength(2);
    expect(dossier.metrics.timeDistribution[0].seconds).toBe(0);
    expect(dossier.observations[1].durationSeconds).toBeNull();
    expect(dossier.limitations.join(" ")).toContain(
      "1 task attempts have no recorded timing",
    );
  });
  it("does not count assisted completion, abandonment or partial completion as unassisted success", () => {
    const { data, sandbox } = fixture();
    addParticipant(data, 1, { executionOutcome: "assisted" });
    addParticipant(data, 2, {
      outcome: "partial",
      executionOutcome: "abandoned",
    });
    addParticipant(data, 3, { outcome: "blocked", executionOutcome: "failed" });
    addParticipant(data, 4, { outcome: "partial" });
    const dossier = buildValidationDossier(sandbox, data);
    expect(dossier.metrics).toMatchObject({
      success: 0,
      assisted: 1,
      abandoned: 1,
      failure: 2,
      partial: 1,
      blocked: 0,
      successRate: 0,
    });
    expect(dossier.verdict.status).toBe("Insufficient Evidence");
    expect(dossier.issues[0].sourceIds).toHaveLength(4);
  });
  it("calculates median, time distribution and task-level denominators from the actual reviewed cohort", () => {
    const { data, sandbox } = fixture();
    [100, 10, 40, 20, 30].forEach((durationSeconds, index) =>
      addParticipant(data, index, { durationSeconds }),
    );
    const dossier = buildValidationDossier(sandbox, data);
    expect(dossier.metrics.medianSeconds).toBe(30);
    expect(dossier.metrics.timeDistribution).toHaveLength(5);
    expect(dossier.tasks[0]).toMatchObject({
      attempts: 5,
      success: 5,
      successRate: 100,
      medianSeconds: 30,
    });
    expect(dossier.verdict.status).toBe("Insufficient Evidence");
    publish(data);
    expect(buildValidationDossier(sandbox, data).verdict.status).toBe("Ship");
  });
  it("requires published review, measurable task criteria and an at-least80percent threshold before Ship", () => {
    const { data, sandbox, campaign } = fixture();
    for (let index = 0; index < 5; index++) addParticipant(data, index);
    publish(data);
    const missing = structuredClone(data);
    delete missing.campaigns[0].tasks[0].successCriteria;
    expect(buildValidationDossier(sandbox, missing).verdict.status).toBe(
      "Insufficient Evidence",
    );
    sandbox.validation!.brief.successThreshold = 60;
    expect(buildValidationDossier(sandbox, data).verdict.status).toBe("Retest");
    sandbox.validation!.brief.successThreshold = 80;
    campaign.founderId = "other-founder";
    expect(buildValidationDossier(sandbox, data).campaign).toBeUndefined();
  });
  it("ranks critical/high/low findings, links approved source evidence and anonymises participant names", () => {
    const { data, sandbox } = fixture();
    addParticipant(data, 0, {
      outcome: "blocked",
      severity: "blocker",
      observation: "The first action button did not respond.",
    });
    for (let index = 1; index < 5; index++) addParticipant(data, index);
    publish(data);
    data.reports[0].findings.push({
      id: "finding",
      title: "First action does not respond",
      severity: "blocker",
      description: "Private Tester 0 could not finish.",
      recommendation: "Repair the first action control and retest.",
      sourceIds: ["campaign:submission-0:task", "missing-source"],
      taskIds: ["task"],
    });
    const dossier = buildValidationDossier(sandbox, data);
    expect(dossier.verdict.status).toBe("Modify");
    expect(dossier.issues[0]).toMatchObject({
      severity: "critical",
      affectedParticipants: 1,
      sourceIds: ["campaign:submission-0:task"],
      basis: "reviewed-finding",
    });
    expect(dossier.issues[0].description).toContain("Participant 1");
    expect(dossier.issues[0].description).not.toContain("Private Tester");
    expect(dossier.observations[0].participant).toBe("Participant 1");
    expect(dossier.metrics.severities.critical).toBe(1);
    expect(dossier.nextExperiments[0].sourceIds).toEqual(
      dossier.issues[0].sourceIds,
    );
  });
  it("reports before/after change only for matching reviewed missions and explicitly limits causal interpretation", () => {
    const { data, sandbox, campaign } = fixture();
    for (let index = 0; index < 5; index++)
      addParticipant(data, index, index < 2 ? { outcome: "blocked" } : {});
    publish(data);
    const next = {
      ...structuredClone(campaign),
      id: "round-two",
      round: 2,
      parentCampaignId: campaign.id,
      changes: "Clarified the start control",
    };
    data.campaigns.push(next);
    sandbox.validation!.campaignId = next.id;
    for (let index = 0; index < 5; index++)
      addParticipant(data, index + 5, {}, "approved", next.id);
    publish(data, next.id);
    const dossier = buildValidationDossier(sandbox, data);
    expect(dossier.comparison).toMatchObject({
      comparable: true,
      previousSuccessRate: 60,
      currentSuccessRate: 100,
      successRateChange: 40,
    });
    expect(dossier.comparison?.limitation).toContain(
      "not a controlled causal experiment",
    );
    expect(dossier.limitations.join(" ")).toContain("Small sample: 5");
    next.tasks[0].instructions =
      "A different instructed path through onboarding.";
    expect(buildValidationDossier(sandbox, data).comparison).toMatchObject({
      comparable: false,
      successRateChange: null,
    });
    next.tasks[0].instructions = campaign.tasks[0].instructions;
    next.audience = "Experienced administrators";
    const changed = buildValidationDossier(sandbox, data);
    expect(changed.comparison).toMatchObject({
      comparable: false,
      successRateChange: null,
    });
  });
  it("does not compare an untested retest as a zero-percent regression", () => {
    const { data, sandbox, campaign } = fixture();
    for (let index = 0; index < 5; index++) addParticipant(data, index);
    data.campaigns.push({
      ...campaign,
      id: "round-two",
      round: 2,
      parentCampaignId: campaign.id,
    });
    sandbox.validation!.campaignId = "round-two";
    expect(buildValidationDossier(sandbox, data).comparison).toMatchObject({
      currentSuccessRate: null,
      successRateChange: null,
      comparable: false,
    });
  });
  it("round trips the validation plan and resized screenshot while rejecting unsafe or oversized inputs", () => {
    const { sandbox, campaign } = fixture();
    sandbox.validation!.plan = {
      tasks: campaign.tasks,
      method: "ai",
      createdAt: date,
      approvedAt: date,
    };
    sandbox.validation!.briefAssets = [
      {
        name: "Product.png",
        mimeType: "image/png",
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jitcAAAAASUVORK5CYII=",
      },
    ];
    expect(validateSandbox(sandbox).validation).toEqual(sandbox.validation);
    const bad = structuredClone(sandbox.validation!);
    bad.brief.targetUrl = "https://user:password@example.com";
    expect(() => validateSandboxValidation(bad)).toThrow("without credentials");
    bad.brief.targetUrl = "";
    bad.briefAssets![0].dataUrl = "https://example.com/private.png";
    expect(() => validateSandboxValidation(bad)).toThrow("valid image");
  });
});
