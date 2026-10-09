import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { parseCommand } from "../_lib/commands.js";
import {
  designExperiment,
  experimentClarifications,
  validateExperimentRequest,
} from "../_lib/experiments.js";
import type {
  ExperimentBrief,
  ExperimentRequest,
} from "../_lib/experiments.js";
import handler from "../experiments.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const key = "sk_experiment_fixture_not_real";
const brief = (patch: Partial<ExperimentBrief> = {}): ExperimentBrief => ({
  inputType: "web-app",
  focus: "onboarding",
  audience: "Freelance designers using desktop browsers",
  assumption: "New users can create their first project without help.",
  decision: "Ship onboarding or change the project creation flow.",
  desiredOutcome: "A new user creates a first project without assistance.",
  targetUrl: "https://example.org/test",
  successThreshold: 80,
  ...patch,
});
const input = (patch: Partial<ExperimentBrief> = {}): ExperimentRequest => ({
  brief: brief(patch),
});
const tasks = () => [
  {
    title: "Find the starting action",
    instructions:
      "Open the authorised test product and locate the control for creating your first project without help.",
    question: "What made it easy or difficult to find the starting action?",
    successCriteria:
      "Success means identifying the create-project control without assistance within the proposed 60-second limit.",
  },
  {
    title: "Create a project",
    instructions:
      "Use fictional test data to create one project in the authorised sandbox, stopping before any purchase or irreversible action.",
    question: "Which step caused difficulty while creating the project?",
    successCriteria:
      "Success means reaching a saved project confirmation without assistance; an error, abandonment or requested help is not unassisted success.",
  },
  {
    title: "Confirm the result",
    instructions:
      "Return to the project list and find the test project you created, without asking for help.",
    question: "How did you know whether your new project was saved?",
    successCriteria:
      "Success means opening the saved test project from the list without help; record failure or assistance separately.",
  },
];
const response = (value: unknown = { tasks: tasks() }) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    },
  ],
});
const provider = (value: unknown = response()) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(value)));
const options = (fetch = provider()) => ({
  fetch,
  key,
  now: () => new Date("2026-10-09T00:00:00.000Z"),
});
const png = {
  name: "Onboarding.png",
  mimeType: "image/png" as const,
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
};

