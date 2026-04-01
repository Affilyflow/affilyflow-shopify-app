import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Webhook: ${topic} for ${shop}`);
  return new Response(null, { status: 200 });
};
