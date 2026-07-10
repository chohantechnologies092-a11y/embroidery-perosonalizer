import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState } from "react";
import { useAppBridge, TitleBar } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  TextField,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  let settings = await prisma.globalSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings) {
    settings = await prisma.globalSettings.create({
      data: { shop: session.shop },
    });
  }

  return { settings };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "setup_addon") {
    const price2 = parseFloat(formData.get("price2Lines")) || 5;
    const price3 = parseFloat(formData.get("price3Lines")) || 6;
    let frameSizes = [];

    try {
      frameSizes = JSON.parse(formData.get("frameSizes"));
    } catch {
      frameSizes = [
        { name: "12cm", price: "4.00" },
        { name: "15cm", price: "6.00" },
        { name: "18cm", price: "8.00" },
      ];
    }

    const variants = [];
    const optionValues = [];

    frameSizes.forEach((size) => {
      optionValues.push({ name: `${size.name} (1 Line)` });
      optionValues.push({ name: `${size.name} (2 Lines)` });
      optionValues.push({ name: `${size.name} (3 Lines)` });
      const basePrice = parseFloat(size.price);

      variants.push({
        optionValues: [
          { optionName: "Frame Size", name: `${size.name} (1 Line)` },
        ],
        price: basePrice.toFixed(2),
      });
      variants.push({
        optionValues: [
          { optionName: "Frame Size", name: `${size.name} (2 Lines)` },
        ],
        price: (basePrice + price2).toFixed(2),
      });
      variants.push({
        optionValues: [
          { optionName: "Frame Size", name: `${size.name} (3 Lines)` },
        ],
        price: (basePrice + price3).toFixed(2),
      });
    });
    const createResponse = await admin.graphql(
      `
      mutation productSet($synchronous: Boolean!, $input: ProductSetInput!) {
        productSet(synchronous: $synchronous, input: $input) {
          product { 
            id 
            variants(first: 50) { edges { node { id title price } } }
          }
          userErrors { message }
        }
      }
    `,
      {
        variables: {
          synchronous: true,
          input: {
            title: "Embroidery Add-on (Hidden)",
            status: "ACTIVE",
            productOptions: [
              {
                name: "Frame Size",
                values: [...optionValues, { name: "Image Upload" }],
              },
            ],
            variants: [
              ...variants,
              {
                optionValues: [
                  { optionName: "Frame Size", name: "Image Upload" },
                ],
                price: parseFloat(formData.get("priceImage") || "3").toFixed(2),
              },
            ],
          },
        },
      },
    );
    const createJson = await createResponse.json();
    const newProduct = createJson.data?.productSet?.product;

    if (newProduct) {
      await prisma.globalSettings.upsert({
        where: { shop: session.shop },
        update: { addonProductId: newProduct.id },
        create: { shop: session.shop, addonProductId: newProduct.id },
      });
      const addonVariants = newProduct.variants.edges.map((e) => ({
        id: e.node.id.split("/").pop(),
        title: e.node.title,
        price: e.node.price,
      }));
      const shopQuery = await admin.graphql(`{ shop { id } }`);
      const shopData = await shopQuery.json();
      const shopId = shopData.data.shop.id;
      const defaultColors = formData.get("defaultColors") || "[]";

      await admin.graphql(
        `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { message } }
        }
      `,
        {
          variables: {
            metafields: [
              {
                ownerId: shopId,
                namespace: "embroidery_app",
                key: "settings",
                type: "json",
                value: JSON.stringify({
                  colors: JSON.parse(defaultColors),
                  addonVariants,
                  fonts: formData.get("defaultFonts")
                    ? JSON.parse(formData.get("defaultFonts"))
                    : [],
                }),
              },
            ],
          },
        },
      );

      return {
        success: true,
        message: "Add-on product created and synced to Storefront!",
      };
    }

    return { success: false, message: "Failed to create add-on product." };
  }

  // Normal Save
  const price2Lines = parseFloat(formData.get("price2Lines")) || 0;
  const price3Lines = parseFloat(formData.get("price3Lines")) || 0;
  const priceImage = parseFloat(formData.get("priceImage")) || 0;
  const defaultFonts = formData.get("defaultFonts");
  const defaultColors = formData.get("defaultColors");
  const frameSizes = formData.get("frameSizes");

  await prisma.globalSettings.upsert({
    where: { shop: session.shop },
    update: {
      price2Lines,
      price3Lines,
      priceImage,
      defaultFonts,
      defaultColors,
      frameSizes,
    },
    create: {
      shop: session.shop,
      price2Lines,
      price3Lines,
      priceImage,
      defaultFonts,
      defaultColors,
      frameSizes,
    },
  });
  const shopQuery = await admin.graphql(`{ shop { id } }`);
  const shopData = await shopQuery.json();
  const shopId = shopData.data.shop.id;
  const existingMetafieldQuery = await admin.graphql(
    `{ shop { metafield(namespace: "embroidery_app", key: "settings") { value } } }`,
  );
  const existingMetafieldData = await existingMetafieldQuery.json();
  let addonVariants = [];

  try {
    const existingVal = JSON.parse(
      existingMetafieldData.data.shop.metafield?.value || "{}",
    );

    addonVariants = existingVal.addonVariants || [];
  } catch (e) {}

  await admin.graphql(
    `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { message } }
    }
  `,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "embroidery_app",
            key: "settings",
            type: "json",
            value: JSON.stringify({
              colors: JSON.parse(defaultColors),
              addonVariants,
              fonts: JSON.parse(defaultFonts),
            }),
          },
        ],
      },
    },
  );

  return { success: true, message: "Global Settings saved and synced!" };
};

