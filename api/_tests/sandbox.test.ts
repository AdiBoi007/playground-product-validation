import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxAnalysis, SandboxRequest } from "../../src/mvp/sandbox.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import {
  collectSandboxSources,
  createSandboxBudget,
  runSandboxAgent,
  sandboxSourceId,
  signSandboxSources,
  verifiedPriorSources,
} from "../_lib/sandbox-agent.js";
import handler, { assertSandboxOrigin } from "../sandbox.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const key = "sk_test_not_a_real_key";
const retrievedAt = "2026-10-09T00:00:00.000Z";
const competitorUrl = "https://example.com/pricing";
const newsUrl = "https://example.com/news/announcement";
const discussionUrl = "https://news.ycombinator.com/item?id=123";
const source = (url: string, title = "Actual source title") => ({
  id: sandboxSourceId(url),
  title,
  url,
  retrievedAt,
});
const input = (patch: Partial<SandboxRequest> = {}): SandboxRequest => ({
  message: "Research an onboarding review service for product teams.",
  history: [],
  attachments: [],
  ...patch,
});
function analysis(): SandboxAnalysis {
  const competitor = source(competitorUrl),
    news = source(newsUrl),
    discussion = source(discussionUrl);
  return {
    product: {
      name: "Onboarding review",
      description: "A founder-supplied idea for reviewing onboarding.",
      url: "",
      audience: "Product teams",
      valueProposition: "Find friction in first-use flows.",
      sourceIds: [],
      basis: "input",
    },
    summary:
      "Review the observed alternatives and test this proposed offer with real users.",
    summarySourceIds: [competitor.id],
    summaryBasis: "inference",
    competitors: [
      {
        name: "Actual competitor",
        url: competitorUrl,
        offer: "Recorded primary-page offer.",
        pricing: "",
        difference: "The founder proposes a different delivery method.",
        sourceIds: [competitor.id],
      },
    ],
    news: [
      {
        headline: "Actual dated announcement",
        summary: "A relevant product announcement was published.",
        publishedAt: "2026-10-08",
        url: newsUrl,
        sourceIds: [news.id],
      },
    ],
    signals: [
      {
        claim: "A discussion participant described difficulty with onboarding.",
        kind: "pain",
        sourceIds: [discussion.id],
      },
    ],
    opportunities: [
      {
        title: "Test the offer",
        detail:
          "The observed discussion suggests a question to investigate, not proof of demand.",
        sourceIds: [discussion.id],
      },
    ],
    risks: [
      {
        title: "Limited sample",
        detail: "The retrieved discussion is anecdotal.",
        sourceIds: [discussion.id],
      },
    ],
    assumptions: [
      {
        id: "a1",
        question: "Can product teams understand the offer?",
        why: "The entered idea needs usability validation.",
        sourceIds: [],
      },
    ],
    nextSteps: [
      {
        title: "Run a human test",
        detail:
          "Recruit relevant product-team members and observe comprehension.",
        sourceIds: [],
        method: "human",
      },
    ],
    sources: [competitor, news, discussion],
  };
}
function researchResponse(patch: Record<string, unknown> = {}) {
  return {
    status: "completed",
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [
            { type: "url", url: competitorUrl, title: "Actual source title" },
            { type: "url", url: newsUrl, title: "Actual source title" },
          ],
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "Actual competitor primary page, dated announcement 2026-10-08, and a participant's onboarding pain. No pricing was confirmed.",
            annotations: [
              {
                type: "url_citation",
                url: discussionUrl,
                title: "Actual source title",
                start_index: 0,
                end_index: 10,
              },
            ],
          },
        ],
      },
    ],
    ...patch,
  };
}
function synthesisResponse(
  value: unknown = {
    reply:
      "I built the full sandbox with cited evidence and a recommended human test.",
    analysis: analysis(),
  },
) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  };
}
function provider(
  values: unknown[] = [researchResponse(), synthesisResponse()],
) {
  let call = 0;
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(values[call++]), {
        headers: { "Content-Type": "application/json" },
      }),
  );
}
const options = (fetch = provider()) => ({
  fetch,
  key,
  now: () => new Date(retrievedAt),
});

