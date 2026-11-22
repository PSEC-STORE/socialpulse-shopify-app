import { BillingProvider, PlanTier, PrismaClient } from "@prisma/client";

export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "psecstore@gmail.com").trim().toLowerCase();
export const OWNER_ORG_NAME = process.env.OWNER_ORG_NAME || "Psecstore";

const OWNER_DOMAINS = (process.env.OWNER_SHOP_DOMAINS || "psecstore.myshopify.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/**
 * Determines whether the authenticated store belongs to Psecstore (psecstore@gmail.com).
 * Owner accounts automatically receive lifetime FREE access to every feature & plan,
 * plus access to the /app/owner Super-Admin Console.
 */
export function isOwnerAccount(email?: string | null, shopDomain?: string | null): boolean {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedShop = (shopDomain || "").trim().toLowerCase();

  if (normalizedEmail && normalizedEmail === OWNER_EMAIL) {
    return true;
  }
  if (normalizedShop && OWNER_DOMAINS.includes(normalizedShop)) {
    return true;
  }
  return false;
}

/**
 * Ensures the Merchant row exists and automatically grants OWNER_UNLIMITED + OWNER_FREE
 * if the connected Shopify store email is psecstore@gmail.com (or belongs to Psecstore).
 */
export async function syncMerchantRecord(
  prisma: PrismaClient,
  params: { shopDomain: string; ownerEmail: string; shopName?: string }
) {
  const ownerFlag = isOwnerAccount(params.ownerEmail, params.shopDomain);

  return prisma.merchant.upsert({
    where: { shopDomain: params.shopDomain },
    create: {
      shopDomain: params.shopDomain,
      shopName: params.shopName || params.shopDomain,
      ownerEmail: params.ownerEmail.toLowerCase(),
      isOwner: ownerFlag,
      planTier: ownerFlag ? PlanTier.OWNER_UNLIMITED : PlanTier.FREE,
      billingProvider: ownerFlag ? BillingProvider.OWNER_FREE : BillingProvider.SHOPIFY_BILLING,
      subscriptionStatus: "ACTIVE",
    },
    update: {
      shopName: params.shopName || undefined,
      ownerEmail: params.ownerEmail.toLowerCase(),
      ...(ownerFlag
        ? {
            isOwner: true,
            planTier: PlanTier.OWNER_UNLIMITED,
            billingProvider: BillingProvider.OWNER_FREE,
            subscriptionStatus: "ACTIVE",
          }
        : {}),
    },
  });
}
