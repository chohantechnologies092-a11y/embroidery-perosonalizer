import {
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  // Fetch orders containing personalization
  const response = await admin.graphql(`#graphql
      query getPersonalizedOrders {
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
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
      }`);
  const jsonResponse = await response.json();
  const allOrders = jsonResponse.data?.orders?.edges || [];
  const personalizedOrders = allOrders
    .filter((o) => {
      return o.node.lineItems.edges.some((li) =>
        li.node.customAttributes.some(
          (attr) =>
            attr.key === "Personalization_Details" ||
            attr.key === "Uploaded_Image",
        ),
      );
    })
    .map((o) => o.node);

  return { orders: personalizedOrders };
};

export default function Orders() {
  const { orders } = useLoaderData();
  const navigate = useNavigate();

  // Helper to parse the custom attributes
  const parseDetails = (lineItems) => {
    const details = {
      type: "None",
      text: "-",
      font: "-",
      color: "-",
      size: "-",
      image: null,
    };

    for (const li of lineItems) {
      for (const attr of li.node.customAttributes) {
        if (attr.key === "Uploaded_Image") {
          details.type = "Image";
          details.image = attr.value;
        }

        if (attr.key === "Personalization_Details") {
          const parts = attr.value.split("|").map((p) => p.trim());

          parts.forEach((p) => {
            if (p.startsWith("Text:"))
              details.text = p.replace("Text:", "").trim();
            if (p.startsWith("Font:"))
              details.font = p.replace("Font:", "").trim();
            if (p.startsWith("Color:"))
              details.color = p.replace("Color:", "").trim();
            if (p.startsWith("Size:"))
              details.size = p.replace("Size:", "").trim();

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

  const ordersRowMarkup = orders.map((order, index) => {
    const details = parseDetails(order.lineItems.edges);

    return (
      <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(order.createdAt).toLocaleDateString()}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {order.customer
            ? `${order.customer.firstName} ${order.customer.lastName}`
            : "Guest"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={details.type === "Text" ? "info" : "success"}>
            {details.type}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {details.image ? (
            <Link url={details.image} target="_blank">
              View Image
            </Link>
          ) : (
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {details.text}
            </Text>
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
        <Layout.Section>
          <Card padding="0">
            {orders.length === 0 ? (
              <EmptyState
                heading="No personalized orders found in the last 50 orders"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Orders containing custom embroidery will appear here
                  automatically.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "order", plural: "orders" }}
                itemCount={orders.length}
                headings={[
                  { title: "Order" },
                  { title: "Date" },
                  { title: "Customer" },
                  { title: "Type" },
                  { title: "Text / Image" },
                  { title: "Font" },
                  { title: "Color" },
                  { title: "Frame Size" },
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
              <Text as="h2" variant="headingMd">
                An error occurred
              </Text>
              <Text as="p" variant="bodyMd">
                {message}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