describe("actual web source admission", () => {
  it("admits tool sources and URL citation annotations, never generated URLs", () => {
    const result = collectSandboxSources(
      researchResponse({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: competitorUrl, title: "Primary price page" },
                { url: "http://127.0.0.1/secret", title: "Blocked" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Made up link https://invented.example.org/ is not a tool source.",
                annotations: [
                  {
                    type: "url_citation",
                    url: discussionUrl,
                    title: "Original comment",
                  },
                ],
              },
            ],
          },
        ],
      }),
      retrievedAt,
    );
    expect(result.map((item) => item.url)).toEqual([
      competitorUrl,
      discussionUrl,
    ]);
    expect(result.every((item) => item.id === sandboxSourceId(item.url))).toBe(
      true,
    );
  });
  it("normalizes URLs for stable IDs across follow-ups", () => {
    expect(sandboxSourceId("https://EXAMPLE.com:443/pricing#plans")).toBe(
      sandboxSourceId(competitorUrl),
    );
    expect(sandboxSourceId(newsUrl)).not.toBe(sandboxSourceId(competitorUrl));
  });
  it("caps source metadata and source counts", () => {
    const result = collectSandboxSources(
      {
        output: [
          {
            type: "web_search_call",
            action: {
              sources: Array.from({ length: 100 }, (_, index) => ({
                url: `https://example.com/${index}`,
                title: "Title ".repeat(1000),
              })),
            },
          },
        ],
      },
      retrievedAt,
    );
    expect(result).toHaveLength(80);
    expect(result[0].title.length).toBeLessThanOrEqual(500);
  });
  it("rejects forged historical source metadata or receipts", () => {
    const priorAnalysis = analysis();
    const sourceReceipt = signSandboxSources(priorAnalysis.sources, key);
    expect(
      verifiedPriorSources(input({ priorAnalysis, sourceReceipt }), key),
    ).toEqual(priorAnalysis.sources);
    priorAnalysis.sources[0].url = "https://fake.example.org/";
    expect(() =>
      verifiedPriorSources(input({ priorAnalysis, sourceReceipt }), key),
    ).toThrow("verification is invalid");
    expect(() =>
      verifiedPriorSources(input({ sourceReceipt: "wrong" }), key),
    ).toThrow();
    expect(verifiedPriorSources(input({ priorAnalysis }), key)).toEqual([]);
  });
});

