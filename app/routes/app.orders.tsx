import { useState } from "react";
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
  InlineStack,
  EmptyState,
  IndexTable,
  Badge,
  Link,
  Banner,
  Button,
  Modal,
  Box,
  Divider,
  Thumbnail
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

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
                lineItems(first: 20) {
                  edges {
                    node {
                      title
                      variant {
                        image {
                          url
                        }
                      }
                      product {
                        featuredImage {
                          url
                        }
                      }
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
        return Array.isArray(customAttrs) && customAttrs.some((attr: any) => {
          const k = (attr?.key || "").toLowerCase();
          const v = (attr?.value || "").toLowerCase();
          return k.includes("personalization") || k.includes("image") || k.includes("custom") || v.includes("font") || v.includes("http");
        });
      });
    }).map((o: any) => o.node);

    return { orders: personalizedOrders, shop, error: null };
  } catch (err: any) {
    console.error("[Orders Loader Exception]:", err);
    return { orders: [], shop: "", error: err?.message || "Failed to fetch orders" };
  }
};

interface ParsedDetails {
  type: string;
  text: string;
  lines: string[];
  font: string;
  color: string;
  size: string;
  image: string | null;
  productImage: string | null;
  placement: { x: number; y: number } | null;
  angle: number;
  allAttributes: { key: string; value: string }[];
}

const parseDetails = (lineItemsEdges: any[]): ParsedDetails => {
  const details: ParsedDetails = {
    type: "None",
    text: "-",
    lines: [],
    font: "-",
    color: "-",
    size: "-",
    image: null,
    productImage: null,
    placement: null,
    angle: 0,
    allAttributes: [],
  };

  if (!Array.isArray(lineItemsEdges)) return details;

  for (const li of lineItemsEdges) {
    const pImg = li?.node?.variant?.image?.url || li?.node?.product?.featuredImage?.url;
    if (pImg && !details.productImage) {
      details.productImage = pImg;
    }

    const customAttrs = li?.node?.customAttributes || [];
    if (!Array.isArray(customAttrs)) continue;

    for (const attr of customAttrs) {
      if (!attr || !attr.key) continue;

      const rawKey = attr.key.trim();
      const rawVal = (attr.value || "").trim();
      if (!rawVal) continue;
      
      details.allAttributes.push({ key: rawKey, value: rawVal });
      const keyLower = rawKey.toLowerCase();

      // Image URL detection
      if (
        keyLower.includes("image") ||
        keyLower.includes("photo") ||
        keyLower.includes("file") ||
        rawVal.startsWith("http://") ||
        rawVal.startsWith("https://") ||
        rawVal.startsWith("//cdn.shopify") ||
        rawVal.startsWith("data:image")
      ) {
        if (rawVal.startsWith("http") || rawVal.startsWith("//") || rawVal.startsWith("data:image")) {
          details.image = rawVal.startsWith("//") ? `https:${rawVal}` : rawVal;
          details.type = "Image Upload";
        }
      }

      // Personalization details parsing
      if (
        keyLower.includes("personalization") ||
        keyLower.includes("details") ||
        keyLower.includes("custom") ||
        keyLower.includes("text") ||
        rawVal.includes("Color:") ||
        rawVal.includes("Font:") ||
        rawVal.includes("Placement:")
      ) {
        const parts = rawVal.split("|").map((p: string) => p.trim());
        parts.forEach((part: string) => {
          const lowerPart = part.toLowerCase();
          if (lowerPart.startsWith("type:")) {
            details.type = part.replace(/^type:/i, "").trim();
          } else if (lowerPart.startsWith("font:")) {
            details.font = part.replace(/^font:/i, "").trim();
          } else if (lowerPart.startsWith("color:")) {
            details.color = part.replace(/^color:/i, "").trim();
          } else if (lowerPart.startsWith("size:") || lowerPart.startsWith("frame:")) {
            details.size = part.replace(/^(size|frame):/i, "").trim();
          } else if (lowerPart.startsWith("angle:")) {
            const angleStr = part.replace(/^angle:/i, "").replace("°", "").trim();
            const parsedAngle = parseFloat(angleStr);
            if (!isNaN(parsedAngle)) details.angle = parsedAngle;
          } else if (lowerPart.startsWith("placement:")) {
            const matchX = part.match(/X:\s*(\d+(?:\.\d+)?)%/i);
            const matchY = part.match(/Y:\s*(\d+(?:\.\d+)?)%/i);
            if (matchX && matchY) {
              details.placement = {
                x: parseFloat(matchX[1]),
                y: parseFloat(matchY[1]),
              };
            }
          } else if (lowerPart.startsWith("text:")) {
            const txt = part.replace(/^text:/i, "").trim();
            if (txt) details.lines.push(txt);
          } else if (lowerPart.match(/^line\s*\d+:/)) {
            const lineContent = part.replace(/^line\s*\d+:/i, "").trim();
            if (lineContent) {
              const frameMarker = "(Frame:";
              const frameIdx = lineContent.indexOf(frameMarker);
              
              if (frameIdx !== -1) {
                const textPart = lineContent.substring(0, frameIdx).trim();
                const framePart = lineContent.substring(frameIdx + frameMarker.length).replace(/\)+\s*$/, "").trim();
                
                if (textPart) details.lines.push(textPart);
                if (framePart && details.size === "-") details.size = framePart;
              } else {
                details.lines.push(lineContent);
              }
            }
          }
        });
      }
    }
  }

  if (details.lines.length > 0) {
    details.text = details.lines.join(" | ");
  }

  if (details.type === "None" || details.type.toLowerCase() === "none") {
    if (details.image) {
      details.type = "Image Upload";
    } else if (details.text !== "-" || details.font !== "-" || details.color !== "-") {
      details.type = "Text";
    }
  }

  return details;
};

