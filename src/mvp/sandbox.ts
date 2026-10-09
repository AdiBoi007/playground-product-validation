import type { ResearchIdea } from "./research";
import { validateResearchIdea } from "./research";
import type { SandboxValidation } from "./validation.js";
import { validateSandboxValidation } from "./validation.js";
import type { TwinWorkspace } from "./twin.js";
import { validateTwinWorkspace } from "./twin.js";

export const SANDBOX_LIMITS = {
  messageChars: 30000,
  attachments: 3,
  attachmentChars: 30000,
  historyMessages: 40,
  historyChars: 120000,
  savedMessages: 200,
  analysisChars: 180000,
  sources: 80,
} as const;

export interface SandboxAttachment {
  name: string;
  text: string;
  mimeType?: string;
}
export interface SandboxSource {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  retrievedAt: string;
}
export interface SandboxMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  sourceIds: string[];
  status?: "pending" | "complete" | "failed" | "cancelled";
  error?: string;
  attachments?: SandboxAttachment[];
}
export interface SandboxProduct {
  name: string;
  description: string;
  url: string;
  audience: string;
  valueProposition: string;
  sourceIds: string[];
  basis: "input" | "sourced" | "inference" | "unknown";
}
export interface SandboxCompetitor {
  name: string;
  url: string;
  offer: string;
  pricing: string;
  difference: string;
  sourceIds: string[];
}
export interface SandboxNews {
  headline: string;
  summary: string;
  publishedAt?: string;
  url: string;
  sourceIds: string[];
}
export interface SandboxSignal {
  claim: string;
  kind: "pain" | "interest" | "objection" | "request";
  sourceIds: string[];
}
export interface SandboxInference {
  title: string;
  detail: string;
  sourceIds: string[];
}
export interface SandboxNextStep extends SandboxInference {
  method: "human" | "ai" | "expert" | "unspecified";
}
export interface SandboxAssumption {
  id: string;
  question: string;
  why: string;
  sourceIds: string[];
}
export interface SandboxAnalysis {
  product: SandboxProduct;
  summary: string;
  summarySourceIds: string[];
  summaryBasis: "inference" | "unknown";
  competitors: SandboxCompetitor[];
  news: SandboxNews[];
  signals: SandboxSignal[];
  opportunities: SandboxInference[];
  risks: SandboxInference[];
  assumptions: SandboxAssumption[];
  nextSteps: SandboxNextStep[];
  sources: SandboxSource[];
}
export interface Sandbox {
  id: string;
  founderId: string;
  title: string;
  initialInput: string;
  messages: SandboxMessage[];
  analysis?: SandboxAnalysis;
  sourceArchive?: SandboxSource[];
  sourceReceipt?: string;
  createdAt: string;
  updatedAt: string;
  validation?: SandboxValidation;
  twin?: TwinWorkspace;
}
export interface SandboxRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  priorAnalysis?: SandboxAnalysis;
  attachments: SandboxAttachment[];
  productUrls?: string[];
  sourceReceipt?: string;
}
export interface SandboxResponse {
  reply: string;
  analysis: SandboxAnalysis;
  sourceReceipt?: string;
}

