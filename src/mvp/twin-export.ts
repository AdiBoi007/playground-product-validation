import type { Sandbox } from "./sandbox";
import type { ValidationDossier } from "./validation";
import type { TwinArtifact, TwinJob, TwinWorkspace } from "./twin";
import {
  buildTwinAnalytics,
  buildTwinReproducibility,
  calibrateTwinAgainstHumans,
  compareTwinJobs,
} from "./twin";
import { getTwinArtifact } from "./twin-client";
import {
  renderReportCsv,
  renderReportDocx,
  renderReportHtml,
  renderReportMarkdown,
  renderReportPdf,
  renderReportPptx,
  renderReportWorkbook,
} from "./validation-export";
import type {
  ReportBlock,
  ReportDocument,
  ReportEvidenceTable,
  ReportSection,
  ReportSheet,
  ValidationExportArtifact,
  ValidationExportFormat,
} from "./validation-export";

export interface TwinExportInput {
  sandbox: Sandbox;
  job: TwinJob;
  dossier?: ValidationDossier;
  workspace?: TwinWorkspace;
  previous?: TwinJob;
}
export interface TwinExportOptions {
  includeScreenshots?: boolean;
  artifactLoader?: (jobId: string, artifactId: string) => Promise<Blob>;
}

const PROVENANCE =
  "Simulated browser evidence. Functional software outcomes, behavioural hypotheses and reviewed human evidence are reported separately.";
const NOT_TESTED = "Not yet tested";
const rate = (value: number | null) =>
  value === null ? NOT_TESTED : `${Math.round(value * 10) / 10}%`;
const duration = (value: number | null) =>
  value === null ? "Not recorded" : `${Math.round(value * 10) / 10} seconds`;
const dollars = (value: number | null) =>
  value === null ? "Not recorded" : `$${value.toFixed(6)}`;
const text = (value: string): ReportBlock => ({ kind: "text", text: value });
const heading = (value: string, anchor?: string): ReportBlock => ({
  kind: "heading",
  text: value,
  ...(anchor ? { anchor } : {}),
});
const table = (headers: string[], rows: string[][]): ReportBlock => ({
  kind: "table",
  headers,
  rows,
});
const references = (ids: string[], prefix = "Evidence"): ReportBlock => ({
  kind: "links",
  links: [...new Set(ids)].map((target, index) => ({
    label: `${prefix} ${index + 1}`,
    target,
  })),
});
const publicUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};
const runReference = (jobId: string, runId: string) => `${jobId}:${runId}`;
const taskReference = (jobId: string, runId: string, taskId: string) =>
  `${jobId}:${runId}:${taskId}`;
const eventReference = (jobId: string, eventId: string) =>
  `${jobId}:${eventId}`;

export function buildTwinReportData(input: TwinExportInput) {
  const { sandbox, job, dossier, previous } = input;
  const workspace = input.workspace || sandbox.twin;
  const analytics = buildTwinAnalytics(job);
  const comparison =
    previous && job.parentJobId === previous.id
      ? compareTwinJobs(job, previous)
      : undefined;
  const calibration = dossier
    ? calibrateTwinAgainstHumans(
        job,
        dossier,
        workspace?.calibrationMatches || [],
        workspace?.issueReviews || [],
      )
    : undefined;
  const reproducibility = buildTwinReproducibility(job);
  const jobSnapshot = {
    ...job,
    runs: job.runs.map((run) => ({
      ...run,
      artifacts: run.artifacts.map(({ url, ...artifact }) => {
        void url;
        return {
          ...artifact,
          access:
            "Private worker artifact; download from the owning Playground workspace",
        };
      }),
    })),
  };
  return {
    schemaVersion: 1,
    title: `${sandbox.title} · ${job.spec.productVersion}`,
    generatedAt: job.updatedAt,
    provenance: PROVENANCE,
    evidenceClassification: {
      browserRuns: "Executed software observations from simulated profiles",
      personas:
        "Configured experimental policies; not real customers or validated psychological measurements",
      inferredFindings: "Hypotheses requiring review",
      humanObservations:
        "QA-approved human evidence; separate from browser metrics",
      research: "External citations or labelled research inference",
    },
    job: jobSnapshot,
    analytics,
    comparison,
    calibration,
    reproducibility,
    research: sandbox.analysis,
    reviewedMatches: (workspace?.calibrationMatches || []).filter(
      (match) => match.jobId === job.id,
    ),
    reviewedIssues: (workspace?.issueReviews || []).filter(
      (review) => review.jobId === job.id,
    ),
    humanEvidence: dossier
      ? {
          title: dossier.title,
          verdict: dossier.verdict,
          metrics: dossier.metrics,
          observations: dossier.observations.map(
            ({ testerId, evidence, ...observation }) => {
              void testerId;
              void evidence;
              return observation;
            },
          ),
          issues: dossier.issues,
          limitations: dossier.limitations,
        }
      : undefined,
  };
}

