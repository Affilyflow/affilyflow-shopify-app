import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // customers/redact: A customer requested deletion of their data (GDPR/CCPA).
  // The app must delete or anonymize any personal data it holds for this customer.
  // payload.customer contains: id, email, phone
  // payload.orders_to_redact contains order IDs associated with this customer.
  // This app stores no personal customer data, so no deletion is required.
  // If you add customer data storage in the future, handle it here.
  console.log(`Customer redact request for shop ${shop}:`, payload);

  return new Response();
};
