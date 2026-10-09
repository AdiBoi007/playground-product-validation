import { describe, expect, it } from "vitest";
import {
  createIdea,
  exportResearchMarkdown,
  generateSuggestedAssumptions,
  researchToCampaignPrefill,
  safeResearchUrl,
  validateResearchIdea,
} from "./research";
import type { ResearchIdea, ResearchReaction } from "./research";
import {
  deleteIdea,
  deserializeResearchIdea,
  getIdeas,
  prepareResearchSave,
  saveIdea,
} from "./research-store";

const moment = "2026-10-09T01:00:00.000Z";
function evidence(overrides: Partial<ResearchReaction> = {}): ResearchReaction {
  return {
    id: "source-interview",
    quote: "  I cannot compare plans.\nWhich option includes exports?  ",
    url: "",
    title: "Customer interview, participant 3",
    author: "Interview participant",
    publishedAt: "2026-10-08",
    collectedAt: moment,
    tone: "unclassified",
    provenance: "manual",
    ...overrides,
  };
}
function fixture(): ResearchIdea {
  return {
    id: "idea-1",
    founderId: "workspace-1",
    name: "Plan comparison",
    description: "Compare plans without opening separate tabs.",
    audience: "Independent shop owners",
    productUrl: "https://example.com/product",
    searchTopic: "plan comparisons",
    competitors: [
      {
        id: "source-competitor",
        name: "Existing comparison tool",
        url: "https://example.org/pricing",
        description: "A public plan comparison page.",
        pricing: "$12/month shown on the inspected page",
        features: ["Plan filters"],
        difference: "The proposed product keeps all export limits visible.",
        checkedAt: moment,
        excerpt: "Compare available plans.",
        provenance: "fetched",
      },
    ],
    reactions: [evidence()],
    assumptions: [
      {
        id: "assumption-1",
        question: "Can shop owners find the export limit?",
        sourceIds: ["source-competitor", "source-interview"],
        status: "untested",
      },
    ],
    createdAt: moment,
    updatedAt: moment,
  };
}
const stored = (idea: ResearchIdea) => ({
  schemaVersion: 1,
  id: idea.id,
  founderId: idea.founderId,
  idea,
});

