import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adverseValidationObservations,
  proposeValidationFindings,
  validateValidationFindingsRequest,
} from "../_lib/validation-findings.js";
import type { ValidationFindingsRequest } from "../_lib/validation-findings.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import handler from "../validation-findings.js";
import { parseCommand } from "../_lib/commands.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const key = "sk_validation_fixes_fixture_not_real";
function input(): ValidationFindingsRequest {
  return {
    campaign: {
      title: "First-use onboarding",
      url: "https://example.com/test",
      objective: "Can new users start without help?",
      audience: "Independent designers",
      tasks: [
        {
          id: "task-1",
          title: "Find the start control",
          instructions:
            "Open the product and find the start control without help.",
          question: "What happened when you tried to start?",
          successCriteria: "Locate the start control without assistance.",
        },
        {
          id: "task-2",
          title: "Save the first project",
          instructions: "Save a test project using fictional information.",
          question: "What happened when saving the project?",
          successCriteria: "Reach a saved confirmation without help.",
        },
      ],
    },
    observations: [
      {
        id: "submission-1:task-1",
        taskId: "task-1",
        outcome: "blocked",
        answer: "I could not find how to start.",
        observation: "The start button was hidden below the first screen.",
        severity: "major",
      },
      {
        id: "submission-2:task-1",
        taskId: "task-1",
        outcome: "assisted",
        answer: "A coordinator pointed out the button.",
        observation: "I needed help locating the start button below the fold.",
        severity: "minor",
      },
      {
        id: "submission-1:task-2",
        taskId: "task-2",
        outcome: "success",
        answer: "The new project saved correctly.",
        observation: "The confirmation clearly showed my project was saved.",
        severity: "none",
      },
    ],
  };
}
function findings() {
  return [
    {
      title: "Start action is outside the initial view",
      severity: "major",
      description:
        "An invented narrative with100testers and80%success should never become the observed description.",
      recommendation:
        "Move the start button into the first visible onboarding area, retain a clear primary label, and retest whether new users locate it without help.",
      sourceIds: ["submission-1:task-1", "submission-2:task-1"],
      taskIds: ["task-1"],
    },
  ];
}
const output = (value: unknown = { findings: findings() }) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    },
  ],
});
const provider = (body: unknown = output()) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body)));
const options = (fetch = provider()) => ({
  fetch,
  key,
  now: () => new Date("2026-10-09T00:00:00.000Z"),
});

