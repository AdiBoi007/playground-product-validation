export type MarketTone = "positive" | "concern" | "question" | "unclassified";
export type ResearchAssumptionStatus =
  "untested" | "testing" | "supported" | "challenged";

export interface ResearchCompetitor {
  id: string;
  name: string;
  url: string;
  description: string;
  pricing: string;
  features: string[];
  difference: string;
  checkedAt?: string;
  excerpt?: string;
  provenance: "manual" | "fetched";
}
export interface MarketReaction {
  id: string;
  quote: string;
  url: string;
  title: string;
  author?: string;
  publishedAt?: string;
  collectedAt: string;
  tone: MarketTone;
  provenance: "manual" | "hacker-news";
}
export type ResearchReaction = MarketReaction;
export interface ResearchAssumption {
  id: string;
  question: string;
  sourceIds: string[];
  status: ResearchAssumptionStatus;
  campaignId?: string;
}
export interface ResearchIdea {
  id: string;
  founderId: string;
  name: string;
  description: string;
  audience: string;
  productUrl: string;
  searchTopic: string;
  competitors: ResearchCompetitor[];
  reactions: MarketReaction[];
  assumptions: ResearchAssumption[];
  createdAt: string;
  updatedAt: string;
}
export type ResearchIdeaInput = Pick<
  ResearchIdea,
  "name" | "description" | "audience" | "productUrl" | "searchTopic"