export default function Settings() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const [price2Lines, setPrice2Lines] = useState(
    settings.price2Lines.toString(),
  );
  const [price3Lines, setPrice3Lines] = useState(
    settings.price3Lines.toString(),
  );
  const [priceImage, setPriceImage] = useState(settings.priceImage.toString());
  const [fonts, setFonts] = useState(() => {
    try {
      return JSON.parse(settings.defaultFonts).join(", ");
    } catch {
      return "Arial, Great Vibes, Pacifico, Dancing Script, Lobster, Alex Brush, Parisienne, Sacramento, Cookie, Charm";
    }
  });
  const [colors, setColors] = useState(() => {
    try {
      const parsed = JSON.parse(settings.defaultColors);

      if (typeof parsed[0] === "string") {
        return parsed.map((hex) => ({ name: hex, hex: hex }));
      }

      return parsed;
    } catch {
      return [
        { name: "Black", hex: "#000000" },
        { name: "White", hex: "#FFFFFF" },
      ];
    }
  });
  const [frameSizes, setFrameSizes] = useState(() => {
    try {
      const parsed = JSON.parse(settings.frameSizes);

      if (parsed.length > 0) return parsed;
      throw new Error();
    } catch {
      return [
        { name: "12cm", price: "4.00" },
        { name: "15cm", price: "6.00" },
        { name: "18cm", price: "8.00" },
      ];
    }
  });

  if (actionData?.success) {
    shopify.toast.show(actionData.message || "Saved successfully!");
  }

  const handleSave = () => {
    const formData = new FormData();

    formData.append("intent", "save");
    formData.append("price2Lines", price2Lines);
    formData.append("price3Lines", price3Lines);
    formData.append("priceImage", priceImage);
    const fontArray = fonts
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    formData.append("defaultFonts", JSON.stringify(fontArray));
    formData.append("defaultColors", JSON.stringify(colors));
    formData.append("frameSizes", JSON.stringify(frameSizes));
    submit(formData, { method: "post" });
  };

  const handleCreateAddon = () => {
    const formData = new FormData();

    formData.append("intent", "setup_addon");
    formData.append("price2Lines", price2Lines);
    formData.append("price3Lines", price3Lines);
    formData.append("priceImage", priceImage);
    formData.append("frameSizes", JSON.stringify(frameSizes));
    submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Global Settings & Pricing">
        <button variant="primary" onClick={handleSave}>
          Save Settings
        </button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Dynamic Frame Sizes
                </Text>
                <Text as="p" tone="subdued">
                  Add the frame sizes available for your products, and set the
                  base price for 1 line of text.
                </Text>

                <BlockStack gap="300">
                  {frameSizes.map((size, index) => (
                    <InlineStack key={index} gap="300" align="start">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Frame Name"
                          value={size.name}
                          onChange={(val) => {
                            const newSizes = [...frameSizes];

                            newSizes[index].name = val;
                            setFrameSizes(newSizes);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Base Price (£)"
                          type="number"
                          value={size.price}
                          onChange={(val) => {
                            const newSizes = [...frameSizes];

                            newSizes[index].price = val;
                            setFrameSizes(newSizes);
                          }}
                          autoComplete="off"
                        />
                      </div>
                      <div style={{ marginTop: "24px" }}>
                        <Button
                          tone="critical"
                          onClick={() => {
                            const newSizes = frameSizes.filter(
                              (_, i) => i !== index,
                            );

                            setFrameSizes(newSizes);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </InlineStack>
                  ))}
                  <InlineStack>
                    <Button
                      onClick={() => {
                        setFrameSizes([
                          ...frameSizes,
                          { name: "New Size", price: "0.00" },
                        ]);
                      }}
                    >
                      + Add Frame Size
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Extra Line & Image Pricing
                </Text>
                <Text as="p" tone="subdued">
                  Set the extra charges applied when a customer selects more
                  than 1 line or adds an image.
                </Text>

                <BlockStack gap="300">
                  <TextField
                    label="Extra Price for 2 Lines (£)"
                    type="number"
                    value={price2Lines}
                    onChange={(val) => setPrice2Lines(val)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Extra Price for 3 Lines (£)"
                    type="number"
                    value={price3Lines}
                    onChange={(val) => setPrice3Lines(val)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Price for Image Option (£)"
                    type="number"
                    value={priceImage}
                    onChange={(val) => setPriceImage(val)}
                    autoComplete="off"
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            <Card background="bg-surface-secondary">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Dynamic Pricing Sync
                </Text>
                <Text as="p">
                  Click the button below to automatically update the Add-on
                  Product in your Shopify store with the Frame Sizes defined
                  above.
                </Text>
                {settings.addonProductId && (
                  <Banner tone="success">
                    Add-on Product is configured. Click below if you changed the
                    sizes.
                  </Banner>
                )}
                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={handleCreateAddon}
                    loading={navigation.state === "submitting"}
                  >
                    Sync Frame Sizes to Shopify
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Enhanced Color Picker
                </Text>
                <Text as="p" tone="subdued">
                  Define thread colors visually so customers see the exact shade
                  and name.
                </Text>

                {colors.map((color, index) => (
                  <InlineStack
                    key={index}
                    gap="200"
                    blockAlign="center"
                    wrap={false}
                  >
                    <input
                      type="color"
                      value={color.hex}
                      onChange={(e) => {
                        const newColors = [...colors];

                        newColors[index].hex = e.target.value;
                        setColors(newColors);
                      }}
                      style={{
                        width: "40px",
                        height: "40px",
                        padding: "0",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: "50%",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <TextField
                        labelHidden
                        label="Color Name"
                        placeholder="Color Name"
                        value={color.name}
                        onChange={(val) => {
                          const newColors = [...colors];

                          newColors[index].name = val;
                          setColors(newColors);
                        }}
                        autoComplete="off"
                      />
                    </div>
                    <Button
                      tone="critical"
                      onClick={() => {
                        const newColors = colors.filter((_, i) => i !== index);

                        setColors(newColors);
                      }}
                    >
                      X
                    </Button>
                  </InlineStack>
                ))}

                <InlineStack>
                  <Button
                    onClick={() =>
                      setColors([
                        ...colors,
                        { name: "New Color", hex: "#000000" },
                      ])
                    }
                  >
                    + Add Color
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Fonts
                </Text>
                <TextField
                  label="Available Fonts (comma separated)"
                  value={fonts}
                  onChange={(val) => setFonts(val)}
                  multiline={4}
                  autoComplete="off"
                />
                <Text as="p" tone="subdued" variant="bodySm">
                  Fancy fonts like{" "}
                  <b>
                    Great Vibes, Pacifico, Dancing Script, Lobster, Cinzel,
                    Playfair Display, Alex Brush, Parisienne, Sacramento,
                    Cookie, Charm
                  </b>{" "}
                  are pre-loaded in the storefront widget!
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
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
