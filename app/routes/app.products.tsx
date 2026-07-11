import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRouteError, isRouteErrorResponse, useSubmit, Form } from "react-router";
import { useAppBridge, TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  EmptyState,
  IndexTable,
  Badge,
  InlineStack
} from "@shopify/polaris";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const productId = formData.get("productId") as string;

  if (!productId) return new Response("Product ID required", { status: 400 });

  if (intent === "delete") {
    await prisma.personalizerConfig.delete({
      where: {
        shop_productId: {
          shop: session.shop,
          productId: productId
        }
      }
    });

    await admin.graphql(`
      mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key }
          userErrors { message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: productId,
          namespace: "embroidery_app",
          key: "config"
        }]
      }
    });

    return { success: true };
  }

  if (intent === "toggleActive") {
    const isActiveStr = formData.get("isActive") as string;
    const newIsActive = isActiveStr === "true";

    const updated = await prisma.personalizerConfig.update({
      where: {
        shop_productId: {
          shop: session.shop,
          productId: productId
        }
      },
      data: { isActive: newIsActive }
    });

    await admin.graphql(`
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { message } }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: productId,
          namespace: "embroidery_app",
          key: "config",
          type: "json",
          value: JSON.stringify({
            zoneX: updated.zoneX,
            zoneY: updated.zoneY,
            zoneWidth: updated.zoneWidth,
            zoneHeight: updated.zoneHeight,
            zoneAngle: updated.zoneAngle,
            isActive: updated.isActive
          })
        }]
      }
    });

    return { success: true };
  }

  return null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const configs = await prisma.personalizerConfig.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return { configs };
};

export default function Products() {
  const { configs } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const shopDomain = configs.length > 0 ? configs[0].shop : "";
  const submit = useSubmit();

  const handleSelectProducts = async () => {
    const payload = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
    });
    
    if (payload && payload.length > 0) {
      const ids = payload.map(p => p.id).join(',');
      navigate(`/app/configure?ids=${encodeURIComponent(ids)}`);
    }
  };

  const productRowMarkup = configs.map(
    ({ id, productId, productHandle, zoneWidth, zoneHeight, zoneAngle, isActive }, index) => {
      const shopUrl = `https://${shopDomain}/products/${productHandle}`;

      return (
        <IndexTable.Row id={id} key={id} position={index}>
          <IndexTable.Cell>
            <div style={{ maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
              <Text variant="bodyMd" fontWeight="bold" as="span" breakWord>
                {productHandle}
              </Text>
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {zoneWidth}% x {zoneHeight}%
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone="info">{`${zoneAngle}°`}</Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {isActive ? (
              <Badge tone="success">Active</Badge>
            ) : (
              <Badge tone="critical">Inactive</Badge>
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack gap="200" align="start">
              <Button size="micro" url={shopUrl} target="_blank">
                View
              </Button>
              <Button size="micro" onClick={() => navigate(`/app/configure?ids=${encodeURIComponent(productId)}`)}>
                Edit
              </Button>
              <Button 
                size="micro" 
                onClick={() => {
                  submit(
                    { intent: "toggleActive", productId, isActive: !isActive ? "true" : "false" },
                    { method: "post" }
                  );
                }}
              >
                {isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button 
                size="micro" 
                tone="critical" 
                onClick={() => {
                  if (confirm("Are you sure you want to delete this configuration?")) {
                    submit({ intent: "delete", productId }, { method: "post" });
                  }
                }}
              >
                Delete
              </Button>
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <Page>
      <TitleBar title="Personalized Products">
        <button variant="primary" onClick={handleSelectProducts}>
          Add Products
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <Card padding="0">
            {configs.length === 0 ? (
              <EmptyState
                heading="No products configured yet"
                action={{
                  content: 'Configure Your First Product',
                  onAction: handleSelectProducts,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Select products from your store and configure where the custom embroidery should appear on their images.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: 'product', plural: 'products' }}
                itemCount={configs.length}
                headings={[
                  { title: 'Product Handle' },
                  { title: 'Embroidery Zone Size' },
                  { title: 'Rotation Angle' },
                  { title: 'Status' },
                  { title: 'Action' },
                ]}
                selectable={false}
              >
                {productRowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = boundary.headers;

export function ErrorBoundary() {
  const error = useRouteError();
  let message = "Unknown Error";
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText} - ${error.data}`;
  } else if (error instanceof Error) {
    message = error.message;
  }
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">An error occurred</Text>
              <Text as="p" variant="bodyMd">{message}</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
