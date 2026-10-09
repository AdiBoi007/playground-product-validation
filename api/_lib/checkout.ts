import type Stripe from "stripe";
import { CAMPAIGN_PRICE, TESTER_SLOTS } from "../../src/mvp/model.js";
import type { WorkspaceData } from "../../src/mvp/types.js";
import { parseCommand } from "./commands.js";
import { domainCommand } from "./domain.js";
import { HttpError } from "./http.js";

export interface CheckoutReservation {
  generation: number;
  session_id: string | null;
  expires_at: string;
}
export interface PaidReceipt {
  campaignId: string;
  founderId: string;
  generation: number;
  reference: string;
}
export function checkoutParameters(
  campaignId: string,
  founderId: string,
  reservation: CheckoutReservation,
  origin: string,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    allowed_payment_method_types: ["card"],
    adaptive_pricing: { enabled: false },
    client_reference_id: campaignId,
    metadata: {
      product: "playground-human-test-v1",
      campaignId,
      founderId,
      checkoutGeneration: String(reservation.generation),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: CAMPAIGN_PRICE,
          product_data: {
            name: "Playground product test",
            description: `${TESTER_SLOTS} human tester slots, reviewed evidence, and a founder report.`,
          },
        },
      },
    ],
    success_url: `${origin}/campaigns/${encodeURIComponent(campaignId)}?payment=success`,
    cancel_url: `${origin}/campaigns/${encodeURIComponent(campaignId)}?payment=cancelled`,
    expires_at: Math.floor(new Date(reservation.expires_at).getTime() / 1000),
  };
}
/** Payment fulfills the mission approved at checkout, even after a delayed webhook and later draft edits. */
export function activatePaidMission(
  original: WorkspaceData,
  receipt: PaidReceipt,
  snapshot: unknown,
) {
  const data = structuredClone(original);
  const campaign = data.campaigns.find(
    (item) =>
      item.id === receipt.campaignId && item.founderId === receipt.founderId,
  );
  if (!campaign) throw new HttpError(409, "Paid campaign not found.");
  if (
    campaign.payment === "paid" &&
    campaign.paymentReference === receipt.reference
  )
    return { data };
  if (campaign.payment === "paid")
    throw new HttpError(
      409,
      "This campaign has another paid checkout. Operations must reconcile the extra payment.",
    );
  const mission = parseCommand({ type: "create-campaign", campaign: snapshot });
  if (mission.type !== "create-campaign" || !mission.campaign.tasksApproved)
    throw new HttpError(409, "The paid mission snapshot is incomplete.");
  Object.assign(campaign, mission.campaign);
  const founder = data.profiles.find(
    (profile) => profile.id === campaign.founderId,
  );
  if (!founder) throw new HttpError(409, "Campaign founder not found.");
  return domainCommand(data, founder, {
    type: "record-payment",
    campaignId: campaign.id,
    reference: receipt.reference,
  });
}