>;
export interface ResearchCampaignPrefill extends Record<string, string> {
  title: string;
  url: string;
  audience: string;
  objective: string;
  assumption: string;
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} could not be read.`);
  return value as Record<string, unknown>;
};
function text(
  value: unknown,
  label: string,
  maximum = 6000,
  required = false,
  trim = true,
) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const result = trim ? value.trim() : value;
  if (required && !result.trim()) throw new Error(`${label} is required.`);
  if (result.length > maximum)
    throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return result;
}
function date(value: unknown, label: string) {
  const result = text(value, label, 50, true);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(`${result.slice(0, 10)}T00:00:00.000Z`)
      .toISOString()
      .slice(0, 10) !== result.slice(0, 10)
  )
    throw new Error(`${label} must be a valid date.`);
  return result;
}
function optionalText(value: unknown, label: string, maximum = 200) {
  return value === undefined || value === ""
    ? undefined
    : text(value, label, maximum, true);
}
function optionalDate(value: unknown, label: string) {
  return value === undefined || value === "" ? undefined : date(value, label);
}
function list(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  if (value.length > maximum)
    throw new Error(`${label} must contain ${maximum} items or fewer.`);
  return value;
}
export function safeResearchUrl(value: string) {
  if (
    !value ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return false;
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
function sourceUrl(value: unknown, label: string, optional = false) {
  const result = text(value, label, 4000);
  if (optional && !result) return "";
  if (!safeResearchUrl(result))
    throw new Error(
      `${label} must be a full HTTP or HTTPS URL without credentials.`,
    );
  return new URL(result).href;
}

export function validateResearchIdea(value: unknown): ResearchIdea {
  const item = record(value, "Research idea");
  const competitors = list(item.competitors, "Competitors", 30).map(
    (entry): ResearchCompetitor => {
      const competitor = record(entry, "Competitor");
      if (!["manual", "fetched"].includes(String(competitor.provenance)))
        throw new Error("Choose a valid competitor source type.");
      return {
        id: text(competitor.id, "Competitor ID", 200, true),
        name: text(competitor.name, "Competitor name", 200, true),
        url: sourceUrl(competitor.url, "Competitor URL"),
        description: text(competitor.description, "Competitor description"),
        pricing: text(competitor.pricing, "Pricing", 1500),
        features: list(competitor.features, "Features", 40).map((feature) =>
          text(feature, "Feature", 500, true),
        ),
        difference: text(competitor.difference, "Comparison note", 4000),
        checkedAt: optionalDate(competitor.checkedAt, "Page inspection date"),
        excerpt: optionalText(competitor.excerpt, "Page excerpt", 6000),
        provenance: competitor.provenance as ResearchCompetitor["provenance"],
      };
    },
  );
  const reactions = list(item.reactions, "Customer evidence", 200).map(
    (entry): MarketReaction => {
      const reaction = record(entry, "Evidence");
      if (
        !["positive", "concern", "question", "unclassified"].includes(
          String(reaction.tone),
        )
      )
        throw new Error("Choose a valid evidence label.");
      if (!["manual", "hacker-news"].includes(String(reaction.provenance)))
        throw new Error("Choose a valid evidence source type.");
      return {
        id: text(reaction.id, "Evidence ID", 200, true),
        quote: text(reaction.quote, "Source quote", 12000, true, false),
        url: sourceUrl(
          reaction.url,
          "Evidence URL",
          reaction.provenance === "manual",
        ),
        title: text(reaction.title, "Source title", 500, true),
        author: optionalText(reaction.author, "Source author", 200),
        publishedAt: optionalDate(reaction.publishedAt, "Publication date"),
        collectedAt: date(reaction.collectedAt, "Collection date"),
        tone: reaction.tone as MarketTone,
        provenance: reaction.provenance as MarketReaction["provenance"],
      };
    },
  );
  const sourceIds = [
    ...competitors.map((competitor) => competitor.id),
    ...reactions.map((reaction) => reaction.id),
  ];
  if (new Set(sourceIds).size !== sourceIds.length)
    throw new Error("Every research source needs a unique ID.");
  const assumptions = list(item.assumptions, "Assumptions", 100).map(
    (entry): ResearchAssumption => {
      const assumption = record(entry, "Assumption");
      if (
        !["untested", "testing", "supported", "challenged"].includes(
          String(assumption.status),
        )
      )
        throw new Error("Choose a valid assumption status.");
      const citations = [
        ...new Set(
          list(assumption.sourceIds, "Assumption sources", 230).map((source) =>
            text(source, "Source ID", 200, true),
          ),
        ),
      ];
      if (citations.some((id) => !sourceIds.includes(id)))
        throw new Error(
          "Assumptions can cite only sources saved in this idea.",
        );
      return {
        id: text(assumption.id, "Assumption ID", 200, true),
        question: text(assumption.question, "Test question", 4000, true),
        sourceIds: citations,
        status: assumption.status as ResearchAssumptionStatus,
        campaignId: optionalText(assumption.campaignId, "Campaign ID", 200),
      };
    },
  );
  if (
    new Set(assumptions.map((assumption) => assumption.id)).size !==
    assumptions.length
  )
    throw new Error("Every assumption needs a unique ID.");
  return {
    id: text(item.id, "Idea ID", 200, true),
    founderId: text(item.founderId, "Workspace ID", 200, true),
    name: text(item.name, "Idea name", 200, true),
    description: text(item.description, "Idea description"),
    audience: text(item.audience, "Audience", 2000),
    productUrl: sourceUrl(item.productUrl, "Product URL", true),
    searchTopic: text(item.searchTopic, "Search topic", 300),
    competitors,
    reactions,
    assumptions,
    createdAt: date(item.createdAt, "Creation date"),
    updatedAt: date(item.updatedAt, "Updated date"),
  };
}

export function createIdea(
  founderId: string,
  input: Partial<ResearchIdeaInput> = {},
): ResearchIdea {
  const now = new Date().toISOString();
  return validateResearchIdea({
    id: crypto.randomUUID(),
    founderId,
    name: input.name?.trim() || "Untitled idea",
    description: input.description || "",
    audience: input.audience || "",
    productUrl: input.productUrl || "",
    searchTopic: input.searchTopic || "",
    competitors: [],
    reactions: [],
    assumptions: [],
    createdAt: now,
    updatedAt: now,
  });
}

const short = (value: string, maximum = 160) => {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > maximum
    ? `${compact.slice(0, maximum - 1).trim()}…`
    : compact;
};
const questionKey = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[\s.,!?“”"'’]+/g, " ")
    .trim();
export function generateSuggestedAssumptions(
  idea: ResearchIdea,
): ResearchAssumption[] {
  const candidates: Array<{ question: string; sourceIds: string[] }> = [];
  const audience = short(idea.audience, 130);
  const name = short(idea.name, 100);
  if (idea.description.trim() && audience)
    candidates.push({
      question: `Can ${audience} explain the proposed offer for ${name}: “${short(idea.description)}”?`,
      sourceIds: [],
    });
  const compared = idea.competitors.find((competitor) =>
    competitor.difference.trim(),
  );
  if (compared)
    candidates.push({
      question: `Is the stated difference from ${short(compared.name, 80)} visible in ${name}: “${short(compared.difference)}”?`,
      sourceIds: [compared.id],
    });
  const priced = idea.competitors.find((competitor) =>
    competitor.pricing.trim(),
  );
  if (priced)
    candidates.push({
      question: `Can testers explain what ${short(priced.name, 80)}’s recorded pricing “${short(priced.pricing, 100)}” includes, and how it compares with ${name}?`,
      sourceIds: [priced.id],
    });
  const observation = idea.reactions.find((reaction) => reaction.quote.trim());
  if (observation)
    candidates.push({
      question: `Does the situation described in “${short(observation.quote)}” occur when using ${name}?`,
      sourceIds: [observation.id],
    });
  if (!compared && idea.competitors.length) {
    const competitor = idea.competitors[0];
    const featureText = competitor.features.length
      ? ` with the recorded features “${short(competitor.features.join(", "), 120)}”`
      : "";
    candidates.push({
      question: `Can testers distinguish ${name} from ${short(competitor.name, 80)}${featureText}?`,
      sourceIds: [competitor.id],
    });
  }
  if (!candidates.length && audience && idea.productUrl)
    candidates.push({
      question: `What do ${audience} expect ${name} to do before using its current product?`,
      sourceIds: [],
    });
  const existing = new Set(
    idea.assumptions.map((assumption) => questionKey(assumption.question)),
  );
  return candidates
    .filter((candidate) => {
      const key = questionKey(candidate.question);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    })
    .slice(0, 3)
    .map((candidate) => ({
      id: crypto.randomUUID(),
      ...candidate,
      status: "untested" as const,
    }));
}

export function researchToCampaignPrefill(
  idea: ResearchIdea,
  assumption?: ResearchAssumption,
): ResearchCampaignPrefill {
  if (assumption && !assumption.question.trim())
    throw new Error("Choose a test question before creating the mission.");
  const target =
    assumption ||
    idea.assumptions.find((item) => item.status === "untested") ||
    idea.assumptions[0];
  return {
    title: `${idea.name} — Product test`,
    url: idea.productUrl,
    audience: idea.audience,
    objective: target?.question || "",
    assumption: target?.question || "",
  };
}

const inline = (value: string) =>
  value.replace(/[\\[\]*_`]/g, "\\$&").replace(/[\r\n]+/g, " ");
