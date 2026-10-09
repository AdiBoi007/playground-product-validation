import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import {
  anonymizeValidationDossier,
  buildValidationExport,
  validationCsv,
  validationHtml,
} from "./validation-export";
import type { ValidationDossier } from "./validation";

function fixture(): ValidationDossier {
  return {
    sandboxId: "sandbox-1",
    title: "Onboarding study",
    generatedAt: "2026-10-09T05:00:00.000Z",
    brief: {
      inputType: "web-app",
      focus: "Can new users complete onboarding without help?",
      audience: "First-time users",
      assumption: "Start is obvious",
      decision: "Ship or change the flow",
      desiredOutcome: "Unassisted onboarding",
      targetUrl: "https://product.example/",
      successThreshold: 80,
    },
    observations: [
      {
        id: "submission1:task1",
        submissionId: "submission1",
        testerId: "private-alice",
        participant: "Participant 1",
        device: "desktop",
        taskId: "task1",
        taskTitle: "Complete onboarding",
        outcome: "success",
        answer: "I found the start button",
        observation: "Reached the welcome page",
        severity: "none",
        durationSeconds: 20,
        evidence: [],
        consentConfirmed: true,
        recordedAt: "2026-10-09T04:00:00.000Z",
      },
      {
        id: "submission2:task1",
        submissionId: "submission2",
        testerId: "private-bob",
        participant: "Participant 2",
        device: "mobile",
        taskId: "task1",
        taskTitle: "Complete onboarding",
        outcome: "blocked",
        answer: "The button was hidden",
        observation: "Could not proceed beyond consent",
        severity: "high",
        durationSeconds: 40,
        evidence: [
          {
            id: "recording1",
            kind: "video",
            name: "Consented session",
            url: "https://evidence.example/session#t=20",
          },
        ],
        consentConfirmed: true,
        recordedAt: "2026-10-09T04:00:00.000Z",
      },
    ],
    metrics: {
      participants: 2,
      expectedParticipants: 5,
      approvedSubmissions: 2,
      submittedParticipants: 2,
      attempts: 2,
      success: 1,
      failure: 1,
      abandoned: 0,
      assisted: 0,
      partial: 0,
      blocked: 1,
      successRate: 50,
      failureRate: 50,
      medianSeconds: 30,
      timedAttempts: 2,
      timeDistribution: [
        {
          sourceId: "submission1:task1",
          taskId: "task1",
          participant: "Participant 1",
          seconds: 20,
        },
        {
          sourceId: "submission2:task1",
          taskId: "task1",
          participant: "Participant 2",
          seconds: 40,
        },
      ],
      severities: { critical: 0, high: 1, medium: 0, low: 0 },
    },
    tasks: [
      {
        taskId: "task1",
        title: "Complete onboarding",
        instructions: "Open the app and complete the welcome flow",
        successCriteria: "Reach the welcome page without assistance",
        attempts: 2,
        success: 1,
        failure: 1,
        abandoned: 0,
        assisted: 0,
        partial: 0,
        blocked: 1,
        successRate: 50,
        medianSeconds: 30,
        sourceIds: ["submission1:task1", "submission2:task1"],
      },
    ],
    issues: [
      {
        id: "finding1",
        title: "Start button hidden",
        severity: "high",
        description: "The primary button could not be reached",
        recommendation: "Keep Continue visible below the consent text",
        sourceIds: ["submission2:task1"],
        taskIds: ["task1"],
        affectedParticipants: 1,
        basis: "observed-feedback",
        effort: "Not estimated",
      },
    ],
    verdict: {
      status: "Insufficient Evidence",
      reason: "Two participants are fewer than the required five",
      criteria: {
        minimumParticipants: 5,
        approvedParticipants: 2,
        successThreshold: 80,
        actualSuccessRate: 50,
        reportPublished: false,
        noCriticalIssues: true,
        successCriteriaDefined: true,
        taskThresholdsMet: false,
      },
    },
    limitations: ["Small sample: two of five required participants"],
    executiveSummary:
      "One of two participants completed onboarding without help. More evidence is required.",
    nextExperiments: [
      {
        title: "Retest the visible Continue button",
        instructions: "Retest with five new users after moving the button",
        successCriteria: "At least 80% finish without help",
        sourceIds: ["submission2:task1"],
      },
    ],
    research: {
      product: {
        name: "Acme",
        description: "Onboarding product",
        url: "https://product.example",
        audience: "First-time users",
        valueProposition: "Fast onboarding",
        sourceIds: [],
        basis: "input",
      },
      summary: "Acme competes on simplicity",
      summarySourceIds: ["source1"],
      summaryBasis: "inference",
      competitors: [
        {
          name: "Public rival",
          url: "https://rival.example/pricing",
          offer: "Guided setup",
          pricing: "$10/month, as publicly listed",
          difference: "A longer setup flow",
          sourceIds: ["source1"],
        },
      ],
      news: [],
      signals: [],
      opportunities: [],
      risks: [],
      assumptions: [],
      nextSteps: [],
      sources: [
        {
          id: "source1",
          title: "Rival public pricing",
          url: "https://rival.example/pricing",
          retrievedAt: "2026-10-09T03:00:00.000Z",
        },
      ],
    },
  };
}