export function buildTwinReportDocument(
  input: TwinExportInput,
): ReportDocument {
  const { sandbox, job, dossier } = input;
  const data = buildTwinReportData(input);
  const a = data.analytics;
  const verdict = !a.attempts
    ? "Insufficient evidence"
    : job.issues.some(
          (issue) =>
            issue.basis === "observed" &&
            ["critical", "high"].includes(issue.severity),
        )
      ? "Modify and retest"
      : job.status !== "completed"
        ? "Review incomplete experiment"
        : "Review coverage and validate with humans";
  const metricRows = [
    ["Evidence class", "Simulated browser evidence"],
    [
      "Execution mode",
      job.spec.mode === "functional"
        ? "Deterministic functional execution"
        : "Synthetic behavioural navigation",
    ],
    ["Experiment status", job.status],
    [
      "Requested / started / completed runs",
      `${a.requestedRuns} / ${a.browserRuns} / ${a.completedRuns}`,
    ],
    ["Observed task attempts", a.attempts ? String(a.attempts) : NOT_TESTED],
    [
      "Measured / unknown attempts",
      a.attempts ? `${a.measuredAttempts} / ${a.unknown}` : NOT_TESTED,
    ],
    ["Asserted task success", rate(a.successRate)],
    ["Median task duration", duration(a.medianSeconds)],
    ["Recorded model cost", dollars(a.costUsd)],
    [
      "Recorded input / output tokens",
      `${a.inputTokens ?? "Not recorded"} / ${a.outputTokens ?? "Not recorded"}`,
    ],
    ["Experiment duration", duration(a.durationSeconds)],
    [
      "Evidence-linked findings",
      a.browserRuns ? String(a.uniqueIssues) : NOT_TESTED,
    ],
  ];
  const summary: ReportSection = {
    id: "executive",
    title: "1. Executive Summary",
    blocks: [
      heading(verdict),
      text(PROVENANCE),
      text(
        `${job.spec.objective}. ${a.completedRuns} browser runs completed; ${a.success} objectively asserted task successes from ${a.measuredAttempts} measured attempts. ${a.unknown} outcomes remain unknown. ${a.uniqueIssues} evidence-linked findings.`,
      ),
      table(["Measure", "Recorded result"], metricRows.slice(0, 8)),
      text(
        job.issues.length
          ? `Next change to review: ${job.issues[0].proposedFix}`
          : "Inspect the tested coverage and run comparable human tasks before making claims about customer behaviour.",
      ),
    ],
  };
  const product: ReportSection = {
    id: "product",
    title: "2. Product Overview",
    blocks: [
      text(
        sandbox.analysis?.product.description ||
          sandbox.validation?.brief.productDescription ||
          sandbox.initialInput ||
          "Product description not supplied.",
      ),
      table(
        ["Input", "Experiment setting"],
        [
          ["Product", sandbox.analysis?.product.name || sandbox.title],
          ["Product version", job.spec.productVersion],
          ["Target", job.spec.targetUrl],
          ["Objective", job.spec.objective],
          [
            "Target audience",
            sandbox.validation?.brief.audience ||
              sandbox.analysis?.product.audience ||
              "Not supplied",
          ],
          ["Authorized origins", job.spec.allowedOrigins.join("\n")],
          [
            "Authorization confirmed",
            job.spec.authorizationConfirmed ? "Yes" : "No",
          ],
        ],
      ),
      {
        kind: "links",
        links: publicUrl(job.spec.targetUrl)
          ? [{ label: "Tested product", url: publicUrl(job.spec.targetUrl) }]
          : [],
      },
    ],
  };
  const market: ReportSection = {
    id: "market",
    title: "3. Market Landscape",
    blocks: [],
  };
  if (sandbox.analysis) {
    market.blocks.push(
      text(`Research summary — AI inference: ${sandbox.analysis.summary}`),
      table(
        ["Competitor", "Offer", "Public pricing / verification", "Difference"],
        sandbox.analysis.competitors.map((competitor) => [
          competitor.name,
          competitor.offer,
          competitor.pricing,
          competitor.difference,
        ]),
      ),
    );
    sandbox.analysis.news.forEach((item) =>
      market.blocks.push(
        heading(item.headline),
        text(
          `${item.summary} Published: ${item.publishedAt || "Date unverified"}.`,
        ),
        references(item.sourceIds, "Source"),
      ),
    );
    sandbox.analysis.signals.forEach((item) =>
      market.blocks.push(
        text(`${item.kind}: ${item.claim}`),
        references(item.sourceIds, "Source"),
      ),
    );
    market.blocks.push(
      text(
        "External market signals are research evidence, not outcomes observed in this browser experiment.",
      ),
    );
  } else
    market.blocks.push(
      text(
        "Market research has not been conducted for this sandbox. No competitor or demand claims are inferred from browser runs.",
      ),
    );
  const methodology: ReportSection = {
    id: "methodology",
    title: "4. Test Methodology",
    blocks: [
      text(
        `Mode: ${job.spec.mode}. Approved: ${job.spec.approvedAt}. Each journey uses an isolated browser session and a configured synthetic profile. ${job.spec.mode === "functional" ? "The worker executes explicitly defined browser actions." : "The model selects goal-directed actions within the profile's configured constraints."} Task success requires the stored observable assertions; unverified outcomes remain unknown.`,
      ),
      table(
        ["Limit", "Configured value"],
        [
          ["Journeys", String(job.spec.settings.runCount)],
          ["Concurrent browsers", String(job.spec.settings.concurrency)],
          ["Maximum steps / journey", String(job.spec.settings.maxSteps)],
          [
            "Maximum seconds / journey",
            String(job.spec.settings.maxDurationSeconds),
          ],
          ["Model token budget", String(job.spec.settings.maxModelTokens)],
          ["Model spend cap (USD)", dollars(job.spec.settings.maxCostUsd)],
          [
            "Model",
            job.spec.mode === "functional"
              ? "No model calls"
              : job.spec.settings.model,
          ],
          ["Seed", String(job.spec.settings.seed)],
          [
            "Policy / evaluator version",
            `${job.spec.policyVersion || "Not recorded"} / ${job.spec.evaluatorVersion || "Not recorded"}`,
          ],
        ],
      ),
      table(
        [
          "Task",
          "Instructions",
          "Measurable criterion",
          "Observable assertions",
        ],
        job.spec.tasks.map((task) => [
          task.title,
          task.instructions,
          task.successCriteria,
          (task.assertions || [])
            .map((assertion) => `${assertion.type}: ${assertion.value}`)
            .join("\n"),
        ]),
      ),
      table(
        ["Synthetic profile", "Goal", "Device / experience", "Time / policy"],
        job.spec.personas.map((persona) => [
          persona.name,
          persona.goal,
          `${persona.device} / ${persona.experience} / ${persona.technicalProficiency}`,
          `${persona.timeBudgetSeconds}s; exploration ${persona.exploration}; privacy sensitivity ${persona.privacySensitivity}; ${persona.motivation}`,
        ]),
      ),
      ...a.limitations.map(text),
    ],
  };
  const analytics: ReportSection = {
    id: "analytics",
    title: "5. Analytics Dashboard",
    blocks: [table(["Measure", "Stored run result"], metricRows)],
  };
  if (a.measuredAttempts)
    analytics.blocks.push(
      {
        kind: "chart",
        title: "Asserted task completion — simulated browser runs",
        unit: "successful task attempts",
        values: a.tasks.map((task) => ({
          label: task.title,
          value: task.success,
          taskId: task.taskId,
        })),
      },
      table(
        [
          "Task",
          "Attempts",
          "Measured",
          "Success",
          "Unknown",
          "Success rate",
          "Median time",
        ],
        a.tasks.map((task) => [
          task.title,
          String(task.attempts),
          String(task.measuredAttempts),
          String(task.success),
          String(task.unknown),
          rate(task.successRate),
          duration(task.medianSeconds),
        ]),
      ),
    );
  else
    analytics.blocks.push(
      text(
        "Not yet tested. No measured task completion outcomes have been recorded.",
      ),
    );
  if (a.timeDistribution.length)
    analytics.blocks.push(
      table(
        ["Run / profile", "Task", "Recorded seconds"],
        a.timeDistribution.map((item) => [
          item.runId,
          job.spec.tasks.find((task) => task.id === item.taskId)?.title ||
            item.taskId,
          String(item.seconds),
        ]),
      ),
    );
  if (a.uniqueIssues)
    analytics.blocks.push({
      kind: "chart",
      title: "Recorded findings by severity",
      unit: "deduplicated findings",
      values: Object.entries(a.severities).map(([label, value]) => ({
        label,
        value,
      })),
    });
  if (a.funnel.some((stage) => stage.reachedRuns))
    analytics.blocks.push(
      {
        kind: "chart",
        title: "Recorded journeys reaching each task",
        unit: "simulated browser runs",
        values: a.funnel.map((stage) => ({
          label: stage.title,
          value: stage.reachedRuns,
          taskId: stage.taskId,
        })),
      },
      text(
        "Journey reach describes the worker's task sequence. It is not an instrumented customer conversion funnel.",
      ),
    );
  if (data.comparison)
    analytics.blocks.push(
      heading(
        `Retest: ${data.comparison.previousProductVersion} → ${data.comparison.currentProductVersion}`,
      ),
      table(
        ["Metric", "Previous", "Current"],
        [
          [
            "Task success",
            rate(data.comparison.previous.successRate),
            rate(data.comparison.current.successRate),
          ],
          [
            "Median duration",
            duration(data.comparison.previous.medianSeconds),
            duration(data.comparison.current.medianSeconds),
          ],
          [
            "Completed browser runs",
            String(data.comparison.previous.completedRuns),
            String(data.comparison.current.completedRuns),
          ],
        ],
      ),
      text(
        `Comparable: ${data.comparison.comparable ? "Yes" : "No"}. ${data.comparison.limitation} ${data.comparison.differences.join(" ")}`,
      ),
    );
  analytics.blocks.push(
    heading("Repeatability"),
    table(
      ["Measured repeatability", "Recorded value"],
      [
        [
          "Repeated profile/task conditions",
          String(data.reproducibility.repeatedConditions),
        ],
        ["Compared outcome pairs", String(data.reproducibility.comparedPairs)],
        [
          "Agreement within repeated conditions",
          rate(data.reproducibility.outcomeAgreement),
        ],
      ],
    ),
    text(data.reproducibility.limitation),
  );
  const findings: ReportSection = {
    id: "findings",
    title: "6. Key Findings",
    blocks: [],
  };
  const recommendations: ReportSection = {
    id: "recommendations",
    title: "7. Recommendations",
    blocks: [],
  };
  job.issues.forEach((issue, index) => {
    const evidenceRefs = [
      ...issue.sourceRunIds.map((id) => runReference(job.id, id)),
      ...issue.sourceEventIds.map((id) => eventReference(job.id, id)),
    ];
    findings.blocks.push(
      heading(`${index + 1}. ${issue.title} · ${issue.severity}`, issue.id),
      text(
        `${issue.basis === "observed" ? "Observed browser evidence" : "AI inference"} · ${issue.category}. ${issue.description}`,
      ),
      text(
        `Affected URL: ${issue.affectedUrl}. Recorded in ${issue.sourceRunIds.length} runs; ${issue.sourceEventIds.length} supporting events. ${issue.requiresHumanVerification ? "Human verification required." : "Technical observation; coverage remains limited to this experiment."}`,
      ),
      text(
        `Reproduction: ${issue.reproductionSteps.join(" → ") || "Review the linked browser events and trace."}`,
      ),
      references(evidenceRefs),
    );
    recommendations.blocks.push(
      heading(`${index + 1}. ${issue.title}`),
      text(
        `Suggested change: ${issue.proposedFix}. Priority: ${issue.severity}. Effort: not estimated. Basis: ${issue.basis}; ${issue.requiresHumanVerification ? "verify with comparable human testing" : "reproduce the technical check"}.`,
      ),
      references(evidenceRefs),
    );
  });
  if (!findings.blocks.length)
    findings.blocks.push(
      text(
        a.attempts
          ? "No findings were recorded by the checks in this experiment. This does not establish that all journeys work."
          : "Not yet tested. No observed browser findings are available.",
      ),
    );
  if (!recommendations.blocks.length)
    recommendations.blocks.push(
      text(
        "Review executed task coverage and unresolved outcomes before proposing product changes.",
      ),
    );
  const decision: ReportSection = {
    id: "verdict",
    title: "8. Validation Verdict",
    blocks: [
      heading(verdict),
      text(
        "A browser experiment can establish tested software behaviour. It cannot establish real customer demand, trust, willingness to pay or population conversion.",
      ),
      table(
        ["Evidence category", "Current status"],
        [
          [
            "Functional checks",
            job.spec.mode === "functional"
              ? rate(a.successRate)
              : "Behavioural navigation with objective assertions",
          ],
          [
            "Behavioural hypotheses",
            job.spec.mode === "behavioural"
              ? `${job.issues.filter((issue) => issue.basis === "inferred").length} inferred findings`
              : "Not evaluated in functional mode",
          ],
          [
            "Human testing",
            dossier?.metrics.attempts
              ? `${dossier.metrics.approvedSubmissions} QA-approved participants; ${dossier.verdict.status}`
              : NOT_TESTED,
          ],
          [
            "Reviewed task comparisons",
            data.calibration?.matchedAttempts
              ? `${data.calibration.matchedAttempts} outcome pairs; ${rate(data.calibration.agreement)} agreement in the reviewed sample`
              : "Not yet calibrated",
          ],
        ],
      ),
    ],
  };
  if (data.calibration)
    decision.blocks.push(
      table(
        ["Reviewed comparison metric", "Observed result"],
        [
          [
            "Matched human participants",
            String(data.calibration.humanParticipants),
          ],
          [
            "Confirmed / not substantiated / missed issues",
            `${data.calibration.confirmedIssues} / ${data.calibration.falsePositives} / ${data.calibration.missedIssues}`,
          ],
          ["Reviewed issue precision", rate(data.calibration.issuePrecision)],
          [
            "Reviewed severity agreement",
            rate(data.calibration.severityAgreement),
          ],
        ],
      ),
      ...data.calibration.limitations.map(text),
    );
  const next: ReportSection = {
    id: "experiments",
    title: "9. Next Experiments",
    blocks: [
      text(
        "Retest accepted product changes using the same tasks, assertions, seed and profile settings. A changed plan or model must be labelled as an incomparable experiment.",
      ),
      ...job.issues
        .slice(0, 12)
        .flatMap((issue): ReportBlock[] => [
          heading(`Retest: ${issue.title}`),
          text(
            `${issue.proposedFix} Repeat the referenced workflow and require its stored assertions to pass. Preserve the previous report and inspect new traces. ${issue.requiresHumanVerification ? "Also test the relevant journey with humans." : "Repeat the technical check across the affected devices."}`,
          ),
          references(issue.sourceRunIds.map((id) => runReference(job.id, id))),
        ]),
      text(
        "Predictive accuracy requires repeated studies, held-out products and reviewed human evidence. This report does not establish calibrated accuracy.",
      ),
    ],
  };
  const appendix: ReportSection = {
    id: "evidence",
    title: "10. Evidence Appendix",
    blocks: [
      text(
        `Source job: ${job.id}. Created: ${job.createdAt}. Updated: ${job.updatedAt}. Event IDs connect findings to ordered browser observations; run IDs connect them to private traces. JSON, JSONL and XLSX contain the full stored task and event records; CSV contains task outcomes. Download private traces from the owning Playground workspace; no access capability is embedded in this report.`,
      ),
    ],
  };
  const referencedEvents = new Set(
    job.issues.flatMap((issue) => issue.sourceEventIds),
  );
  job.runs.forEach((run, index) => {
    const persona = job.spec.personas.find((item) => item.id === run.personaId);
    appendix.blocks.push(
      heading(
        `R${index + 1} · ${persona?.name || run.personaId} · ${run.status}`,
        runReference(job.id, run.id),
      ),
      text(
        `Device: ${persona?.device || "Unknown"}. Started: ${run.startedAt || "Not yet started"}. Finished: ${run.finishedAt || "Not yet finished"}. Model calls: ${run.usage.modelCalls}. Model cost: ${dollars(run.usage.costUsd)}. ${run.error ? `Worker error: ${run.error}` : ""}`,
      ),
    );
    run.taskResults.forEach((result) =>
      appendix.blocks.push(
        heading(
          `${job.spec.tasks.find((task) => task.id === result.taskId)?.title || result.taskId}: ${result.outcome}`,
          taskReference(job.id, run.id, result.taskId),
        ),
        text(
          `${result.reason}. Duration: ${duration(result.durationSeconds)}.`,
        ),
        table(
          ["Assertion", "Passed", "Observed"],
          result.assertions.map((assertion) => [
            assertion.assertionId,
            assertion.passed === null
              ? "Unknown"
              : assertion.passed
                ? "Yes"
                : "No",
            assertion.observed,
          ]),
        ),
      ),
    );
    const selectedEvents = run.events.filter(
      (event, eventIndex) =>
        eventIndex < 4 ||
        eventIndex === run.events.length - 1 ||
        referencedEvents.has(event.id) ||
        [
          "assertion",
          "console-error",
          "network-error",
          "policy-block",
          "stop",
        ].includes(event.type),
    );
    selectedEvents.forEach((event) =>
      appendix.blocks.push(
        heading(
          `${(event.elapsedMs / 1000).toFixed(2)}s · ${event.type}`,
          eventReference(job.id, event.id),
        ),
        text(
          `${event.summary}\nPage: ${event.url}\nRecorded: ${event.at}. Event ID: ${event.id}.`,
        ),
      ),
    );
    if (selectedEvents.length < run.events.length)
      appendix.blocks.push(
        text(
          `${run.events.length - selectedEvents.length} additional routine events are retained in the raw exports and replayable trace.`,
        ),
      );
    if (run.artifacts.length)
      appendix.blocks.push(
        table(
          ["Artifact ID", "Type", "Name", "Access"],
          run.artifacts.map((artifact) => [
            artifact.id,
            artifact.type,
            artifact.name,
            "Private workspace; download in Playground",
          ]),
        ),
      );
  });
  if (!job.runs.some((run) => run.events.length))
    appendix.blocks.push(
      text("Not yet tested. No browser events have been recorded."),
    );
  sandbox.analysis?.sources.forEach((source) =>
    appendix.blocks.push(
      heading(source.title, source.id),
      text(
        `External source. Retrieved: ${source.retrievedAt}. Published: ${source.publishedAt || "Date unverified"}.`,
      ),
      {
        kind: "links",
        links: publicUrl(source.url)
          ? [{ label: source.url, url: publicUrl(source.url) }]
          : [],
      },
    ),
  );
  if (dossier?.observations.length)
    appendix.blocks.push(
      heading("Separate QA-approved human evidence"),
      text(
        "Participant names are anonymized. Human observations are retained separately and never counted as synthetic runs.",
      ),
      table(
        ["Observation", "Participant", "Task", "Outcome", "Written evidence"],
        dossier.observations.map((observation) => [
          observation.id,
          observation.participant,
          observation.taskTitle,
          observation.outcome,
          observation.observation,
        ]),
      ),
    );
  return {
    title: data.title,
    generatedAt: data.generatedAt,
    reportLabel: "Market Twin simulation dossier",
    provenance: PROVENANCE,
    summary: verdict,
    sections: [
      summary,
      product,
      market,
      methodology,
      analytics,
      findings,
      recommendations,
      decision,
      next,
      appendix,
    ],
  };
}

