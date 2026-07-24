import {
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
  useSubmit,
  useFetcher,
} from "react-router";
import { useAppBridge, TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState, useCallback } from "react";
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
  InlineStack,
  IndexFilters,
  ChoiceList,
  useIndexResourceState,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "bulk_delete") {
    const productIdsStr = formData.get("productIds");

    if (!productIdsStr) return null;
    const productIds = JSON.parse(productIdsStr);

    await prisma.personalizerConfig.deleteMany({
      where: { shop: session.shop, productId: { in: productIds } },
    });
    const chunks = [];

    for (let i = 0; i < productIds.length; i += 25) {
      chunks.push(productIds.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      const metafields = chunk.map((id) => ({
        ownerId: id,
        namespace: "embroidery_app",
        key: "config",
      }));

      await admin.graphql(
        `
        mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) { deletedMetafields { key } }
        }
      `,
        { variables: { metafields } },
      );
    }

    return { success: true };
  }

  if (intent === "bulk_status") {
    const productIdsStr = formData.get("productIds");

    if (!productIdsStr) return null;
    const productIds = JSON.parse(productIdsStr);
    const newIsActive = formData.get("isActive") === "true";

    await prisma.personalizerConfig.updateMany({
      where: { shop: session.shop, productId: { in: productIds } },
      data: { isActive: newIsActive },
    });
    const updatedConfigs = await prisma.personalizerConfig.findMany({
      where: { shop: session.shop, productId: { in: productIds } },
    });
    const chunks = [];

    for (let i = 0; i < updatedConfigs.length; i += 25) {
      chunks.push(updatedConfigs.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      const metafields = chunk.map((c) => ({
        ownerId: c.productId,
        namespace: "embroidery_app",
        key: "config",
        type: "json",
        value: JSON.stringify({
          zoneX: c.zoneX,
          zoneY: c.zoneY,
          zoneWidth: c.zoneWidth,
          zoneHeight: c.zoneHeight,
          zoneAngle: c.zoneAngle,
          isActive: c.isActive,
        }),
      }));

      await admin.graphql(
        `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { message } }
        }
      `,
        { variables: { metafields } },
      );
    }

    return { success: true };
  }

  const productId = formData.get("productId");

  if (!productId) return null;

  if (intent === "delete") {
    await prisma.personalizerConfig.delete({
      where: { shop_productId: { shop: session.shop, productId } },
    });
    await admin.graphql(
      `
      mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key }
        }
      }
    `,
      {
        variables: {
          metafields: [
            { ownerId: productId, namespace: "embroidery_app", key: "config" },
          ],
        },
      },
    );

    return { success: true };
  }

  if (intent === "toggleActive") {
    const isActiveStr = formData.get("isActive");
    const newIsActive = isActiveStr === "true";
    const updated = await prisma.personalizerConfig.update({
      where: { shop_productId: { shop: session.shop, productId } },
      data: { isActive: newIsActive },
    });

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
                isActive: updated.isActive,
              }),
            },
          ],
        },
      },
    );

    return { success: true };
  }

  return null;
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const configs = await prisma.personalizerConfig.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });
  const query = await admin.graphql(`
    query { shop { metafield(namespace: "embroidery_app", key: "settings") { value } } }
  `);
  const response = await query.json();
  let shopSettings = null;

  if (response.data?.shop?.metafield?.value) {
    try {
      shopSettings = JSON.parse(response.data.shop.metafield.value);
    } catch {}
  }

  return { configs, shopSettings };
};

