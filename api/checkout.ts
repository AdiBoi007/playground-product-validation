import type Stripe from "stripe";
import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { CAMPAIGN_PRICE } from "../src/mvp/model.js";
import {
  checkoutParameters,
  type CheckoutReservation,
} from "./_lib/checkout.js";
import { domainCommand } from "./_lib/domain.js";
import {
  expectMethod,
  failure,
  HttpError,
  json,
  objectBody,
  stringField,
} from "./_lib/http.js";
import { authenticate, database, memberWorkspace } from "./_lib/server.js";
import { appOrigin, stripe } from "./_lib/stripe.js";

async function attachSession(
  campaignId: string,
  generation: number,
  sessionId: string,
) {
  const { error } = await database().rpc("playground_attach_checkout_session", {
    requested_campaign: campaignId,
    requested_generation: generation,
    requested_session: sessionId,
  });
  if (error)
    throw new HttpError(
      503,
      "Checkout could not be saved. Retry to recover the same session.",
    );
}
async function releaseCheckout(campaignId: string, generation: number) {
  const { data, error } = await database().rpc("playground_release_checkout", {
    requested_campaign: campaignId,
    requested_generation: generation,
  });
  if (error || data !== true)
    throw new HttpError(
      409,
      "Checkout changed while cancelling. Refresh and try again.",
    );
}
function requireUnpaidSession(session: Stripe.Checkout.Session) {
  if (session.payment_status === "paid" || session.status === "complete")
    throw new HttpError(
      409,
      "Payment is processing. Refresh the campaign in a moment. Another checkout cannot be started.",
    );
}
export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    expectMethod(req, "POST");
    const user = await authenticate(req);
    const { data, profile } = await memberWorkspace(user);
    const body = objectBody(req);
    const campaignId = stringField(body, "campaignId", 100);
    const cancel = body.cancel === true;
    const campaign = data.campaigns.find(
      (item) => item.id === campaignId && item.founderId === profile.id,
    );
    if (!campaign || profile.role !== "founder")
      throw new HttpError(403, "Only the campaign founder can check out.");
    if (campaign.payment === "paid")
      throw new HttpError(409, "This campaign is already paid.");
    if (campaign.priceCents !== CAMPAIGN_PRICE || campaign.currency !== "usd")
      throw new HttpError(
        409,
        "The campaign price is inconsistent. Contact operations.",
      );
    const origin = appOrigin();
    const provider = stripe();
    const { data: previous, error: readError } = await database()
      .from("playground_checkouts")
      .select("generation,session_id,expires_at")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (readError)
      throw new HttpError(503, "Checkout history could not be read.");
    const prior = previous as CheckoutReservation | null;
    let priorSession: Stripe.Checkout.Session | null = null;
    if (prior) {
      if (prior.session_id)
        priorSession = await provider.checkout.sessions.retrieve(
          prior.session_id,
        );
      else {
        // Recover a session created before a crashed response / DB save using exactly the same parameters.
        try {
          priorSession = await provider.checkout.sessions.create(
            checkoutParameters(campaignId, profile.id, prior, origin),
            { idempotencyKey: `playground-${campaignId}-${prior.generation}` },
          );
          await attachSession(campaignId, prior.generation, priorSession.id);
        } catch (error) {
          const rejectedExpiredCreation =
            Date.parse(prior.expires_at) <= Date.now() &&
            typeof error === "object" &&
            error !== null &&
            "param" in error &&
            error.param === "expires_at" &&
            "type" in error &&
            error.type === "StripeInvalidRequestError";
          if (!rejectedExpiredCreation) throw error;
          // Stripe rejected the original expired parameters: no session was created under this idempotency key.
        }
      }
      if (priorSession) requireUnpaidSession(priorSession);
    }
    if (cancel) {
      if (!prior) return json(res, { cancelled: true });
      if (priorSession?.status === "open") {
        const expired = await provider.checkout.sessions.expire(
          priorSession.id,
        );
        if (expired.status !== "expired")
          throw new HttpError(
            409,
            "Checkout could not be cancelled. Refresh its payment status.",
          );
      }
      await releaseCheckout(campaignId, prior.generation);
      return json(res, { cancelled: true });
    }
    if (priorSession?.status === "open" && priorSession.url)
      return json(res, { url: priorSession.url });
    if (
      prior &&
      priorSession?.status === "expired" &&
      Date.parse(prior.expires_at) > Date.now()
    )
      await releaseCheckout(campaignId, prior.generation);
    domainCommand(data, profile, {
      type: "record-payment",
      campaignId,
      reference: "checkout-validation",
    });
    const { data: reservations, error } = await database().rpc(
      "playground_reserve_checkout",
      {
        requested_campaign: campaignId,
        requested_founder: profile.id,
        expected_generation: prior?.generation ?? 0,
      },
    );
    if (error)
      throw new HttpError(
        409,
        error.code === "P0001"
          ? "The mission or checkout changed. Refresh and approve the current mission before retrying."
          : "Checkout could not be reserved. Please try again.",
      );
    if (!Array.isArray(reservations) || !reservations[0])
      throw new HttpError(503, "Checkout did not return a reservation.");
    const reservation = reservations[0] as CheckoutReservation;
    const session = await provider.checkout.sessions.create(
      checkoutParameters(campaignId, profile.id, reservation, origin),
      { idempotencyKey: `playground-${campaignId}-${reservation.generation}` },
    );
    await attachSession(campaignId, reservation.generation, session.id);
    requireUnpaidSession(session);
    if (!session.url)
      throw new HttpError(503, "Stripe did not return a checkout URL.");
    return json(res, { url: session.url });
  } catch (error) {
    return failure(res, error);
  }
}
