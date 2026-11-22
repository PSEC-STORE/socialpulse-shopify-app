import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { Page, Layout, Card, IndexTable, Badge, Text, Banner, Button, InlineGrid, BlockStack } from "@shopify/polaris";
import { PlanTier } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isOwnerAccount, OWNER_EMAIL, OWNER_ORG_NAME } from "../services/owner.server";
import { PLANS } from "../config/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const currentMerchant = await prisma.merchant.findUnique({ where: { shopDomain: session.shop } });

  if (!currentMerchant || !isOwnerAccount(currentMerchant.ownerEmail, currentMerchant.shopDomain)) {
    throw new Response("Forbidden — Owner Access Only (Psecstore)", { status: 403 });
  }

  const allMerchants = await prisma.merchant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { scheduledPosts: true, channels: true } } },
  });

  const mrrUsd = allMerchants.reduce((sum, m) => {
    if (m.isOwner || m.subscriptionStatus !== "ACTIVE") return sum;
    return sum + (PLANS[m.planTier]?.priceUsdMonthly || 0);
  }, 0);

  return { allMerchants, mrrUsd, ownerEmail: OWNER_EMAIL, ownerOrg: OWNER_ORG_NAME };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const currentMerchant = await prisma.merchant.findUnique({ where: { shopDomain: session.shop } });
  if (!currentMerchant?.isOwner) throw new Response("Forbidden", { status: 403 });

  const formData = await request.formData();
  const targetMerchantId = String(formData.get("merchantId"));
  const newTier = String(formData.get("planTier")) as PlanTier;

  await prisma.merchant.update({
    where: { id: targetMerchantId },
    data: { planTier: newTier, subscriptionStatus: "ACTIVE" },
  });

  return { updated: true };
};

export default function OwnerConsolePage() {
  const { allMerchants, mrrUsd, ownerEmail, ownerOrg } = useLoaderData<typeof loader>();

  return (
    <Page title={`${ownerOrg} Super-Admin Console`} subtitle={`Authenticated Owner: ${ownerEmail}`}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Installed Customer Stores</Text>
                <Text as="h2" variant="headingXl">{allMerchants.length}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Estimated Monthly Revenue (MRR)</Text>
                <Text as="h2" variant="headingXl">${mrrUsd.toLocaleString()}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" tone="subdued">Owner Billing Status</Text>
                <Badge tone="success">100% Free Lifetime Access</Badge>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              itemCount={allMerchants.length}
              selectable={false}
              headings={[
                { title: "Store" },
                { title: "Email" },
                { title: "Plan" },
                { title: "Billing" },
                { title: "Posts Used" },
                { title: "Owner Override" },
              ]}
            >
              {allMerchants.map((m, idx) => (
                <IndexTable.Row id={m.id} key={m.id} position={idx}>
                  <IndexTable.Cell>{m.shopDomain}</IndexTable.Cell>
                  <IndexTable.Cell>{m.ownerEmail}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={m.isOwner ? "success" : "info"}>{m.planTier}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{m.billingProvider}</IndexTable.Cell>
                  <IndexTable.Cell>{m.isOwner ? "∞ Unlimited" : m.postsUsedThisMonth}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {!m.isOwner && (
                      <Form method="post">
                        <input type="hidden" name="merchantId" value={m.id} />
                        <input type="hidden" name="planTier" value="PRO_AGENCY" />
                        <Button submit size="slim">Grant Pro</Button>
                      </Form>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
