import type { ValidationDossier } from "./validation";

export type ValidationExportFormat =
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "csv"
  | "json"
  | "jsonl"
  | "markdown"
  | "html";

export interface ValidationExportArtifact {
  blob: Blob;
  filename: string;
}

export type ReportLink = { label: string; url?: string; target?: string };
export type ReportBlock =
  | { kind: "text"; text: string }
  | { kind: "heading"; text: string; anchor?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | {
      kind: "chart";
      title: string;
      values: {
        label: string;
        value: number;
        target?: string;
        taskId?: string;
      }[];
      unit: string;
    }
  | { kind: "links"; links: ReportLink[] }
  | { kind: "image"; url: string; caption: string };
export interface ReportSection {
  id: string;
  title: string;
  blocks: ReportBlock[];
}
type Block = ReportBlock;
type Section = ReportSection;
type Link = ReportLink;
export interface ReportDocument {
  title: string;
  generatedAt: string;
  reportLabel: string;
  provenance: string;
  summary: string;
  sections: ReportSection[];
}
export interface ReportEvidenceRow {
  id: string;
  taskId: string;
  outcome: string;
  values: string[];
  device?: string;
  profileId?: string;
}
export interface ReportEvidenceTable {
  title: string;
  headers: string[];
  rows: ReportEvidenceRow[];
  tasks: { id: string; title: string }[];
  outcomes: string[];
  profiles?: { id: string; name: string }[];
}
export interface ReportSheet {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
}

const PALETTE = {
  ink: "173F3B",
  teal: "23685E",
  blue: "357FE5",
  ivory: "F7F5ED",
  muted: "62716C",
  line: "DBE2DC",
};
// Exact existing radial mark, embedded so downloaded reports work without a server.
const BRAND_MARK =
  "data:image/png;base64,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";
const NOT_TESTED = "Not yet tested";
const MIME: Record<ValidationExportFormat, string> = {
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

function rate(value: number | null) {
  return value === null ? NOT_TESTED : `${Math.round(value * 10) / 10}%`;
}
function duration(value: number | null) {
  return value === null ? NOT_TESTED : `${Math.round(value * 10) / 10} seconds`;
}
function publicUrl(value: string | undefined) {
  if (!value) return undefined;
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
}
function embeddedImage(value: string) {
  return (
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(value) &&
    value.length <= 4_300_000
  );
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
function anchor(value: string) {
  return `ref-${encodeURIComponent(value)}`;
}

/** Shareable exports never include internal participant identities or unconsented media. */
export function anonymizeValidationDossier(dossier: ValidationDossier) {
  const { founderId: omittedFounder, ...campaign } = dossier.campaign ?? {};
  const { reviewerId: omittedReviewer, ...report } = dossier.report ?? {};
  void omittedFounder;
  void omittedReviewer;
  return {
    ...dossier,
    campaign: dossier.campaign ? campaign : undefined,
    report: dossier.report ? report : undefined,
    observations: dossier.observations.map(({ testerId, ...observation }) => {
      void testerId;
      return {
        ...observation,
        evidence: observation.consentConfirmed
          ? observation.evidence.filter(
              (asset) =>
                publicUrl(asset.url) ||
                (asset.kind === "image" && embeddedImage(asset.url)),
            )
          : [],
      };
    }),
  };
}

function sections(d: ValidationDossier): Section[] {
  const metricRows = [
    ["Task success", rate(d.metrics.successRate)],
    ["Failure rate", rate(d.metrics.failureRate)],
    [
      "Participants with approved feedback",
      d.metrics.participants
        ? `${d.metrics.participants} / ${d.metrics.expectedParticipants}`
        : NOT_TESTED,
    ],
    [
      "Task observations",
      d.metrics.attempts ? String(d.metrics.attempts) : NOT_TESTED,
    ],
    ["Median time on task", duration(d.metrics.medianSeconds)],
    [
      "Measured task durations",
      d.metrics.timedAttempts ? String(d.metrics.timedAttempts) : NOT_TESTED,
    ],
    [
      "Critical / high / medium / low issues",
      d.metrics.attempts
        ? ["critical", "high", "medium", "low"]
            .map(
              (key) =>
                d.metrics.severities[key as keyof typeof d.metrics.severities],
            )
            .join(" / ")
        : NOT_TESTED,
    ],
  ];
  const references = new Map<string, string>();
  d.observations.forEach((item, i) => references.set(item.id, `E${i + 1}`));
  d.research?.sources.forEach((item, i) =>
    references.set(item.id, `S${i + 1}`),
  );
  const refs = (ids: string[]) =>
    ids.map((id) => references.get(id) ?? id).join(", ") ||
    "No supporting observations";
  const refLinks = (ids: string[]): Block => ({
    kind: "links",
    links: ids
      .filter((id) => references.has(id))
      .map((id) => ({ label: references.get(id)!, target: id })),
  });
  const summary: Section = {
    id: "executive",
    title: "1. Executive Summary",
    blocks: [
      { kind: "text", text: d.executiveSummary },
      { kind: "heading", text: `Decision: ${d.verdict.status}` },
      { kind: "text", text: d.verdict.reason },
      {
        kind: "table",
        headers: ["Measure", "Actual result"],
        rows: metricRows.slice(0, 5),
      },
      {
        kind: "text",
        text: d.issues.length
          ? `Next action: ${d.issues[0].recommendation}`
          : (d.nextExperiments[0]?.instructions ??
            "Design and approve a test before drawing a validation conclusion."),
      },
      {
        kind: "text",
        text: `Limitations: ${d.limitations.join(" ") || "No additional limitations recorded."}`,
      },
    ],
  };
  const product: Section = {
    id: "product",
    title: "2. Product Overview",
    blocks: [
      {
        kind: "text",
        text:
          d.research?.product.description ||
          d.brief.productDescription ||
          d.campaign?.title ||
          d.title,
      },
      {
        kind: "table",
        headers: ["Brief", "Founder input"],
        rows: [
          ["Product", d.research?.product.name || d.title],
          ["Input type", d.brief.inputType],
          ["Target users", d.brief.audience || "Not supplied"],
          ["Validation objective", d.brief.focus || "Not supplied"],
          ["Assumption", d.brief.assumption || "Not supplied"],
          ["Desired outcome", d.brief.desiredOutcome || "Not supplied"],
          ["Decision to make", d.brief.decision || "Not supplied"],
          [
            "Positioning",
            d.research?.product.valueProposition || "Not supplied",
          ],
          [
            "Product description basis",
            d.research?.product.basis || "Founder supplied",
          ],
        ],
      },
      {
        kind: "links",
        links: publicUrl(d.brief.targetUrl)
          ? [{ label: d.brief.targetUrl, url: d.brief.targetUrl }]
          : [],
      },
      refLinks(d.research?.product.sourceIds ?? []),
    ],
  };
  const market: Section = {
    id: "market",
    title: "3. Market Landscape",
    blocks: [
      {
        kind: "text",
        text: "External research describes the market. It does not demonstrate that participants can use this product or that demand is validated.",
      },
    ],
  };
  if (d.research) {
    market.blocks.push(
      {
        kind: "text",
        text: `${d.research.summary} [AI inference; sources: ${refs(d.research.summarySourceIds)}]`,
      },
      refLinks(d.research.summarySourceIds),
    );
    if (d.research.competitors.length)
      market.blocks.push({
        kind: "table",
        headers: [
          "Competitor",
          "Offer",
          "Public pricing",
          "Difference",
          "Sources",
        ],
        rows: d.research.competitors.map((c) => [
          c.name,
          c.offer,
          c.pricing,
          c.difference,
          refs(c.sourceIds),
        ]),
      });
    else
      market.blocks.push({
        kind: "text",
        text: "Competitors not yet researched or verified.",
      });
    d.research.news.forEach((item) =>
      market.blocks.push(
        { kind: "heading", text: item.headline },
        {
          kind: "text",
          text: `${item.summary} Published: ${item.publishedAt || "Date not verified"}. Sources: ${refs(item.sourceIds)}.`,
        },
        refLinks(item.sourceIds),
      ),
    );
    d.research.signals.forEach((item) =>
      market.blocks.push(
        {
          kind: "text",
          text: `${item.kind}: ${item.claim}. Sources: ${refs(item.sourceIds)}. Public signal; unvalidated for this product.`,
        },
        refLinks(item.sourceIds),
      ),
    );
  } else
    market.blocks.push({
      kind: "text",
      text: "Market research not yet completed. Product testing: Not yet tested.",
    });
  const tasks = d.tasks.length
    ? d.tasks
    : (d.plan?.tasks ?? []).map((task) => ({
        ...task,
        successCriteria: task.question,
      }));
  const methodology: Section = {
    id: "methodology",
    title: "4. Test Methodology",
    blocks: [
      {
        kind: "text",
        text: d.campaign
          ? `Human testing campaign, round ${d.campaign.round}. Tasks ${d.campaign.tasksApproved ? "approved by the founder" : "await founder approval"}. Product URL: ${d.campaign.url}.`
          : `Execution ${d.plan?.approvedAt ? "plan approved; campaign not launched" : "not started"}. ${NOT_TESTED}.`,
      },
      {
        kind: "table",
        headers: ["Criterion", "Value"],
        rows: [
          ["Research question", d.brief.focus || "Not supplied"],
          ["Relevant audience", d.brief.audience || "Not supplied"],
          [
            "Minimum participants",
            String(d.verdict.criteria.minimumParticipants),
          ],
          ["Success threshold", rate(d.verdict.criteria.successThreshold)],
          ["Accepted participants", String(d.metrics.participants)],
          [
            "Feedback awaiting / failing QA",
            String(
              Math.max(
                0,
                d.metrics.submittedParticipants - d.metrics.participants,
              ),
            ),
          ],
          [
            "Evidence included",
            "Only QA-approved observations; media requires participant consent",
          ],
        ],
      },
      {
        kind: "table",
        headers: ["Task", "Instructions", "Measurable success criterion"],
        rows: tasks.map((task) => [
          task.title,
          task.instructions,
          task.successCriteria || "Not defined; edit before running the test",
        ]),
      },
      ...d.limitations.map((text): Block => ({ kind: "text", text })),
    ],
  };
  const analytics: Section = {
    id: "analytics",
    title: "5. Analytics Dashboard",
    blocks: [
      {
        kind: "text",
        text: "Metrics below are calculated from accepted participant observations. No synthetic demand, funnel events or estimated timings are substituted for missing measurements.",
      },
      {
        kind: "table",
        headers: ["Measure", "Actual result"],
        rows: metricRows,
      },
    ],
  };
  if (d.metrics.attempts) {
    analytics.blocks.push(
      {
        kind: "chart",
        title: "Successful task outcomes",
        values: d.tasks.map((t) => ({
          label: t.title,
          value: t.success,
          target: t.sourceIds[0],
          taskId: t.taskId,
        })),
        unit: "observations",
      },
      {
        kind: "table",
        headers: ["Task", "Success / attempts", "Success rate", "Median time"],
        rows: d.tasks.map((task) => [
          task.title,
          `${task.success} / ${task.attempts}`,
          rate(task.successRate),
          duration(task.medianSeconds),
        ]),
      },
      {
        kind: "chart",
        title: "Issue severity",
        values: Object.entries(d.metrics.severities).map(([label, value]) => ({
          label,
          value,
        })),
        unit: "issues",
      },
    );
  } else
    analytics.blocks.push({
      kind: "text",
      text: "Task completion and behavioural analytics: Not yet tested.",
    });
  if (d.metrics.timeDistribution.length)
    analytics.blocks.push({
      kind: "table",
      headers: ["Participant", "Task", "Measured duration", "Evidence"],
      rows: d.metrics.timeDistribution.map((time) => [
        time.participant,
        d.tasks.find((task) => task.taskId === time.taskId)?.title ??
          time.taskId,
        duration(time.seconds),
        refs([time.sourceId]),
      ]),
    });
  else
    analytics.blocks.push({
      kind: "text",
      text: "Time distribution: Not yet tested. Legacy observations without recorded durations are excluded.",
    });
  if (d.comparison)
    analytics.blocks.push(
      {
        kind: "heading",
        text: `Retest: round ${d.comparison.previousRound} → ${d.comparison.currentRound}`,
      },
      {
        kind: "table",
        headers: ["Measure", "Previous", "Current"],
        rows: [
          [
            "Participants",
            String(d.comparison.previousParticipants),
            String(d.comparison.currentParticipants),
          ],
          [
            "Task success",
            rate(d.comparison.previousSuccessRate),
            rate(d.comparison.currentSuccessRate),
          ],
          [
            "Median time",
            duration(d.comparison.previousMedianSeconds),
            duration(d.comparison.currentMedianSeconds),
          ],
        ],
      },
      {
        kind: "text",
        text: `Comparability: ${d.comparison.comparable ? "Comparable task definitions" : "Not comparable"}. ${d.comparison.limitation}`,
      },
    );
  const findings: Section = {
    id: "findings",
    title: "6. Key Findings",
    blocks: [],
  };
  const recommendations: Section = {
    id: "recommendations",
    title: "7. Recommendations",
    blocks: [],
  };
  d.issues.forEach((issue, i) => {
    findings.blocks.push(
      { kind: "heading", text: `${i + 1}. ${issue.title} · ${issue.severity}` },
      {
        kind: "text",
        text: `${issue.description} Affected participants: ${issue.affectedParticipants}. Basis: ${issue.basis}. Evidence: ${refs(issue.sourceIds)}.`,
      },
      refLinks(issue.sourceIds),
    );
    recommendations.blocks.push(
      { kind: "heading", text: `${i + 1}. ${issue.title}` },
      {
        kind: "text",
        text: `${issue.recommendation} Priority: ${issue.severity}. Effort: ${issue.effort}. Supporting observations: ${refs(issue.sourceIds)}. Suggested fix; effectiveness requires a retest.`,
      },
      refLinks(issue.sourceIds),
    );
  });
  if (!findings.blocks.length)
    findings.blocks.push({
      kind: "text",
      text: d.metrics.attempts
        ? "No issues recorded in approved feedback. This does not establish that all journeys are issue-free."
        : "Not yet tested. No observed product findings are available.",
    });
  if (!recommendations.blocks.length)
    recommendations.blocks.push({
      kind: "text",
      text: "No evidence-backed product fixes are available. Run the approved test and review the participant submissions.",
    });
  const verdict: Section = {
    id: "verdict",
    title: "8. Validation Verdict",
    blocks: [
      { kind: "heading", text: d.verdict.status },
      { kind: "text", text: d.verdict.reason },
      {
        kind: "table",
        headers: ["Decision criterion", "Observed status"],
        rows: [
          [
            "Minimum sample",
            `${d.verdict.criteria.approvedParticipants} / ${d.verdict.criteria.minimumParticipants}`,
          ],
          ["Required success rate", rate(d.verdict.criteria.successThreshold)],
          ["Actual success rate", rate(d.verdict.criteria.actualSuccessRate)],
          [
            "Report reviewed and published",
            d.verdict.criteria.reportPublished ? "Yes" : "No",
          ],
          [
            "Critical issues absent",
            d.metrics.attempts
              ? d.verdict.criteria.noCriticalIssues
                ? "Yes"
                : "No"
              : NOT_TESTED,
          ],
        ],
      },
      ...d.limitations.map((text): Block => ({ kind: "text", text })),
    ],
  };
  const experiments: Section = {
    id: "experiments",
    title: "9. Next Experiments",
    blocks: [],
  };
  d.nextExperiments.forEach((item, i) =>
    experiments.blocks.push(
      { kind: "heading", text: `${i + 1}. ${item.title}` },
      {
        kind: "text",
        text: `${item.instructions} Success criterion: ${item.successCriteria}. Evidence motivating this experiment: ${refs(item.sourceIds)}. Planned experiment; not an observed outcome.`,
      },
      refLinks(item.sourceIds),
    ),
  );
  if (!experiments.blocks.length)
    experiments.blocks.push({
      kind: "text",
      text: "Define a validation objective, measurable task criteria and the decision this test will inform.",
    });
  const appendix: Section = {
    id: "evidence",
    title: "10. Evidence Appendix",
    blocks: [
      {
        kind: "text",
        text: "Participants are anonymized. Written observations are QA-approved; consent is required to export screenshots and recording links. Evidence IDs connect findings to their underlying observations.",
      },
    ],
  };
  d.observations.forEach((observation) => {
    appendix.blocks.push(
      {
        kind: "heading",
        text: `${references.get(observation.id)} · ${observation.participant} · ${observation.taskTitle}`,
        anchor: observation.id,
      },
      {
        kind: "text",
        text: `Outcome: ${observation.outcome}. Severity: ${observation.severity}. Device: ${observation.device}. Recorded: ${observation.recordedAt}. Duration: ${duration(observation.durationSeconds)}.`,
      },
      {
        kind: "text",
        text: `Answer: ${observation.answer}\nObservation: ${observation.observation}`,
      },
    );
    if (!observation.consentConfirmed && observation.evidence.length)
      appendix.blocks.push({
        kind: "text",
        text: "Attached media omitted: participant consent has not been recorded.",
      });
    if (observation.consentConfirmed)
      observation.evidence.forEach((asset) => {
        if (publicUrl(asset.url))
          appendix.blocks.push({
            kind: "links",
            links: [{ label: `${asset.name} (${asset.kind})`, url: asset.url }],
          });
        if (asset.kind === "image" && embeddedImage(asset.url))
          appendix.blocks.push({
            kind: "image",
            url: asset.url,
            caption: `${references.get(observation.id)} · ${asset.name}`,
          });
      });
  });
  if (!d.observations.length)
    appendix.blocks.push({
      kind: "text",
      text: "Participant observations: Not yet tested.",
    });
  d.research?.sources.forEach((source) =>
    appendix.blocks.push(
      {
        kind: "heading",
        text: `${references.get(source.id)} · ${source.title}`,
        anchor: source.id,
      },
      {
        kind: "text",
        text: `External research source. Retrieved: ${source.retrievedAt}. Published: ${source.publishedAt || "Date not verified"}.`,
      },
      {
        kind: "links",
        links: publicUrl(source.url)
          ? [{ label: source.url, url: source.url }]
          : [],
      },
    ),
  );
  return [
    summary,
    product,
    market,
    methodology,
    analytics,
    findings,
    recommendations,
    verdict,
    experiments,
    appendix,
  ];
}

function csvCell(value: string) {
  // CSV opened in spreadsheet software must treat participant text as data, never formulas.
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function validationCsv(d: ValidationDossier) {
  const headers = [
    "evidence_id",
    "participant",
    "device",
    "task",
    "outcome",
    "duration_seconds",
    "severity",
    "answer",
    "observation",
    "recorded_at",
    "consent_confirmed",
    "evidence_links",
  ];
  const rows = d.observations.map((o) => [
    o.id,
    o.participant,
    o.device,
    o.taskTitle,
    o.outcome,
    o.durationSeconds === null ? "" : String(o.durationSeconds),
    o.severity,
    o.answer,
    o.observation,
    o.recordedAt,
    String(o.consentConfirmed),
    o.consentConfirmed
      ? o.evidence.flatMap((a) => (publicUrl(a.url) ? [a.url] : [])).join(" | ")
      : "",
  ]);
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}

function markdown(d: ValidationDossier) {
  return renderReportMarkdown({
    title: d.title,
    generatedAt: d.generatedAt,
    reportLabel: "validation dossier",
    provenance:
      "Participant identities omitted. Downloaded snapshot; not a publicly hosted report.",
    summary: d.verdict.status,
    sections: sections(d),
  });
}

export function renderReportMarkdown(d: ReportDocument) {
  const cell = (text: string) =>
    text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const lines = [
    `# ${d.title}: ${d.reportLabel}`,
    "",
    `Generated: ${d.generatedAt}`,
    "",
    d.provenance,
    "",
  ];
  for (const section of d.sections) {
    lines.push(`## ${section.title}`, "");
    for (const block of section.blocks) {
      if (block.kind === "text") lines.push(block.text, "");
      if (block.kind === "heading")
        lines.push(
          block.anchor
            ? `<a id="${escapeHtml(anchor(block.anchor))}"></a>`
            : "",
          `### ${block.text}`,
          "",
        );
      if (block.kind === "table" && block.rows.length)
        lines.push(
          `| ${block.headers.map(cell).join(" | ")} |`,
          `| ${block.headers.map(() => "---").join(" | ")} |`,
          ...block.rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
          "",
        );
      if (block.kind === "links")
        lines.push(
          block.links
            .map(
              (link) =>
                `[${link.label.replace(/[\u005B\u005D]/g, "")}](${link.url ?? `#${anchor(link.target!)}`})`,
            )
            .join(" · "),
          "",
        );
      if (block.kind === "chart")
        lines.push(
          `**${block.title}** (${block.unit})`,
          "",
          ...block.values.map((v) => `- ${v.label}: ${v.value}`),
          "",
        );
      if (block.kind === "image")
        lines.push(
          `![${block.caption.replace(/[\u005B\u005D]/g, "")}](${block.url})`,
          "",
        );
    }
  }
  return lines.join("\n");
}

function chartSvg(block: Extract<Block, { kind: "chart" }>) {
  const max = Math.max(1, ...block.values.map((v) => v.value));
  const height = 38 + block.values.length * 42;
  const graphics = block.values
    .map((v, i) => {
      const graphic = `<g><text x="0" y="${24 + i * 42}" fill="#${PALETTE.ink}" font-size="13">${escapeHtml(v.label.length > 30 ? v.label.slice(0, 29) + "…" : v.label)}</text><rect x="230" y="${9 + i * 42}" width="${Math.max(0, (v.value / max) * 420)}" height="24" rx="5" fill="#${PALETTE.blue}"/><text x="${238 + (v.value / max) * 420}" y="${26 + i * 42}" fill="#${PALETTE.ink}" font-size="13">${v.value}</text><title>${escapeHtml(v.label)}: ${v.value} ${escapeHtml(block.unit)}</title></g>`;
      return v.taskId
        ? `<a href="#observations" data-filter-task="${escapeHtml(v.taskId)}" aria-label="${escapeHtml(v.label)}: view task observations">${graphic}</a>`
        : graphic;
    })
    .join("");
  return `<svg viewBox="0 0 720 ${height}" role="img" aria-label="${escapeHtml(block.title)}" xmlns="http://www.w3.org/2000/svg"><title>${escapeHtml(block.title)}</title>${graphics}</svg>`;
}

export function validationHtml(d: ValidationDossier) {
  const body = sections(d)
    .map(
      (section) =>
        `<section id="${section.id}"><h2>${escapeHtml(section.title)}</h2>${section.blocks
          .map((block) => {
            if (block.kind === "heading")
              return `<h3${block.anchor ? ` id="${escapeHtml(anchor(block.anchor))}"` : ""}>${escapeHtml(block.text)}</h3>`;
            if (block.kind === "text")
              return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
            if (block.kind === "table")
              return block.rows.length
                ? `<div class="table-wrap"><table><thead><tr>${block.headers.map((value) => `<th scope="col">${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
                : "";
            if (block.kind === "links")
              return `<p class="links">${block.links.map((link) => `<a href="${escapeHtml(link.url ?? `#${anchor(link.target!)}`)}"${link.url ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(link.label)}</a>`).join(" · ")}</p>`;
            if (block.kind === "chart")
              return `<figure><figcaption>${escapeHtml(block.title)} · ${escapeHtml(block.unit)}</figcaption>${chartSvg(block)}</figure>`;
            return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.caption)}" loading="lazy"><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
          })
          .join("")}</section>`,
    )
    .join("");
  const rows = d.observations
    .map(
      (o) =>
        `<tr data-task="${escapeHtml(o.taskId)}" data-outcome="${escapeHtml(o.outcome)}"><td>${escapeHtml(o.participant)}</td><td>${escapeHtml(o.taskTitle)}</td><td>${escapeHtml(o.outcome)}</td><td>${escapeHtml(duration(o.durationSeconds))}</td><td><a href="#${escapeHtml(anchor(o.id))}">View observation</a></td></tr>`,
    )
    .join("");
  const taskOptions = d.tasks
    .map(
      (t) =>
        `<option value="${escapeHtml(t.taskId)}">${escapeHtml(t.title)}</option>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(d.title)} · Playground validation report</title><style>body{margin:0;background:#${PALETTE.ivory};color:#${PALETTE.ink};font:15px/1.6 system-ui,sans-serif}main{max-width:1100px;padding:36px 24px;margin:auto}header{border-bottom:1px solid #${PALETTE.line};padding-bottom:24px}h1{font-size:34px;line-height:1.2}h2{font-size:24px}h3{font-size:18px;margin-top:28px}section{background:#fff;border:1px solid #${PALETTE.line};border-radius:16px;padding:26px;margin:22px 0;scroll-margin-top:16px}nav{display:flex;gap:10px;flex-wrap:wrap}a{color:#215db6;overflow-wrap:anywhere}p{white-space:normal;overflow-wrap:anywhere}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #${PALETTE.line};padding:11px;text-align:left;vertical-align:top;min-width:100px;overflow-wrap:anywhere}th{background:#eef3ed}figure{margin:24px 0}figure svg{width:100%;max-height:750px}img{max-width:100%;max-height:600px;object-fit:contain}figcaption{color:#${PALETTE.muted};font-size:13px}select,button{font:inherit;padding:9px;border:1px solid #${PALETTE.line};border-radius:8px;background:white;color:inherit}label{display:inline-flex;gap:8px;margin-right:12px;align-items:center}.note{color:#${PALETTE.muted}}[hidden]{display:none!important}@media print{nav,.filters{display:none}section{break-before:page;border:0}section:first-of-type{break-before:auto}body{background:white}main{padding:0}}@media(max-width:600px){main{padding:20px 12px}section{padding:18px}h1{font-size:27px}}</style></head><body><main><header><strong style="display:inline-flex;align-items:center;gap:10px"><img src="${BRAND_MARK}" width="28" height="28" alt="Playground mark"><span>Playground<span style="color:#${PALETTE.blue}">.</span></span></strong><h1>${escapeHtml(d.title)}</h1><p>Validation dossier · ${escapeHtml(d.generatedAt)} · ${escapeHtml(d.verdict.status)}</p><p class="note">Downloaded report snapshot. This file contains confidential product information and consented evidence; share it only with intended recipients. It is not a publicly hosted or access-controlled report.</p><nav>${sections(
    d,
  )
    .map(
      (s) =>
        `<a href="#${s.id}">${escapeHtml(s.title.replace(/^\d+\. /, ""))}</a>`,
    )
    .join(
      "",
    )}</nav></header><section id="observations"><h2>Participant results</h2><div class="filters"><label>Task<select id="task-filter"><option value="">All tasks</option>${taskOptions}</select></label><label>Outcome<select id="outcome-filter"><option value="">All outcomes</option>${["success", "partial", "blocked", "failure", "abandoned", "assisted"].map((o) => `<option>${o}</option>`).join("")}</select></label><p id="shown-count" aria-live="polite">${d.observations.length} observations</p></div>${d.observations.length ? `<div class="table-wrap"><table><thead><tr><th>Participant</th><th>Task</th><th>Outcome</th><th>Time</th><th>Evidence</th></tr></thead><tbody id="observation-rows">${rows}</tbody></table></div>` : `<p>${NOT_TESTED}</p>`}</section>${body}<footer class="note">Playground · Calculated participant metrics; research and suggested changes are separately labelled.</footer></main><script>const task=document.getElementById('task-filter'),outcome=document.getElementById('outcome-filter');function filter(){let count=0;document.querySelectorAll('#observation-rows tr').forEach(row=>{const shown=(!task.value||row.dataset.task===task.value)&&(!outcome.value||row.dataset.outcome===outcome.value);row.hidden=!shown;if(shown)count++});document.getElementById('shown-count').textContent=count+' observations'}task.addEventListener('change',filter);outcome.addEventListener('change',filter);document.querySelectorAll('[data-filter-task]').forEach(link=>link.addEventListener('click',()=>{task.value=link.dataset.filterTask;outcome.value='';filter()}));</script></body></html>`;
}

export function renderReportHtml(
  document: ReportDocument,
  evidence: ReportEvidenceTable,
) {
  const body = document.sections
    .map(
      (section) =>
        `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(section.title)}</h2>${section.blocks
          .map((block) => {
            if (block.kind === "heading")
              return `<h3${block.anchor ? ` id="${escapeHtml(anchor(block.anchor))}"` : ""}>${escapeHtml(block.text)}</h3>`;
            if (block.kind === "text")
              return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
            if (block.kind === "table")
              return block.rows.length
                ? `<div class="table-wrap"><table><thead><tr>${block.headers.map((value) => `<th scope="col">${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
                : "";
            if (block.kind === "links")
              return `<p>${block.links.map((link) => `<a href="${escapeHtml(link.url ?? `#${anchor(link.target!)}`)}"${link.url ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(link.label)}</a>`).join(" · ")}</p>`;
            if (block.kind === "chart")
              return `<figure><figcaption>${escapeHtml(block.title)} · ${escapeHtml(block.unit)}</figcaption>${chartSvg(block)}</figure>`;
            return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.caption)}" loading="lazy"><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
          })
          .join("")}</section>`,
    )
    .join("");
  const rows = evidence.rows
    .map(
      (row) =>
        `<tr data-task="${escapeHtml(row.taskId)}" data-outcome="${escapeHtml(row.outcome)}" data-device="${escapeHtml(row.device || "")}" data-profile="${escapeHtml(row.profileId || "")}">${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}<td><a href="#${escapeHtml(anchor(row.id))}">View evidence</a></td></tr>`,
    )
    .join("");
  const options = (values: { id: string; name: string }[]) =>
    values
      .map(
        (value) =>
          `<option value="${escapeHtml(value.id)}">${escapeHtml(value.name)}</option>`,
      )
      .join("");
  const hasDevice = evidence.rows.some((row) => row.device);
  const profileFilter = evidence.profiles?.length
    ? `<label>Profile<select id="profile-filter"><option value="">All profiles</option>${options(evidence.profiles)}</select></label>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(document.title)} · Playground ${escapeHtml(document.reportLabel)}</title><style>