function unzip(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("Invalid Office ZIP: missing central directory");
  let offset = buffer.readUInt32LE(end + 16);
  const count = buffer.readUInt16LE(end + 10);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50);
    const method = buffer.readUInt16LE(offset + 10),
      compressed = buffer.readUInt32LE(offset + 20);
    const nameSize = buffer.readUInt16LE(offset + 28),
      extraSize = buffer.readUInt16LE(offset + 30),
      commentSize = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42),
      name = buffer.subarray(offset + 46, offset + 46 + nameSize).toString();
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + compressed);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString());
    offset += 46 + nameSize + extraSize + commentSize;
  }
  return files;
}

afterEach(() => vi.unstubAllGlobals());

describe("Validation dossier exports", () => {
  it("marks absent behavioural data as Not yet tested in the full report", async () => {
    const d = fixture();
    d.observations = [];
    d.tasks = [];
    d.issues = [];
    d.metrics = {
      ...d.metrics,
      participants: 0,
      attempts: 0,
      successRate: null,
      failureRate: null,
      medianSeconds: null,
      timedAttempts: 0,
      timeDistribution: [],
    };
    d.verdict.criteria.actualSuccessRate = null;
    const artifact = await buildValidationExport("markdown", d);
    const text = await artifact.blob.text();
    expect(text).toContain("| Task success | Not yet tested |");
    expect(text).toContain(
      "Task completion and behavioural analytics: Not yet tested.",
    );
    expect(text).toContain("Participant observations: Not yet tested.");
    expect(text).toContain("## 10. Evidence Appendix");
    expect(text).not.toContain("80% task success");
  });

  it("exports actual percentage and measured durations without rescaling or invented timings", async () => {
    const text = await (
      await buildValidationExport("markdown", fixture())
    ).blob.text();
    expect(text).toContain("| Task success | 50% |");
    expect(text).toContain("| Median time on task | 30 seconds |");
    expect(text).not.toContain("5000%");
    expect(text).toContain("[E2](#ref-submission2%3Atask1)");
    expect(text).toContain("Retrieved: 2026-10-09T03:00:00.000Z");
  });

  it("keeps CSV quotations and newlines intact and prevents spreadsheet formula injection", () => {
    const d = fixture();
    d.observations[0].answer =
      '=HYPERLINK("https://attacker.example","click")\nsecond line';
    const csv = validationCsv(d);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(
      '"\'=HYPERLINK(""https://attacker.example"",""click"")\nsecond line"',
    );
    expect(csv).toContain('"Participant 1"');
    expect(csv).not.toContain("private-alice");
  });

  it("preserves the founder's product description when research has not been run", async () => {
    const d = fixture();
    delete d.research;
    d.brief.productDescription =
      "A mobile scheduling tool for independent designers";
    const text = await (await buildValidationExport("markdown", d)).blob.text();
    expect(text).toContain(d.brief.productDescription);
    expect(text).toContain("Founder supplied");
  });

  it("omits internal tester IDs and unconsented or unsafe evidence from machine-readable exports", async () => {
    const d = fixture();
    d.observations[1].consentConfirmed = false;
    d.observations[0].evidence = [
      {
        id: "unsafe",
        kind: "link",
        name: "Unsafe link",
        url: "javascript:alert(1)",
      },
    ];
    const safe = anonymizeValidationDossier(d);
    expect(safe.observations[1].evidence).toEqual([]);
    expect(safe.observations[0].evidence).toEqual([]);
    const text = await (await buildValidationExport("json", d)).blob.text();
    expect(JSON.parse(text).metrics.successRate).toBe(50);
    expect(text).not.toContain("testerId");
    expect(text).not.toContain("private-bob");
    expect(text).not.toContain("https://evidence.example/session");
    expect(text).not.toContain("javascript:");
    const jsonl = await (await buildValidationExport("jsonl", d)).blob.text();
    const records = jsonl
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.map((record) => record.type)).toEqual([
      "dossier",
      "observation",
      "observation",
      "issue",
    ]);
  });

  it("creates a portable HTML report with filters, charts, escaped content and clickable source evidence", () => {
    const d = fixture();
    d.title = '<script>alert("injected")</script>';
    d.observations[0].observation = '<img src=x onerror="alert(1)">';
    const html = validationHtml(d);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("injected")</script>');
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain('id="task-filter"');
    expect(html).toContain('id="outcome-filter"');
    expect(html).toContain("row.hidden=!shown");
    expect(html).toContain('<svg viewBox="0 0 720');
    expect(html).toContain('data-filter-task="task1"');
    expect(html).toContain('href="https://rival.example/pricing"');
    expect(html).toContain('href="https://evidence.example/session#t=20"');
    expect(html).toContain("not a publicly hosted or access-controlled report");
    expect((html.match(/<section id=/g) ?? []).length).toBe(11);
  });

  it("embeds the exact existing Playground mark in portable HTML", async () => {
    const mark = await readFile("public/brand/icon-48.png");
    expect(validationHtml(fixture())).toContain(
      `src="data:image/png;base64,${mark.toString("base64")}"`,
    );
  });

  it("creates a real ten-section PDF with embedded brand font and both source and observation links", async () => {
    const font = await readFile("public/brand/manrope-report-regular.ttf");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(font)),
    );
    const artifact = await buildValidationExport("pdf", fixture());
    const bytes = new Uint8Array(await artifact.blob.arrayBuffer());
    expect(artifact.blob.type).toBe("application/pdf");
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(10);
    expect(document.getTitle()).toContain("Onboarding study");
    const actions: { kind: string; uri?: string }[] = [];
    for (const page of document.getPages()) {
      const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
      for (const reference of annotations?.asArray() ?? []) {
        const annotation = document.context.lookup(reference, PDFDict);
        const action = annotation.lookup(PDFName.of("A"), PDFDict);
        const kind = action.lookup(PDFName.of("S"), PDFName).asString();
        actions.push({
          kind,
          uri: action.lookupMaybe(PDFName.of("URI"), PDFString)?.decodeText(),
        });
      }
    }
    expect(actions).toContainEqual({
      kind: "/URI",
      uri: "https://rival.example/pricing",
    });
    expect(actions).toContainEqual({
      kind: "/URI",
      uri: "https://evidence.example/session#t=20",
    });
    expect(actions.some((a) => a.kind === "/GoTo")).toBe(true);
  });

  it("produces a genuine editable DOCX with all report sections and external hyperlink relationships", async () => {
    const artifact = await buildValidationExport("docx", fixture());
    const files = unzip(new Uint8Array(await artifact.blob.arrayBuffer()));
    expect(files.get("[Content_Types].xml")).toContain(
      "wordprocessingml.document.main+xml",
    );
    const text = files.get("word/document.xml")!;
    expect(text).toContain("1. Executive Summary");
    expect(text).toContain("10. Evidence Appendix");
    expect(text).toContain("50%");
    expect(text).toContain("Participant 2");
    expect(text).not.toContain("private-bob");
    expect(files.get("word/_rels/document.xml.rels")).toContain(
      "https://rival.example/pricing",
    );
  });

  it("produces a genuine PowerPoint presentation with editable charts and spreadsheet metrics", async () => {
    const artifact = await buildValidationExport("pptx", fixture());
    const files = unzip(new Uint8Array(await artifact.blob.arrayBuffer()));
    expect(files.get("[Content_Types].xml")).toContain(
      "presentationml.presentation.main+xml",
    );
    const slides = [...files].filter(([name]) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
    expect(slides.length).toBeGreaterThanOrEqual(10);
    expect(slides.map(([, text]) => text).join(" ")).toContain(
      "10. Evidence Appendix",
    );
    const chart = [...files].find(([name]) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(name),
    );
    expect(chart?.[1]).toContain("Successful task outcomes");
    expect(chart?.[1]).toContain("<c:v>1</c:v>");
  });

  it("produces XLSX source data with numeric measurements, pseudonyms and working evidence hyperlinks", async () => {
    const artifact = await buildValidationExport("xlsx", fixture());
    const files = unzip(new Uint8Array(await artifact.blob.arrayBuffer()));
    expect(files.get("[Content_Types].xml")).toContain(
      "spreadsheetml.sheet.main+xml",
    );
    expect(files.get("xl/workbook.xml")).toContain("Participant results");
    expect(files.get("xl/workbook.xml")).toContain("Task analytics");
    const all = [...files.values()].join(" ");
    expect(all).toContain("Participant 2");
    expect(all).not.toContain("private-bob");
    expect(all).toContain("https://evidence.example/session#t=20");
    expect(files.get("xl/worksheets/sheet2.xml")).toContain("<v>50</v>");
  });
});
