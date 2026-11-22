import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { Page, Layout, Card, BlockStack, InlineGrid, Text, Badge, Button, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { GLOBAL_SOCIAL_NETWORKS, PLANS } from "../config/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const merchant = await prisma.merchant.findUnique({
    where: { shopDomain: session.shop },
    include: {
      channels: true,
      scheduledPosts: { orderBy: { scheduledFor: "asc" }, take: 10 },
      customMedia: { orderBy: { createdAt: "desc" }, take: 6 },
    },
  });

  // Fetch latest active Shopify products & blog articles via Admin GraphQL API
  const catalogRes = await admin.graphql(`#graphql
    query GetProductsAndArticles {
      products(first: 10, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          status
          totalInventory
          featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
      articles(first: 10, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          publishedAt
          image { url }
        }
      }
    }
  `);
  const catalogJson = await catalogRes.json();

  return {
    merchant,
    plan: merchant ? PLANS[merchant.planTier] : PLANS.FREE,
    products: catalogJson.data?.products?.nodes || [],
    articles: catalogJson.data?.articles?.nodes || [],
    networksCount: GLOBAL_SOCIAL_NETWORKS.length,
  };
};

export default function DashboardPage() {
  const { merchant, plan, products, articles, networksCount } = useLoaderData<typeof loader>();

  return (
    <Page
      title="SocialPulse Auto-Sync"
      subtitle="Automated Shopify Products, Blogs, Showcase Animations & Custom Media Publisher"
      primaryAction={{ content: "Plans & Billing", url: "/app/billing" }}
      secondaryActions={
        merchant?.isOwner
          ? [{ content: "Psecstore Owner Console", url: "/app/owner" }]
          : []
      }
    >
      <Layout>
        <Layout.Section>
          {merchant?.isOwner ? (
            <Banner title="Psecstore Owner Mode — Unlimited Free Access" tone="success">
              <p>
                Connected as <strong>{merchant.ownerEmail}</strong>. All 14+ global networks,
                FFmpeg product animations, custom media uploads, and automated blog/product drip
                scheduling are unlocked at $0 forever.
              </p>
            </Banner>
          ) : (
            <Banner title={`Active Plan: ${plan.name}`} tone="info">
              <p>
                Used {merchant?.postsUsedThisMonth ?? 0} of{" "}
                {plan.monthlyPostLimit === -1 ? "Unlimited" : plan.monthlyPostLimit} monthly posts
                across all {networksCount} global social networks.
              </p>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Synced Products</Text>
                <Text as="h2" variant="headingXl">{products.length}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Synced Blog Articles</Text>
                <Text as="h2" variant="headingXl">{articles.length}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Global Networks Supported</Text>
                <Text as="h2" variant="headingXl">{networksCount}+</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Queued Posts</Text>
                <Text as="h2" variant="headingXl">{merchant?.scheduledPosts?.length ?? 0}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Next Steps in Your Workspace</Text>
              <Text as="p">
                Manage custom media uploads, generate animated product showcase reels (Ken Burns,
                Price Badge Pop, Flash Sale Pulse, Luxury Spotlight), and configure auto-posting
                across TikTok, LinkedIn, Pinterest, X, Instagram, Facebook, YouTube Shorts, Threads,
                Bluesky, Reddit, Snapchat, Telegram, Google Business Profile & Tumblr.
              </Text>
              <InlineGrid columns={3} gap="300">
                <Link to="/app/media">
                  <Button fullWidth variant="primary">Animation Studio & Custom Media</Button>
                </Link>
                <Link to="/app/billing">
                  <Button fullWidth>Manage Plan & Subscriptions</Button>
                </Link>
                {merchant?.isOwner && (
                  <Link to="/app/owner">
                    <Button fullWidth tone="success">Open Psecstore Owner Console</Button>
                  </Link>
                )}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
