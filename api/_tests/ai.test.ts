import type { Profile, WorkspaceData } from "../../src/mvp/types.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyData } from "../../src/mvp/model.js";

const state = vi.hoisted(() => ({
  data: null as unknown as WorkspaceData,
  actor: null as unknown as Profile,
  sequence: 0,
  respond: vi.fn(),
  budget: vi.fn(),
}));
vi.mock("../_lib/server.js", () => ({
  authenticate: async () => ({ id: state.actor.id }),
  memberWorkspace: async () => ({
    data: structuredClone(state.data),
    profile: state.actor,
  }),
  mutateWorkspace: async (
    _user: unknown,
    mutation: (data: WorkspaceData, actor: Profile) => { data: WorkspaceData },
  ) => ({
    result: mutation(structuredClone(state.data), state.actor),
    profile: state.actor,
  }),
  visibleWorkspace: async (data: WorkspaceData) => data,
  serverId: () => `generated-${++state.sequence}`,
}));
vi.mock("../_lib/ai.js", () => ({
  structuredResponse: state.respond,
  consumeAiBudget: state.budget,
}));
import synthesize from "../synthesis.js";
import mission from "../mission.js";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-key");
  vi.stubEnv("OPENAI_MODEL", "test-only-model");
  state.respond.mockReset();
  state.budget.mockReset();
  state.budget.mockResolvedValue(undefined);
  state.sequence = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const data = emptyData();
  state.actor = {
    id: "operator",
    email: "operator@example.com",
    name: "Operator",
    role: "admin",
    expertise: [],
    device: "desktop",
    availability: "available",
    bio: "",
    createdAt: "2026-10-09",
  };
  data.profiles = [
    state.actor,
    {
      ...state.actor,
      id: "tester",
      role: "tester",
      name: "Human test fixture",
    },
  ];
  data.campaigns = [
    {
      id: "campaign",
      founderId: "founder",
      title: "Fixture product",
      url: "https://example.com",
      audience: "Designers",
      objective: "Complete signup",
      assumption: "",
      tasks: [
        {
          id: "task",
          title: "Sign up",
          instructions: "Try signup",
          question: "Where did you get stuck?",
        },
      ],
      tasksApproved: true,
      payment: "paid",
      priceCents: 14900,
      currency: "usd",
      round: 1,
      changes: "",
      createdAt: "2026-10-09",
      updatedAt: "2026-10-09",
    },
  ];
  data.assignments = [
    {
      id: "assignment",
      campaignId: "campaign",
      testerId: "tester",
      status: "approved",
      invitedAt: "2026-10-09",
    },
  ];
  data.submissions = [
    {
      id: "submission",
      assignmentId: "assignment",
      campaignId: "campaign",
      testerId: "tester",
      status: "approved",
      qaNote: "Reviewed",
      overallFeedback: "Signup instructions were confusing.",
      createdAt: "2026-10-09",
      updatedAt: "2026-10-09",
      results: [
        {
          taskId: "task",
          outcome: "blocked",
          answer: "I could not find the continue button.",
          observation: "The continue button appeared disabled.",
          severity: "blocker",
          evidence: [
            {
              id: "link",
              name: "Recording",
              kind: "video",
              url: "https://example.com/recording",
            },
          ],
        },
      ],
    },
  ];
  state.data = data;
});
async function run(handler: typeof synthesize, body: Record<string, unknown>) {
  let value: unknown;
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn((result) => {
      value = result;
    }),
  } as unknown as ApiResponse;
  await handler({ method: "POST", body, headers: {} } as ApiRequest, response);
  return {
    value: value as { data: WorkspaceData; method?: string; tasks?: unknown[] },
    response,
  };
}
it("keeps generating a sourced structured report during an AI outage", async () => {
  state.respond.mockRejectedValue(new Error("Provider unavailable"));
  const { value, response } = await run(synthesize, { campaignId: "campaign" });
  expect(response.status).toHaveBeenCalledWith(200);
  expect(value.data.reports[0].method).toBe("structured");
  expect(value.data.reports[0].status).toBe("draft");
  expect(value.data.reports[0].findings[0].sourceIds).toEqual([
    "submission:task",
  ]);
});
it("rejects unknown AI sources and uses the safe structured draft", async () => {
  state.respond.mockResolvedValue({
    findings: [
      {
        title: "Unsupported",
        severity: "major",
        description: "Unverified claim",
        recommendation: "Fix this issue",
        sourceIds: ["fabricated:task"],
        taskIds: ["task"],
      },
    ],
  });
  const { value } = await run(synthesize, { campaignId: "campaign" });
  expect(value.data.reports[0].method).toBe("structured");
  expect(value.data.reports[0].findings[0].sourceIds).toEqual([
    "submission:task",
  ]);
});
it("preserves valid AI findings as a cited draft with authoritative cohort counts", async () => {
  state.respond.mockResolvedValue({
    findings: [
      {
        title: "Continue action unclear",
        severity: "blocker",
        description: "The cited tester could not continue signup.",
        recommendation: "Clarify the required fields and button state.",
        sourceIds: ["submission:task"],
        taskIds: ["task"],
      },
    ],
  });
  const { value } = await run(synthesize, { campaignId: "campaign" });
  expect(value.data.reports[0].method).toBe("ai");
  expect(value.data.reports[0].status).toBe("draft");
  expect(value.data.reports[0].summary).toContain(
    "1 reviewed human testers completed 1 task attempts",
  );
  expect(value.data.reports[0].findings[0].sourceIds).toEqual([
    "submission:task",
  ]);
});
it("allows explicit structured synthesis without sending feedback to AI", async () => {
  const { value } = await run(synthesize, {
    campaignId: "campaign",
    method: "structured",
  });
  expect(value.data.reports[0].method).toBe("structured");
  expect(state.respond).not.toHaveBeenCalled();
});
it("labels task suggestions as templates after an AI outage", async () => {
  state.actor.role = "founder";
  state.respond.mockRejectedValue(new Error("Provider unavailable"));
  const { value } = await run(mission, {
    url: "https://example.com",
    audience: "Designers",
    objective: "Complete signup",
    assumption: "Users understand the first step",
  });
  expect(value.method).toBe("template");
  expect(value.tasks).toHaveLength(3);
});