const schemaText = { type: "string" };
const schemaDate = { type: ["string", "null"] };
const schemaIds = { type: "array", items: schemaText };
const schemaObject = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const schemaList = (properties: Record<string, unknown>) => ({
  type: "array",
  items: schemaObject(properties),
});
const inferenceSchema = {
  title: schemaText,
  detail: schemaText,
  sourceIds: schemaIds,
};
export const SANDBOX_ANALYSIS_JSON_SCHEMA = schemaObject({
  product: schemaObject({
    name: schemaText,
    description: schemaText,
    url: schemaText,
    audience: schemaText,
    valueProposition: schemaText,
    sourceIds: schemaIds,
    basis: {
      type: "string",
      enum: ["input", "sourced", "inference", "unknown"],
    },
  }),
  summary: schemaText,
  summarySourceIds: schemaIds,
  summaryBasis: { type: "string", enum: ["inference", "unknown"] },
  competitors: schemaList({
    name: schemaText,
    url: schemaText,
    offer: schemaText,
    pricing: schemaText,
    difference: schemaText,
    sourceIds: schemaIds,
  }),
  news: schemaList({
    headline: schemaText,
    summary: schemaText,
    publishedAt: schemaDate,
    url: schemaText,
    sourceIds: schemaIds,
  }),
  signals: schemaList({
    claim: schemaText,
    kind: {
      type: "string",
      enum: ["pain", "interest", "objection", "request"],
    },
    sourceIds: schemaIds,
  }),
  opportunities: schemaList(inferenceSchema),
  risks: schemaList(inferenceSchema),
  assumptions: schemaList({
    id: schemaText,
    question: schemaText,
    why: schemaText,
    sourceIds: schemaIds,
  }),
  nextSteps: schemaList({
    ...inferenceSchema,
    method: { type: "string", enum: ["human", "ai", "expert", "unspecified"] },
  }),
  sources: schemaList({
    id: schemaText,
    title: schemaText,
    url: schemaText,
    publishedAt: schemaDate,
    retrievedAt: schemaText,
  }),
});

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} could not be read.`);
  return value as Record<string, unknown>;
}
function text(
  value: unknown,
  label: string,
  max = 6000,
  required = false,
  trim = true,
) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const result = trim ? value.trim() : value;
  if (required && !result.trim()) throw new Error(`${label} is required.`);
  if (result.length > max)
    throw new Error(`${label} must be ${max} characters or fewer.`);
  return result;
}
function optionalText(value: unknown, label: string, max = 1000) {
  return value === undefined || value === null || value === ""
    ? undefined
    : text(value, label, max, true);
}
function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  if (value.length > max)
    throw new Error(`${label} must contain ${max} items or fewer.`);
  return value;
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new Error(`Choose a valid ${label}.`);
  return value as T;
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
function optionalDate(value: unknown, label: string) {
  return value === undefined || value === null || value === ""
    ? undefined
    : date(value, label);
}
export function safeSandboxUrl(value: string) {
  if (
    !value ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function url(value: unknown, label: string, optional = false) {
  const result = text(value, label, 4000);
  if (optional && !result) return "";
  if (!safeSandboxUrl(result))
    throw new Error(
      `${label} must be a full HTTP or HTTPS URL without credentials.`,
    );
  return new URL(result).href;
}
function size(value: unknown, label: string, maximum: number) {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} could not be read.`);
  }
  if (!serialized || serialized.length > maximum)
    throw new Error(`${label} is too large. Reduce the supplied material.`);
}
function sources(
  value: unknown,
  maximum: number = SANDBOX_LIMITS.sources,
): SandboxSource[] {
  const result = list(value, "Sources", maximum).map((entry) => {
    const item = record(entry, "Source");
    return {
      id: text(item.id, "Source ID", 200, true),
      title: text(item.title, "Source title", 600, true),
      url: url(item.url, "Source URL"),
      publishedAt: optionalDate(item.publishedAt, "Publication date"),
      retrievedAt: date(item.retrievedAt, "Retrieval date"),
    };
  });
  if (new Set(result.map((source) => source.id)).size !== result.length)
    throw new Error("Every source needs a unique ID.");
  return result;
}
function citations(
  value: unknown,
  sourceIds: Set<string>,
  label: string,
  required = false,
) {
  const result = [
    ...new Set(
      list(value, `${label} sources`, SANDBOX_LIMITS.sources).map((id) =>
        text(id, "Source ID", 200, true),
      ),
    ),
  ];
  if (required && !result.length)
    throw new Error(`${label} must cite at least one retrieved source.`);
  if (result.some((id) => !sourceIds.has(id)))
    throw new Error(`${label} cites a source that is not in this analysis.`);
  return result;
}
function attachments(value: unknown): SandboxAttachment[] {
  return list(value, "Attachments", SANDBOX_LIMITS.attachments).map((entry) => {
    const item = record(entry, "Attachment");
    return {
      name: text(item.name, "Attachment name", 200, true),
      text: text(
        item.text,
        "Attachment text",
        SANDBOX_LIMITS.attachmentChars,
        true,
        false,
      ),
      mimeType: optionalText(item.mimeType, "Attachment type", 100),
    };
  });
}