describe("specific proposed fixes from real evidence", () => {
  it("uses one bounded tool-free budgetmodel call with source-ID enums and no profile or media fields", async () => {
    vi.stubEnv("SANDBOX_MODEL", "gpt-6-luna");
    const request = input() as ValidationFindingsRequest & {
      profiles?: unknown[];
    };
    request.profiles = [
      { name: "Private Person", email: "private@example.com" },
    ];
    Object.assign(request.observations[0], {
      testerName: "Private Person",
      evidence: [{ url: "data:image/png;base64,private" }],
    });
    const fetch = provider(),
      result = await proposeValidationFindings(request, options(fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      max_output_tokens: 2500,
    });
    expect(payload.tools).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("Private Person");
    expect(JSON.stringify(payload)).not.toContain("data:image");
    const sourceEnums =
      payload.text.format.schema.properties.findings.items.properties.sourceIds
        .items.enum;
    expect(sourceEnums).toEqual(["submission-1:task-1", "submission-2:task-1"]);
    expect(result).toMatchObject({
      method: "ai",
      findings: [
        {
          recommendation: expect.stringContaining("Move the start button"),
          sourceIds: findings()[0].sourceIds,
          taskIds: ["task-1"],
        },
      ],
    });
    expect(result.findings[0].description).toContain(
      input().observations[0].observation,
    );
    expect(result.findings[0].description).not.toContain("100testers");
    expect(result.findings[0].description).not.toContain("80%success");
  });
  it("returns no invented findings and spends no provider call when there are no adverse observations", async () => {
    const request = input();
    request.observations = [request.observations[2]];
    const fetch = provider();
    expect(adverseValidationObservations(request)).toHaveLength(0);
    expect(
      await proposeValidationFindings(request, { ...options(fetch), key: "" }),
    ).toMatchObject({ findings: [], method: "structured" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects uncited, foreign, duplicated and successful-only sources or mismatched tasks", async () => {
    const edits = [
      { sourceIds: [] },
      { sourceIds: ["foreign-campaign:task-1"] },
      { sourceIds: ["submission-1:task-2"], taskIds: ["task-2"] },
      { sourceIds: ["submission-1:task-1", "submission-1:task-1"] },
      { taskIds: ["task-2"] },
      { taskIds: ["task-1", "task-2"] },
    ];
    for (const edit of edits)
      await expect(
        proposeValidationFindings(
          input(),
          options(
            provider(output({ findings: [{ ...findings()[0], ...edit }] })),
          ),
        ),
      ).rejects.toMatchObject({ code: "INVALID_FINDINGS" });
  });
  it("rejects unsupported severity, severity inflation and provider-generated metrics/verdict fields", async () => {
    for (const edit of [
      { severity: "blocker" },
      { severity: "critical" },
      { verdict: "Ship" },
      { completionRate: 100 },
    ])
      await expect(
        proposeValidationFindings(
          input(),
          options(
            provider(output({ findings: [{ ...findings()[0], ...edit }] })),
          ),
        ),
      ).rejects.toMatchObject({ code: "INVALID_FINDINGS" });
    await expect(
      proposeValidationFindings(
        input(),
        options(
          provider(output({ findings: findings(), metrics: { success: 80 } })),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_FINDINGS" });
  });
  it("validates the task evidence context and strips emails from free text before provider transport", async () => {
    const request = input();
    request.observations[0].observation =
      "The start button did not work; contact me at private@example.com.";
    const fetch = provider();
    await proposeValidationFindings(request, options(fetch));
    expect(JSON.stringify(fetch.mock.calls[0])).not.toContain(
      "private@example.com",
    );
    const bad = input();
    bad.observations[0].taskId = "foreign-task";
    expect(() => validateValidationFindingsRequest(bad)).toThrow(
      "outside this mission",
    );
    bad.observations[0].taskId = "task-1";
    bad.observations[0].id = "private@example.com";
    expect(() => validateValidationFindingsRequest(bad)).toThrow(
      "opaque observation",
    );
  });
  it("does not fabricate fallback fixes on missing credentials, provider failure or refusal", async () => {
    await expect(
      proposeValidationFindings(input(), { key: "" }),
    ).rejects.toMatchObject({ code: "SETUP_REQUIRED" });
    await expect(
      proposeValidationFindings(
        input(),
        options(vi.fn(async () => new Response(key, { status: 401 }))),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_CONFIGURATION",
      message: expect.not.stringContaining(key),
    });
    await expect(
      proposeValidationFindings(
        input(),
        options(
          provider({
            status: "completed",
            output: [{ content: [{ type: "refusal", refusal: "No" }] }],
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "FINDINGS_REFUSED" });
  });
  it("bounds input and output and deadlines stalled provider adapters without a retry", async () => {
    const request = input();
    request.observations = Array.from({ length: 41 }, (_, index) => ({
      ...request.observations[0],
      id: `source-${index}`,
    }));
    expect(() => validateValidationFindingsRequest(request)).toThrow("forty");
    const stalled = vi.fn<typeof fetch>(() => new Promise(() => {}));
    await expect(
      proposeValidationFindings(input(), {
        ...options(stalled),
        deadlineMs: 5,
      }),
    ).rejects.toMatchObject({ status: 504, code: "TIMEOUT" });
    expect(stalled).toHaveBeenCalledTimes(1);
    const oversized = vi.fn<typeof fetch>(
      async () => new Response("x".repeat(96_001)),
    );
    await expect(
      proposeValidationFindings(input(), options(oversized)),
    ).rejects.toMatchObject({ code: "INVALID_FINDINGS" });
  });
  it("aborts the single paid-call attempt on client cancellation", async () => {
    const controller = new AbortController(),
      fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    const pending = proposeValidationFindings(
      input(),
      options(fetch),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      status: 499,
      code: "CANCELLED",
    });
    expect((fetch.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  });
  it("retains explicit AI method on the whitelisted report update command", () => {
    expect(
      parseCommand({
        type: "update-report",
        reportId: "report",
        summary: "Actual QA-approved outcomes remain unchanged.",
        findings: [],
        method: "ai",
      }),
    ).toMatchObject({ method: "ai" });
    expect(() =>
      parseCommand({
        type: "update-report",
        reportId: "report",
        summary: "Outcomes",
        findings: [],
        method: "fabricated",
      }),
    ).toThrow();
  });
});
describe("proposed-fix endpoint boundaries", () => {
  const call = async (
    method: string,
    body: unknown = input(),
    origin = "https://validation.example.com",
    contentType = "application/json",
  ) => {
    const req = Readable.from([
      Buffer.from(JSON.stringify(body)),
    ]) as ApiRequest;
    req.method = method;
    req.headers = {
      host: "validation.example.com",
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
  it("GET reveals only configuration and empty-adverse POST needs no key or charge", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await call("GET")).json).toHaveBeenCalledWith({
      configured: false,
    });
    const request = input();
    request.observations = [];
    expect((await call("POST", request)).json).toHaveBeenCalledWith(
      expect.objectContaining({ findings: [], method: "structured" }),
    );
    expect((await call("POST")).status).toHaveBeenCalledWith(503);
  });
  it("rejects unsupported origins, methods and content types before any paid call", async () => {
    vi.stubEnv("OPENAI_API_KEY", key);
    const fetch = provider();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await call("POST", input(), "https://attacker.example.com")).status,
    ).toHaveBeenCalledWith(403);
    expect((await call("PUT")).status).toHaveBeenCalledWith(405);
    expect(
      (
        await call(
          "POST",
          input(),
          "https://validation.example.com",
          "text/plain",
        )
      ).status,
    ).toHaveBeenCalledWith(415);
    expect(fetch).not.toHaveBeenCalled();
  });
});