function taskRows(input: TwinExportInput) {
  return input.job.runs.flatMap((run) =>
    run.taskResults.map((result) => {
      const persona = input.job.spec.personas.find(
        (item) => item.id === run.personaId,
      );
      return [
        "simulated",
        input.job.spec.mode,
        input.job.id,
        run.id,
        persona?.name || run.personaId,
        persona?.device || "unknown",
        result.taskId,
        input.job.spec.tasks.find((task) => task.id === result.taskId)?.title ||
          result.taskId,
        result.outcome,
        result.durationSeconds,
        result.reason,
        result.eventIds.join(" | "),
        run.usage.inputTokens,
        run.usage.outputTokens,
        run.usage.costUsd,
      ] as (string | number | boolean | null)[];
    }),
  );
}
const taskHeaders = [
  "evidence_class",
  "mode",
  "job_id",
  "run_id",
  "profile",
  "device",
  "task_id",
  "task",
  "outcome",
  "duration_seconds",
  "reason",
  "event_ids",
  "run_input_tokens",
  "run_output_tokens",
  "run_cost_usd",
];

function evidenceTable(input: TwinExportInput): ReportEvidenceTable {
  return {
    title: "Simulated browser task outcomes",
    headers: ["Profile", "Device", "Task", "Outcome", "Time"],
    tasks: input.job.spec.tasks.map((task) => ({
      id: task.id,
      title: task.title,
    })),
    outcomes: [
      "success",
      "failure",
      "blocked",
      "abandoned",
      "assisted",
      "unknown",
    ],
    profiles: input.job.spec.personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
    })),
    rows: input.job.runs.flatMap((run) =>
      run.taskResults.map((result) => {
        const persona = input.job.spec.personas.find(
          (item) => item.id === run.personaId,
        );
        return {
          id: taskReference(input.job.id, run.id, result.taskId),
          taskId: result.taskId,
          outcome: result.outcome,
          device: persona?.device,
          profileId: run.personaId,
          values: [
            persona?.name || run.personaId,
            persona?.device || "unknown",
            input.job.spec.tasks.find((task) => task.id === result.taskId)
              ?.title || result.taskId,
            result.outcome,
            duration(result.durationSeconds),
          ],
        };
      }),
    ),
  };
}