describe("concrete AI experiment design", () => {
  it("asks targeted essential questions without spending a provider call, including without a key", async () => {
    const fetch = provider();
    const result = await designExperiment(
      input({
        audience: "",
        decision: "",
        desiredOutcome: "",
        focus: "",
        targetUrl: "",
      }),
      { ...options(fetch), key: "" },
    );
    expect(result).toMatchObject({
      clarifications: expect.arrayContaining([
        {
          field: "audience",
          question: expect.stringContaining("Who should test"),
        },
        {
          field: "decision",
          question: expect.stringContaining("What decision"),
        },
        {
          field: "desiredOutcome",
          question: expect.stringContaining("observable result"),
        },
        { field: "focus", question: expect.stringContaining("validate") },
        {
          field: "targetUrl",
          question: expect.stringContaining("prototype link"),
        },
      ]),
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows concept and screenshot review missions without pretending an executable target exists", async () => {
    const concept = input({
      inputType: "idea",
      targetUrl: "",
      productDescription:
        "A concept for helping freelance designers create project briefs.",
    });
    expect(experimentClarifications(concept)).toBeUndefined();
    const screenshots = {
      brief: brief({ inputType: "screenshots", targetUrl: "" }),
      briefAssets: [png],
    };
    expect(
      experimentClarifications(validateExperimentRequest(screenshots)),
    ).toBeUndefined();
    const fetch = provider();
    await designExperiment(screenshots, options(fetch));
    const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(payload.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: png.dataUrl,
      detail: "low",
    });
    expect(payload.instructions).toContain(
      "no interactive workflow is available",
    );
    expect(payload.instructions).toContain(
      "Screenshots are user-supplied context, not behavioural evidence",
    );
  });
  it("uses direct PDF/text brief material as untrusted product context in the same single design call", async () => {
    const request: ExperimentRequest = {
      brief: brief({ inputType: "documents", targetUrl: "" }),
      briefDocuments: [
        {
          name: "Product brief.pdf",
          mimeType: "application/pdf",
          text: "A product concept for freelance designers to create project briefs. Uploaded text is supplied context, not observed testing.",
        },
      ],
    };
    const fetch = provider();
    await designExperiment(request, options(fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    const context = JSON.parse(payload.input[0].content[0].text);
    expect(context.briefDocuments).toEqual([
      {
        ...request.briefDocuments![0],
        basis: "user-supplied extracted document; no interaction observed",
      },
    ]);
    expect(payload.instructions).toContain("untrusted data");
    const invalidRequests = [
      { ...request, briefDocuments: Array(4).fill(request.briefDocuments![0]) },
      { ...request, briefDocuments: [{ name: "Empty.txt", text: "" }] },
      {
        ...request,
        briefDocuments: [{ name: "Long.md", text: "x".repeat(30_001) }],
      },
    ];
    for (const invalid of invalidRequests)
      await expect(
        designExperiment(invalid, options(fetch)),
      ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses one bounded tool-free structured call on the inexpensive configured model, returning only draft missions", async () => {
    vi.stubEnv("SANDBOX_MODEL", "gpt-6-luna");
    const fetch = provider();
    const result = await designExperiment(input(), options(fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      max_output_tokens: 2500,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(payload.tools).toBeUndefined();
    expect(payload.text.format.schema.properties.tasks).toMatchObject({
      minItems: 3,
      maxItems: 6,
    });
    expect(result).toMatchObject({
      method: "ai",
      createdAt: "2026-10-09T00:00:00.000Z",
      tasks: tasks().map((task) => ({ ...task, id: expect.any(String) })),
    });
    expect(result).not.toHaveProperty("results");
    if ("tasks" in result)
      expect(new Set(result.tasks.map((task) => task.id)).size).toBe(3);
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("rejects malformed or oversized brief fields and unsupported images before paid work", async () => {
    const fetch = provider();
    for (const value of [
      input({ successThreshold: Number.NaN }),
      input({ successThreshold: 101 }),
      input({ focus: "x".repeat(201) }),
      input({ targetUrl: "https://user:password@example.org" }),
      { ...input(), briefAssets: Array(4).fill(png) },
      { ...input(), briefAssets: [{ ...png, mimeType: "image/svg+xml" }] },
      {
        ...input(),
        briefAssets: [{ ...png, dataUrl: "data:image/png;base64,c2VjcmV0" }],
      },
    ]) {
      await expect(
        designExperiment(value, options(fetch)),
      ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed research context and combined image bodies over the deployment limit", async () => {
    const fetch = provider();
    await expect(
      designExperiment(
        { ...input(), analysis: { competitors: [] } },
        options(fetch),
      ),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(
      designExperiment(
        {
          ...input(),
          briefAssets: [{ ...png, dataUrl: "x".repeat(4_000_001) }],
        },
        options(fetch),
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects generic, duplicate, fabricated-result and incomplete provider output instead of supplying fallback tasks", async () => {
    const generic = tasks();
    generic[0].successCriteria = "Looks good";
    const duplicate = tasks();
    duplicate[1].title = duplicate[0].title;
    for (const value of [
      { tasks: generic },
      { tasks: duplicate },
      { tasks: tasks().slice(0, 2) },
      { tasks: tasks(), successRate: 80 },
      { tasks: [...tasks(), ...tasks(), tasks()[0]] },
    ]) {
      await expect(
        designExperiment(input(), options(provider(response(value)))),
      ).rejects.toMatchObject({ code: "INVALID_PLAN" });
    }
    await expect(
      designExperiment(
        input(),
        options(provider({ status: "incomplete", output: [] })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  });
  it("returns configuration and refusal errors without exposing provider details or the server key", async () => {
    const fetch = provider();
    await expect(
      designExperiment(input(), { ...options(fetch), key: "" }),
    ).rejects.toMatchObject({ code: "SETUP_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
    const denied = vi.fn<typeof globalThis.fetch>(
      async () => new Response(`private response ${key}`, { status: 401 }),
    );
    await expect(
      designExperiment(input(), options(denied)),
    ).rejects.toMatchObject({
      status: 503,
      code: "PROVIDER_CONFIGURATION",
      message: expect.not.stringContaining(key),
    });
    await expect(
      designExperiment(
        input(),
        options(
          provider({
            status: "completed",
            output: [{ content: [{ type: "refusal", refusal: "No" }] }],
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "DESIGN_REFUSED" });
  });
  it("enforces a deadline even when a provider adapter ignores cancellation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    await expect(
      designExperiment(input(), { ...options(fetch), deadlineMs: 5 }),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels provider work with the browser request and does not start any replacement call", async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise(() => {});
    });
    const pending = designExperiment(
      input(),
      options(fetch),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      status: 499,
      code: "CANCELLED",
    });
    expect(signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds provider response data before parsing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("x".repeat(128_001)),
    );
    await expect(
      designExperiment(input(), options(fetch)),
    ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  });
});

describe("experiment endpoint boundaries", () => {
  const call = async (
    method: string,
    body: unknown = input(),
    origin = "https://playground.example.org",
    contentType = "application/json",
  ) => {
    const req = Readable.from([
      Buffer.from(JSON.stringify(body)),
    ]) as ApiRequest;
    req.method = method;
    req.headers = {
      host: "playground.example.org",
      origin,
      "content-type": contentType,
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
  it("GET discloses only key presence and POST can clarify essentials without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const status = await call("GET");
    expect(status.json).toHaveBeenCalledWith({ configured: false });
    const clarification = await call("POST", input({ audience: "" }));
    expect(clarification.status).toHaveBeenCalledWith(200);
    expect(clarification.json).toHaveBeenCalledWith({
      clarifications: [{ field: "audience", question: expect.any(String) }],
    });
    const configured = await call("POST");
    expect(configured.status).toHaveBeenCalledWith(503);
    expect(configured.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SETUP_REQUIRED" }),
    );
  });
  it("rejects foreign origins, unsupported methods and non-JSON bodies without contacting a provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", key);
    const fetch = provider();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await call("POST", input(), "https://attacker.example.org")).status,
    ).toHaveBeenCalledWith(403);
    expect((await call("PUT")).status).toHaveBeenCalledWith(405);
    expect(
      (
        await call(
          "POST",
          input(),
          "https://playground.example.org",
          "text/plain",
        )
      ).status,
    ).toHaveBeenCalledWith(415);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("human evidence command ingestion", () => {
  const command = (
    resultPatch: Record<string, unknown> = {},
    consentConfirmed: unknown = true,
  ) => ({
    type: "submit-feedback",
    assignmentId: "assignment-1",
    overallFeedback: "The project creation flow stalled.",
    consentConfirmed,
    results: [
      {
        taskId: "task-1",
        outcome: "blocked",
        answer: "Could not finish",
        observation: "The next button never advanced.",
        severity: "major",
        evidence: [],
        durationSeconds: 72.5,
        executionOutcome: "failed",
        ...resultPatch,
      },
    ],
  });
  it("preserves measured duration, observed failure and participant consent in the whitelisted command", () => {
    expect(parseCommand(command())).toMatchObject({
      consentConfirmed: true,
      results: [{ durationSeconds: 72.5, executionOutcome: "failed" }],
    });
    expect(
      parseCommand(command({ executionOutcome: "abandoned" })),
    ).toMatchObject({ results: [{ executionOutcome: "abandoned" }] });
    expect(
      parseCommand(command({ executionOutcome: "assisted" })),
    ).toMatchObject({ results: [{ executionOutcome: "assisted" }] });
  });
  it("rejects non-finite, negative or excessive durations, invalid outcomes and non-boolean consent", () => {
    for (const durationSeconds of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      86401,
      "72",
    ])
      expect(() => parseCommand(command({ durationSeconds }))).toThrow();
    expect(() =>
      parseCommand(command({ executionOutcome: "simulated" })),
    ).toThrow();
    expect(() => parseCommand(command({}, "yes"))).toThrow();
  });
});