body{margin:0;background:#${PALETTE.ivory};color:#${PALETTE.ink};font:15px/1.6 system-ui,sans-serif}main{max-width:1100px;padding:36px 24px;margin:auto}header{padding-bottom:24px;border-bottom:1px solid #${PALETTE.line}}h1{font-size:34px;line-height:1.2}h2{font-size:24px}h3{font-size:18px;margin-top:28px}section{background:#fff;border:1px solid #${PALETTE.line};border-radius:16px;padding:26px;margin:22px 0;scroll-margin-top:16px}nav,.filters{display:flex;flex-wrap:wrap;gap:12px}a{color:#215db6;overflow-wrap:anywhere}p{overflow-wrap:anywhere}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #${PALETTE.line};padding:11px;text-align:left;vertical-align:top;min-width:100px;overflow-wrap:anywhere}th{background:#eef3ed}figure{margin:24px 0}figure svg{width:100%;max-height:750px}img{max-width:100%;max-height:600px;object-fit:contain}figcaption,.note{color:#${PALETTE.muted};font-size:13px}select{font:inherit;padding:9px;border:1px solid #${PALETTE.line};border-radius:8px;background:#fff;color:inherit}label{display:inline-flex;gap:8px;align-items:center}#shown-count{flex-basis:100%;margin:0}[hidden]{display:none!important}@media print{nav,.filters{display:none}section{break-before:page;border:0}body{background:#fff}main{padding:0}}@media(max-width:600px){main{padding:20px 12px}section{padding:18px}h1{font-size:27px}}
</style></head><body><main><header><strong style="display:inline-flex;align-items:center;gap:10px"><img src="${BRAND_MARK}" width="28" height="28" alt="Playground mark"><span>Playground<span style="color:#${PALETTE.blue}">.</span></span></strong><h1>${escapeHtml(document.title)}</h1><p>${escapeHtml(document.reportLabel)} · ${escapeHtml(document.generatedAt)} · ${escapeHtml(document.summary)}</p><p class="note">${escapeHtml(document.provenance)}</p><p class="note">Downloaded report snapshot. This file contains confidential product information. Private worker artifacts require the original Playground workspace; this file does not create public access.</p><nav>${document.sections.map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title.replace(/^\d+\. /, ""))}</a>`).join("")}</nav></header>
<section id="observations"><h2>${escapeHtml(evidence.title)}</h2><div class="filters"><label>Task<select id="task-filter"><option value="">All tasks</option>${options(evidence.tasks.map((task) => ({ id: task.id, name: task.title })))}</select></label><label>Outcome<select id="outcome-filter"><option value="">All outcomes</option>${options(evidence.outcomes.map((outcome) => ({ id: outcome, name: outcome })))}</select></label>${hasDevice ? '<label>Device<select id="device-filter"><option value="">All devices</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>' : ""}${profileFilter}<p id="shown-count" aria-live="polite">${evidence.rows.length} observations</p></div>${evidence.rows.length ? `<div class="table-wrap"><table><thead><tr>${[...evidence.headers, "Evidence"].map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody id="observation-rows">${rows}</tbody></table></div>` : "<p>Not yet tested</p>"}</section>${body}<footer class="note">Playground · ${escapeHtml(document.provenance)}</footer></main><script>
const filterNames=['task','outcome','device','profile'];const filters=filterNames.map(name=>[name,document.getElementById(name+'-filter')]).filter(pair=>pair[1]);function filter(){let count=0;document.querySelectorAll('#observation-rows tr').forEach(row=>{const shown=filters.every(pair=>!pair[1].value||row.dataset[pair[0]]===pair[1].value);row.hidden=!shown;if(shown)count++});document.getElementById('shown-count').textContent=count+' observations'}filters.forEach(pair=>pair[1].addEventListener('change',filter));document.querySelectorAll('[data-filter-task]').forEach(link=>link.addEventListener('click',()=>{filters.forEach(pair=>pair[1].value=pair[0]==='task'?link.dataset.filterTask:'');filter()}));
</script></body></html>`;
}