function workbookSheets(input: TwinExportInput): ReportSheet[] {
  const data = buildTwinReportData(input);
  return [
    {
      name: "Simulated task results",
      headers: taskHeaders,
      rows: taskRows(input),
    },
    {
      name: "Browser events",
      headers: [
        "Evidence class",
        "Run ID",
        "Event ID",
        "Task ID",
        "Recorded",
        "Elapsed ms",
        "Type",
        "URL",
        "Observation",
        "Screenshot ID",
      ],
      rows: input.job.runs.flatMap((run) =>
        run.events.map((event) => [
          "simulated",
          run.id,
          event.id,
          event.taskId || "",
          event.at,
          event.elapsedMs,
          event.type,
          event.url,
          event.summary,
          event.screenshotId || "",
        ]),
      ),
    },
    {
      name: "Task assertions",
      headers: [
        "Run ID",
        "Task ID",
        "Assertion ID",
        "Passed",
        "Observed",
        "Event ID",
      ],
      rows: input.job.runs.flatMap((run) =>
        run.taskResults.flatMap((result) =>
          result.assertions.map((assertion) => [
            run.id,
            result.taskId,
            assertion.assertionId,
            assertion.passed,
            assertion.observed,
            assertion.eventId || "",
          ]),
        ),
      ),
    },
    {
      name: "Findings and fixes",
      headers: [
        "Finding ID",
        "Title",
        "Category",
        "Severity",
        "Basis",
        "Observation",
        "Proposed fix",
        "Human verification",
        "Run IDs",
        "Event IDs",
      ],
      rows: input.job.issues.map((issue) => [
        issue.id,
        issue.title,
        issue.category,
        issue.severity,
        issue.basis,
        issue.description,
        issue.proposedFix,
        issue.requiresHumanVerification,
        issue.sourceRunIds.join(" | "),
        issue.sourceEventIds.join(" | "),
      ]),
    },
    {
      name: "Configured profiles",
      headers: [
        "Profile ID",
        "Name",
        "Goal",
        "Device",
        "Experience",
        "Proficiency",
        "Motivation",
        "Privacy sensitivity",
        "Time budget seconds",
        "Exploration",
        "Seed",
      ],
      rows: input.job.spec.personas.map((persona) => [
        persona.id,
        persona.name,
        persona.goal,
        persona.device,
        persona.experience,
        persona.technicalProficiency,
        persona.motivation,
        persona.privacySensitivity,
        persona.timeBudgetSeconds,
        persona.exploration,
        persona.seed,
      ]),
    },
    {
      name: "Human comparison",
      headers: [
        "Job ID",
        "Run ID",
        "Task ID",
        "Human observation ID",
        "Reviewer note",
        "Reviewed",
      ],
      rows: data.reviewedMatches.map((match) => [
        match.jobId,
        match.runId,
        match.taskId,
        match.observationId,
        match.reviewerNote,
        match.reviewedAt,
      ]),
    },
    {
      name: "Research sources",
      headers: ["Source ID", "Title", "URL", "Retrieved", "Published"],
      rows: (input.sandbox.analysis?.sources || []).map((source) => [
        source.id,
        source.title,
        source.url,
        source.retrievedAt,
        source.publishedAt || "Not verified",
      ]),
    },
  ];
}

