import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRouteError, isRouteErrorResponse } from "react-router";
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
  Badge
} from "@shopify/polaris";

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
    ({ id, productId, productHandle, zoneWidth, zoneHeight, zoneAngle }, index) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {productHandle}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {zoneWidth}% x {zoneHeight}%
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone="info">{zoneAngle}&deg;</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button size="micro" onClick={() => navigate(`/app/configure?ids=${encodeURIComponent(productId)}`)}>
            Edit Configuration
          </Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
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
