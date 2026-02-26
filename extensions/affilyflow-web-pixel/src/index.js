import { register } from "@shopify/web-pixels-extension";

const AFFILYFLOW_PIXEL_VERSION = "2.0.0";
const SALES_ENDPOINT = "https://xepn-38qp-in4n.f2.xano.io/api:-WVr0FO_/sales/salg";

function money(node) {
  const amount = node?.amount ?? node?.value ?? "";
  const currencyCode = node?.currencyCode ?? node?.currency ?? "";
  return { amount, currencyCode };
}

function asCsv(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.filter(Boolean).join(", ");
}

function parseDateMs(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

register(({ analytics, browser }) => {
  async function safeCookie(name) {
    try {
      const c = await browser.cookie.get(name);
      return c?.value || "";
    } catch {
      return "";
    }
  }

  async function safeLS(key) {
    try {
      const v = await browser.localStorage.getItem(key);
      return v || "";
    } catch {
      return "";
    }
  }

  analytics.subscribe("checkout_completed", async (event) => {
    try {
      const checkout = event?.data?.checkout;
      if (!checkout) return;

      // Order ID
      const orderId = checkout?.order?.id || checkout?.order?.orderNumber || "";

      // Attribution (from your Theme App Extension cookies)
      const aff_id = (await safeCookie("affiliate_id")) || (await safeLS("affiliate_id")) || "";
      const network = (await safeCookie("network")) || (await safeLS("network")) || "";
      const store = (await safeCookie("store")) || (await safeLS("store")) || "";
      const fullUrl = (await safeCookie("full_url")) || (await safeLS("full_url")) || "";
      const referrerCookie =
        (await safeCookie("referrer")) ||
        (await safeCookie("refferer")) ||
        (await safeLS("referrer")) ||
        "";

      // Totals (keeps your legacy "subtotalPrice" mapping)
      const subtotal = money(checkout?.subtotalPrice);
      const orderTotal = subtotal.amount;
      const currency = subtotal.currencyCode;

      // Cookie age
      const affiliateSetAt =
        (await safeCookie("affiliate_set_at")) || (await safeLS("affiliate_set_at")) || null;

      let cookieAgeSeconds = null;
      let cookieAgeHours = null;
      let cookieAgeDays = null;

      if (affiliateSetAt) {
        const createdMs = parseDateMs(affiliateSetAt);
        if (createdMs) {
          const diffMs = Date.now() - createdMs;
          if (diffMs >= 0) {
            cookieAgeSeconds = Math.floor(diffMs / 1000);
            cookieAgeHours = Math.floor(diffMs / (1000 * 60 * 60));
            cookieAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          }
        }
      }

      // Line items IDs (legacy-ish)
      const productIds = Array.isArray(checkout?.lineItems)
        ? checkout.lineItems.map((item) => item?.id).filter(Boolean)
        : [];
      const productNames = productIds.length === 1 ? String(productIds[0]) : asCsv(productIds);

      const payload = {
        aff_id: aff_id,
        refferer: referrerCookie, // keeping your misspelling for backend compatibility
        network: network,
        order_id: orderId,
        store: store,
        full_url: fullUrl,
        order_total: orderTotal,
        currency: currency,
        productIds: productNames,

        cookie_created_at: affiliateSetAt,
        cookie_age_seconds: cookieAgeSeconds,
        cookie_age_hours: cookieAgeHours,
        cookie_age_days: cookieAgeDays,

        pixel_version: AFFILYFLOW_PIXEL_VERSION,
      };

      await fetch(SALES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      // silent by design
    }
  });
});