import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRouteError, isRouteErrorResponse } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  IndexTable,
  Badge,
  EmptyState
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const configs = await prisma.personalizerConfig.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  const response = await admin.graphql(
    `#graphql
      query getRecentPersonalizedOrders {
        orders(first: 10, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              customer { firstName lastName }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }`
  );
  
  const jsonResponse = await response.json();
  const allOrders = jsonResponse.data?.orders?.edges || [];
  
  const personalizedOrders = allOrders.filter((o: any) => {
    return o.node.lineItems.edges.some((li: any) => 
      li.node.customAttributes.some((attr: any) => attr.key === "Personalization_Details" || attr.key === "Uploaded_Image")
    );
  }).map((o: any) => o.node).slice(0, 5);

  return { configs, recentOrders: personalizedOrders };
};

export default function Index() {
  const { configs, recentOrders } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const ordersRowMarkup = recentOrders.map(
    ({ id, name, createdAt, customer }: any, index: number) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{new Date(createdAt).toLocaleDateString()}</IndexTable.Cell>
        <IndexTable.Cell>
          {customer ? `${customer.firstName} ${customer.lastName}` : "Guest"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button size="micro" onClick={() => navigate('/app/orders')}>
            View Details
          </Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page>
      <TitleBar title="Embroidery Personalizer Dashboard">
        <button variant="primary" onClick={() => navigate('/app/settings')}>
          Global Settings
        </button>
      </TitleBar>

      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card background="bg-surface-success">
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Total Configured Products
                </Text>
                <Text as="p" variant="heading3xl" tone="success">
                  {configs.length}
                </Text>
                <InlineStack align="end">
                    <Button onClick={() => navigate('/app/products')}>Manage Products</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card background="bg-surface-info">
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Recent Personalized Orders
                </Text>
                <Text as="p" variant="heading3xl" tone="info">
                  {recentOrders.length}
                </Text>
                <InlineStack align="end">
                    <Button onClick={() => navigate('/app/orders')}>View All Orders</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card padding="0">
              {recentOrders.length === 0 ? (
                <EmptyState
                  heading="No personalized orders found yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>When customers purchase items with custom embroidery, they will appear here.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: 'order', plural: 'orders' }}
                  itemCount={recentOrders.length}
                  headings={[
                    { title: 'Order' },
                    { title: 'Date' },
                    { title: 'Customer' },
                    { title: 'Action' },
                  ]}
                  selectable={false}
                >
                  {ordersRowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
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
