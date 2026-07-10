import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  // We can authenticate via app proxy if set up, but for a public storefront widget
  // a simple CORS enabled public endpoint is sometimes easier, or we use App Proxy.
  // Let's use authenticate.public.appProxy if it's hitting the proxy.
  // For simplicity, we'll just allow CORS and read the shop query param.
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  if (!shop) {
    return Response.json(
      { error: "Missing shop parameter" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  try {
    // Get Global Settings
    let globalSettings = await prisma.globalSettings.findUnique({
      where: { shop },
    });

    if (!globalSettings) {
      globalSettings = {
        id: "default",
        shop,
        price2Lines: 5,
        price3Lines: 6,
        priceImage: 3,
        defaultFonts: '["Arial", "Times New Roman", "Courier New"]',
        defaultColors:
          '[{"name":"Black","hex":"#000000"},{"name":"White","hex":"#FFFFFF"}]',
        frameSizes:
          '[{"name":"12cm","price":"4.00"},{"name":"15cm","price":"6.00"}]',
        addonProductId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Get Product Specific Config
    let productConfig = null;

    if (productId) {
      productConfig = await prisma.personalizerConfig.findUnique({
        where: {
          shop_productId: {
            shop,
            productId: `gid://shopify/Product/${productId}`,
          },
        },
      });

      // Fallback: search by ID string just in case it was stored differently
      if (!productConfig) {
        productConfig = await prisma.personalizerConfig.findFirst({
          where: {
            shop,
            productId: {
              contains: productId,
            },
          },
        });
      }
    }

    // Fetch addon variants directly using Unauthenticated Admin API
    let addonVariants = [];

    if (globalSettings.addonProductId) {
      try {
        const { admin } = await unauthenticated.admin(shop);
        const productResponse = await admin.graphql(
          `#graphql
          query getVariants($id: ID!) {
            product(id: $id) {
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }`,
          { variables: { id: globalSettings.addonProductId } },
        );
        const prodJson = await productResponse.json();
        const edges = prodJson.data?.product?.variants?.edges || [];

        addonVariants = edges.map((edge) => ({
          id: edge.node.id.split("/").pop(),
          title: edge.node.title,
          price: edge.node.price,
        }));
      } catch (err) {
        console.error("Failed to fetch addon variants", err);
      }
    }

    return Response.json(
      {
        global: {
          price2Lines: globalSettings.price2Lines,
          price3Lines: globalSettings.price3Lines,
          priceImage: globalSettings.priceImage,
          fonts: JSON.parse(globalSettings.defaultFonts),
          colors: JSON.parse(globalSettings.defaultColors).map((c) =>
            typeof c === "string" ? { name: c, hex: c } : c,
          ),
          frameSizes: JSON.parse(globalSettings.frameSizes || "[]"),
          addonProductId: globalSettings.addonProductId,
        },
        product: productConfig
          ? {
              zoneX: productConfig.zoneX,
              zoneY: productConfig.zoneY,
              zoneWidth: productConfig.zoneWidth,
              zoneHeight: productConfig.zoneHeight,
            }
          : null,
        addonVariants,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching personalizer API:", error);

    return Response.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
};
