import { Readable } from "node:stream";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import type { User } from "@supabase/supabase-js";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../../src/mvp/model.js";
import { parseCommand } from "../_lib/commands.js";
import { rawBody } from "../_lib/http.js";
import { reconcileProfile } from "../_lib/server.js";
import { paidCampaignSession } from "../_lib/stripe.js";
import { decodeEvidence } from "../evidence.js";
import webhook from "../webhook.js";

afterEach(() => vi.unstubAllEnvs());
const authUser = (metadata: Record<string, unknown>): User =>
  ({
    id: "human-1",
    email: "person@example.com",
    user_metadata: metadata,
    created_at: "2026-10-09T00:00:00Z",
  }) as User;
function session(
  patch: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_paid",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_total: 14900,
    client_reference_id: "campaign-1",
    metadata: {
      product: "playground-human-test-v1",
      campaignId: "campaign-1",
      founderId: "founder-1",
      checkoutGeneration: "1",
    },
    ...patch,
  } as Stripe.Checkout.Session;
}
describe("server command boundary", () => {
  it("rejects client payment confirmation", () => {
    expect(() =>
      parseCommand({
        type: "record-payment",
        campaignId: "campaign-1",
        reference: "fake",
      }),
    ).toThrow("confirmed by Stripe");
  });
  it("removes injected privileges and payment fields before domain execution", () => {
    const profile = parseCommand({
      type: "update-profile",
      profile: {
        name: "Person",
        expertise: ["Design"],
        device: "desktop",
        availability: "available",
        bio: "",
        role: "admin",
        id: "someone-else",
        email: "admin@example.com",
      },
    });
    expect(profile).toEqual({
      type: "update-profile",
      profile: {
        name: "Person",
        expertise: ["Design"],
        device: "desktop",
        availability: "available",
        bio: "",
      },
    });
    const campaign = parseCommand({
      type: "create-campaign",
      campaign: {
        title: "Product",
        url: "https://example.com",
        audience: "Designers",
        objective: "Complete onboarding",
        assumption: "",
        tasks: [],
        tasksApproved: false,
        founderId: "other",
        payment: "paid",
        priceCents: 1,
      },
    });
    expect(
      campaign.type === "create-campaign" && campaign.campaign,
    ).not.toHaveProperty("payment");
    expect(
      campaign.type === "create-campaign" && campaign.campaign,
    ).not.toHaveProperty("founderId");
  });
  it("rejects malformed nested inputs and active content URLs", () => {
    expect(() =>
      parseCommand({
        type: "update-profile",
        profile: { name: "x", expertise: "all" },
      }),
    ).toThrow();
    expect(() =>
      parseCommand({
        type: "submit-feedback",
        assignmentId: "a",
        overallFeedback: "Feedback",
        results: [
          {
            taskId: "t",
            outcome: "success",
            answer: "answer",
            observation: "observation",
            severity: "none",
            evidence: [
              {
                id: "e",
                name: "Attack",
                kind: "link",
                url: "javascript:alert(1)",
              },
            ],
          },
        ],
      }),
    ).toThrow("recording link");
  });
});
describe("verified account roles", () => {
  it("cannot grant admin using editable auth metadata", () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    expect(
      reconcileProfile(emptyData(), authUser({ role: "admin" })).role,
    ).toBe("founder");
  });
  it("freezes a registered tester role despite changed metadata", () => {
    const data = emptyData();
    reconcileProfile(data, authUser({ role: "tester" }));
    expect(reconcileProfile(data, authUser({ role: "admin" })).role).toBe(
      "tester",
    );
  });
  it("grants admin only through server allowlist and revokes it when removed", () => {
    const data = emptyData();
    vi.stubEnv("ADMIN_EMAILS", " PERSON@example.com ");
    expect(reconcileProfile(data, authUser({ role: "tester" })).role).toBe(
      "admin",
    );
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(reconcileProfile(data, authUser({ role: "admin" })).role).toBe(
      "founder",
    );
  });
});
describe("payment activation", () => {
  it("ignores pending / unrelated payments", () => {
    expect(
      paidCampaignSession(session({ payment_status: "unpaid" })),
    ).toBeNull();
    expect(paidCampaignSession(session({ metadata: {} }))).toBeNull();
  });
  it("requires the exact paid USD total and linked campaign", () => {
    expect(() => paidCampaignSession(session({ amount_total: 100 }))).toThrow(
      "price",
    );
    expect(() => paidCampaignSession(session({ currency: "aud" }))).toThrow(
      "price",
    );
    expect(() =>
      paidCampaignSession(
        session({ client_reference_id: "different-campaign" }),
      ),
    ).toThrow("metadata");
    expect(paidCampaignSession(session())).toEqual({
      campaignId: "campaign-1",
      founderId: "founder-1",
      generation: 1,
      reference: "cs_test_paid",
    });
  });
  it("verifies a signed unparsed webhook and rejects a tampered body", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_server_test_only");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_server_test_only");
    const stripe = new Stripe("sk_test_server_test_only");
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "unhandled.test",
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_server_test_only",
    });
    const call = async (body: string) => {
      const req = Readable.from([Buffer.from(body)]) as ApiRequest;
      req.method = "POST";
      req.headers = { "stripe-signature": signature };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as ApiResponse;
      await webhook(req, res);
      return res;
    };
    expect((await call(payload)).status).toHaveBeenCalledWith(200);
    expect((await call(`${payload} `)).status).toHaveBeenCalledWith(400);
  });
});
describe("private screenshot uploads", () => {
  it("checks actual file bytes instead of trusting MIME type", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(decodeEvidence("image/png", png.toString("base64")).extension).toBe(
      "png",
    );
    expect(() =>
      decodeEvidence(
        "image/png",
        Buffer.from("<svg onload='alert(1)' />").toString("base64"),
      ),
    ).toThrow("file type");
    expect(() =>
      decodeEvidence("image/svg+xml", Buffer.from("<svg/>").toString("base64")),
    ).toThrow("PNG");
    expect(() => decodeEvidence("image/png", "A".repeat(4_194_308))).toThrow(
      "3 MB",
    );
  });
  it("preserves exact request bytes and limits raw webhook payloads", async () => {
    const bytes = Buffer.from(' {"id":"event"}\n');
    expect(
      await rawBody(
        Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]) as ApiRequest,
      ),
    ).toEqual(bytes);
    await expect(
      rawBody(Readable.from([bytes]) as ApiRequest, 2),
    ).rejects.toThrow("too large");
  });
});
