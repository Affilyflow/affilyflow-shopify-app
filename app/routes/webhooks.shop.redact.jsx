import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // shop/redact: Sent 48 hours after a store owner uninstalls the app.
  // The app must delete all data it holds for this shop (GDPR compliance).
  // Sessions are cleaned up here as a safety net (also handled on app/uninstalled).
  console.log(`Shop redact request for shop ${shop}:`, payload);

  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
