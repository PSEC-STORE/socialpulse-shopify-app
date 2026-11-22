import type { ActionFunctionArgs } from "react-router";
import { AnimationPreset, PostSourceType, PostStatus } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generatePlatformCaptions } from "../services/aiCaptions.server";
import { checkPostQuota } from "../services/billing.server";
import { SocialNetworkId } from "../config/plans.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE": {
      const merchant = await prisma.merchant.findUnique({
        where: { shopDomain: shop },
        include: { channels: { where: { isConnected: true, autoPublish: true } } },
      });

      if (!merchant || !merchant.automationEnabled || !merchant.autoPostNewProducts) {
        return new Response("Automation disabled", { status: 200 });
      }

      // Only auto-publish ACTIVE products
      if (payload?.status && String(payload.status).toUpperCase() !== "ACTIVE") {
        return new Response("Skipped non-active product", { status: 200 });
      }

      const quota = await checkPostQuota(prisma, merchant);
      if (!quota.allowed) {
        return new Response("Monthly quota reached", { status: 200 });
      }

      const productGid = `gid://shopify/Product/${payload.id}`;
      // Prevent duplicate scheduling for the same product
      const existing = await prisma.scheduledPost.findFirst({
        where: { merchantId: merchant.id, shopifyResourceId: productGid },
      });
      if (existing) {
        return new Response("Already queued/published", { status: 200 });
      }

      const targetNetworks = merchant.channels.map((c) => c.network) as SocialNetworkId[];
      if (targetNetworks.length === 0) {
        return new Response("No connected auto-publish channels", { status: 200 });
      }

      const mediaUrls: string[] = (payload.images || []).map((img: any) => img.src).filter(Boolean);
      const price = payload.variants?.[0]?.price ? `${payload.variants[0].price}` : undefined;
      const productUrl = `https://${shop}/products/${payload.handle}`;

      const captions = await generatePlatformCaptions({
        sourceType: "SHOPIFY_PRODUCT",
        title: payload.title || "New Product",
        description: (payload.body_html || "").replace(/<[^>]+>/g, " ").trim(),
        priceDisplay: price,
        destinationUrl: productUrl,
        brandVoice: merchant.brandVoice,
        defaultHashtags: merchant.defaultHashtags,
        networks: targetNetworks,
        utmParams: {
          source: merchant.utmSource,
          medium: merchant.utmMedium,
          campaign: merchant.utmCampaign,
        },
      });

      // Add 2-minute buffer so Shopify finishes attaching images before worker pulls media
      const scheduledFor = new Date(Date.now() + merchant.imageBufferMinutes * 60_000);

      await prisma.scheduledPost.create({
        data: {
          merchantId: merchant.id,
          sourceType: PostSourceType.SHOPIFY_PRODUCT,
          shopifyResourceId: productGid,
          title: payload.title || "New Product",
          destinationUrl: productUrl,
          priceDisplay: price,
          targetNetworks,
          captionsJson: captions,
          mediaUrls,
          animationPreset: AnimationPreset.NONE,
          applyWatermark: Boolean(merchant.watermarkLogoUrl),
          scheduledFor,
          status: PostStatus.QUEUED,
        },
      });
      break;
    }

    case "APP_UNINSTALLED":
      await prisma.session.deleteMany({ where: { shop } });
      await prisma.merchant.updateMany({
        where: { shopDomain: shop },
        data: { automationEnabled: false, subscriptionStatus: "UNINSTALLED" },
      });
      break;

    // Mandatory Shopify GDPR Compliance Webhooks
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // SocialPulse does not store end-customer PII
      return new Response("No customer PII stored", { status: 200 });

    case "SHOP_REDACT":
      await prisma.merchant.deleteMany({ where: { shopDomain: shop } });
      await prisma.session.deleteMany({ where: { shop } });
      return new Response("Shop data redacted", { status: 200 });
  }

  return new Response("OK", { status: 200 });
};
