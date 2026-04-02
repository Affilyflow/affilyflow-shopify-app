import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // customers/data_request: A customer requested their data from the merchant.
  // Shopify notifies the app so it can provide any customer data it stores.
  // This app stores no personal customer data beyond what Shopify holds,
  // so no data export is required. Acknowledge receipt by returning 200.
  console.log(`Customer data request for shop ${shop}:`, payload);

  return new Response();
};