export function validateSandboxAnalysis(value: unknown): SandboxAnalysis {
  size(value, "Analysis", SANDBOX_LIMITS.analysisChars);
  const item = record(value, "Analysis");
  const actualSources = sources(item.sources);
  const sourceIds = new Set(actualSources.map((source) => source.id));
  const product = record(item.product, "Product");
  const basis = choice(
    product.basis,
    ["input", "sourced", "inference", "unknown"],
    "product basis",
  );
  const inferenceItems = (value: unknown, label: string): SandboxInference[] =>
    list(value, label, 20).map((entry) => {
      const item = record(entry, label);
      return {
        title: text(item.title, `${label} title`, 300, true),
        detail: text(item.detail, `${label} detail`, 4000, true),
        sourceIds: citations(item.sourceIds, sourceIds, label),
      };
    });
  const assumptions = list(item.assumptions, "Assumptions", 20).map((entry) => {
    const assumption = record(entry, "Assumption");
    return {
      id: text(assumption.id, "Assumption ID", 200, true),
      question: text(assumption.question, "Test question", 3000, true),
      why: text(assumption.why, "Assumption rationale", 4000, true),
      sourceIds: citations(assumption.sourceIds, sourceIds, "Assumption"),
    };
  });
  if (
    new Set(assumptions.map((assumption) => assumption.id)).size !==
    assumptions.length
  )
    throw new Error("Every assumption needs a unique ID.");
  return {
    product: {
      name: text(product.name, "Product name", 200, true),
      description: text(product.description, "Product description"),
      url: url(product.url, "Product URL", true),
      audience: text(product.audience, "Audience", 2000),
      valueProposition: text(
        product.valueProposition,
        "Value proposition",
        4000,
      ),
      sourceIds: citations(
        product.sourceIds,
        sourceIds,
        "Product",
        basis === "sourced",
      ),
      basis,
    },
    summary: text(item.summary, "Summary", 8000, true),
    summarySourceIds: citations(item.summarySourceIds, sourceIds, "Summary"),
    summaryBasis: choice(
      item.summaryBasis,
      ["inference", "unknown"],
      "summary basis",
    ),
    competitors: list(item.competitors, "Competitors", 15).map((entry) => {
      const competitor = record(entry, "Competitor");
      return {
        name: text(competitor.name, "Competitor name", 300, true),
        url: url(competitor.url, "Competitor URL"),
        offer: text(competitor.offer, "Competitor offer", 4000),
        pricing: text(competitor.pricing, "Competitor pricing", 2000),
        difference: text(competitor.difference, "Competitor comparison", 4000),
        sourceIds: citations(
          competitor.sourceIds,
          sourceIds,
          "Competitor",
          true,
        ),
      };
    }),
    news: list(item.news, "News", 20).map((entry) => {
      const news = record(entry, "News");
      return {
        headline: text(news.headline, "News headline", 600, true),
        summary: text(news.summary, "News summary", 4000, true),
        publishedAt: optionalDate(news.publishedAt, "News publication date"),
        url: url(news.url, "News URL"),
        sourceIds: citations(news.sourceIds, sourceIds, "News", true),
      };
    }),
    signals: list(item.signals, "Customer signals", 30).map((entry) => {
      const signal = record(entry, "Customer signal");
      return {
        claim: text(signal.claim, "Customer signal", 4000, true),
        kind: choice(
          signal.kind,
          ["pain", "interest", "objection", "request"],
          "signal type",
        ),
        sourceIds: citations(
          signal.sourceIds,
          sourceIds,
          "Customer signal",
          true,
        ),
      };
    }),
    opportunities: inferenceItems(item.opportunities, "Opportunity"),
    risks: inferenceItems(item.risks, "Risk"),
    assumptions,
    nextSteps: inferenceItems(item.nextSteps, "Next step").map(
      (step, index) => ({
        ...step,
        method: choice(
          record((item.nextSteps as unknown[])[index], "Next step").method ??
            "unspecified",
          ["human", "ai", "expert", "unspecified"],
          "testing method",
        ),
      }),
    ),
    sources: actualSources,
  };
}