export default function Orders() {
  const { orders, shop, error } = useLoaderData<typeof loader>();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const safeOrders = orders || [];

  const getAdminOrderUrl = (orderId: string) => {
    const numericId = orderId.split('/').pop();
    const cleanShop = (shop || "").replace('.myshopify.com', '');
    if (cleanShop && numericId) {
      return `https://admin.shopify.com/store/${cleanShop}/orders/${numericId}`;
    }
    return null;
  };

  const selectedDetails = selectedOrder
    ? parseDetails(selectedOrder?.lineItems?.edges || [])
    : null;

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
          <Badge tone={details.type.toLowerCase().includes('image') ? 'success' : 'info'}>
            {details.type}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {details.image ? (
            <InlineStack gap="200" align="start" blockAlign="center">
              <img
                src={details.image}
                alt="Personalization preview"
                style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e1e3e5" }}
              />
              <Link url={details.image} target="_blank">View Image</Link>
            </InlineStack>
          ) : (
            <Text variant="bodyMd" fontWeight="semibold" as="span">{details.text}</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>{details.font}</IndexTable.Cell>
        <IndexTable.Cell>{details.color}</IndexTable.Cell>
        <IndexTable.Cell>{details.size}</IndexTable.Cell>
        <IndexTable.Cell>
          <Button size="micro" onClick={() => setSelectedOrder(order)}>
            View Details
          </Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page>
      <style>{`
        @font-face {
          font-family: 'Disneycute';
          src: url('https://cdn.shopify.com/s/files/1/0759/5386/4882/files/Disneycute.otf?v=1784549011') format('opentype');
          font-weight: normal;
          font-style: normal;
        }
        @font-face {
          font-family: 'Relitha';
          src: url('https://cdn.shopify.com/s/files/1/0759/5386/4882/files/relitha.otf?v=1784549010') format('opentype');
          font-weight: normal;
          font-style: normal;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Pacifico&display=swap');
      `}</style>
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
                  { title: 'Type' },
                  { title: 'Text / Image' },
                  { title: 'Font' },
                  { title: 'Color' },
                  { title: 'Frame Size' },
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

      {/* Order Details Modal */}
      {selectedOrder && selectedDetails && (
        <Modal
          open={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`Order Details - ${selectedOrder.name}`}
          primaryAction={
            getAdminOrderUrl(selectedOrder.id)
              ? {
                  content: "Open Order in Shopify Admin",
                  onAction: () => {
                    const url = getAdminOrderUrl(selectedOrder.id);
                    if (url) window.open(url, "_blank");
                  },
                }
              : undefined
          }
          secondaryActions={[
            {
              content: "Close",
              onAction: () => setSelectedOrder(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingSm">Order Date: {new Date(selectedOrder.createdAt).toLocaleString()}</Text>
                <Badge tone={selectedDetails.type.toLowerCase().includes('image') ? 'success' : 'info'}>
                  {selectedDetails.type}
                </Badge>
              </InlineStack>

              <Divider />

              {/* Visual Embroidery Placement Preview Box with Circular Frame Overlay */}
              {selectedDetails.productImage && (
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200" align="center">
                    <Text as="h4" variant="headingXs" fontWeight="bold">
                      Visual Placement Preview (Where Customer Placed Embroidery)
                    </Text>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        maxWidth: "360px",
                        height: "360px",
                        borderRadius: "12px",
                        overflow: "hidden",
                        border: "2px solid #ddd",
                        backgroundColor: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto",
                      }}
                    >
                      <img
                        src={selectedDetails.productImage}
                        alt="Product base"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />

                      {/* Dotted Circular Frame Overlay placed at exact X%, Y% and rotated by Angle */}
                      {selectedDetails.placement && (
                        <div
                          style={{
                            position: "absolute",
                            left: `${selectedDetails.placement.x}%`,
                            top: `${selectedDetails.placement.y}%`,
                            transform: `translate(-50%, -50%) rotate(${selectedDetails.angle}deg)`,
                            width: "100px",
                            height: "100px",
                            borderRadius: "50%",
                            border: "2px dotted rgba(44, 110, 203, 0.85)",
                            backgroundColor: "rgba(44, 110, 203, 0.12)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxSizing: "border-box",
                            pointerEvents: "none",
                            zIndex: 10,
                            padding: "6px",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                          }}
                        >
                          <span
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              color: selectedDetails.color !== "-" ? selectedDetails.color : "#000",
                              fontFamily: selectedDetails.font !== "-" ? `"${selectedDetails.font}", sans-serif` : "sans-serif",
                              fontSize: "16px",
                              fontWeight: "normal",
                              textAlign: "center",
                              wordBreak: "break-word",
                              lineHeight: 1.2,
                            }}
                          >
                            {selectedDetails.lines.length > 0 ? (
                              selectedDetails.lines.map((line, idx) => (
                                <div key={idx}>{line}</div>
                              ))
                            ) : (
                              <div>Sample</div>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedDetails.placement && (
                      <Badge tone="info">
                        {`Placement: X ${selectedDetails.placement.x}%, Y ${selectedDetails.placement.y}% | Rotation: ${selectedDetails.angle}°`}
                      </Badge>
                    )}
                  </BlockStack>
                </Box>
              )}

              {/* Uploaded Image Box */}
              {selectedDetails.image && (
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200" align="center">
                    <Text as="h4" variant="headingXs" fontWeight="bold">Uploaded Custom Image</Text>
                    <img
                      src={selectedDetails.image}
                      alt="Uploaded embroidery preview"
                      style={{ maxWidth: "100%", maxHeight: "300px", borderRadius: "8px", border: "1px solid #ccc" }}
                    />
                    <Link url={selectedDetails.image} target="_blank">
                      Download / Open Full High-Res Image
                    </Link>
                  </BlockStack>
                </Box>
              )}

              {/* Styled Detail Card Boxes Grid */}
              <Box padding="300">
                <BlockStack gap="300">
                  <Text as="h4" variant="headingSm" fontWeight="bold">
                    Personalization Details Breakdown
                  </Text>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    {/* Box 1: Text Lines */}
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        backgroundColor: "#f6f6f7",
                        border: "1px solid #e1e3e5",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <Text as="h5" variant="headingXs" tone="subdued">
                        ✍️ EMBROIDERY TEXT
                      </Text>
                      <div style={{ marginTop: "6px" }}>
                        <Text as="p" variant="bodyLg" fontWeight="bold">
                          {selectedDetails.lines.length > 0
                            ? selectedDetails.lines.join(" | ")
                            : selectedDetails.text}
                        </Text>
                      </div>
                    </div>

                    {/* Box 2: Selected Font */}
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        backgroundColor: "#f6f6f7",
                        border: "1px solid #e1e3e5",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <Text as="h5" variant="headingXs" tone="subdued">
                        🔤 SELECTED FONT
                      </Text>
                      <div style={{ marginTop: "6px" }}>
                        <span
                          style={{
                            fontFamily: selectedDetails.font !== "-" ? `"${selectedDetails.font}", sans-serif` : "sans-serif",
                            fontSize: "18px",
                            fontWeight: "bold",
                            color: "#1a1a1a",
                          }}
                        >
                          {selectedDetails.font}
                        </span>
                      </div>
                    </div>

                    {/* Box 3: Thread Color */}
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        backgroundColor: "#f6f6f7",
                        border: "1px solid #e1e3e5",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <Text as="h5" variant="headingXs" tone="subdued">
                        🧵 THREAD / FILL COLOR
                      </Text>
                      <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            backgroundColor: selectedDetails.color !== "-" ? selectedDetails.color : "#000",
                            border: "1px solid #ccc",
                            display: "inline-block",
                          }}
                        />
                        <Text as="p" variant="bodyLg" fontWeight="bold">
                          {selectedDetails.color}
                        </Text>
                      </div>
                    </div>

                    {/* Box 4: Frame Size & Price */}
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        backgroundColor: "#f6f6f7",
                        border: "1px solid #e1e3e5",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <Text as="h5" variant="headingXs" tone="subdued">
                        📐 FRAME SIZE & ADD-ON
                      </Text>
                      <div style={{ marginTop: "6px" }}>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {selectedDetails.size}
                        </Text>
                      </div>
                    </div>
                  </div>
                </BlockStack>
              </Box>

              <Divider />

              {/* Raw Custom Attributes List */}
              <Box padding="300">
                <BlockStack gap="200">
                  <Text as="h4" variant="headingXs" fontWeight="bold">All Custom Line Item Attributes</Text>
                  {selectedDetails.allAttributes.length === 0 ? (
                    <Text as="p" tone="subdued">No raw attributes found.</Text>
                  ) : (
                    selectedDetails.allAttributes.map((attr, idx) => (
                      <Box key={idx} padding="200" background="bg-surface-tertiary" borderRadius="100">
                        <Text as="p" variant="bodySm">
                          <strong>{attr.key}:</strong> {attr.value}
                        </Text>
                      </Box>
                    ))
                  )}
                </BlockStack>
              </Box>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}

export const headers = boundary.headers;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}


