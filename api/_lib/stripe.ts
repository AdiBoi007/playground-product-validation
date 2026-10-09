import Stripe from "stripe";
import { CAMPAIGN_PRICE } from "../../src/mvp/model.js";
import { HttpError } from "./http.js";
import { requiredEnv } from "./server.js";

let client: Stripe | undefined;
export function stripe() {
  return (client ??= new Stripe(requiredEnv("STRIPE_SECRET_KEY")));
}

export function appOrigin() {
  let url: URL;
  try {
    url = new URL(requiredEnv("APP_URL"));
  } catch {
    throw new HttpError(503, "Set APP_URL to your website origin.");
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  ) {
    throw new HttpError(503, "APP_URL must use HTTPS.");
  }
  return url.origin;
}

export function paidCampaignSession(session: Stripe.Checkout.Session) {
  if (session.metadata?.product !== "playground-human-test-v1") return null;
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.status !== "complete"
  )
    return null;
  if (session.amount_total !== CAMPAIGN_PRICE || session.currency !== "usd")
    throw new HttpError(
      400,
      "Checkout total does not match the campaign price.",
    );
  const campaignId = session.metadata.campaignId;
  const founderId = session.metadata.founderId;
  const generation = Number(session.metadata.checkoutGeneration);
  if (
    !campaignId ||
    !founderId ||
    session.client_reference_id !== campaignId ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  )
    throw new HttpError(400, "Checkout campaign metadata is incomplete.");
  return { campaignId, founderId, generation, reference: session.id };
}
