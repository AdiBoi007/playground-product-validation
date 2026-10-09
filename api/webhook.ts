import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { activatePaidMission } from "./_lib/checkout.js";
import {
  expectMethod,
  failure,
  HttpError,
  json,
  rawBody,
} from "./_lib/http.js";
import { database, mutateWorkspace, requiredEnv } from "./_lib/server.js";
import { paidCampaignSession, stripe } from "./_lib/stripe.js";

// Stripe signature verification requires the exact unparsed request bytes.
export const config = { api: { bodyParser: false } };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    expectMethod(req, "POST");
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string")
      throw new HttpError(400, "Missing Stripe signature.");
    const body = await rawBody(req);
    const provider = stripe();
    let event;
    try {
      event = provider.webhooks.constructEvent(
        body,
        signature,
        requiredEnv("STRIPE_WEBHOOK_SECRET"),
      );
    } catch {
      throw new HttpError(400, "Invalid Stripe signature.");
    }
    if (
      ![
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    )
      return json(res, { received: true });
    const receivedSession = event.data.object;
    if (
      !("id" in receivedSession) ||
      !("object" in receivedSession) ||
      receivedSession.object !== "checkout.session"
    )
      return json(res, { received: true });
    const session = await provider.checkout.sessions.retrieve(
      receivedSession.id,
    );
    const paid = paidCampaignSession(session);
    if (!paid) return json(res, { received: true });
    const { data: mission, error: missionError } = await database()
      .from("playground_checkout_missions")
      .select("founder_id,mission_snapshot,session_id")
      .eq("campaign_id", paid.campaignId)
      .eq("generation", paid.generation)
      .single();
    if (
      missionError ||
      !mission ||
      mission.founder_id !== paid.founderId ||
      (mission.session_id && mission.session_id !== paid.reference)
    )
      throw new HttpError(
        409,
        "The approved paid mission could not be matched.",
      );
    await mutateWorkspace(null, (data) =>
      activatePaidMission(data, paid, mission.mission_snapshot),
    );
    return json(res, { received: true });
  } catch (error) {
    return failure(res, error);
  }
}