export default function Products() {
  const { configs, shopSettings } = useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const submit = useSubmit();
  const fetcher = useFetcher();
  const shopDomain = configs.length > 0 ? configs[0].shop : "";

  const handleSyncAll = () => {
    if (!shopSettings) {
      shopify.toast.show("Please save Settings first.");

      return;
    }

    const formData = new FormData();

    formData.append("intent", "setup_addon");
    formData.append(
      "frameSizes",
      JSON.stringify(shopSettings.frameConfig || []),
    );
    formData.append("priceImage", shopSettings.priceImage || "3");
    fetcher.submit(formData, { method: "post", action: "/app/settings" });
    shopify.toast.show("Syncing Add-on Product to Shopify...");
  };

  const [queryValue, setQueryValue] = useState("");
  const [status, setStatus] = useState(undefined);
  const [mode, setMode] = useState("DEFAULT");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const handleQueryValueChange = useCallback((value) => {
    setQueryValue(value);
    setCurrentPage(1);
  }, []);
  const handleQueryValueRemove = useCallback(() => {
    setQueryValue("");
    setCurrentPage(1);
  }, []);
  const handleStatusChange = useCallback((value) => {
    setStatus(value);
    setCurrentPage(1);
  }, []);
  const handleStatusRemove = useCallback(() => {
    setStatus(undefined);
    setCurrentPage(1);
  }, []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
    handleStatusRemove();
  }, [handleQueryValueRemove, handleStatusRemove]);
  const filteredConfigs = configs.filter((config) => {
    let match = true;

    if (queryValue) {
      match =
        match &&
        config.productHandle.toLowerCase().includes(queryValue.toLowerCase());
    }

    if (status && status.length > 0) {
      if (status[0] === "active") match = match && config.isActive;
      if (status[0] === "inactive") match = match && !config.isActive;
    }

    return match;
  });
  const totalPages = Math.ceil(filteredConfigs.length / itemsPerPage);
  const paginatedConfigs = filteredConfigs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );
  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(paginatedConfigs);

  const handleSelectProducts = async () => {
    const payload = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: [],
    });

    if (payload && payload.length > 0) {
      const payloadIds = payload.map((p) => p.id);

      navigate(
        `/app/configure?ids=${encodeURIComponent(payloadIds.join(","))}`,
      );
    }
  };

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={status || []}
          onChange={handleStatusChange}
        />
      ),
      shortcut: true,
    },
  ];
  const appliedFilters = [];

  if (status && status.length > 0) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${status[0]}`,
      onRemove: handleStatusRemove,
    });
  }

  const productRowMarkup = paginatedConfigs.map(
    (
      {
        id,
        productId,
        productHandle,
        zoneWidth,
        zoneHeight,
        zoneAngle,
        isActive,
      },
      index,
    ) => {
      const shopUrl = `https://${shopDomain}/products/${productHandle}`;

      return (
        <IndexTable.Row
          id={id}
          key={id}
          position={index}
          selected={selectedResources.includes(id)}
        >
          <IndexTable.Cell>
            <div
              style={{
                maxWidth: "300px",
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
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
              <Button
                size="micro"
                onClick={() =>
                  navigate(
                    `/app/configure?ids=${encodeURIComponent(productId)}`,
                  )
                }
              >
                Edit
              </Button>
              <Button
                size="micro"
                onClick={() => {
                  submit(
                    {
                      intent: "toggleActive",
                      productId,
                      isActive: !isActive ? "true" : "false",
                    },
                    { method: "post" },
                  );
                }}
              >
                {isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button
                size="micro"
                tone="critical"
                onClick={() => {
                  if (
                    confirm(
                      "Are you sure you want to delete this configuration?",
                    )
                  ) {
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
    },
  );

  return (
    <Page>
      <TitleBar title="Personalized Products">
        <button onClick={handleSyncAll}>Sync Frame Prices</button>
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
                  content: "Configure Your First Product",
                  onAction: handleSelectProducts,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Select products from your store and configure where the custom
                  embroidery should appear on their images.
                </p>
              </EmptyState>
            ) : (
              <BlockStack>
                <IndexFilters
                  queryValue={queryValue}
                  queryPlaceholder="Search products by handle"
                  onQueryChange={handleQueryValueChange}
                  onQueryClear={handleQueryValueRemove}
                  onClearAll={handleClearAll}
                  cancelAction={{
                    onAction: handleClearAll,
                    disabled: false,
                    loading: false,
                  }}
                  tabs={[{ content: "All", id: "all-0" }]}
                  selected={0}
                  onSelect={() => {}}
                  filters={filters}
                  appliedFilters={appliedFilters}
                  mode={mode}
                  setMode={setMode}
                />
                <IndexTable
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={filteredConfigs.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  promotedBulkActions={[
                    {
                      content: "Configure Selected",
                      onAction: () => {
                        const productIds = selectedResources
                          .map(
                            (id) =>
                              filteredConfigs.find((c) => c.id === id)
                                ?.productId,
                          )
                          .filter(Boolean);

                        if (productIds.length > 0) {
                          navigate(
                            `/app/configure?ids=${encodeURIComponent(productIds.join(","))}`,
                          );
                        }
                      },
                    },
                    {
                      content: "Activate",
                      onAction: () => {
                        const productIds = selectedResources
                          .map(
                            (id) =>
                              filteredConfigs.find((c) => c.id === id)
                                ?.productId,
                          )
                          .filter(Boolean);

                        submit(
                          {
                            intent: "bulk_status",
                            productIds: JSON.stringify(productIds),
                            isActive: "true",
                          },
                          { method: "post" },
                        );
                        clearSelection();
                      },
                    },
                    {
                      content: "Deactivate",
                      onAction: () => {
                        const productIds = selectedResources
                          .map(
                            (id) =>
                              filteredConfigs.find((c) => c.id === id)
                                ?.productId,
                          )
                          .filter(Boolean);

                        submit(
                          {
                            intent: "bulk_status",
                            productIds: JSON.stringify(productIds),
                            isActive: "false",
                          },
                          { method: "post" },
                        );
                        clearSelection();
                      },
                    },
                    {
                      content: "Delete",
                      onAction: () => {
                        if (
                          confirm(
                            "Are you sure you want to delete the selected configurations?",
                          )
                        ) {
                          const productIds = selectedResources
                            .map(
                              (id) =>
                                filteredConfigs.find((c) => c.id === id)
                                  ?.productId,
                            )
                            .filter(Boolean);

                          submit(
                            {
                              intent: "bulk_delete",
                              productIds: JSON.stringify(productIds),
                            },
                            { method: "post" },
                          );
                          clearSelection();
                        }
                      },
                    },
                  ]}
                  headings={[
                    { title: "Product Handle" },
                    { title: "Embroidery Zone Size" },
                    { title: "Rotation Angle" },
                    { title: "Status" },
                    { title: "Action" },
                  ]}
                  selectable={true}
                  pagination={{
                    hasNext: currentPage < totalPages,
                    hasPrevious: currentPage > 1,
                    onNext: () => setCurrentPage((prev) => prev + 1),
                    onPrevious: () => setCurrentPage((prev) => prev - 1),
                  }}
                >
                  {productRowMarkup}
                </IndexTable>
              </BlockStack>
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