const link = (label: string, url: string) =>
  `[${inline(label)}](<${new URL(url).href}>)`;
const quoted = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
export function exportResearchMarkdown(idea: ResearchIdea): string {
  const research = validateResearchIdea(idea);
  const lines = [
    `# ${inline(research.name)}`,
    "",
    `Created: ${research.createdAt}`,
    `Updated: ${research.updatedAt}`,
    "",
    "## Idea",
    "",
    research.description || "No description entered.",
    "",
    `Audience: ${research.audience || "Not specified"}`,
  ];
  if (research.productUrl)
    lines.push(`Product: ${link(research.productUrl, research.productUrl)}`);
  if (research.searchTopic) lines.push(`Search topic: ${research.searchTopic}`);
  lines.push("", "## Competitors", "");
  if (!research.competitors.length) lines.push("No competitors recorded.", "");
  for (const competitor of research.competitors) {
    lines.push(
      `### ${inline(competitor.name)}`,
      "",
      `Source: ${link(competitor.name, competitor.url)}`,
      `Source ID: ${competitor.id}`,
      `Entry type: ${competitor.provenance === "fetched" ? "Public page inspection" : "Manual entry"}`,
    );
    if (competitor.checkedAt) lines.push(`Checked: ${competitor.checkedAt}`);
    if (competitor.description) lines.push("", competitor.description);
    lines.push("", `Recorded pricing: ${competitor.pricing || "Not recorded"}`);
    if (competitor.features.length)
      lines.push(
        "",
        "Recorded features:",
        ...competitor.features.map((feature) => `- ${feature}`),
      );
    if (competitor.difference)
      lines.push("", `Founder comparison note: ${competitor.difference}`);
    if (competitor.excerpt)
      lines.push("", "Page excerpt:", quoted(competitor.excerpt));
    lines.push("");
  }
  lines.push("## Customer evidence", "");
  if (!research.reactions.length) lines.push("No evidence recorded.", "");
  for (const reaction of research.reactions) {
    lines.push(
      `### ${inline(reaction.title)}`,
      "",
      quoted(reaction.quote),
      "",
      `Source: ${reaction.url ? link(reaction.title, reaction.url) : `${inline(reaction.title)} (manual note; no public link)`}`,
      `Source ID: ${reaction.id}`,
      `Entry type: ${reaction.provenance === "hacker-news" ? "Hacker News" : "Manual entry"}`,
      `Collected: ${reaction.collectedAt}`,
    );
    if (reaction.publishedAt) lines.push(`Published: ${reaction.publishedAt}`);
    if (reaction.author) lines.push(`Author: ${reaction.author}`);
    lines.push(`Evidence label: ${reaction.tone}`, "");
  }
  lines.push("## Testable assumptions", "");
  if (!research.assumptions.length) lines.push("No assumptions recorded.", "");
  for (const assumption of research.assumptions) {
    lines.push(
      `### ${inline(assumption.question)}`,
      "",
      `Status: ${assumption.status}`,
    );
    if (assumption.campaignId) lines.push(`Campaign: ${assumption.campaignId}`);
    if (!assumption.sourceIds.length) lines.push("Sources: none linked");
    for (const sourceId of assumption.sourceIds) {
      const competitor = research.competitors.find(
        (item) => item.id === sourceId,
      );
      const reaction = research.reactions.find((item) => item.id === sourceId);
      if (competitor)
        lines.push(`- ${link(competitor.name, competitor.url)} (${sourceId})`);
      if (reaction)
        lines.push(
          `- ${reaction.url ? link(reaction.title, reaction.url) : `${inline(reaction.title)} (manual note; no public link)`} (${sourceId})`,
        );
    }
    lines.push("");
  }
  return lines.join("\n");
}