export function validateSandboxRequest(value: unknown): SandboxRequest {
  const item = record(value, "Research request");
  const actualAttachments = attachments(item.attachments ?? []);
  const message = text(
    item.message,
    "Message",
    SANDBOX_LIMITS.messageChars,
    !actualAttachments.length,
    false,
  );
  const history = list(
    item.history ?? [],
    "Conversation history",
    SANDBOX_LIMITS.historyMessages,
  ).map((entry) => {
    const message = record(entry, "History message");
    return {
      role: choice(message.role, ["user", "assistant"], "message role"),
      content: text(
        message.content,
        "History message",
        SANDBOX_LIMITS.messageChars,
        true,
        false,
      ),
    };
  });
  if (
    history.reduce((total, message) => total + message.content.length, 0) >
    SANDBOX_LIMITS.historyChars
  )
    throw new Error(
      "Conversation history is too large. Send the most recent messages.",
    );
  return {
    message,
    history,
    attachments: actualAttachments,
    priorAnalysis:
      item.priorAnalysis === undefined || item.priorAnalysis === null
        ? undefined
        : validateSandboxAnalysis(item.priorAnalysis),
    productUrls:
      item.productUrls === undefined
        ? undefined
        : list(item.productUrls, "Product URLs", 5).map((value) =>
            url(value, "Product URL"),
          ),
    sourceReceipt: optionalText(item.sourceReceipt, "Source receipt", 128),
  };
}
export function validateSandboxResponse(value: unknown): SandboxResponse {
  const item = record(value, "Research response");
  return {
    reply: text(
      item.reply,
      "Research reply",
      SANDBOX_LIMITS.messageChars,
      true,
      false,
    ),
    analysis: validateSandboxAnalysis(item.analysis),
    sourceReceipt: optionalText(item.sourceReceipt, "Source receipt", 128),
  };
}
export function validateSandbox(value: unknown): Sandbox {
  const item = record(value, "Sandbox");
  const analysis =
    item.analysis === undefined || item.analysis === null
      ? undefined
      : validateSandboxAnalysis(item.analysis);
  const archive = sources(item.sourceArchive ?? [], 400);
  const byId = new Map(archive.map((source) => [source.id, source]));
  for (const source of analysis?.sources ?? []) {
    const old = byId.get(source.id);
    if (old && old.url !== source.url)
      throw new Error(
        "A source ID was reused for a different URL. Earlier citations have been kept.",
      );
    byId.set(source.id, source);
  }
  if (byId.size > 400)
    throw new Error(
      "This sandbox has too many archived sources. Start a new sandbox.",
    );
  const sourceIds = new Set(byId.keys());
  const messages = list(
    item.messages,
    "Messages",
    SANDBOX_LIMITS.savedMessages,
  ).map((entry) => {
    const message = record(entry, "Message");
    const actualAttachments =
      message.attachments === undefined
        ? undefined
        : attachments(message.attachments);
    return {
      id: text(message.id, "Message ID", 200, true),
      role: choice(message.role, ["user", "assistant"], "message role"),
      text: text(
        message.text,
        "Message",
        SANDBOX_LIMITS.messageChars,
        !actualAttachments?.length,
        false,
      ),
      createdAt: date(message.createdAt, "Message date"),
      sourceIds: citations(message.sourceIds, sourceIds, "Message"),
      status:
        message.status === undefined
          ? undefined
          : choice(
              message.status,
              ["pending", "complete", "failed", "cancelled"],
              "message status",
            ),
      error: optionalText(message.error, "Message error", 2000),
      attachments: actualAttachments,
    };
  });
  if (new Set(messages.map((message) => message.id)).size !== messages.length)
    throw new Error("Every message needs a unique ID.");
  return {
    id: text(item.id, "Sandbox ID", 200, true),
    founderId: text(item.founderId, "Workspace ID", 200, true),
    title: text(item.title, "Sandbox title", 200, true),
    initialInput: text(
      item.initialInput,
      "Initial input",
      SANDBOX_LIMITS.messageChars,
      false,
      false,
    ),
    messages,
    analysis,
    sourceArchive: [...byId.values()],
    sourceReceipt: optionalText(item.sourceReceipt, "Source receipt", 128),
    createdAt: date(item.createdAt, "Creation date"),
    updatedAt: date(item.updatedAt, "Updated date"),
    validation:
      item.validation === undefined || item.validation === null
        ? undefined
        : validateSandboxValidation(item.validation),
    twin:
      item.twin === undefined || item.twin === null
        ? undefined
        : validateTwinWorkspace(item.twin),
  };
}
export function createSandbox(founderId: string, input = ""): Sandbox {
  const timestamp = new Date().toISOString();
  return validateSandbox({
    id: crypto.randomUUID(),
    founderId,
    title: input.trim().slice(0, 70) || "New sandbox",
    initialInput: input,
    messages: [],
    sourceArchive: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
export function sandboxToCampaignPrefill(
  sandbox: Sandbox,
  assumption?: SandboxAssumption,
): Record<string, string> {
  const target = assumption || sandbox.analysis?.assumptions[0];
  return {
    title: `${sandbox.analysis?.product.name || sandbox.title} — Product test`,
    url: sandbox.analysis?.product.url || "",
    audience: sandbox.analysis?.product.audience || "",
    objective: target?.question || "",
    assumption: target?.question || "",
  };
}
const inline = (value: string) =>
  value.replace(/[\\[\]*_`]/g, "\\$&").replace(/[\r\n]+/g, " ");
const sourceLink = (source: SandboxSource) =>
  `[${inline(source.title)}](<${source.url}>)`;
export function exportSandboxMarkdown(value: Sandbox) {
  const sandbox = validateSandbox(value),
    analysis = sandbox.analysis;
  const archive = new Map(
    (sandbox.sourceArchive || []).map((source) => [source.id, source]),
  );
  const cite = (ids: string[]) =>
    ids.length
      ? `Sources: ${ids.map((id) => `${sourceLink(archive.get(id)!)} (${id})`).join(", ")}`
      : "Sources: entered idea only; unverified hypothesis";
  const lines = [
    `# ${inline(sandbox.title)}`,
    "",
    `Created: ${sandbox.createdAt}`,
    `Updated: ${sandbox.updatedAt}`,
    "",
    "## Input",
    "",
    sandbox.initialInput || "No initial text",
    "",
  ];
  if (analysis) {
    lines.push(
      "## Product",
      "",
      `Name: ${analysis.product.name}`,
      `Description: ${analysis.product.description}`,
      `Audience: ${analysis.product.audience}`,
      `Value proposition: ${analysis.product.valueProposition}`,
      `Basis: ${analysis.product.basis}`,
      cite(analysis.product.sourceIds),
      "",
    );
    if (analysis.product.url)
      lines.push(`Product URL: <${analysis.product.url}>`, "");
    lines.push(
      "## Market analysis — inference",
      "",
      analysis.summary,
      cite(analysis.summarySourceIds),
      "",
      "## Competitors",
      "",
    );
    for (const competitor of analysis.competitors)
      lines.push(
        `### ${inline(competitor.name)}`,
        "",
        `URL: <${competitor.url}>`,
        `Offer: ${competitor.offer || "Not recorded"}`,
        `Pricing: ${competitor.pricing || "Not verified"}`,
        `Comparison — inference: ${competitor.difference || "Not assessed"}`,
        cite(competitor.sourceIds),
        "",
      );
    lines.push("## News", "");
    for (const news of analysis.news)
      lines.push(
        `### ${inline(news.headline)}`,
        "",
        news.summary,
        `URL: <${news.url}>`,
        ...(news.publishedAt ? [`Published: ${news.publishedAt}`] : []),
        cite(news.sourceIds),
        "",
      );
    lines.push("## Customer signals", "");
    for (const signal of analysis.signals)
      lines.push(
        `### ${signal.kind}`,
        "",
        signal.claim,
        cite(signal.sourceIds),
        "",
      );
    for (const [label, items] of [
      ["Opportunities", analysis.opportunities],
      ["Risks", analysis.risks],
      ["Next steps", analysis.nextSteps],
    ] as const) {
      lines.push(`## ${label} — inference`, "");
      for (const item of items)
        lines.push(
          `### ${inline(item.title)}`,
          "",
          item.detail,
          ...("method" in item ? [`Recommended method: ${item.method}`] : []),
          cite(item.sourceIds),
          "",
        );
    }
    lines.push("## Assumptions to test — unvalidated", "");
    for (const assumption of analysis.assumptions)
      lines.push(
        `### ${inline(assumption.question)}`,
        "",
        assumption.why,
        cite(assumption.sourceIds),
        "",
      );
  }
  lines.push("## Conversation", "");
  for (const message of sandbox.messages) {
    lines.push(
      `### ${message.role} · ${message.createdAt}`,
      "",
      message.text,
      `Status: ${message.status || "complete"}`,
      ...(message.error ? [`Error: ${message.error}`] : []),
    );
    for (const attachment of message.attachments || [])
      lines.push("", `Attachment: ${attachment.name}`, "", attachment.text);
    if (message.sourceIds.length) lines.push(cite(message.sourceIds));
    lines.push("");
  }
  lines.push("## Sources", "");
  for (const source of archive.values())
    lines.push(
      `- ${sourceLink(source)} (${source.id}); retrieved ${source.retrievedAt}${source.publishedAt ? `; published ${source.publishedAt}` : ""}`,
    );
  return lines.join("\n");
}
export function importResearchIdea(value: ResearchIdea): Sandbox {
  const idea = validateResearchIdea(value);
  const timestamp = new Date().toISOString();
  const archive: SandboxSource[] = [];
  const lines = [
    `Saved idea: ${idea.name}`,
    idea.description,
    `Audience: ${idea.audience}`,
    ...(idea.productUrl ? [`Product URL: ${idea.productUrl}`] : []),
  ];
  for (const competitor of idea.competitors) {
    archive.push({
      id: competitor.id,
      title: competitor.name,
      url: competitor.url,
      retrievedAt: competitor.checkedAt || idea.updatedAt,
    });
    lines.push(
      `Competitor recorded manually: ${competitor.name} (${competitor.url})`,
      competitor.description,
      `Recorded pricing: ${competitor.pricing || "Not recorded"}`,
      competitor.difference,
    );
  }
  for (const reaction of idea.reactions) {
    if (reaction.url)
      archive.push({
        id: reaction.id,
        title: reaction.title,
        url: reaction.url,
        publishedAt: reaction.publishedAt,
        retrievedAt: reaction.collectedAt,
      });
    lines.push(
      `Recorded source: ${reaction.title}${reaction.url ? ` (${reaction.url})` : " (private note)"}`,
      reaction.quote,
    );
  }
  for (const assumption of idea.assumptions)
    lines.push(`Question (${assumption.status}): ${assumption.question}`);
  const importedText = lines.filter(Boolean).join("\n\n");
  const segments = importedText.match(/[\s\S]{1,30000}/g) || [];
  if (segments.length > SANDBOX_LIMITS.savedMessages)
    throw new Error("This saved idea is too large to import into one sandbox.");
  return validateSandbox({
    ...createSandbox(idea.founderId),
    title: idea.name,
    initialInput: segments[0] || "",
    sourceArchive: archive,
    messages: segments.map((text, index) => ({
      id: crypto.randomUUID(),
      role: "user",
      text,
      sourceIds: index
        ? []
        : archive.slice(0, SANDBOX_LIMITS.sources).map((source) => source.id),
      status: "complete",
      createdAt: timestamp,
    })),
  });
}