async function imageData(blob: Blob) {
  if (
    !["image/png", "image/jpeg"].includes(blob.type) ||
    blob.size > 3 * 1024 * 1024
  )
    throw new Error(
      "Screenshot type or size is not supported for this report.",
    );
  let selected = blob;
  if (
    typeof createImageBitmap === "function" &&
    typeof document !== "undefined"
  ) {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot create a screenshot thumbnail.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      selected = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Cannot export screenshot thumbnail.")),
          "image/jpeg",
          0.72,
        ),
      );
    } finally {
      bitmap.close();
    }
  }
  if (selected.size > 600 * 1024)
    throw new Error("Screenshot thumbnail exceeds the report evidence limit.");
  const bytes = new Uint8Array(await selected.arrayBuffer());
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    encoded += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return {
    url: `data:${selected.type};base64,${btoa(encoded)}`,
    size: selected.size,
  };
}

async function appendScreenshots(
  document: ReportDocument,
  input: TwinExportInput,
  options: TwinExportOptions,
) {
  const appendix = document.sections[9];
  const artifacts = new Map<string, TwinArtifact>();
  input.job.runs.forEach((run) =>
    run.artifacts
      .filter((artifact) => artifact.type === "screenshot")
      .forEach((artifact) => artifacts.set(artifact.id, artifact)),
  );
  const priority = input.job.issues
    .flatMap((issue) => issue.artifactIds)
    .filter((id) => artifacts.has(id));
  const selected = [...new Set([...priority, ...artifacts.keys()])].slice(0, 6);
  if (!selected.length) return;
  const loader = options.artifactLoader || getTwinArtifact;
  let total = 0,
    included = 0;
  for (const id of selected) {
    const artifact = artifacts.get(id)!;
    try {
      const result = await imageData(await loader(input.job.id, id));
      if (total + result.size > 2 * 1024 * 1024) break;
      appendix.blocks.push({
        kind: "image",
        url: result.url,
        caption: `Simulated browser screenshot · ${artifact.name} · artifact ${id}`,
      });
      total += result.size;
      included++;
    } catch {
      appendix.blocks.push(
        text(
          `Screenshot ${artifact.name} could not be embedded. Its private artifact remains available in the owning Playground workspace.`,
        ),
      );
    }
  }
  appendix.blocks.push(
    text(
      `${included} screenshot thumbnails included; maximum six and 2 MB combined. Full-resolution screenshots and replayable traces remain private worker artifacts.`,
    ),
  );
}