describe("two-phase sandbox research", () => {
  it("forces real live search before strict full-snapshot synthesis", async () => {
    const fetch = provider();
    const result = await runSandboxAgent(input(), options(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    const request = fetch.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>,
    );
    expect(request[0]).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      tool_choice: "required",
      max_tool_calls: 6,
      tools: [{ type: "web_search", external_web_access: true }],
      include: ["web_search_call.action.sources"],
    });
    expect(request[0].instructions).toContain("untrusted data");
    expect(request[1]).not.toHaveProperty("tools");
    expect(request[1]).toMatchObject({
      text: {
        format: {
          type: "json_schema",
          strict: true,
          name: "playground_sandbox",
        },
      },
    });
    const schema = (
      request[1] as { text: { format: { schema: Record<string, unknown> } } }
    ).text.format.schema;
    expect(schema.$defs).toEqual({
      sourceId: {
        type: "string",
        enum: analysis().sources.map((source) => source.id),
      },
      catalogUrl: {
        type: "string",
        enum: analysis().sources.map((source) => source.url),
      },
    });
    const wireAnalysis = (
      schema.properties as {
        analysis: { properties: Record<string, unknown>; required: string[] };
      }
    ).analysis;
    expect(wireAnalysis.properties).not.toHaveProperty("sources");
    expect(wireAnalysis.required).not.toContain("sources");
    const checkReferences = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      const properties = (node.properties || {}) as Record<string, unknown>;
      for (const [name, property] of Object.entries(properties)) {
        if (name === "sourceIds" || name === "summarySourceIds")
          expect(property).toMatchObject({
            items: { $ref: "#/$defs/sourceId" },
          });
        else checkReferences(property);
      }
      if (node.items) checkReferences(node.items);
    };
    checkReferences(wireAnalysis);
    for (const name of ["competitors", "news"])
      expect(wireAnalysis.properties[name]).toMatchObject({
        items: { properties: { url: { $ref: "#/$defs/catalogUrl" } } },
      });
    expect(result.analysis.competitors[0].pricing).toBe("");
    expect(result.analysis.nextSteps[0].method).toBe("human");
    expect(result.sourceReceipt).toBe(
      signSandboxSources(result.analysis.sources, key),
    );
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bearer ${key}`,
    });
  });
  it("allows product inspection failure while preserving its stated limitation", async () => {
    const fetch = provider();
    const inspect = vi.fn(async () => {
      throw new Error("Blocked product page");
    });
    await runSandboxAgent(
      input({ productUrls: ["https://product.example.com/"] }),
      { ...options(fetch), inspect },
    );
    expect(inspect).toHaveBeenCalledWith("https://product.example.com/");
    expect(String(fetch.mock.calls[0][1]?.body)).toContain(
      "could not be directly inspected",
    );
  });
  it("reads product URLs and context from actual extracted attachments", async () => {
    const fetch = provider();
    const structured = analysis();
    structured.product.url = "https://product.example.com/";
    const attachmentProvider = provider([
      researchResponse(),
      synthesisResponse({
        reply: "I researched the uploaded brief.",
        analysis: structured,
      }),
    ]);
    const inspect = vi.fn(async () => ({
      url: structured.product.url,
      name: "Product",
      description: "Actual page",
      pricing: "",
      excerpt: "Actual page text",
      retrievedAt,
    }));
    await runSandboxAgent(
      input({
        message: "",
        attachments: [
          {
            name: "brief.pdf",
            mimeType: "application/pdf",
            text: "The product is at https://product.example.com/. Product teams need onboarding review.",
          },
        ],
      }),
      { ...options(attachmentProvider), inspect },
    );
    expect(inspect).toHaveBeenCalledWith(structured.product.url);
    expect(String(attachmentProvider.mock.calls[0][1]?.body)).toContain(
      "brief.pdf",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unknown citation references during synthesis", async () => {
    const unknown = analysis();
    unknown.signals[0].sourceIds = ["not-admitted"];
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            researchResponse(),
            synthesisResponse({ reply: "Reply", analysis: unknown }),
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
  });
  it("assembles authoritative metadata when copied model metadata differs or is absent", async () => {
    const copied = analysis();
    copied.sources = [
      {
        id: "s1",
        title: "A shortened copied title",
        url: "https://fake.example.org/",
        retrievedAt: "2026-10-09",
      },
    ];
    const hydrated = await runSandboxAgent(
      input(),
      options(
        provider([
          researchResponse(),
          synthesisResponse({ reply: "Reply", analysis: copied }),
        ]),
      ),
    );
    expect(hydrated.analysis.sources).toEqual(analysis().sources);
    const omitted = analysis() as Omit<SandboxAnalysis, "sources"> & {
      sources?: SandboxAnalysis["sources"];
    };
    delete omitted.sources;
    const complete = await runSandboxAgent(
      input(),
      options(
        provider([
          researchResponse(),
          synthesisResponse({ reply: "Reply", analysis: omitted }),
        ]),
      ),
    );
    expect(complete.analysis.sources).toEqual(analysis().sources);
    expect(complete.sourceReceipt).toBe(
      signSandboxSources(complete.analysis.sources, key),
    );
  });
  it("validates inline chat citations against the final admitted snapshot", async () => {
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            researchResponse(),
            synthesisResponse({
              reply: "A claim [src_0000000000000000]",
              analysis: analysis(),
            }),
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
    const catalogOnly = source("https://example.com/catalog-only");
    const research = researchResponse();
    research.output[0] = {
      type: "web_search_call",
      action: {
        type: "search",
        sources: [
          { type: "url", url: competitorUrl, title: "Actual source title" },
          { type: "url", url: newsUrl, title: "Actual source title" },
          { type: "url", url: catalogOnly.url, title: catalogOnly.title },
        ],
      },
    };
    const fromReply = await runSandboxAgent(
      input(),
      options(
        provider([
          research,
          synthesisResponse({
            reply: `A claim [${catalogOnly.id}]`,
            analysis: analysis(),
          }),
        ]),
      ),
    );
    expect(fromReply.analysis.sources).toContainEqual(catalogOnly);
    const valid = await runSandboxAgent(
      input(),
      options(
        provider([
          researchResponse(),
          synthesisResponse({
            reply: `An observed offer [${sandboxSourceId(competitorUrl)}]`,
            analysis: analysis(),
          }),
        ]),
      ),
    );
    expect(valid.reply).toContain(`[${sandboxSourceId(competitorUrl)}]`);
  });
  it("rejects competitor/news URLs not among their cited actual sources", async () => {
    const forged = analysis();
    forged.competitors[0].url = "https://invented.example.org/";
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            researchResponse(),
            synthesisResponse({ reply: "Reply", analysis: forged }),
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
    const mismatched = analysis();
    mismatched.news[0].sourceIds = [mismatched.sources[0].id];
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            researchResponse(),
            synthesisResponse({ reply: "Reply", analysis: mismatched }),
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
  });
  it("rejects claims with missing citations and unknown product URLs", async () => {
    const empty = analysis();
    empty.signals[0].sourceIds = [];
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            researchResponse(),
            synthesisResponse({ reply: "Reply", analysis: empty }),
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
    const product = analysis();
    product.product.url = "https://invented.example.org/";
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            researchResponse(),
            synthesisResponse({ reply: "Reply", analysis: product }),
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
  });
  it("keeps admitted historical sources on full follow-up snapshots with valid receipts", async () => {
    const priorAnalysis = analysis();
    const sourceReceipt = signSandboxSources(priorAnalysis.sources, key);
    const followUp = analysis();
    followUp.product.audience = "Enterprise product teams";
    const research = researchResponse({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                url: "https://example.com/enterprise",
                title: "Enterprise offer",
              },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "A fresh enterprise offer was found; prior signed sources remain useful.",
            },
          ],
        },
      ],
    });
    const fetch = provider([
      research,
      synthesisResponse({
        reply: "I updated the audience and retained the full cited sandbox.",
        analysis: followUp,
      }),
    ]);
    const result = await runSandboxAgent(
      input({
        message: "Focus this on enterprise teams.",
        history: [{ role: "assistant", content: "Earlier research reply" }],
        priorAnalysis,
        sourceReceipt,
      }),
      options(fetch),
    );
    expect(result.analysis.product.audience).toBe("Enterprise product teams");
    expect(result.analysis.sources.map((source) => source.id)).toEqual(
      priorAnalysis.sources.map((source) => source.id),
    );
    expect(String(fetch.mock.calls[0][1]?.body)).toContain(
      "verifiedPriorSources",
    );
  });
  it("does not trust historical source URLs without a signed receipt", async () => {
    const priorAnalysis = analysis();
    const research = researchResponse({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              { url: "https://example.com/new", title: "Fresh source" },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Only a new actual source was found.",
            },
          ],
        },
      ],
    });
    await expect(
      runSandboxAgent(
        input({ priorAnalysis }),
        options(provider([research, synthesisResponse()])),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
  });
  it("returns clear setup/provider/refusal/incomplete errors with no fabricated analysis", async () => {
    const fetch = provider();
    await expect(
      runSandboxAgent(input(), { ...options(fetch), key: "" }),
    ).rejects.toMatchObject({ status: 503, code: "SETUP_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      runSandboxAgent(
        input(),
        options(provider([{ status: "incomplete", output: [] }])),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_INCOMPLETE" });
    await expect(
      runSandboxAgent(
        input(),
        options(
          provider([
            {
              status: "completed",
              output: [
                {
                  type: "message",
                  content: [{ type: "refusal", refusal: "No" }],
                },
              ],
            },
          ]),
        ),
      ),
    ).rejects.toMatchObject({ code: "RESEARCH_REFUSED" });
    const denied = vi.fn<typeof globalThis.fetch>(
      async () => new Response(`secret provider error ${key}`, { status: 401 }),
    );
    await expect(
      runSandboxAgent(input(), options(denied)),
    ).rejects.toMatchObject({
      status: 503,
      code: "PROVIDER_CONFIGURATION",
      message:
        "AI research could not run with the current server configuration.",
    });
  });
  it("requires a real web tool call and at least one verifiable research source", async () => {
    const noCall = researchResponse({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Model-only prose with https://example.com",
            },
          ],
        },
      ],
    });
    const fetch = provider([noCall]);
    await expect(
      runSandboxAgent(input(), options(fetch)),
    ).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const noSources = researchResponse({
      output: [
        { type: "web_search_call", action: { sources: [] } },
        {
          type: "message",
          content: [{ type: "output_text", text: "No actual sources." }],
        },
      ],
    });
    await expect(
      runSandboxAgent(input(), options(provider([noSources]))),
    ).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });
  it("bounds request content and provider response bodies", async () => {
    const fetch = provider();
    await expect(
      runSandboxAgent(input({ message: "x".repeat(30001) }), options(fetch)),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(fetch).not.toHaveBeenCalled();
    const large = vi.fn<typeof globalThis.fetch>(
      async () => new Response("x".repeat(1_048_577)),
    );
    await expect(
      runSandboxAgent(input(), options(large)),
    ).rejects.toMatchObject({ code: "PROVIDER_INCOMPLETE" });
  });
  it("aborts active provider work on client cancellation and starts no second call", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (_url, init) =>
        new Promise((resolve, reject) => {
          void resolve;
          providerSignal = init?.signal as AbortSignal;
          providerSignal.addEventListener(
            "abort",
            () => reject(new DOMException("Cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const pending = runSandboxAgent(input(), options(fetch), controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "CANCELLED",
      status: 499,
    });
    expect(providerSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("enforces a total deadline even when provider response is pending", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (_url, init) =>
        new Promise((resolve, reject) => {
          void resolve;
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Timeout", "AbortError")),
            { once: true },
          );
        }),
    );
    await expect(
      runSandboxAgent(input(), { ...options(fetch), deadlineMs: 5 }),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds stalled product inspection before any paid provider request", async () => {
    const fetch = provider();
    await expect(
      runSandboxAgent(
        input({ productUrls: ["https://product.example.com/"] }),
        {
          ...options(fetch),
          inspect: () => new Promise(() => {}),
          deadlineMs: 5,
        },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns at its deadline even if a request adapter fails to observe abort", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    await expect(
      runSandboxAgent(input(), { ...options(fetch), deadlineMs: 5 }),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("public paid endpoint boundaries", () => {
  const request = (
    origin = "https://playground.example.com",
    host = "playground.example.com",
  ) => ({ headers: { origin, host } }) as ApiRequest;
  it("allows only same-origin or configured workspace origins", () => {
    expect(() => assertSandboxOrigin(request())).not.toThrow();
    expect(() =>
      assertSandboxOrigin(request("http://localhost:5176", "localhost:5176")),
    ).not.toThrow();
    expect(() =>
      assertSandboxOrigin(request("https://attacker.example.org")),
    ).toThrow();
    expect(() => assertSandboxOrigin(request(""))).toThrow();
    const cross = request();
    cross.headers["sec-fetch-site"] = "cross-site";
    expect(() => assertSandboxOrigin(cross)).toThrow();
  });
  it("caps concurrent work, per-client rate and global rate with idempotent release", () => {
    let now = 0;
    const budget = createSandboxBudget(() => now);
    const release1 = budget("one"),
      release2 = budget("two");
    expect(() => budget("three")).toThrow("limits reached");
    release1();
    release1();
    release2();
    budget("one")();
    budget("one")();
    expect(() => budget("one")).toThrow();
    for (let index = 0; index < 6; index++) budget(`client-${index}`)();
    expect(() => budget("global-limit")).toThrow();
    now = 60001;
    expect(() => budget("one")()).not.toThrow();
  });
  it("GET reveals configuration presence without keys/model and POST reports setup errors", async () => {
    const call = async (
      method: string,
      body = "",
      origin = "https://playground.example.com",
    ) => {
      const req = Readable.from([Buffer.from(body)]) as ApiRequest;
      req.method = method;
      req.headers = {
        host: "playground.example.com",
        origin,
        "content-type": "application/json",
      };
      const res = new EventEmitter() as ApiResponse;
      Object.assign(res, {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        writableEnded: false,
      });
      await handler(req, res);
      return res;
    };
    vi.stubEnv("OPENAI_API_KEY", "");
    const status = await call("GET");
    expect(status.json).toHaveBeenCalledWith({ configured: false });
    const missing = await call("POST", JSON.stringify(input()));
    expect(missing.status).toHaveBeenCalledWith(503);
    expect(missing.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SETUP_REQUIRED" }),
    );
    const blocked = await call(
      "POST",
      JSON.stringify(input()),
      "https://attacker.example.org",
    );
    expect(blocked.status).toHaveBeenCalledWith(403);
    vi.stubEnv("OPENAI_API_KEY", key);
    vi.stubEnv("SANDBOX_MODEL", "private-model-value");
    const configured = await call("GET");
    expect(configured.json).toHaveBeenCalledWith({ configured: true });
    expect(JSON.stringify(vi.mocked(configured.json).mock.calls)).not.toContain(
      key,
    );
    expect(JSON.stringify(vi.mocked(configured.json).mock.calls)).not.toContain(
      "private-model-value",
    );
  });
});
