import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRouteError, isRouteErrorResponse } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  EmptyState,
  IndexTable,
  Badge,
  Link,
  Banner
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);

    // Fetch orders containing personalization
    const response = await admin.graphql(
      `#graphql
        query getPersonalizedOrders {
          orders(first: 50, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                customer { firstName lastName email }
                lineItems(first: 20) {
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
    
    const jsonResponse = (await response.json()) as any;
    if (jsonResponse.errors) {
      console.error("[Orders Loader] GraphQL errors:", jsonResponse.errors);
    }

    const allOrders = jsonResponse.data?.orders?.edges || [];
    
    const personalizedOrders = allOrders.filter((o: any) => {
      const lineItemsEdges = o?.node?.lineItems?.edges || [];
      return lineItemsEdges.some((li: any) => {
        const customAttrs = li?.node?.customAttributes || [];
        return Array.isArray(customAttrs) && customAttrs.some((attr: any) => 
          attr?.key === "Personalization_Details" || attr?.key === "Uploaded_Image"
        );
      });
    }).map((o: any) => o.node);

    return { orders: personalizedOrders, error: null };
  } catch (err: any) {
    console.error("[Orders Loader Exception]:", err);
    return { orders: [], error: err?.message || "Failed to fetch orders" };
  }
};

export default function Orders() {
  const { orders, error } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const getCustomerName = (customer: any) => {
    if (!customer) return "Guest";
    const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
    return fullName || customer.email || "Guest";
  };

  // Helper to parse the custom attributes
  const parseDetails = (lineItemsEdges: any[]) => {
    const details = { type: "None", text: "-", font: "-", color: "-", size: "-", image: null as string | null };
    if (!Array.isArray(lineItemsEdges)) return details;

    for (const li of lineItemsEdges) {
      const customAttrs = li?.node?.customAttributes || [];
      if (!Array.isArray(customAttrs)) continue;

      for (const attr of customAttrs) {
        if (!attr || !attr.key) continue;
        if (attr.key === "Uploaded_Image") {
          details.type = "Image";
          details.image = attr.value;
        }
        if (attr.key === "Personalization_Details" && attr.value) {
          const parts = attr.value.split('|').map((p: string) => p.trim());
          parts.forEach((p: string) => {
            if (p.startsWith("Text:")) details.text = p.replace("Text:", "").trim();
            if (p.startsWith("Font:")) details.font = p.replace("Font:", "").trim();
            if (p.startsWith("Color:")) details.color = p.replace("Color:", "").trim();
            if (p.startsWith("Size:")) details.size = p.replace("Size:", "").trim();
            if (p.startsWith("Type:")) {
                details.type = p.replace("Type:", "").trim();
            }
          });
          if (details.type === "None" && details.text !== "-") {
              details.type = "Text";
          }
        }
      }
    }
    return details;
  };

  const safeOrders = orders || [];

  const ordersRowMarkup = safeOrders.map((order: any, index: number) => {
    const lineItemsEdges = order?.lineItems?.edges || [];
    const details = parseDetails(lineItemsEdges);
    return (
      <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "-"}</IndexTable.Cell>
        <IndexTable.Cell>
          {getCustomerName(order.customer)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={details.type === 'Text' ? 'info' : 'success'}>
            {details.type}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {details.image ? (
            <Link url={details.image as string} target="_blank">View Image</Link>
          ) : (
            <Text variant="bodyMd" fontWeight="semibold" as="span">{details.text}</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>{details.font}</IndexTable.Cell>
        <IndexTable.Cell>{details.color}</IndexTable.Cell>
        <IndexTable.Cell>{details.size}</IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page>
      <TitleBar title="Personalized Orders" />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Unable to fetch recent orders">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card padding="0">
            {safeOrders.length === 0 ? (
              <EmptyState
                heading="No personalized orders found in recent orders"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Orders containing custom embroidery will appear here automatically.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: 'order', plural: 'orders' }}
                itemCount={safeOrders.length}
                headings={[
                  { title: 'Order' },
                  { title: 'Date' },
                  { title: 'Customer' },
                  { title: 'Type' },
                  { title: 'Text / Image' },
                  { title: 'Font' },
                  { title: 'Color' },
                  { title: 'Frame Size' },
                ]}
                selectable={false}
              >
                {ordersRowMarkup}
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
  return boundary.error(useRouteError());
}