const mime: Record<ValidationExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  jsonl: "application/x-ndjson;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
  html: "text/html;charset=utf-8",
};

export async function buildTwinExport(
  format: ValidationExportFormat,
  input: TwinExportInput,
  options: TwinExportOptions = {},
): Promise<ValidationExportArtifact> {
  const document = buildTwinReportDocument(input);
  const data = buildTwinReportData(input);
  if (
    options.includeScreenshots !== false &&
    ["pdf", "docx", "pptx", "html"].includes(format)
  )
    await appendScreenshots(document, input, options);
  let contents: Blob | string | Uint8Array<ArrayBuffer>;
  if (format === "pdf") contents = await renderReportPdf(document);
  else if (format === "docx") contents = await renderReportDocx(document);
  else if (format === "pptx") contents = await renderReportPptx(document);
  else if (format === "xlsx")
    contents = await renderReportWorkbook(document, workbookSheets(input));
  else if (format === "csv")
    contents = renderReportCsv(taskHeaders, taskRows(input));
  else if (format === "json") contents = JSON.stringify(data, null, 2);
  else if (format === "jsonl")
    contents =
      [
        JSON.stringify({
          type: "simulation",
          schemaVersion: 1,
          provenance: PROVENANCE,
          title: data.title,
          generatedAt: data.generatedAt,
          mode: input.job.spec.mode,
          analytics: data.analytics,
          calibration: data.calibration,
          comparison: data.comparison,
        }),
        ...data.job.runs.flatMap((run) => [
          JSON.stringify({ type: "run", ...run }),
          ...run.events.map((event) =>
            JSON.stringify({
              ...event,
              eventType: event.type,
              type: "browser-event",
              runId: run.id,
            }),
          ),
          ...run.taskResults.map((result) =>
            JSON.stringify({
              type: "task-outcome",
              evidenceClass: "simulated",
              runId: run.id,
              ...result,
            }),
          ),
        ]),
        ...data.job.issues.map((issue) =>
          JSON.stringify({ type: "finding", ...issue }),
        ),
      ].join("\n") + "\n";
  else if (format === "markdown") contents = renderReportMarkdown(document);
  else contents = renderReportHtml(document, evidenceTable(input));
  const stem =
    `${input.sandbox.title}-${input.job.spec.productVersion}`
      .normalize("NFKD")
      .replace(/[^a-z\d]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "playground";
  return {
    blob: new Blob([contents], { type: mime[format] }),
    filename: `${stem}-market-twin.${format === "markdown" ? "md" : format}`,
  };
}

export async function exportTwinDossier(
  format: ValidationExportFormat,
  input: TwinExportInput,
): Promise<void> {
  const artifact = await buildTwinExport(format, input);
  const url = URL.createObjectURL(artifact.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
