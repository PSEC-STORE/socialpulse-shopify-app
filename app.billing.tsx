import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { Page, Layout, Card, BlockStack, InlineGrid, Text, Badge, Button, Banner, List } from "@shopify/polaris";
import { PlanTier } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLANS } from "../config/plans.server";
import { createShopifySubscriptionCharge } from "../services/billing.server";
import { createRazorpaySubscription } from "../services/razorpay.server";
import { OWNER_EMAIL, OWNER_ORG_NAME } from "../services/owner.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await prisma.merchant.findUnique({ where: { shopDomain: session.shop } });
  return {
    merchant,
    plans: [PLANS.FREE, PLANS.STARTER, PLANS.GROWTH, PLANS.PRO_AGENCY],
    ownerEmail: OWNER_EMAIL,
    ownerOrg: OWNER_ORG_NAME,
    enableRazorpayDirect: process.env.ENABLE_RAZORPAY_DIRECT === "true",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const targetTier = formData.get("tier") as Exclude<PlanTier, "OWNER_UNLIMITED" | "FREE">;
  const method = formData.get("method") as "SHOPIFY" | "RAZORPAY";

  const merchant = await prisma.merchant.findUnique({ where: { shopDomain: session.shop } });
  if (!merchant) return Response.json({ error: "Merchant not found" }, { status: 404 });

  // Owner (psecstore@gmail.com) never pays
  if (merchant.isOwner) {
    return Response.json({ message: "Owner account already has unlimited free access to all plans." });
  }

  if (method === "RAZORPAY") {
    const sub = await createRazorpaySubscription({
      merchantId: merchant.id,
      shopDomain: merchant.shopDomain,
      customerEmail: merchant.ownerEmail,
      planTier: targetTier,
    });
    return Response.json({ checkoutUrl: sub.shortUrl, provider: "RAZORPAY" });
  }

  // Default & mandatory for Shopify App Store installs: Shopify Billing API
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing?upgraded=${targetTier}`;
  const result = await createShopifySubscriptionCharge(admin.graphql, {
    planTier: targetTier,
    returnUrl,
  });
  return Response.json({ checkoutUrl: result?.confirmationUrl, provider: "SHOPIFY" });
};

export default function BillingPage() {
  const { merchant, plans, ownerEmail, ownerOrg, enableRazorpayDirect } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  if (fetcher.data && "checkoutUrl" in fetcher.data && fetcher.data.checkoutUrl) {
    window.top?.location.assign(fetcher.data.checkoutUrl);
  }

  return (
    <Page title="Plans & Billing" subtitle={`Powered by ${ownerOrg}`}>
      <Layout>
        <Layout.Section>
          {merchant?.isOwner ? (
            <Banner title={`Owner Unlimited Access Active (${ownerOrg})`} tone="success">
              <p>
                Signed in as owner account <strong>{ownerEmail}</strong>. All paid tiers, unlimited
                posts across all 14+ global social platforms, unlimited product showcase animations,
                custom media uploads, and the Super-Admin Owner Console are unlocked{" "}
                <strong>100% free of cost</strong>.
              </p>
            </Banner>
          ) : (
            <Banner title={`Current Plan: ${merchant?.planTier || "FREE"}`} tone="info">
              <p>
                Monthly posts used: <strong>{merchant?.postsUsedThisMonth ?? 0}</strong> | Product
                animations used: <strong>{merchant?.animationsUsedThisMonth ?? 0}</strong>. Free
                plan includes 10 posts/month across TikTok, LinkedIn, Pinterest, X, Instagram,
                Facebook, YouTube Shorts, Threads & all other global networks.
              </p>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            {plans.map((plan) => {
              const isCurrent = merchant?.planTier === plan.tier;
              return (
                <Card key={plan.tier}>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {plan.name}
                    </Text>
                    <Text as="p" variant="headingLg">
                      ${plan.priceUsdMonthly}/mo{" "}
                      <Text as="span" variant="bodySm" tone="subdued">
                        (₹{plan.priceInrMonthly}/mo)
                      </Text>
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {plan.tagline}
                    </Text>
                    <List>
                      <List.Item>
                        {plan.monthlyPostLimit === -1
                          ? "Unlimited posts/month"
                          : `${plan.monthlyPostLimit} posts/month across all 14+ networks`}
                      </List.Item>
                      <List.Item>
                        {plan.monthlyAnimationLimit === -1
                          ? "Unlimited product showcase animations"
                          : `${plan.monthlyAnimationLimit} product animations/month`}
                      </List.Item>
                      <List.Item>
                        {plan.customMediaStorageMb === -1
                          ? "Unlimited custom media"
                          : `${plan.customMediaStorageMb >= 1024 ? `${plan.customMediaStorageMb / 1024} GB` : `${plan.customMediaStorageMb} MB`} custom media uploads`}
                      </List.Item>
                      <List.Item>Products + Blog auto-sync & AI captions</List.Item>
                    </List>

                    {merchant?.isOwner ? (
                      <Badge tone="success">Included Free for Owner</Badge>
                    ) : isCurrent ? (
                      <Badge tone="info">Current Plan</Badge>
                    ) : plan.tier !== "FREE" ? (
                      <BlockStack gap="200">
                        <fetcher.Form method="post">
                          <input type="hidden" name="tier" value={plan.tier} />
                          <input type="hidden" name="method" value="SHOPIFY" />
                          <Button submit variant="primary" fullWidth>
                            Subscribe via Shopify
                          </Button>
                        </fetcher.Form>
                        {enableRazorpayDirect && (
                          <fetcher.Form method="post">
                            <input type="hidden" name="tier" value={plan.tier} />
                            <input type="hidden" name="method" value="RAZORPAY" />
                            <Button submit variant="secondary" fullWidth>
                              Pay via Razorpay (INR/UPI)
                            </Button>
                          </fetcher.Form>
                        )}
                      </BlockStack>
                    ) : null}
                  </BlockStack>
                </Card>
              );
            })}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