describe("market research evidence", () => {
  it("creates an empty idea without fabricated competitors, reactions or conclusions", () => {
    const idea = createIdea("workspace-1");
    expect(idea.founderId).toBe("workspace-1");
    expect(idea.name).toBe("Untitled idea");
    expect(idea.competitors).toEqual([]);
    expect(idea.reactions).toEqual([]);
    expect(idea.assumptions).toEqual([]);
    expect(generateSuggestedAssumptions(idea)).toEqual([]);
    expect(researchToCampaignPrefill(idea).objective).toBe("");
    expect(() => createIdea(" ")).toThrow("Workspace ID");
  });

  it("accepts only full HTTP(S) source links without embedded credentials or controls", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///private/note",
      "ftp://example.com",
      "/relative-page",
      "https://user:password@example.com",
      "https://example.com/\npricing",
      "https://example.com/\u007fpricing",
    ])
      expect(safeResearchUrl(url), url).toBe(false);
    expect(safeResearchUrl("https://example.com/path?q=one#two")).toBe(true);
    expect(safeResearchUrl("http://localhost:5176")).toBe(true);
    const idea = fixture();
    idea.competitors[0].url = "javascript:alert(1)";
    expect(() => validateResearchIdea(idea)).toThrow("Competitor URL");
  });

  it("allows a named private interview source but requires Hacker News evidence to link to its source", () => {
    const idea = fixture();
    expect(validateResearchIdea(idea).reactions[0].url).toBe("");
    idea.reactions[0].provenance = "hacker-news";
    expect(() => validateResearchIdea(idea)).toThrow("Evidence URL");
    idea.reactions[0].url = "https://news.ycombinator.com/item?id=123";
    expect(validateResearchIdea(idea).reactions[0].provenance).toBe(
      "hacker-news",
    );
    idea.reactions[0].url = "mailto:someone@example.com";
    idea.reactions[0].provenance = "manual";
    expect(() => validateResearchIdea(idea)).toThrow("Evidence URL");
    idea.reactions[0].url = "";
    idea.reactions[0].title = " ";
    expect(() => validateResearchIdea(idea)).toThrow("Source title");
  });

  it("preserves exact evidence text and user labels without inferring sentiment", () => {
    const idea = fixture();
    const copy = structuredClone(idea);
    const validated = validateResearchIdea(idea);
    expect(validated.reactions[0].quote).toBe(idea.reactions[0].quote);
    expect(validated.reactions[0].tone).toBe("unclassified");
    expect(idea).toEqual(copy);
    expect(validated).not.toBe(idea);
    expect(validated.reactions[0]).not.toBe(idea.reactions[0]);
    idea.reactions[0].quote = " ";
    expect(() => validateResearchIdea(idea)).toThrow("Source quote");
    idea.reactions[0].quote = "x".repeat(12001);
    expect(() => validateResearchIdea(idea)).toThrow("12000");
  });

  it("rejects invalid calendar dates, unsupported labels and invented schema fields", () => {
    const idea = fixture();
    idea.reactions[0].publishedAt = "2026-02-30";
    expect(() => validateResearchIdea(idea)).toThrow("valid date");
    idea.reactions[0].publishedAt = "2024-02-29";
    expect(validateResearchIdea(idea).reactions[0].publishedAt).toBe(
      "2024-02-29",
    );
    expect(() =>
      validateResearchIdea({
        ...idea,
        reactions: [{ ...idea.reactions[0], tone: "high demand" }],
      }),
    ).toThrow("evidence label");
    expect(() =>
      validateResearchIdea({
        ...idea,
        assumptions: [{ ...idea.assumptions[0], status: "proven" }],
      }),
    ).toThrow("assumption status");
    const validated = validateResearchIdea({ ...idea, demandScore: 99 });
    expect(validated).not.toHaveProperty("demandScore");
  });

  it("keeps source IDs unique and citations within the same idea", () => {
    const idea = fixture();
    idea.assumptions[0].sourceIds.push("source-interview");
    expect(validateResearchIdea(idea).assumptions[0].sourceIds).toEqual([
      "source-competitor",
      "source-interview",
    ]);
    idea.assumptions[0].sourceIds.push("source-from-another-idea");
    expect(() => validateResearchIdea(idea)).toThrow("saved in this idea");
    idea.assumptions[0].sourceIds = [];
    idea.reactions[0].id = idea.competitors[0].id;
    expect(() => validateResearchIdea(idea)).toThrow("unique ID");
  });

  it("suggests untested questions from recorded input and excludes already saved questions", () => {
    const idea = fixture();
    const copy = structuredClone(idea);
    const suggestions = generateSuggestedAssumptions(idea);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((item) => item.status === "untested")).toBe(true);
    expect(suggestions[0].question).toContain(idea.audience);
    expect(suggestions[1].question).toContain(idea.competitors[0].difference);
    expect(suggestions[1].sourceIds).toEqual(["source-competitor"]);
    expect(suggestions[2].question).toContain(idea.competitors[0].pricing);
    expect(idea).toEqual(copy);
    const firstQuestion = suggestions[0].question;
    idea.assumptions.push(suggestions[0]);
    expect(
      generateSuggestedAssumptions(idea).map((item) => item.question),
    ).not.toContain(firstQuestion);
  });

  it("passes the chosen test question, audience and product URL to the campaign without conclusions", () => {
    const idea = fixture();
    const prefill = researchToCampaignPrefill(idea, idea.assumptions[0]);
    expect(prefill).toEqual({
      title: "Plan comparison — Product test",
      url: idea.productUrl,
      audience: idea.audience,
      objective: idea.assumptions[0].question,
      assumption: idea.assumptions[0].question,
    });
    expect(new URLSearchParams(prefill).get("objective")).toBe(
      idea.assumptions[0].question,
    );
    idea.assumptions = [];
    expect(researchToCampaignPrefill(idea).assumption).toBe("");
  });

  it("exports actual quotations, source citations, dates and manually assigned states", () => {
    const idea = fixture();
    idea.assumptions[0].status = "testing";
    const markdown = exportResearchMarkdown(idea);
    expect(markdown).toContain(
      ">   I cannot compare plans.\n> Which option includes exports?  ",
    );
    expect(markdown).toContain("(<https://example.org/pricing>)");
    expect(markdown).toContain("(source-competitor)");
    expect(markdown).toContain("(source-interview)");
    expect(markdown).toContain("manual note; no public link");
    expect(markdown).toContain(`Collected: ${moment}`);
    expect(markdown).toContain("Published: 2026-10-08");
    expect(markdown).toContain("Evidence label: unclassified");
    expect(markdown).toContain("Status: testing");
    expect(markdown).toContain(idea.competitors[0].pricing);
    expect(markdown).not.toContain("market demand");
    idea.competitors[0].pricing = "";
    expect(exportResearchMarkdown(idea)).toContain(
      "Recorded pricing: Not recorded",
    );
  });
});

