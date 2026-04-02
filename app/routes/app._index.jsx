import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData();

  return (
    <s-page heading="Affilyflow Affiliate Tracking">
      <s-section heading="Your affiliate tracking is active">
        <s-paragraph>
          Affilyflow is installed on <s-text emphasis="bold">{shop}</s-text> and
          is tracking affiliate activity through your storefront. No further
          setup is required.
        </s-paragraph>
        <s-paragraph>
          Visit your Affilyflow dashboard to manage affiliates, view clicks and
          conversions, and configure your program.
        </s-paragraph>
        <s-button
          variant="primary"
          href="https://affilyflow.com"
          target="_blank"
        >
          Open Affilyflow Dashboard
        </s-button>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          Affilyflow uses a Shopify web pixel to track affiliate referrals
          across your storefront without affecting page speed.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Tracks affiliate clicks and conversions</s-list-item>
          <s-list-item>Attributes orders to the correct affiliate</s-list-item>
          <s-list-item>Reports are available on affilyflow.com</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
