import { describe, expect, it } from "vitest";
import {
  createSandbox,
  exportSandboxMarkdown,
  importResearchIdea,
  SANDBOX_ANALYSIS_JSON_SCHEMA,
  SANDBOX_LIMITS,
  safeSandboxUrl,
  sandboxToCampaignPrefill,
  validateSandbox,
  validateSandboxAnalysis,
  validateSandboxRequest,
  validateSandboxResponse,
} from "./sandbox";
import type { Sandbox, SandboxAnalysis, SandboxMessage } from "./sandbox";
import {
  deleteSandbox,
  deserializeSandbox,
  getSandboxes,
  prepareSandboxSave,
  saveSandbox,
} from "./sandbox-store";
import { createIdea } from "./research";

const timestamp = "2026-10-09T01:00:00.000Z";
function analysis(): SandboxAnalysis {
  return {
    product: {
      name: "Invoice concept",
      description: "Send invoices with payment links.",
      url: "https://example.com/product",
      audience: "Freelance designers",
      valueProposition: "Fewer steps to send an invoice",
      sourceIds: [],
      basis: "input",
    },
    summary:
      "The cited examples suggest comparing checkout steps; demand is unverified.",
    summarySourceIds: ["src-pricing"],
    summaryBasis: "inference",
    competitors: [
      {
        name: "Recorded competitor",
        url: "https://example.org/pricing",
        offer: "Invoice links",
        pricing: "",
        difference: "Compare checkout steps",
        sourceIds: ["src-pricing"],
      },
    ],
    news: [
      {
        headline: "Invoice product announcement",
        summary: "The source describes invoice links.",
        publishedAt: "2026-10-08",
        url: "https://example.org/news",
        sourceIds: ["src-news"],
      },
    ],
    signals: [
      {
        claim: "A discussion participant requested a shorter checkout.",
        kind: "request",
        sourceIds: ["src-news"],
      },
    ],
    opportunities: [
      {
        title: "Simpler checkout",
        detail:
          "Investigate whether reducing checkout steps helps this audience.",
        sourceIds: ["src-news"],
      },
    ],
    risks: [
      {
        title: "Unverified demand",
        detail: "The input has not established willingness to pay.",
        sourceIds: [],
      },
    ],
    assumptions: [
      {
        id: "question-1",
        question: "Can a designer send an invoice in two minutes?",
        why: "This tests the proposed reduction in steps.",
        sourceIds: ["src-pricing"],
      },
    ],
    nextSteps: [
      {
        title: "Observe invoice creation",
        detail: "Test the proposed workflow with intended users.",
        sourceIds: [],
        method: "human",
      },
    ],
    sources: [
      {
        id: "src-pricing",
        title: "Public pricing page",
        url: "https://example.org/pricing",
        retrievedAt: timestamp,
      },
      {
        id: "src-news",
        title: "Public discussion",
        url: "https://example.org/news",
        publishedAt: "2026-10-08",
        retrievedAt: timestamp,
      },
    ],
  };
}
function userMessage(
  status: SandboxMessage["status"] = "pending",
): SandboxMessage {
  return {
    id: "user-1",
    role: "user",
    text: "  Research my invoice idea.\nKeep this input intact.  ",
    sourceIds: [],
    status,
    createdAt: timestamp,
  };
}
function fixture(): Sandbox {
  return validateSandbox({
    id: "sandbox-1",
    founderId: "founder-1",
    title: "Invoice research",
    initialInput: "Research my invoice idea.",
    messages: [
      userMessage(),
      {
        id: "assistant-1",
        role: "assistant",
        text: "Review checkout steps [src-pricing].",
        sourceIds: ["src-pricing"],
        status: "complete",
        createdAt: timestamp,
      },
    ],
    analysis: analysis(),
    sourceReceipt: "signed-source-list",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
const stored = (sandbox: Sandbox) => ({
  schemaVersion: 1,
  id: sandbox.id,
  founderId: sandbox.founderId,
  sandbox,
});

describe("chat research sandbox", () => {
  it("starts with entered material and no fabricated conversation or research", () => {
    const sandbox = createSandbox("founder-1", "An entered idea");
    expect(sandbox.initialInput).toBe("An entered idea");
    expect(sandbox.messages).toEqual([]);
    expect(sandbox.analysis).toBeUndefined();
    expect(sandbox.sourceArchive).toEqual([]);
    expect(sandboxToCampaignPrefill(sandbox).objective).toBe("");
    expect(() => createSandbox(" ")).toThrow("Workspace ID");
  });

  it("requires retrieved citations for competitors, news and customer claims", () => {
    const value = analysis();
    expect(validateSandboxAnalysis(value).product.basis).toBe("input");
    for (const section of ["competitors", "news", "signals"] as const) {
      const changed = structuredClone(value);
      changed[section][0].sourceIds = [];
      expect(() => validateSandboxAnalysis(changed)).toThrow(
        "at least one retrieved source",
      );
    }
    value.signals[0].sourceIds = ["invented-id"];
    expect(() => validateSandboxAnalysis(value)).toThrow(
      "not in this analysis",
    );
  });

  it("requires sources for a sourced product and keeps inference labels explicit", () => {
    const value = analysis();
    value.product.basis = "sourced";
    expect(() => validateSandboxAnalysis(value)).toThrow("Product must cite");
    value.product.sourceIds = ["src-pricing"];
    expect(validateSandboxAnalysis(value).product.basis).toBe("sourced");
    expect(() =>
      validateSandboxAnalysis({ ...value, summaryBasis: "proven demand" }),
    ).toThrow("summary basis");
    const result = validateSandboxAnalysis({
      ...value,
      demandScore: 100,
      customers: 9000,
    });
    expect(result).not.toHaveProperty("demandScore");
    expect(result).not.toHaveProperty("customers");
    expect(result.competitors[0].pricing).toBe("");
  });

  it("rejects unsafe source links, duplicated identifiers and impossible publication dates", () => {
    for (const value of [
      "javascript:alert(1)",
      "https://user:secret@example.com",
      "file:///note",
      "https://example.com/\npath",
      "/relative",
    ])
      expect(safeSandboxUrl(value)).toBe(false);
    expect(safeSandboxUrl("https://example.com/?q=idea#source")).toBe(true);
    const value = analysis();
    value.sources[0].url = "javascript:alert(1)";
    expect(() => validateSandboxAnalysis(value)).toThrow("Source URL");
    value.sources[0].url = "https://example.org/pricing";
    value.sources[1].id = value.sources[0].id;
    expect(() => validateSandboxAnalysis(value)).toThrow("unique ID");
    value.sources[1].id = "src-news";
    value.news[0].publishedAt = "2026-02-30";
    expect(() => validateSandboxAnalysis(value)).toThrow("valid date");
    value.news[0].publishedAt = "2024-02-29";
    expect(validateSandboxAnalysis(value).news[0].publishedAt).toBe(
      "2024-02-29",
    );
  });

  it("validates attachment-only requests, extraction caps and bounded conversation context", () => {
    const request = validateSandboxRequest({
      message: "",
      history: [],
      attachments: [
        {
          name: "notes.pdf",
          mimeType: "application/pdf",
          text: "  Original extracted material\n  ",
        },
      ],
    });
    expect(request.attachments[0].text).toBe(
      "  Original extracted material\n  ",
    );
    expect(request.attachments[0].mimeType).toBe("application/pdf");
    expect(() =>
      validateSandboxRequest({ message: " ", history: [], attachments: [] }),
    ).toThrow("Message is required");
    expect(() =>
      validateSandboxRequest({
        message: "Idea",
        attachments: [{ name: "notes", text: "x".repeat(30001) }],
      }),
    ).toThrow("30000");
    const history = Array.from({ length: 5 }, () => ({
      role: "user",
      content: "x".repeat(30000),
    }));
    expect(() =>
      validateSandboxRequest({ message: "Follow up", history }),
    ).toThrow("most recent messages");
    expect(() =>
      validateSandboxRequest({
        message: "Idea",
        sourceReceipt: "x".repeat(129),
      }),
    ).toThrow("128");
  });

  it("validates complete responses and shares a strict structured schema with the server", () => {
    expect(
      validateSandboxResponse({
        reply: "Here is the sourced analysis.",
        analysis: analysis(),
        sourceReceipt: "proof",
      }).sourceReceipt,
    ).toBe("proof");
    expect(() =>
      validateSandboxResponse({ reply: "", analysis: analysis() }),
    ).toThrow("Research reply");
    const schema = SANDBOX_ANALYSIS_JSON_SCHEMA;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("sources");
    expect(schema.required).toContain("summaryBasis");
    const value = analysis();
    expect(validateSandboxAnalysis(value).nextSteps[0].method).toBe("human");
    expect(() =>
      validateSandboxAnalysis({
        ...value,
        nextSteps: [{ ...value.nextSteps[0], method: "automatic verdict" }],
      }),
    ).toThrow("testing method");
  });

  it("keeps entered text, failed messages and the last successful analysis intact for retry", () => {
    const value = fixture(),
      copy = structuredClone(value);
    value.messages[0].status = "failed";
    value.messages[0].error = "Provider unavailable";
    const result = validateSandbox(value);
    expect(result.messages[0].text).toBe(copy.messages[0].text);
    expect(result.messages[0].status).toBe("failed");
    expect(result.analysis).toEqual(copy.analysis);
    expect(result.sourceReceipt).toBe("signed-source-list");
    result.messages[0].status = "pending";
    result.messages[0].error = undefined;
    expect(validateSandbox(result).messages).toHaveLength(2);
  });

  it("archives old citations when a follow-up replaces its source set", () => {
    const value = fixture();
    const next = analysis();
    next.sources[0].id = "new-pricing";
    next.sources[0].url = "https://example.net/pricing";
    next.product.sourceIds = [];
    next.competitors[0].sourceIds = ["new-pricing"];
    next.summarySourceIds = ["new-pricing"];
    next.assumptions[0].sourceIds = ["new-pricing"];
    const result = validateSandbox({ ...value, analysis: next });
    expect(result.sourceArchive?.map((source) => source.id)).toContain(
      "src-pricing",
    );
    expect(result.sourceArchive?.map((source) => source.id)).toContain(
      "new-pricing",
    );
    expect(result.messages[1].sourceIds).toEqual(["src-pricing"]);
    next.sources[0].id = "src-pricing";
    next.competitors[0].sourceIds = ["src-pricing"];
    next.summarySourceIds = ["src-pricing"];
    next.assumptions[0].sourceIds = ["src-pricing"];
    expect(() => validateSandbox({ ...value, analysis: next })).toThrow(
      "different URL",
    );
  });

  it("exports actual sources and marks recommendations as inference, with honest missing pricing", () => {
    const value = fixture(),
      markdown = exportSandboxMarkdown(value);
    expect(markdown).toContain(value.messages[0].text);
    expect(markdown).toContain("## Market analysis — inference");
    expect(markdown).toContain("## Assumptions to test — unvalidated");
    expect(markdown).toContain("Pricing: Not verified");
    expect(markdown).toContain("Recommended method: human");
    expect(markdown).toContain("(<https://example.org/pricing>)");
    expect(markdown).toContain(`retrieved ${timestamp}`);
    const question = value.analysis!.assumptions[0];
    expect(sandboxToCampaignPrefill(value, question)).toMatchObject({
      url: value.analysis!.product.url,
      audience: value.analysis!.product.audience,
      objective: question.question,
      assumption: question.question,
    });
  });

  it("imports legacy material as entered evidence while leaving its original record unchanged", () => {
    const idea = createIdea("founder-1", {
      name: "Old idea",
      description: "An earlier description",
    });
    idea.reactions = [
      {
        id: "private-note",
        quote: "  Exact interview note  ",
        title: "Interview",
        url: "",
        provenance: "manual",
        tone: "unclassified",
        collectedAt: timestamp,
      },
    ];
    const copy = structuredClone(idea),
      imported = importResearchIdea(idea);
    expect(idea).toEqual(copy);
    expect(imported.messages[0].text).toContain("  Exact interview note  ");
    expect(imported.messages[0].text).toContain("private note");
    expect(imported.analysis).toBeUndefined();
    expect(imported.sourceArchive).toEqual([]);
  });
});

describe("sandbox persistence boundary", () => {
  it("protects newer research from stale saves and advances revisions despite clock changes", () => {
    const original = fixture();
    const next = prepareSandboxSave(
      {
        ...original,
        messages: [
          ...original.messages,
          { ...userMessage("pending"), id: "user-2" },
        ],
      },
      original,
      Date.parse(timestamp),
    );
    expect(Date.parse(next.updatedAt)).toBe(Date.parse(timestamp) + 1);
    expect(() => prepareSandboxSave(original, next)).toThrow(
      "changed in another tab",
    );
    const saved = prepareSandboxSave(
      { ...next, createdAt: "2020-01-01" },
      next,
      Date.parse(timestamp) - 1000,
    );
    expect(Date.parse(saved.updatedAt)).toBe(Date.parse(timestamp) + 2);
    expect(saved.createdAt).toBe(original.createdAt);
    expect(saved.messages).toHaveLength(3);
  });

  it("checks schema and owner metadata before accepting a saved record", () => {
    const value = fixture();
    expect(deserializeSandbox(stored(value), value.founderId)).toEqual(value);
    expect(() => deserializeSandbox(stored(value), "other-owner")).toThrow(
      "another workspace",
    );
    const future = { ...stored(value), schemaVersion: 2 },
      copy = structuredClone(future);
    expect(() => deserializeSandbox(future, value.founderId)).toThrow(
      "unsupported schema version",
    );
    expect(future).toEqual(copy);
    expect(() =>
      deserializeSandbox({ ...stored(value), id: "wrong" }, value.founderId),
    ).toThrow("does not match");
  });

  it("validates inputs before opening IndexedDB and reports storage unavailability", async () => {
    await expect(getSandboxes(" ")).rejects.toThrow("Workspace ID");
    await expect(deleteSandbox("founder-1", " ")).rejects.toThrow("Sandbox ID");
    const value = fixture();
    value.messages[0].sourceIds = ["fake-source"];
    await expect(saveSandbox(value)).rejects.toThrow("not in this analysis");
    await expect(getSandboxes("founder-1")).rejects.toThrow(
      "storage is unavailable",
    );
    expect(SANDBOX_LIMITS.attachments).toBe(3);
  });
});
