import { describe, expect, it } from "vitest";
import { emptyData } from "./model";
import { createSandbox } from "./sandbox";
import { buildValidationDossier } from "./validation";
import {
  buildDefaultTwinPersonas,
  buildTwinAnalytics,
  buildTwinReproducibility,
  calibrateTwinAgainstHumans,
  compareTwinJobs,
  defaultTwinSettings,
  validateTwinExperimentSpec,
  validateTwinJob,
  validateTwinWorkspace,
} from "./twin";
import type {
  TwinExperimentSpec,
  TwinHumanMatch,
  TwinIssue,
  TwinJob,
  TwinOutcome,
  TwinRun,
} from "./twin";
import type { Campaign } from "./types";

const date = "2026-10-09T01:00:00.000Z";
function experiment(): TwinExperimentSpec {
  return {
    mode: "functional",
    targetUrl: "https://product.example/",
    allowedOrigins: ["https://product.example"],
    authorizationConfirmed: true,
    productVersion: "v1",
    objective: "Can a visitor create their first project without help?",
    tasks: [
      {
        id: "onboarding",
        title: "Create a project",
        instructions: "Create your first project without help.",
        question: "What happened?",
        successCriteria:
          "The project-created confirmation is visible without help.",
        steps: [
          {
            id: "open",
            type: "navigate",
            url: "/",
            description: "Open the product",
          },
          {
            id: "assert",
            type: "assert",
            assertionId: "created",
            description: "Check confirmation",
          },
        ],
        assertions: [
          {
            id: "created",
            type: "text-visible",
            value: "Project created",
            description: "The project-created confirmation appears",
          },
        ],
      },
    ],
    personas: buildDefaultTwinPersonas("Create a first project", 10),
    settings: defaultTwinSettings(),
    approvedAt: date,
  };
}
function fixture(): TwinJob {
  return {
    id: "job-1",
    sandboxId: "sandbox-1",
    status: "queued",
    spec: experiment(),
    createdAt: date,
    updatedAt: date,
    runs: [],
    issues: [],
  };
}
function addRun(
  job: TwinJob,
  index: number,
  outcome: TwinOutcome = "success",
  durationSeconds: number | null = 30,
): TwinRun {
  const id = `run-${index}`;
  const eventId = `${id}:event`;
  const run: TwinRun = {
    id,
    personaId: job.spec.personas[index % job.spec.personas.length].id,
    status: "completed",
    createdAt: date,
    startedAt: date,
    finishedAt: "2026-10-09T01:01:00.000Z",
    events: [
      {
        id: eventId,
        taskId: "onboarding",
        at: date,
        elapsedMs: 0,
        type: "assertion",
        url: job.spec.targetUrl,
        summary: "Checked project confirmation",
        screenshotId: `${id}:shot`,
      },
    ],
    artifacts: [
      {
        id: `${id}:shot`,
        type: "screenshot",
        name: "Confirmation",
        url: `/api/twin?action=artifact&id=${id}`,
        mimeType: "image/png",
        createdAt: date,
        eventId,
      },
    ],
    taskResults: [
      {
        taskId: "onboarding",
        outcome,
        durationSeconds,
        reason:
          outcome === "success"
            ? "Confirmation observed"
            : "The configured workflow did not finish",
        eventIds: [eventId],
        assertions: [
          {
            assertionId: "created",
            passed: outcome === "unknown" ? null : outcome === "success",
            observed: "Captured confirmation state",
            eventId,
          },
        ],
      },
    ],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      modelCalls: 0,
      model: "",
    },
  };
  job.runs.push(run);
  return run;
}
function addIssue(job: TwinJob, id = "issue-1", runId = "run-0"): TwinIssue {
  const issue: TwinIssue = {
    id,
    title: "Confirmation missing",
    category: "usability",
    severity: "high",
    basis: "observed",
    description:
      "The configured browser journey ended without its confirmation.",
    affectedUrl: job.spec.targetUrl,
    taskIds: ["onboarding"],
    sourceRunIds: [runId],
    sourceEventIds: [`${runId}:event`],
    artifactIds: [`${runId}:shot`],
    reproductionSteps: [
      "Open the product",
      "Attempt to create a first project",
      "Inspect the confirmation state",
    ],
    proposedFix: "Show a clear confirmation when project creation succeeds.",
    requiresHumanVerification: true,
  };
  job.issues.push(issue);
  return issue;
}
function humanDossier() {
  const data = emptyData();
  const spec = experiment();
  const campaign: Campaign = {
    id: "human-campaign",
    founderId: "founder",
    title: "Human onboarding",
    url: spec.targetUrl,
    audience: "New product users",
    objective: spec.objective,
    assumption: "The confirmation is clear",
    tasks: spec.tasks,
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
  for (let index = 0; index < 2; index++) {
    data.profiles.push({
      id: `human-${index}`,
      role: "tester",
      name: `Private Name ${index}`,
      email: `private${index}@example.com`,
      expertise: ["software"],
      device: index ? "mobile" : "desktop",
      availability: "available",
      bio: "",
      createdAt: date,
    });
    data.assignments.push({
      id: `assignment-${index}`,
      campaignId: campaign.id,
      testerId: `human-${index}`,
      status: "approved",
      invitedAt: date,
    });
    data.submissions.push({
      id: `submission-${index}`,
      assignmentId: `assignment-${index}`,
      campaignId: campaign.id,
      testerId: `human-${index}`,
      status: "approved",
      consentConfirmed: true,
      qaNote: "Evidence checked",
      overallFeedback: "Observed the first-use workflow",
      createdAt: date,
      updatedAt: date,
      results: [
        {
          taskId: "onboarding",
          outcome: index ? "success" : "blocked",
          severity: index ? "none" : "major",
          answer: "Observed the first-use workflow",
          observation: index
            ? "The confirmation was visible"
            : "I could not locate a project confirmation",
          evidence: [],
          durationSeconds: 50,
        },
      ],
    });
  }
  data.reports.push({
    id: "human-report",
    campaignId: campaign.id,
    status: "published",
    method: "structured",
    generatedAt: date,
    reviewedAt: date,
    reviewerId: "admin",
    summary: "Reviewed first-use evidence",
    findings: [
      {
        id: "human-issue",
        title: "Confirmation not visible",
        severity: "major",
        description: "A tester could not locate confirmation",
        recommendation: "Show the project confirmation",
        sourceIds: ["submission-0:onboarding"],
        taskIds: ["onboarding"],
      },
    ],
  });
  const sandbox = {
    ...createSandbox("founder", spec.objective),
    validation: {
      brief: {
        inputType: "web-app" as const,
        focus: "Onboarding",
        audience: campaign.audience,
        assumption: campaign.assumption,
        decision: "Ship or modify",
        desiredOutcome: spec.objective,
        targetUrl: spec.targetUrl,
        successThreshold: 80,
      },
      campaignId: campaign.id,
    },
  };
  return buildValidationDossier(sandbox, data);
}
function match(job: TwinJob, index: number): TwinHumanMatch {
  return {
    id: `match-${index}`,
    jobId: job.id,
    runId: `run-${index}`,
    taskId: "onboarding",
    observationId: `submission-${index}:onboarding`,
    reviewedAt: date,
    reviewerNote:
      "Confirmed the same version, task and success criterion before matching the observed outcomes.",
  };
}

describe("Market Twin experiment boundaries", () => {
  it("validates an approved executable experiment without fabricating run data", () => {
    expect(validateTwinExperimentSpec(experiment())).toEqual(experiment());
    const job = validateTwinJob(fixture());
    expect(job.runs).toEqual([]);
    expect(job.issues).toEqual([]);
  });
  it("requires authorization and exact credential-free allowed origins", () => {
    expect(() =>
      validateTwinExperimentSpec({
        ...experiment(),
        authorizationConfirmed: false,
      }),
    ).toThrow(/authorized/);
    for (const targetUrl of [
      "file:///etc/passwd",
      "https://secret:password@product.example/",
    ])
      expect(() =>
        validateTwinExperimentSpec({ ...experiment(), targetUrl }),
      ).toThrow(/HTTP/);
    for (const allowedOrigins of [
      ["https://*.example"],
      ["https://product.example/path"],
      ["https://other.example"],
    ])
      expect(() =>
        validateTwinExperimentSpec({ ...experiment(), allowedOrigins }),
      ).toThrow();
  });
  it("rejects unbounded jobs, costs, token counts and unsupported policies", () => {
    for (const settings of [
      { runCount: 101 },
      { concurrency: 5 },
      { maxSteps: 101 },
      { maxDurationSeconds: Infinity },
      { maxCostUsd: 1.01 },
      { maxModelTokens: 100001 },
    ])
      expect(() =>
        validateTwinExperimentSpec({
          ...experiment(),
          settings: { ...defaultTwinSettings(), ...settings },
        }),
      ).toThrow();
    expect(() =>
      validateTwinExperimentSpec({ ...experiment(), mode: "behavioural" }),
    ).toThrow(/budget/);
    expect(
      validateTwinExperimentSpec({
        ...experiment(),
        mode: "behavioural",
        settings: defaultTwinSettings("behavioural"),
      }).settings.maxCostUsd,
    ).toBe(0.25);
  });
  it("requires executable steps and observable assertions rather than a model-declared success", () => {
    const spec = experiment();
    expect(() =>
      validateTwinExperimentSpec({
        ...spec,
        tasks: [{ ...spec.tasks[0], steps: [] }],
      }),
    ).toThrow(/steps/);
    expect(() =>
      validateTwinExperimentSpec({
        ...spec,
        tasks: [{ ...spec.tasks[0], assertions: [] }],
      }),
    ).toThrow(/assertion/);
    expect(() =>
      validateTwinExperimentSpec({
        ...spec,
        tasks: [{ ...spec.tasks[0], successCriteria: "" }],
      }),
    ).toThrow(/criteria/);
    expect(() =>
      validateTwinExperimentSpec({
        ...spec,
        tasks: [
          {
            ...spec.tasks[0],
            steps: [
              {
                id: "evil",
                type: "navigate",
                url: "https://other.example/",
                description: "Leave the target",
              },
            ],
          },
        ],
      }),
    ).toThrow(/allowed origins/);
  });
  it("allows approved exact test write paths while rejecting traversal and broad permissions", () => {
    expect(
      validateTwinExperimentSpec({
        ...experiment(),
        authorizedWritePaths: ["/api/test-accounts"],
      }).authorizedWritePaths,
    ).toEqual(["/api/test-accounts"]);
    for (const path of [
      "/api/*",
      "//external.example",
      "/api/../accounts",
      "/api/accounts?all=true",
      "/api\\accounts",
    ])
      expect(() =>
        validateTwinExperimentSpec({
          ...experiment(),
          authorizedWritePaths: [path],
        }),
      ).toThrow(/exact relative/);
  });
  it("supports bounded draft editing and preserves history without orphan comparison references", () => {
    const draft = {
      ...experiment(),
      targetUrl: "",
      allowedOrigins: [],
      authorizationConfirmed: false,
      objective: "",
      productVersion: "",
      tasks: [],
      approvedAt: "",
    };
    expect(
      validateTwinWorkspace({ spec: draft, jobIds: [] }).spec?.tasks,
    ).toEqual([]);
    expect(() => validateTwinExperimentSpec(draft)).toThrow();
    expect(() =>
      validateTwinWorkspace({ jobIds: [], activeJobId: "foreign" }),
    ).toThrow(/history/);
    expect(() =>
      validateTwinWorkspace({
        jobIds: ["own-job"],
        calibrationMatches: [{ ...match(fixture(), 0), jobId: "foreign" }],
      }),
    ).toThrow(/workspace/);
  });
  it("creates repeatable categorical policy profiles without psychological scores", () => {
    const profiles = buildDefaultTwinPersonas("Create a project", 10, 21);
    expect(profiles).toEqual(
      buildDefaultTwinPersonas("Create a project", 10, 21),
    );
    expect(new Set(profiles.map((profile) => profile.seed)).size).toBe(10);
    expect(new Set(profiles.map((profile) => profile.device)).size).toBe(2);
    expect(profiles[0]).not.toHaveProperty("trustScore");
    expect(profiles[0]).not.toHaveProperty("conversionProbability");
  });
});

describe("stored browser evidence integrity", () => {
  it("rejects successful outcomes with missing or failed success assertions", () => {
    const job = fixture();
    const run = addRun(job, 0);
    expect(validateTwinJob(job).runs).toHaveLength(1);
    run.taskResults[0].assertions[0].passed = false;
    expect(() => validateTwinJob(job)).toThrow(/success assertion/);
    run.taskResults[0].assertions = [];
    expect(() => validateTwinJob(job)).toThrow(/success assertion/);
  });
  it("rejects task outcomes, screenshots and issues citing foreign run evidence", () => {
    const job = fixture();
    const first = addRun(job, 0, "failure");
    addRun(job, 1);
    first.taskResults[0].eventIds = ["run-1:event"];
    expect(() => validateTwinJob(job)).toThrow(/belonging/);
    first.taskResults[0].eventIds = ["run-0:event"];
    first.events[0].screenshotId = "run-1:shot";
    expect(() => validateTwinJob(job)).toThrow(/same run/);
    first.events[0].screenshotId = "run-0:shot";
    const issue = addIssue(job);
    issue.sourceEventIds = ["run-1:event"];
    expect(() => validateTwinJob(job)).toThrow(/actual task/);
  });
  it("requires human verification for inferences and rejects executable artifact URLs", () => {
    const job = fixture();
    const run = addRun(job, 0, "failure");
    const issue = addIssue(job);
    issue.basis = "inferred";
    issue.requiresHumanVerification = false;
    expect(() => validateTwinJob(job)).toThrow(/human verification/);
    issue.requiresHumanVerification = true;
    run.artifacts[0].url = "javascript:alert(1)";
    expect(() => validateTwinJob(job)).toThrow(/HTTP/);
  });
});

describe("actual simulated analytics", () => {
  it("leaves rates, time and cost unknown until a browser has actually run", () => {
    const job = fixture();
    job.runs.push({
      id: "queued",
      personaId: "profile-1",
      status: "queued",
      createdAt: date,
      events: [],
      artifacts: [],
      taskResults: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        modelCalls: 0,
        model: "",
      },
    });
    const metrics = buildTwinAnalytics(job);
    expect(metrics).toMatchObject({
      requestedRuns: 20,
      recordedRuns: 1,
      browserRuns: 0,
      attempts: 0,
      successRate: null,
      medianSeconds: null,
      costUsd: null,
      durationSeconds: null,
    });
    expect(metrics.limitations.join(" ")).toContain("Not yet tested");
    expect(metrics.label).toBe("Simulated browser evidence");
  });
  it("computes denominators, actual zero durations and unknown outcomes from recorded events only", () => {
    const job = fixture();
    (
      [
        "success",
        "failure",
        "abandoned",
        "assisted",
        "unknown",
      ] as TwinOutcome[]
    ).forEach((outcome, index) =>
      addRun(job, index, outcome, index === 4 ? null : index * 20),
    );
    const metrics = buildTwinAnalytics(job);
    expect(metrics).toMatchObject({
      browserRuns: 5,
      attempts: 5,
      measuredAttempts: 4,
      success: 1,
      failure: 1,
      abandoned: 1,
      assisted: 1,
      unknown: 1,
      successRate: 25,
      medianSeconds: 30,
      costUsd: 0,
      durationSeconds: 60,
    });
    expect(metrics.tasks[0].sourceEventIds).toHaveLength(5);
    expect(metrics.timeDistribution[0].seconds).toBe(0);
    expect(metrics.limitations.join(" ")).toContain(
      "excluded from the success-rate denominator",
    );
  });
  it("does not count an outcome lacking source events even if it was typed as a success", () => {
    const job = fixture();
    addRun(job, 0).taskResults[0].eventIds = [];
    expect(buildTwinAnalytics(job).successRate).toBeNull();
    expect(buildTwinAnalytics(job).attempts).toBe(0);
  });
  it("filters observed results and exposes traceable cohorts and task stages", () => {
    const job = fixture();
    addRun(job, 0, "failure", 90);
    addRun(job, 1, "success", 10);
    addIssue(job);
    expect(buildTwinAnalytics(job, { device: "mobile" })).toMatchObject({
      browserRuns: 1,
      successRate: 100,
      medianSeconds: 10,
      uniqueIssues: 0,
    });
    expect(
      buildTwinAnalytics(job, { outcome: "failure" }).tasks[0].sourceRunIds,
    ).toEqual(["run-0"]);
    expect(buildTwinAnalytics(job).funnel[0]).toMatchObject({
      reachedRuns: 2,
      successfulRuns: 1,
      sourceRunIds: ["run-0", "run-1"],
    });
    expect(buildTwinAnalytics(job).cohort[1]).toMatchObject({
      device: "mobile",
      attempts: 1,
      successRate: 100,
    });
  });
  it("reports unknown aggregate provider cost rather than understating unrecorded spend", () => {
    const job = fixture();
    const run = addRun(job, 0);
    run.usage = {
      inputTokens: 200,
      outputTokens: 50,
      costUsd: 0.003,
      modelCalls: 1,
      model: "gpt-6-luna",
    };
    const next = addRun(job, 1);
    next.usage.costUsd = null;
    expect(buildTwinAnalytics(job)).toMatchObject({
      costUsd: null,
      inputTokens: 200,
      outputTokens: 50,
    });
  });
  it("compares versions only when the task, population and execution conditions remain comparable", () => {
    const before = fixture();
    addRun(before, 0, "failure", 90);
    const after = {
      ...structuredClone(before),
      id: "job-2",
      parentJobId: before.id,
      runs: [],
    };
    after.spec.productVersion = "v2";
    after.spec.targetUrl = "https://product.example/v2";
    addRun(after, 0, "success", 30);
    expect(compareTwinJobs(after, before)).toMatchObject({
      comparable: true,
      successRateChange: 100,
      medianSecondsChange: -60,
    });
    after.spec.personas[0].timeBudgetSeconds++;
    expect(compareTwinJobs(after, before)).toMatchObject({
      comparable: false,
      successRateChange: null,
      medianSecondsChange: null,
    });
  });
  it("measures repeatability only when a stored profile/task has repeated known outcomes", () => {
    const job = fixture();
    addRun(job, 0, "success");
    expect(buildTwinReproducibility(job).outcomeAgreement).toBeNull();
    addRun(job, 10, "success");
    addRun(job, 20, "failure");
    addRun(job, 30, "unknown");
    expect(buildTwinReproducibility(job)).toMatchObject({
      repeatedConditions: 1,
      comparedPairs: 3,
      agreeingPairs: 1,
      outcomeAgreement: 33.33,
    });
    expect(buildTwinReproducibility(job).groups[0].runIds).toEqual([
      "run-0",
      "run-10",
      "run-20",
    ]);
  });
});