describe("research storage boundary", () => {
  it("rejects a stale snapshot before replacing newer evidence and supports saving after reload", () => {
    const original = fixture();
    const staleTab = structuredClone(original);
    const newer = prepareResearchSave(
      {
        ...original,
        reactions: [...original.reactions, evidence({ id: "new-interview" })],
      },
      original,
      Date.parse(moment),
    );
    const copy = structuredClone(newer);
    expect(() => prepareResearchSave(staleTab, newer)).toThrow(
      "This idea changed in another tab. Reload before saving.",
    );
    expect(newer).toEqual(copy);
    const reloaded = prepareResearchSave(
      { ...newer, name: "Edited after reload" },
      newer,
    );
    expect(reloaded.reactions).toHaveLength(2);
    expect(reloaded.name).toBe("Edited after reload");
    expect(reloaded.createdAt).toBe(original.createdAt);
  });

  it("advances each saved revision even within one millisecond or when the clock moves backwards", () => {
    const original = fixture();
    const now = Date.parse(moment);
    const first = prepareResearchSave(original, original, now);
    const second = prepareResearchSave(first, first, now);
    const backwardClock = prepareResearchSave(second, second, now - 10000);
    expect(Date.parse(first.updatedAt)).toBe(now + 1);
    expect(Date.parse(second.updatedAt)).toBe(now + 2);
    expect(Date.parse(backwardClock.updatedAt)).toBe(now + 3);
    expect(first.createdAt).toBe(original.createdAt);
  });

  it("reads only matching schema, idea ID and founder metadata", () => {
    const idea = fixture();
    expect(deserializeResearchIdea(stored(idea), idea.founderId)).toEqual(idea);
    expect(() =>
      deserializeResearchIdea(stored(idea), "other-founder"),
    ).toThrow("another workspace");
    expect(() =>
      deserializeResearchIdea(
        { ...stored(idea), id: "different-id" },
        idea.founderId,
      ),
    ).toThrow("does not match");
    expect(() =>
      deserializeResearchIdea(
        { ...stored(idea), idea: { ...idea, founderId: "other-founder" } },
        idea.founderId,
      ),
    ).toThrow("does not match");
    const newerRecord = { ...stored(idea), schemaVersion: 2 };
    const copy = structuredClone(newerRecord);
    expect(() => deserializeResearchIdea(newerRecord, idea.founderId)).toThrow(
      "unsupported schema version",
    );
    expect(newerRecord).toEqual(copy);
  });

  it("validates inputs before opening storage and reports unavailable storage clearly", async () => {
    await expect(getIdeas(" ")).rejects.toThrow("Workspace ID");
    await expect(deleteIdea("workspace-1", " ")).rejects.toThrow("Idea ID");
    const idea = fixture();
    idea.productUrl = "javascript:alert(1)";
    await expect(saveIdea(idea)).rejects.toThrow("Product URL");
    await expect(getIdeas("workspace-1")).rejects.toThrow(
      "storage is unavailable",
    );
  });
});
