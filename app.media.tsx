import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { Page, Layout, Card, BlockStack, TextField, Select, Button, Banner, Text, InlineGrid } from "@shopify/polaris";
import { useState } from "react";
import { AnimationPreset, PostSourceType, PostStatus } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkAnimationQuota, checkStorageQuota } from "../services/billing.server";
import { GLOBAL_SOCIAL_NETWORKS } from "../config/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await prisma.merchant.findUnique({
    where: { shopDomain: session.shop },
    include: { customMedia: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  return { merchant, networks: GLOBAL_SOCIAL_NETWORKS };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await prisma.merchant.findUnique({ where: { shopDomain: session.shop } });
  if (!merchant) return Response.json({ error: "Merchant not found" }, { status: 404 });

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "ADD_CUSTOM_MEDIA") {
    const storageCheck = checkStorageQuota(merchant, 2.5);
    if (!storageCheck.allowed) return Response.json({ error: storageCheck.reason }, { status: 402 });

    await prisma.customMedia.create({
      data: {
        merchantId: merchant.id,
        title: String(formData.get("title") || "Custom Asset"),
        mimeType: String(formData.get("mimeType") || "image/jpeg"),
        url: String(formData.get("mediaUrl")),
        sizeMb: 2.5,
      },
    });
    return Response.json({ ok: true, message: "Custom media added to your library." });
  }

  if (intent === "CREATE_ANIMATED_POST") {
    const animQuota = await checkAnimationQuota(prisma, merchant);
    if (!animQuota.allowed) return Response.json({ error: animQuota.reason }, { status: 402 });

    const title = String(formData.get("title") || "Product Showcase");
    const mediaUrl = String(formData.get("mediaUrl"));
    const preset = String(formData.get("preset") || "KEN_BURNS_ZOOM") as AnimationPreset;
    const priceDisplay = String(formData.get("priceDisplay") || "");
    const overlayText = String(formData.get("overlayText") || title);
    const allNetworkIds = GLOBAL_SOCIAL_NETWORKS.map((n) => n.id);

    await prisma.scheduledPost.create({
      data: {
        merchantId: merchant.id,
        sourceType: PostSourceType.ANIMATED_SHOWCASE,
        title,
        priceDisplay: priceDisplay || null,
        customOverlayText: overlayText,
        mediaUrls: [mediaUrl],
        animationPreset: preset,
        applyWatermark: Boolean(merchant.watermarkLogoUrl),
        targetNetworks: allNetworkIds,
        captionsJson: Object.fromEntries(allNetworkIds.map((id) => [id, `${title} ${priceDisplay}`])),
        scheduledFor: new Date(),
        status: PostStatus.QUEUED,
      },
    });

    return Response.json({ ok: true, message: "Product animation queued for rendering & posting!" });
  }

  return Response.json({ ok: true });
};

export default function MediaAndAnimationPage() {
  const { merchant } = useLoaderData<typeof loader>();
  const [title, setTitle] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("₹1,499");
  const [preset, setPreset] = useState("KEN_BURNS_ZOOM");

  return (
    <Page title="Product Animation Studio & Custom Media" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <Form method="post">
                <input type="hidden" name="intent" value="CREATE_ANIMATED_POST" />
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Create Animated Product Showcase Reel</Text>
                  <TextField label="Product / Campaign Title" name="title" value={title} onChange={setTitle} autoComplete="off" />
                  <TextField label="Product Photo or Custom Image URL (HTTPS)" name="mediaUrl" value={mediaUrl} onChange={setMediaUrl} autoComplete="off" />
                  <TextField label="Price Badge Overlay (Optional)" name="priceDisplay" value={priceDisplay} onChange={setPriceDisplay} autoComplete="off" />
                  <Select
                    label="Animation Template"
                    name="preset"
                    value={preset}
                    onChange={setPreset}
                    options={[
                      { label: "Ken Burns Cinematic Zoom (9:16 / 1:1)", value: "KEN_BURNS_ZOOM" },
                      { label: "Price Drop Badge Pop-In", value: "PRICE_BADGE_POP" },
                      { label: "Multi-Angle Slide Carousel Reel", value: "SLIDE_CAROUSEL_REEL" },
                      { label: "Luxury Spotlight Vignette", value: "SPOTLIGHT_LUXURY" },
                      { label: "Flash Sale High-Energy Pulse", value: "FLASH_SALE_PULSE" },
                    ]}
                  />
                  <Button submit variant="primary">Render Animation & Queue to All Socials</Button>
                </BlockStack>
              </Form>
            </Card>

            <Card>
              <Form method="post">
                <input type="hidden" name="intent" value="ADD_CUSTOM_MEDIA" />
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Upload / Register Custom Media</Text>
                  <Text as="p" tone="subdued">
                    Add your own lifestyle photos, behind-the-scenes clips, festive banners, or promo
                    videos to mix alongside automatic Shopify product & blog posts.
                  </Text>
                  <TextField label="Asset Name" name="title" value={title} onChange={setTitle} autoComplete="off" />
                  <TextField label="Public Media URL (R2 / S3 / Shopify Files)" name="mediaUrl" value={mediaUrl} onChange={setMediaUrl} autoComplete="off" />
                  <Button submit>Save to Custom Media Library</Button>
                  <Banner tone="info">
                    <p>Library items saved: {merchant?.customMedia?.length ?? 0}</p>
                  </Banner>
                </BlockStack>
              </Form>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