describe("explicit human calibration", () => {
  it("keeps agreement and issue precision unknown before reviewed pairs exist", () => {
    const job = fixture();
    addRun(job, 0);
    addIssue(job);
    const calibration = calibrateTwinAgainstHumans(job, humanDossier());
    expect(calibration).toMatchObject({
      matchedAttempts: 0,
      agreement: null,
      falsePositives: 0,
      missedIssues: 0,
      issuePrecision: null,
      severityAgreement: null,
    });
    expect(calibration.limitations.join(" ")).toContain("Not yet calibrated");
  });
  it("calculates confusion and task agreement from explicit QA-approved observation pairs", () => {
    const job = fixture();
    addRun(job, 0, "failure");
    addRun(job, 1, "failure");
    const calibration = calibrateTwinAgainstHumans(job, humanDossier(), [
      match(job, 0),
      match(job, 1),
    ]);
    expect(calibration).toMatchObject({
      matchedAttempts: 2,
      humanParticipants: 2,
      agreement: 50,
      agreements: 1,
      disagreements: 1,
      confusion: {
        bothSuccess: 0,
        bothNotSuccess: 1,
        syntheticSuccessHumanNot: 0,
        humanSuccessSyntheticNot: 1,
      },
    });
    expect(calibration.taskAgreement[0].sourceMatchIds).toEqual([
      "match-0",
      "match-1",
    ]);
    expect(calibration.limitations.join(" ")).toContain(
      "small convenience sample",
    );
  });
  it("excludes repeated human observations, unknown synthetic outcomes and incomparable products", () => {
    const job = fixture();
    addRun(job, 0, "success");
    addRun(job, 1, "unknown");
    const pairs = [
      match(job, 0),
      { ...match(job, 0), id: "duplicate" },
      match(job, 1),
      { ...match(job, 0), id: "foreign", observationId: "invented" },
    ];
    expect(
      calibrateTwinAgainstHumans(job, humanDossier(), pairs),
    ).toMatchObject({
      matchedAttempts: 1,
      invalidMatchIds: ["duplicate", "match-1", "foreign"],
    });
    const dossier = humanDossier();
    dossier.campaign!.url = "https://different.example/";
    expect(
      calibrateTwinAgainstHumans(job, dossier, pairs).agreement,
    ).toBeNull();
  });
  it("counts confirmed issues and severity only from explicit reviewed human evidence", () => {
    const job = fixture();
    addRun(job, 0, "failure");
    addIssue(job);
    const dossier = humanDossier();
    const calibration = calibrateTwinAgainstHumans(
      job,
      dossier,
      [],
      [
        {
          id: "review",
          jobId: job.id,
          issueId: "issue-1",
          humanIssueId: dossier.issues[0].id,
          verdict: "confirmed",
          humanObservationIds: ["submission-0:onboarding"],
          reviewedAt: date,
          reviewerNote:
            "The human observation and screenshot substantiate the same missing confirmation.",
        },
      ],
    );
    expect(calibration).toMatchObject({
      confirmedIssues: 1,
      falsePositives: 0,
      issuePrecision: 100,
      severityAgreement: 100,
    });
  });
  it("does not treat absence as false positives or permit reviews without human source observations", () => {
    const job = fixture();
    addRun(job, 0, "failure");
    addIssue(job);
    const dossier = humanDossier();
    const review = {
      id: "review",
      jobId: job.id,
      issueId: "issue-1",
      verdict: "not-substantiated" as const,
      humanObservationIds: ["submission-1:onboarding"],
      reviewedAt: date,
      reviewerNote:
        "Checked the same task and version: the real participant observed the expected confirmation.",
    };
    expect(
      calibrateTwinAgainstHumans(job, dossier, [], [review]),
    ).toMatchObject({ falsePositives: 1, issuePrecision: 0 });
    expect(
      calibrateTwinAgainstHumans(
        job,
        dossier,
        [],
        [{ ...review, humanObservationIds: [] }],
      ),
    ).toMatchObject({
      falsePositives: 0,
      issuePrecision: null,
      invalidReviewIds: ["review"],
    });
  });
  it("requires human finding evidence for misses and rejects success-only confirmations", () => {
    const job = fixture();
    addRun(job, 0, "failure");
    addIssue(job);
    const dossier = humanDossier();
    const reviewedAt = date;
    const reviewerNote = "Compared the observed human and synthetic findings.";
    const calibration = calibrateTwinAgainstHumans(
      job,
      dossier,
      [],
      [
        {
          id: "miss",
          jobId: job.id,
          humanIssueId: dossier.issues[0].id,
          verdict: "missed",
          humanObservationIds: ["submission-0:onboarding"],
          reviewedAt,
          reviewerNote,
        },
        {
          id: "false-confirm",
          jobId: job.id,
          issueId: "issue-1",
          verdict: "confirmed",
          humanObservationIds: ["submission-1:onboarding"],
          reviewedAt,
          reviewerNote,
        },
      ],
    );
    expect(calibration).toMatchObject({
      missedIssues: 1,
      confirmedIssues: 0,
      invalidReviewIds: ["false-confirm"],
    });
  });
});
