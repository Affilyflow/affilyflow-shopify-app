import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received compliance webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // A customer requested their data. This app stores no personal customer
      // data beyond Shopify sessions, so no export is required.
      console.log(`Customer data request for shop ${shop}:`, payload);
      break;

    case "CUSTOMERS_REDACT":
      // A customer requested deletion of their data (GDPR/CCPA).
      // This app stores no personal customer data, so no deletion is required.
      // If you add customer data storage in the future, handle it here.
      console.log(`Customer redact request for shop ${shop}:`, payload);
      break;

    case "SHOP_REDACT":
      // Sent 48 hours after a store owner uninstalls the app.
      // Delete all data held for this shop.
      console.log(`Shop redact request for shop ${shop}:`, payload);
      await db.session.deleteMany({ where: { shop } });
      break;

    default:
      console.warn(`Unhandled compliance topic: ${topic}`);
  }

  return new Response();
};
