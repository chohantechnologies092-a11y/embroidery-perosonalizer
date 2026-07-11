import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useActionData, useNavigate, useRouteError, isRouteErrorResponse } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useState, useEffect } from "react";
import { useAppBridge, TitleBar } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  RangeSlider,
  Banner,
  Button,
  List
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");

  if (!idsParam) {
    throw new Response("Product ID required", { status: 400 });
  }

  const allIds = idsParam.split(',');
  const productId = allIds[0];

  const response = await admin.graphql(
    `#graphql
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          media(first: 1) {
            edges {
              node {
                ... on MediaImage {
                  image {
                    url
                  }
                }
              }
            }
          }
        }
      }`,
    { variables: { id: productId } }
  );

  const jsonResponse = await response.json();
  const product = jsonResponse.data?.product;

  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const config = await prisma.personalizerConfig.findUnique({
    where: {
      shop_productId: {
        shop: session.shop,
        productId: product.id
      }
    }
  });

  let globalSettings = await prisma.globalSettings.findUnique({
    where: { shop: session.shop }
  });
  
  if (!globalSettings) {
    globalSettings = { price2Lines: 5, price3Lines: 6, priceImage: 3, defaultFonts: '["Arial"]', defaultColors: '["#000000"]' } as any;
  }

  return { product, config, globalSettings, allIds };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const productIds = (formData.get("productIds") as string).split(',');
  const zoneX = parseFloat(formData.get("zoneX") as string) || 0;
  const zoneY = parseFloat(formData.get("zoneY") as string) || 0;
  const zoneWidth = parseFloat(formData.get("zoneWidth") as string) || 100;
  const zoneHeight = parseFloat(formData.get("zoneHeight") as string) || 50;
  const zoneAngle = parseFloat(formData.get("zoneAngle") as string) || 0;

  await Promise.all(productIds.map(async (id) => {
    try {
      const pRes = await admin.graphql(`query { product(id: "${id}") { handle } }`);
      const pJson = await pRes.json();
      const productHandle = pJson.data?.product?.handle || "unknown";

      const existing = await prisma.personalizerConfig.findUnique({
        where: { shop_productId: { shop: session.shop, productId: id } }
      });
      const isActive = existing?.isActive ?? true;

      await prisma.personalizerConfig.upsert({
        where: { shop_productId: { shop: session.shop, productId: id } },
        update: { zoneX, zoneY, zoneWidth, zoneHeight, zoneAngle, productHandle },
        create: {
          shop: session.shop,
          productId: id,
          productHandle,
          zoneX, zoneY, zoneWidth, zoneHeight, zoneAngle,
          isActive
        }
      });

      await admin.graphql(`
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { message } }
        }
      `, {
        variables: {
          metafields: [{
            ownerId: id,
            namespace: "embroidery_app",
            key: "config",
            type: "json",
            value: JSON.stringify({ zoneX, zoneY, zoneWidth, zoneHeight, zoneAngle, isActive })
          }]
        }
      });
    } catch(err) {
      console.error(`Failed to configure product ${id}`, err);
    }
  }));

  return { success: true };
};

export default function Configure() {
  const { product, config, globalSettings, allIds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const imageUrl = product.media.edges[0]?.node?.image?.url || "";

  const [zoneX, setZoneX] = useState(config?.zoneX ?? 50);
  const [zoneY, setZoneY] = useState(config?.zoneY ?? 50);
  const [zoneWidth, setZoneWidth] = useState(config?.zoneWidth ?? 30);
  const [zoneHeight, setZoneHeight] = useState(config?.zoneHeight ?? 10);
  const [zoneAngle, setZoneAngle] = useState(config?.zoneAngle ?? 0);

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Configuration saved!");
    }
  }, [actionData, shopify]);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("productIds", allIds.join(','));
    formData.append("zoneX", zoneX.toString());
    formData.append("zoneY", zoneY.toString());
    formData.append("zoneWidth", zoneWidth.toString());
    formData.append("zoneHeight", zoneHeight.toString());
    formData.append("zoneAngle", zoneAngle.toString());
    
    submit(formData, { method: "post" });
  };

  return (
    <Page
      backAction={{ content: 'Products', onAction: () => navigate('/app/products') }}
    >
      <TitleBar title={`Configure Zone for ${product.title}`}>
        <button variant="primary" onClick={handleSave}>
          Save {allIds.length > 1 ? `(${allIds.length} Products)` : "Configuration"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        {allIds.length > 1 && (
          <Banner title="Bulk Configuration Mode" tone="info">
            You are configuring {allIds.length} products simultaneously. The changes you save here will be applied to all selected products instantly.
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Embroidery Zone Preview</Text>
                <Text as="p" tone="subdued">
                  Drag the sliders to adjust the blue box. This determines exactly where the customer's text will be placed on the final image.
                </Text>
                
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', background: '#f4f6f8', border: '1px solid #dfe3e8', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ position: 'relative', display: 'inline-block', boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
                    {imageUrl ? (
                      <img src={imageUrl} alt={product.title} style={{ maxWidth: '100%', maxHeight: '500px', display: 'block' }} />
                    ) : (
                      <div style={{ width: '300px', height: '300px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Image</div>
                    )}
                    
                    <div
                      style={{
                        position: 'absolute',
                        left: `${zoneX}%`,
                        top: `${zoneY}%`,
                        width: `${zoneWidth}%`,
                        height: `${zoneHeight}%`,
                        transform: `translate(-50%, -50%) rotate(${zoneAngle}deg)`,
                        border: '2px dashed #2c6ecb',
                        backgroundColor: 'rgba(44, 110, 203, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#2c6ecb',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        backdropFilter: 'blur(1px)',
                        transformOrigin: 'center center',
                        marginLeft: `${zoneWidth/2}%`,
                        marginTop: `${zoneHeight/2}%`
                      }}
                    >
                      Embroidery Text
                    </div>
                  </div>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Zone Dimensions</Text>
                  
                  <RangeSlider
                    label={`Left (X): ${zoneX}%`}
                    value={zoneX}
                    onChange={(val) => setZoneX(Number(val))}
                    min={0} max={100}
                    output
                  />
                  <RangeSlider
                    label={`Top (Y): ${zoneY}%`}
                    value={zoneY}
                    onChange={(val) => setZoneY(Number(val))}
                    min={0} max={100}
                    output
                  />
                  <RangeSlider
                    label={`Width: ${zoneWidth}%`}
                    value={zoneWidth}
                    onChange={(val) => setZoneWidth(Number(val))}
                    min={5} max={100}
                    output
                  />
                  <RangeSlider
                    label={`Height: ${zoneHeight}%`}
                    value={zoneHeight}
                    onChange={(val) => setZoneHeight(Number(val))}
                    min={5} max={100}
                    output
                  />
                  <RangeSlider
                    label={`Angle: ${zoneAngle}°`}
                    value={zoneAngle}
                    onChange={(val) => setZoneAngle(Number(val))}
                    min={-180} max={180}
                    output
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Global Settings Overview</Text>
                  <Text as="p" tone="subdued">
                    Fonts, Colors, and Pricing are applied globally across all products.
                  </Text>
                  <List type="bullet">
                    <List.Item>2 Lines: £{globalSettings?.price2Lines}</List.Item>
                    <List.Item>3 Lines: £{globalSettings?.price3Lines}</List.Item>
                    <List.Item>Image Upload: £{globalSettings?.priceImage}</List.Item>
                  </List>
                  <Button onClick={() => navigate('/app/settings')}>
                    Edit Global Settings
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
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
