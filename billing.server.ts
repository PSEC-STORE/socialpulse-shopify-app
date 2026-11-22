import { Merchant, PlanTier, PrismaClient } from "@prisma/client";
import { PLANS } from "../config/plans.server";
import { isOwnerAccount } from "./owner.server";

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remaining: number | "UNLIMITED";
  upgradeRequired?: boolean;
}

/**
 * Resets monthly usage counters if the 30-day cycle has rolled over.
 */
export async function maybeResetMonthlyQuota(prisma: PrismaClient, merchant: Merchant): Promise<Merchant> {
  const now = new Date();
  const resetDate = new Date(merchant.usageResetAt);
  const daysElapsed = (now.getTime() - resetDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysElapsed >= 30) {
    return prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        postsUsedThisMonth: 0,
        animationsUsedThisMonth: 0,
        usageResetAt: now,
      },
    });
  }
  return merchant;
}

/**
 * Enforces monthly post quota.
 * - Owner (psecstore@gmail.com / Psecstore): ALWAYS UNLIMITED & FREE.
 * - Free Plan customers: 10 posts/month across all 14+ global networks.
 * - Paid customers: Plan limits from PLANS config.
 */
export async function checkPostQuota(prisma: PrismaClient, merchant: Merchant): Promise<QuotaCheckResult> {
  if (merchant.isOwner || isOwnerAccount(merchant.ownerEmail, merchant.shopDomain)) {
    return { allowed: true, remaining: "UNLIMITED" };
  }

  const fresh = await maybeResetMonthlyQuota(prisma, merchant);
  const plan = PLANS[fresh.planTier];

  if (plan.monthlyPostLimit === -1) {
    return { allowed: true, remaining: "UNLIMITED" };
  }

  const remaining = Math.max(0, plan.monthlyPostLimit - fresh.postsUsedThisMonth);
  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      upgradeRequired: true,
      reason: `You have reached your ${plan.name} limit of ${plan.monthlyPostLimit} posts/month. Upgrade your plan to continue auto-posting across all networks.`,
    };
  }

  return { allowed: true, remaining };
}

/**
 * Enforces product animation rendering quota (bypassed for Psecstore owner).
 */
export async function checkAnimationQuota(prisma: PrismaClient, merchant: Merchant): Promise<QuotaCheckResult> {
  if (merchant.isOwner || isOwnerAccount(merchant.ownerEmail, merchant.shopDomain)) {
    return { allowed: true, remaining: "UNLIMITED" };
  }

  const fresh = await maybeResetMonthlyQuota(prisma, merchant);
  const plan = PLANS[fresh.planTier];

  if (plan.monthlyAnimationLimit === -1) {
    return { allowed: true, remaining: "UNLIMITED" };
  }

  const remaining = Math.max(0, plan.monthlyAnimationLimit - fresh.animationsUsedThisMonth);
  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      upgradeRequired: true,
      reason: `Monthly product animation limit (${plan.monthlyAnimationLimit}) reached on ${plan.name}. Upgrade to create more product showcase reels.`,
    };
  }

  return { allowed: true, remaining };
}

/**
 * Enforces custom media upload storage quota (bypassed for Psecstore owner).
 */
export function checkStorageQuota(merchant: Merchant, incomingFileMb: number): QuotaCheckResult {
  if (merchant.isOwner || isOwnerAccount(merchant.ownerEmail, merchant.shopDomain)) {
    return { allowed: true, remaining: "UNLIMITED" };
  }

  const plan = PLANS[merchant.planTier];
  if (plan.customMediaStorageMb === -1) {
    return { allowed: true, remaining: "UNLIMITED" };
  }

  const remaining = Math.max(0, plan.customMediaStorageMb - merchant.storageUsedMb);
  if (incomingFileMb > remaining) {
    return {
      allowed: false,
      remaining,
      upgradeRequired: true,
      reason: `Not enough media storage (${remaining.toFixed(1)} MB left on ${plan.name}). Upgrade for more custom media storage.`,
    };
  }
  return { allowed: true, remaining };
}

/**
 * Shopify Billing API / Managed Pricing helper for Public Shopify App Store installs.
 * IMPORTANT: All apps distributed on the Shopify App Store MUST bill via Shopify App Pricing
 * or the Shopify Billing API.
 */
export async function createShopifySubscriptionCharge(
  adminGraphql: (query: string, options?: Record<string, unknown>) => Promise<Response>,
  params: {
    planTier: Exclude<PlanTier, "OWNER_UNLIMITED" | "FREE">;
    returnUrl: string;
    isTest?: boolean;
  }
) {
  const plan = PLANS[params.planTier];
  const response = await adminGraphql(
    `#graphql
    mutation AppSubscriptionCreate(
      $name: String!
      $returnUrl: URL!
      $test: Boolean
      $lineItems: [AppSubscriptionLineItemInput!]!
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        lineItems: $lineItems
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id status }
      }
    }`,
    {
      variables: {
        name: `SocialPulse ${plan.name} Plan`,
        returnUrl: params.returnUrl,
        test: params.isTest ?? process.env.NODE_ENV !== "production",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: plan.priceUsdMonthly, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const json = await response.json();
  return json.data?.appSubscriptionCreate;
}