export function renderReportCsv(
  headers: string[],
  rows: (string | number | boolean | null)[][],
) {
  return (
    "\uFEFF" +
    [
      headers,
      ...rows.map((row) =>
        row.map((value) => (value === null ? "" : String(value))),
      ),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}

export async function renderReportWorkbook(
  document: ReportDocument,
  sheets: ReportSheet[],
) {
  const module = await import("exceljs");
  const workbook = new module.default.Workbook();
  workbook.creator = "Playground";
  workbook.created = new Date(document.generatedAt);
  const overview: ReportSheet = {
    name: "Report overview",
    headers: ["Section", "Content"],
    rows: document.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.kind === "text" || block.kind === "heading"
          ? [[section.title, block.text]]
          : [],
      ),
    ),
  };
  for (const sheet of [overview, ...sheets]) {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    worksheet.addRow(sheet.headers);
    sheet.rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${PALETTE.teal}` },
    };
    worksheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 32 : 25;
      column.alignment = { vertical: "top", wrapText: true };
    });
    worksheet.autoFilter = {
      from: "A1",
      to: {
        row: Math.max(1, sheet.rows.length + 1),
        column: sheet.headers.length,
      },
    };
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function renderReportPdf(
  d: ReportDocument,
): Promise<Uint8Array<ArrayBuffer>> {
  const lib = await import("pdf-lib");
  const doc = await lib.PDFDocument.create();
  const brandMark = await doc.embedPng(BRAND_MARK);
  doc.setTitle(`${d.title}: ${d.reportLabel}`);
  doc.setAuthor("Playground");
  doc.setSubject(d.provenance);
  doc.setCreationDate(new Date(d.generatedAt));
  let regular = await doc.embedFont(lib.StandardFonts.Helvetica);
  let bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  try {
    const responses = await Promise.all([
      fetch("/brand/manrope-report-regular.ttf"),
      fetch("/brand/manrope-report-bold.ttf"),
    ]);
    if (responses.every((response) => response.ok)) {
      const fontkit = await import("@pdf-lib/fontkit");
      doc.registerFontkit(fontkit.default);
      regular = await doc.embedFont(await responses[0].arrayBuffer(), {
        subset: true,
      });
      bold = await doc.embedFont(await responses[1].arrayBuffer(), {
        subset: true,
      });
    }
  } catch {
    /* A standard embedded font keeps the report downloadable offline. */
  }
  const regularChars = new Set(regular.getCharacterSet());
  const printable = (text: string) =>
    [...text]
      .map((char) =>
        regularChars.has(char.codePointAt(0)!)
          ? char
          : char === "\n" || char === "\r"
            ? " "
            : "?",
      )
      .join("");
  const color = (hex: string) =>
    lib.rgb(
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    );
  const width = 595.28,
    height = 841.89,
    margin = 44,
    contentWidth = width - margin * 2;
  let page = doc.addPage([width, height]),
    y = height - 104;
  let sectionTitle = "";
  const destinations = new Map<
    string,
    { page: import("pdf-lib").PDFPage; y: number }
  >();
  const pending: {
    page: import("pdf-lib").PDFPage;
    rect: number[];
    target: string;
  }[] = [];
  const pageHeader = () => {
    page.drawRectangle({
      x: 0,
      y: height - 66,
      width,
      height: 66,
      color: color(PALETTE.ivory),
    });
    page.drawImage(brandMark, {
      x: margin,
      y: height - 44,
      width: 24,
      height: 24,
    });
    page.drawText("Playground", {
      x: margin + 32,
      y: height - 39,
      size: 18,
      font: bold,
      color: color(PALETTE.ink),
    });
    page.drawText(".", {
      x: margin + 32 + bold.widthOfTextAtSize("Playground", 18),
      y: height - 39,
      size: 18,
      font: bold,
      color: color(PALETTE.blue),
    });
    page.drawText(printable(d.title).slice(0, 65), {
      x: margin + 32,
      y: height - 57,
      size: 8,
      font: regular,
      color: color(PALETTE.muted),
    });
    page.drawLine({
      start: { x: margin, y: 47 },
      end: { x: width - margin, y: 47 },
      thickness: 0.5,
      color: color(PALETTE.line),
    });
  };
  const nextPage = (continuation = true) => {
    page = doc.addPage([width, height]);
    y = height - 104;
    pageHeader();
    if (continuation && sectionTitle) {
      page.drawText(printable(sectionTitle + " (continued)"), {
        x: margin,
        y,
        size: 12,
        font: bold,
        color: color(PALETTE.teal),
      });
      y -= 28;
    }
  };
  const ensure = (needed: number) => {
    if (y - needed < 65) nextPage();
  };
  const wrap = (
    text: string,
    size: number,
    available = contentWidth,
    font = regular,
  ) => {
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r/g, "").split("\n")) {
      let line = "";
      for (const word of printable(paragraph).split(/\s+/)) {
        if (!word) continue;
        const proposed = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(proposed, size) <= available) {
          line = proposed;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const char of word) {
          if (line && font.widthOfTextAtSize(line + char, size) > available) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (
    value: string,
    size = 10,
    font = regular,
    ink = PALETTE.ink,
  ) => {
    for (const line of wrap(value, size, contentWidth, font)) {
      ensure(size * 1.6);
      page.drawText(line, { x: margin, y, size, font, color: color(ink) });
      y -= size * 1.5;
    }
    y -= 8;
  };
  const annotation = (
    p: import("pdf-lib").PDFPage,
    rect: number[],
    action: unknown,
  ) => {
    const ref = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: rect,
        Border: [0, 0, 0],
        A: action as import("pdf-lib").PDFDict,
      }),
    );
    let annots = p.node.lookupMaybe(lib.PDFName.of("Annots"), lib.PDFArray);
    if (!annots) {
      annots = doc.context.obj([]);
      p.node.set(lib.PDFName.of("Annots"), annots);
    }
    annots.push(ref);
  };
  const links = (items: Link[]) => {
    for (const item of items) {
      const label = `${item.label}${item.url && item.label !== item.url ? ` — ${item.url}` : ""}`;
      for (const line of wrap(label, 9)) {
        ensure(16);
        page.drawText(line, {
          x: margin,
          y,
          size: 9,
          font: regular,
          color: color(PALETTE.blue),
        });
        const rect = [
          margin,
          y - 2,
          margin + Math.max(12, regular.widthOfTextAtSize(line, 9)),
          y + 11,
        ];
        if (item.url && publicUrl(item.url))
          annotation(
            page,
            rect,
            doc.context.obj({
              Type: "Action",
              S: "URI",
              URI: lib.PDFString.of(item.url),
            }),
          );
        else if (item.target) pending.push({ page, rect, target: item.target });
        y -= 15;
      }
      y -= 5;
    }
  };
  const table = (headers: string[], rows: string[][]) => {
    if (!rows.length) return;
    const widths = headers.map((_, i) =>
      headers.length === 2
        ? contentWidth * (i === 0 ? 0.34 : 0.66)
        : contentWidth / headers.length,
    );
    const render = (
      cells: string[][],
      start: number,
      take: number,
      header: boolean,
    ) => {
      const rowHeight = Math.max(24, take * 12 + 14);
      ensure(rowHeight + 2);
      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 8,
        width: contentWidth,
        height: rowHeight,
        color: color(header ? "EAF0EA" : "FFFFFF"),
        borderColor: color(PALETTE.line),
        borderWidth: 0.4,
      });
      let x = margin;
      cells.forEach((cell, i) => {
        cell.slice(start, start + take).forEach((line, j) =>
          page.drawText(line, {
            x: x + 7,
            y: y - 5 - j * 12,
            size: header ? 8.5 : 8,
            font: header ? bold : regular,
            color: color(PALETTE.ink),
          }),
        );
        x += widths[i];
      });
      y -= rowHeight;
    };
    const headerCells = headers.map((cell, i) =>
      wrap(cell, 8.5, widths[i] - 14, bold),
    );
    const headerLines = Math.max(...headerCells.map((c) => c.length));
    const drawHeader = () => render(headerCells, 0, headerLines, true);
    drawHeader();
    for (const row of rows) {
      const cells = headers.map((_, i) =>
        wrap(row[i] ?? "", 8, widths[i] - 14),
      );
      const total = Math.max(...cells.map((cell) => cell.length));
      let start = 0;
      while (start < total) {
        if (y - 38 < 65) {
          nextPage();
          drawHeader();
        }
        const capacity = Math.max(1, Math.floor((y - 65 - 14) / 12));
        const take = Math.min(total - start, capacity);
        render(cells, start, take, false);
        start += take;
        if (start < total) {
          nextPage();
          drawHeader();
        }
      }
    }
    y -= 18;
  };
  pageHeader();
  for (const [index, section] of d.sections.entries()) {
    if (index) nextPage(false);
    sectionTitle = section.title;
    destinations.set(section.id, { page, y });
    text(section.title, 21, bold, PALETTE.teal);
    for (const block of section.blocks) {
      if (block.kind === "text") text(block.text);
      if (block.kind === "heading") {
        ensure(54);
        if (block.anchor) destinations.set(block.anchor, { page, y });
        text(block.text, 12, bold);
      }
      if (block.kind === "links") links(block.links);
      if (block.kind === "table") table(block.headers, block.rows);
      if (block.kind === "chart") {
        ensure(70);
        text(block.title + ` (${block.unit})`, 12, bold);
        const max = Math.max(1, ...block.values.map((v) => v.value));
        for (const value of block.values) {
          ensure(40);
          const label = wrap(value.label, 8, 140)[0];
          page.drawText(label, {
            x: margin,
            y: y - 1,
            size: 8,
            font: regular,
            color: color(PALETTE.ink),
          });
          const barWidth = (value.value / max) * 295;
          page.drawRectangle({
            x: margin + 150,
            y: y - 6,
            width: barWidth,
            height: 15,
            color: color(PALETTE.blue),
          });
          page.drawText(String(value.value), {
            x: margin + 158 + barWidth,
            y: y - 1,
            size: 9,
            font: regular,
            color: color(PALETTE.ink),
          });
          y -= 29;
        }
        y -= 12;
      }
      if (block.kind === "image") {
        try {
          let bytes: Uint8Array | string = block.url;
          if (
            !/^data:image\/(?:png|jpeg);/.test(block.url) &&
            typeof document !== "undefined"
          ) {
            const image = new Image();
            image.src = block.url;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext("2d")?.drawImage(image, 0, 0);
            bytes = canvas.toDataURL("image/png");
          }
          const image = /^data:image\/jpeg;/.test(block.url)
            ? await doc.embedJpg(bytes)
            : await doc.embedPng(bytes);
          const scale = Math.min(
            contentWidth / image.width,
            320 / image.height,
          );
          const imageHeight = image.height * scale;
          ensure(imageHeight + 45);
          page.drawImage(image, {
            x: margin,
            y: y - imageHeight,
            width: image.width * scale,
            height: imageHeight,
          });
          y -= imageHeight + 15;
          text(block.caption, 8, regular, PALETTE.muted);
        } catch {
          text(
            `${block.caption}: image could not be embedded. Use the HTML or JSON export to access the original consented attachment.`,
            9,
          );
        }
      }
    }
  }
  for (const item of pending) {
    const dest = destinations.get(item.target);
    if (dest)
      annotation(
        item.page,
        item.rect,
        doc.context.obj({
          Type: "Action",
          S: "GoTo",
          D: [dest.page.ref, lib.PDFName.of("XYZ"), null, dest.y + 20, null],
        }),
      );
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: width - margin - 42,
      y: 30,
      size: 8,
      font: regular,
      color: color(PALETTE.muted),
    });
    p.drawText(
      printable(`Playground · Confidential ${d.reportLabel}`).slice(0, 90),
      {
        x: margin,
        y: 30,
        size: 8,
        font: regular,
        color: color(PALETTE.muted),
      },
    );
  });
  return new Uint8Array(await doc.save());
}

export async function renderReportDocx(d: ReportDocument) {
  const lib = await import("docx");
  const children: (import("docx").Paragraph | import("docx").Table)[] = [];
  const paragraph = (text: string) =>
    new lib.Paragraph({
      children: [new lib.TextRun(text)],
      spacing: { after: 180 },
    });
  children.push(
    new lib.Paragraph({
      text: `${d.title}: ${d.reportLabel}`,
      heading: lib.HeadingLevel.TITLE,
    }),
    paragraph(`Playground · ${d.generatedAt} · ${d.provenance}`),
  );
  for (const [index, section] of d.sections.entries()) {
    children.push(
      new lib.Paragraph({
        text: section.title,
        heading: lib.HeadingLevel.HEADING_1,
        pageBreakBefore: index > 0,
      }),
    );
    for (const block of section.blocks) {
      if (block.kind === "text") children.push(paragraph(block.text));
      if (block.kind === "heading")
        children.push(
          new lib.Paragraph({
            text: block.text,
            heading: lib.HeadingLevel.HEADING_2,
          }),
        );
      if (block.kind === "table" && block.rows.length)
        children.push(
          new lib.Table({
            width: { size: 100, type: lib.WidthType.PERCENTAGE },
            rows: [block.headers, ...block.rows].map(
              (row, i) =>
                new lib.TableRow({
                  tableHeader: i === 0,
                  children: row.map(
                    (text) =>
                      new lib.TableCell({
                        shading: i === 0 ? { fill: "EAF0EA" } : undefined,
                        children: [
                          new lib.Paragraph({
                            children: [
                              new lib.TextRun({
                                text,
                                bold: i === 0,
                                size: 20,
                              }),
                            ],
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
        );
      if (block.kind === "links")
        children.push(
          new lib.Paragraph({
            children: block.links.map((link) =>
              link.url
                ? new lib.ExternalHyperlink({
                    link: link.url,
                    children: [
                      new lib.TextRun({
                        text: `${link.label}   `,
                        style: "Hyperlink",
                      }),
                    ],
                  })
                : new lib.TextRun({
                    text: `Evidence reference: ${link.label}   `,
                  }),
            ),
          }),
        );
      if (block.kind === "chart")
        children.push(
          new lib.Paragraph({
            text: `${block.title} (${block.unit})`,
            heading: lib.HeadingLevel.HEADING_2,
          }),
          new lib.Table({
            rows: block.values.map(
              (v) =>
                new lib.TableRow({
                  children: [v.label, String(v.value)].map(
                    (text) =>
                      new lib.TableCell({ children: [paragraph(text)] }),
                  ),
                }),
            ),
          }),
        );
      if (block.kind === "image") {
        const imageType = block.url.match(/^data:image\/(png|jpeg|gif);/)?.[1];
        if (imageType)
          children.push(
            new lib.Paragraph({
              children: [
                new lib.ImageRun({
                  type:
                    imageType === "jpeg" ? "jpg" : (imageType as "png" | "gif"),
                  data: block.url,
                  transformation: { width: 480, height: 270 },
                }),
              ],
            }),
            paragraph(block.caption),
          );
        else
          children.push(
            paragraph(
              `${block.caption}: original screenshot is included in the HTML and JSON exports.`,
            ),
          );
      }
    }
  }
  const document = new lib.Document({
    creator: "Playground",
    title: d.title,
    description: d.provenance,
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 22, color: PALETTE.ink },
          paragraph: { spacing: { after: 160, line: 300 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 36, bold: true, color: PALETTE.teal },
          paragraph: { spacing: { before: 300, after: 200 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } },
        },
        footers: {
          default: new lib.Footer({
            children: [
              new lib.Paragraph({
                children: [
                  new lib.TextRun("Playground · Confidential · "),
                  new lib.TextRun({ children: [lib.PageNumber.CURRENT] }),
                ],
                alignment: lib.AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return lib.Packer.toBlob(document);
}

export async function renderReportPptx(d: ReportDocument) {
  const { default: Presentation } = await import("pptxgenjs");
  const presentation = new Presentation();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Playground";
  presentation.subject = d.provenance;
  presentation.title = d.title;
  presentation.company = "Playground";
  presentation.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  let number = 0;
  const slide = (title: string) => {
    const s = presentation.addSlide();
    number++;
    s.background = { color: PALETTE.ivory };
    s.addText("Playground.", {
      x: 0.5,
      y: 0.2,
      w: 5,
      h: 0.3,
      fontSize: 15,
      bold: true,
      color: PALETTE.ink,
      margin: 0,
    });
    s.addText(title, {
      x: 0.5,
      y: 0.7,
      w: 12.3,
      h: 0.7,
      fontSize: 26,
      bold: true,
      color: PALETTE.teal,
      margin: 0,
      breakLine: false,
    });
    s.addText(`Confidential · ${number}`, {
      x: 10,
      y: 7.1,
      w: 2.8,
      h: 0.2,
      fontSize: 9,
      align: "right",
      color: PALETTE.muted,
    });
    return s;
  };
  for (const section of d.sections) {
    let current = slide(section.title),
      y = 1.65;
    const ensure = (needed: number) => {
      if (y + needed > 6.85) {
        current = slide(section.title + " (continued)");
        y = 1.65;
      }
    };
    for (const block of section.blocks) {
      if (block.kind === "text" || block.kind === "heading") {
        const fontSize = block.kind === "heading" ? 16 : 13;
        // Fixed-length pieces prevent a long source quotation from silently overflowing a slide.
        const chunks = block.text.match(/[\s\S]{1,650}/g) ?? [""];
        for (const chunk of chunks) {
          const h = Math.max(0.45, Math.ceil(chunk.length / 120) * 0.24 + 0.2);
          ensure(h);
          current.addText(chunk, {
            x: 0.55,
            y,
            w: 12.2,
            h,
            fontSize,
            bold: block.kind === "heading",
            color: PALETTE.ink,
            margin: 0,
            valign: "top",
            breakLine: false,
          });
          y += h + 0.15;
        }
      }
      if (block.kind === "table" && block.rows.length) {
        // Paginate long cells explicitly instead of depending on Office clipping or table auto-pagination.
        for (const row of block.rows) {
          const limit = Math.max(100, Math.floor(900 / row.length));
          const cells = row.map(
            (cell) =>
              cell.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) ?? [""],
          );
          const parts = Math.max(...cells.map((cell) => cell.length));
          for (let part = 0; part < parts; part++) {
            const segment = cells.map(
              (cell, column) =>
                cell[part] ??
                (column === 0 && part ? `${row[0]} (continued)` : ""),
            );
            const maxLength = Math.max(...segment.map((text) => text.length));
            const h = Math.min(
              4.6,
              Math.max(
                0.75,
                Math.ceil(maxLength / (90 / row.length)) * 0.16 + 0.5,
              ),
            );
            ensure(h + 0.2);
            current.addTable(
              [
                block.headers.map((text) => ({
                  text,
                  options: { bold: true, fill: { color: "EAF0EA" } },
                })),
                segment.map((text) => ({ text })),
              ],
              {
                x: 0.55,
                y,
                w: 12.2,
                h,
                fontSize: 11,
                color: PALETTE.ink,
                border: { color: PALETTE.line, pt: 0.5 },
                margin: 0.08,
                valign: "top",
                autoPage: false,
              },
            );
            y += h + 0.2;
          }
        }
      }
      if (block.kind === "links")
        for (const link of block.links) {
          ensure(0.45);
          current.addText(link.label, {
            x: 0.55,
            y,
            w: 12.2,
            h: 0.35,
            fontSize: 11,
            color: PALETTE.blue,
            hyperlink: link.url ? { url: link.url } : undefined,
            margin: 0,
          });
          y += 0.42;
        }
      if (block.kind === "chart" && block.values.length) {
        ensure(4.5);
        current.addChart(
          presentation.ChartType.bar,
          [
            {
              name: block.unit,
              labels: block.values.map((v) => v.label),
              values: block.values.map((v) => v.value),
            },
          ],
          {
            x: 0.55,
            y,
            w: 12.2,
            h: 4.4,
            chartColors: [PALETTE.blue],
            showValue: true,
            showLegend: false,
            catAxisLabelFontSize: 10,
            valAxisLabelFontSize: 10,
            valAxisMinVal: 0,
            showTitle: true,
            title: block.title,
            titleFontSize: 16,
          },
        );
        y += 4.6;
      }
      if (block.kind === "image") {
        if (/^data:image\/(?:png|jpeg|gif);/.test(block.url)) {
          ensure(4.6);
          current.addImage({
            data: block.url,
            x: 0.6,
            y,
            w: 8.3,
            h: 4.3,
            altText: block.caption,
          });
          y += 4.5;
        } else {
          ensure(0.5);
          current.addText(
            `${block.caption}: see HTML / JSON for original image`,
            { x: 0.55, y, w: 12, h: 0.4, fontSize: 11 },
          );
          y += 0.5;
        }
      }
    }
  }
  return (await presentation.write({
    outputType: "blob",
    compression: true,
  })) as Blob;
}

async function xlsx(d: ValidationDossier) {
  const module = await import("exceljs");
  const workbook = new module.default.Workbook();
  workbook.creator = "Playground";
  workbook.created = new Date(d.generatedAt);
  const sheet = (
    name: string,
    headers: string[],
    rows: (string | number | boolean | null)[][],
  ) => {
    const worksheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    worksheet.addRow(headers);
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + PALETTE.teal },
    };
    worksheet.columns.forEach((column, i) => {
      column.width = i === 0 ? 30 : 24;
      column.alignment = { vertical: "top", wrapText: true };
    });
    worksheet.autoFilter = {
      from: "A1",
      to: { row: Math.max(1, rows.length + 1), column: headers.length },
    };
    return worksheet;
  };
  const summaryRows = sections(d).flatMap((section) =>
    section.blocks
      .filter((b): b is Extract<Block, { kind: "text" }> => b.kind === "text")
      .map((block) => [section.title, block.text]),
  );
  sheet("Report overview", ["Section", "Content"], summaryRows);
  sheet(
    "Task analytics",
    [
      "Task",
      "Attempts",
      "Success",
      "Failure",
      "Abandoned",
      "Assisted",
      "Partial",
      "Blocked",
      "Success rate",
      "Median seconds",
    ],
    d.tasks.map((t) => [
      t.title,
      t.attempts,
      t.success,
      t.failure,
      t.abandoned,
      t.assisted,
      t.partial,
      t.blocked,
      t.successRate,
      t.medianSeconds,
    ]),
  );
  sheet(
    "Participant results",
    [
      "Evidence ID",
      "Participant",
      "Device",
      "Task",
      "Outcome",
      "Duration seconds",
      "Severity",
      "Answer",
      "Observation",
      "Recorded",
      "Consent",
    ],
    d.observations.map((o) => [
      o.id,
      o.participant,
      o.device,
      o.taskTitle,
      o.outcome,
      o.durationSeconds,
      o.severity,
      o.answer,
      o.observation,
      o.recordedAt,
      o.consentConfirmed,
    ]),
  );
  sheet(
    "Findings and fixes",
    [
      "Issue",
      "Severity",
      "Description",
      "Recommendation",
      "Affected participants",
      "Evidence IDs",
      "Effort",
      "Basis",
    ],
    d.issues.map((i) => [
      i.title,
      i.severity,
      i.description,
      i.recommendation,
      i.affectedParticipants,
      i.sourceIds.join(" | "),
      i.effort,
      i.basis,
    ]),
  );
  sheet(
    "Next experiments",
    ["Experiment", "Instructions", "Success criterion", "Evidence IDs"],
    d.nextExperiments.map((e) => [
      e.title,
      e.instructions,
      e.successCriteria,
      e.sourceIds.join(" | "),
    ]),
  );
  const sources = sheet(
    "Research sources",
    ["ID", "Title", "URL", "Retrieved", "Published"],
    (d.research?.sources ?? []).map((s) => [
      s.id,
      s.title,
      s.url,
      s.retrievedAt,
      s.publishedAt ?? "Date not verified",
    ]),
  );
  d.research?.sources.forEach((s, i) => {
    if (publicUrl(s.url))
      sources.getCell(i + 2, 3).value = { text: s.url, hyperlink: s.url };
  });
  const evidenceRows = d.observations.flatMap((o) =>
    o.consentConfirmed
      ? o.evidence.flatMap((asset) =>
          publicUrl(asset.url)
            ? [[o.id, o.participant, asset.name, asset.kind, asset.url]]
            : [],
        )
      : [],
  );
  const evidence = sheet(
    "Evidence links",
    ["Evidence ID", "Participant", "Name", "Kind", "URL"],
    evidenceRows,
  );
  evidenceRows.forEach((row, i) => {
    evidence.getCell(i + 2, 5).value = { text: row[4], hyperlink: row[4] };
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

export async function buildValidationExport(
  format: ValidationExportFormat,
  dossier: ValidationDossier,
): Promise<ValidationExportArtifact> {
  const stem =
    (dossier.title
      .normalize("NFKD")
      .replace(/[^a-z\d]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "playground") + "-validation";
  let contents: Blob | string | Uint8Array<ArrayBuffer>;
  const safe = anonymizeValidationDossier(dossier);
  const document: ReportDocument = {
    title: dossier.title,
    generatedAt: dossier.generatedAt,
    reportLabel: "validation dossier",
    provenance:
      "Accepted human participant evidence; participant identities omitted",
    summary: dossier.verdict.status,
    sections: sections(dossier),
  };
  if (format === "pdf") contents = await renderReportPdf(document);
  else if (format === "docx") contents = await renderReportDocx(document);
  else if (format === "pptx") contents = await renderReportPptx(document);
  else if (format === "xlsx") contents = await xlsx(dossier);
  else if (format === "csv") contents = validationCsv(dossier);
  else if (format === "json") contents = JSON.stringify(safe, null, 2);
  else if (format === "jsonl")
    contents =
      [
        JSON.stringify({
          type: "dossier",
          title: safe.title,
          generatedAt: safe.generatedAt,
          brief: safe.brief,
          metrics: safe.metrics,
          verdict: safe.verdict,
          limitations: safe.limitations,
        }),
        ...safe.observations.map((observation) =>
          JSON.stringify({ type: "observation", ...observation }),
        ),
        ...safe.issues.map((issue) =>
          JSON.stringify({ type: "issue", ...issue }),
        ),
      ].join("\n") + "\n";
  else if (format === "markdown") contents = markdown(dossier);
  else contents = validationHtml(dossier);
  return {
    blob: new Blob([contents], { type: MIME[format] }),
    filename: `${stem}.${format === "markdown" ? "md" : format}`,
  };
}

export async function exportValidationDossier(
  format: ValidationExportFormat,
  dossier: ValidationDossier,
): Promise<void> {
  const artifact = await buildValidationExport(format, dossier);
  const url = URL.createObjectURL(artifact.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
