import crypto from "node:crypto";
import Razorpay from "razorpay";
import { BillingProvider, PlanTier, PrismaClient } from "@prisma/client";

/**
 * Razorpay Subscriptions Service (Owned by Psecstore).
 *
 * COMPLIANCE NOTICE:
 * - Use Razorpay for DIRECT / CUSTOM-APP / AGENCY / WEB SAAS customers who subscribe
 *   through your own website (e.g., socialpulse.psecstore.com) or direct agency retainers.
 * - For merchants installing via the public Shopify App Store, Shopify policy REQUIRES
 *   Shopify App Pricing / Shopify Billing API (handled in billing.server.ts).
 */

function getRazorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in environment variables.");
  }
  return new Razorpay({ key_id, key_secret });
}

const RAZORPAY_PLAN_MAP: Partial<Record<PlanTier, string | undefined>> = {
  STARTER: process.env.RAZORPAY_PLAN_STARTER_INR,
  GROWTH: process.env.RAZORPAY_PLAN_GROWTH_INR,
  PRO_AGENCY: process.env.RAZORPAY_PLAN_PRO_INR,
};

export async function createRazorpaySubscription(params: {
  merchantId: string;
  shopDomain: string;
  customerEmail: string;
  planTier: Exclude<PlanTier, "OWNER_UNLIMITED" | "FREE">;
}) {
  const planId = RAZORPAY_PLAN_MAP[params.planTier];
  if (!planId) {
    throw new Error(`Razorpay Plan ID not configured for tier: ${params.planTier}`);
  }

  const rzp = getRazorpayClient();
  const subscription = await rzp.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: 120, // Up to 10 years of monthly recurring billing
    notes: {
      merchantId: params.merchantId,
      shopDomain: params.shopDomain,
      planTier: params.planTier,
      owner: "Psecstore",
    },
  });

  return {
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url,
    keyId: process.env.RAZORPAY_KEY_ID!,
  };
}

/**
 * Verifies client-side Razorpay Checkout callback signature.
 */
export function verifyRazorpayPaymentSignature(params: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  const body = `${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.razorpaySignature));
}

/**
 * Verifies Razorpay Server-to-Server Webhook signature (`x-razorpay-signature`).
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Processes Razorpay subscription lifecycle webhooks and updates the Merchant's plan.
 */
export async function handleRazorpayWebhookEvent(prisma: PrismaClient, event: any) {
  const eventType: string = event.event;
  const subEntity = event.payload?.subscription?.entity;
  const notes = subEntity?.notes || {};
  const merchantId: string | undefined = notes.merchantId;
  const planTier = (notes.planTier as PlanTier) || PlanTier.STARTER;

  if (!merchantId) return { ignored: true, reason: "Missing merchantId in notes" };

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant || merchant.isOwner) {
    // Never downgrade or bill the Psecstore owner account
    return { ignored: true, reason: "Owner account or merchant not found" };
  }

  if (eventType === "subscription.activated" || eventType === "subscription.charged") {
    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        planTier,
        billingProvider: BillingProvider.RAZORPAY,
        razorpaySubscriptionId: subEntity.id,
        subscriptionStatus: "ACTIVE",
        currentPeriodEnd: subEntity.current_end ? new Date(subEntity.current_end * 1000) : null,
      },
    });
  } else if (
    eventType === "subscription.cancelled" ||
    eventType === "subscription.halted" ||
    eventType === "subscription.expired"
  ) {
    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        planTier: PlanTier.FREE,
        subscriptionStatus: eventType.replace("subscription.", "").toUpperCase(),
      },
    });
  }

  await prisma.billingEvent.create({
    data: {
      merchantId,
      provider: BillingProvider.RAZORPAY,
      eventType,
      externalId: subEntity?.id,
      currency: "INR",
      payloadJson: event,
    },
  });

  return { processed: true, eventType };
}
