import type Stripe from "stripe";
import type { WorkspaceData } from "../../src/mvp/types.js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyData } from "../../src/mvp/model.js";
import { activatePaidMission, checkoutParameters } from "../_lib/checkout.js";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  create: vi.fn(),
  expire: vi.fn(),
  rpc: vi.fn(),
  previous: null as unknown,
  workspace: null as unknown as WorkspaceData,
}));
vi.mock("../_lib/server.js", () => ({
  authenticate: async () => ({ id: "founder" }),
  memberWorkspace: async () => ({
    data: structuredClone(mocks.workspace),
    profile: mocks.workspace.profiles[0],
  }),
  database: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.previous, error: null }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  }),
  serverId: () => "generated",
}));
vi.mock("../_lib/stripe.js", () => ({
  appOrigin: () => "https://example.com",
  stripe: () => ({
    checkout: {
      sessions: {
        retrieve: mocks.retrieve,
        create: mocks.create,
        expire: mocks.expire,
      },
    },
  }),
}));
import checkout from "../checkout.js";

beforeEach(() => {
  mocks.retrieve.mockReset();
  mocks.create.mockReset();
  mocks.expire.mockReset();
  mocks.rpc.mockReset();
  mocks.previous = {
    generation: 1,
    session_id: "cs_previous",
    expires_at: "2020-01-01T00:00:00Z",
  };
  const data = emptyData();
  data.profiles = [
    {
      id: "founder",
      email: "founder@example.com",
      name: "Founder",
      role: "founder",
      expertise: [],
      device: "desktop",
      availability: "available",
      bio: "",
      createdAt: "2026-10-09",
    },
  ];
  data.campaigns = [
    {
      id: "campaign",
      founderId: "founder",
      title: "Approved product",
      url: "https://example.com",
      audience: "Designers",
      objective: "Complete onboarding",
      assumption: "",
      tasks: [
        {
          id: "task",
          title: "Sign up",
          instructions: "Try the signup flow",
          question: "What happened?",
        },
      ],
      tasksApproved: true,
      payment: "unpaid",
      priceCents: 14900,
      currency: "usd",
      round: 1,
      changes: "",
      createdAt: "2026-10-09",
      updatedAt: "2026-10-09",
    },
  ];
  mocks.workspace = data;
});
async function call(body: Record<string, unknown>) {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as ApiResponse;
  await checkout({ method: "POST", headers: {}, body } as ApiRequest, response);
  return response;
}
it("fulfills the original approved mission when a webhook arrives after expiry and draft edits", () => {
  const original = structuredClone(mocks.workspace.campaigns[0]);
  mocks.workspace.campaigns[0].tasksApproved = false;
  mocks.workspace.campaigns[0].title = "Later unpaid draft";
  mocks.workspace.campaigns[0].tasks = [];
  const receipt = {
    campaignId: "campaign",
    founderId: "founder",
    generation: 1,
    reference: "cs_paid",
  };
  const result = activatePaidMission(mocks.workspace, receipt, original);
  expect(result.data.campaigns[0].title).toBe("Approved product");
  expect(result.data.campaigns[0].tasksApproved).toBe(true);
  expect(result.data.campaigns[0].tasks).toHaveLength(1);
  expect(result.data.campaigns[0].payment).toBe("paid");
  expect(activatePaidMission(result.data, receipt, original).data).toEqual(
    result.data,
  );
});
it("blocks another checkout for a paid prior session even after the local reservation expired", async () => {
  mocks.retrieve.mockResolvedValue({
    id: "cs_previous",
    status: "complete",
    payment_status: "paid",
  } as Stripe.Checkout.Session);
  const response = await call({ campaignId: "campaign" });
  expect(response.status).toHaveBeenCalledWith(409);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("keeps the mission locked if Stripe cannot confirm cancellation", async () => {
  mocks.retrieve.mockResolvedValue({
    id: "cs_previous",
    status: "open",
    payment_status: "unpaid",
  } as Stripe.Checkout.Session);
  mocks.expire.mockResolvedValue({
    id: "cs_previous",
    status: "complete",
  } as Stripe.Checkout.Session);
  const response = await call({ campaignId: "campaign", cancel: true });
  expect(response.status).toHaveBeenCalledWith(409);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("releases the lock only after Stripe confirms the session expired", async () => {
  mocks.retrieve.mockResolvedValue({
    id: "cs_previous",
    status: "open",
    payment_status: "unpaid",
  } as Stripe.Checkout.Session);
  mocks.expire.mockResolvedValue({
    id: "cs_previous",
    status: "expired",
  } as Stripe.Checkout.Session);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const response = await call({ campaignId: "campaign", cancel: true });
  expect(response.status).toHaveBeenCalledWith(200);
  expect(mocks.rpc).toHaveBeenCalledWith("playground_release_checkout", {
    requested_campaign: "campaign",
    requested_generation: 1,
  });
});
it("uses stable idempotent parameters and links every session to its immutable generation", () => {
  const reservation = {
    generation: 3,
    session_id: null,
    expires_at: "2026-10-09T12:00:00Z",
  };
  const first = checkoutParameters(
    "campaign",
    "founder",
    reservation,
    "https://example.com",
  );
  expect(
    checkoutParameters(
      "campaign",
      "founder",
      reservation,
      "https://example.com",
    ),
  ).toEqual(first);
  expect(first.metadata?.checkoutGeneration).toBe("3");
  expect(first.expires_at).toBe(
    Math.floor(Date.parse(reservation.expires_at) / 1000),
  );
});
