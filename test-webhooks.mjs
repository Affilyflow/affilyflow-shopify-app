/**
 * Webhook HMAC verification test
 *
 * Runs two suites:
 *   1. Unit  — verifies the HMAC algorithm in isolation (no server needed)
 *   2. Integration — fires real HTTP requests at a running dev server
 *
 * Usage:
 *   # Unit tests only (no server required):
 *   node test-webhooks.mjs
 *
 *   # Unit + integration (server must already be running):
 *   SHOPIFY_API_SECRET=<your_secret> APP_URL=http://localhost:3000 node test-webhooks.mjs --integration
 *
 * The secret must match the value in your .env file.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SECRET = process.env.SHOPIFY_API_SECRET ?? "test_secret_for_unit_tests";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const RUN_INTEGRATION = process.argv.includes("--integration");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the base64 HMAC-SHA256 signature exactly as Shopify does. */
function shopifyHmac(secret, rawBody) {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

/** Constant-time comparison to avoid timing attacks (mirrors what the library does). */
function signaturesMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Simple HTTP/HTTPS POST, returns { status, body }. */
function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = lib(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. UNIT TESTS — pure crypto, no server
// ---------------------------------------------------------------------------
console.log("\n── Unit tests (HMAC algorithm) ──────────────────────────────────\n");

const BODY = JSON.stringify({ shop: "test-shop.myshopify.com", customer: { id: 123 } });
const VALID_SIG = shopifyHmac(SECRET, BODY);

// Correct signature verifies
assert(
  "valid signature matches",
  signaturesMatch(VALID_SIG, shopifyHmac(SECRET, BODY))
);

// Tampered body produces different signature
const TAMPERED_BODY = BODY.replace("123", "999");
assert(
  "tampered body fails signature check",
  !signaturesMatch(VALID_SIG, shopifyHmac(SECRET, TAMPERED_BODY))
);

// Wrong secret produces different signature
assert(
  "wrong secret fails signature check",
  !signaturesMatch(VALID_SIG, shopifyHmac("wrong_secret", BODY))
);

// Empty body has its own stable signature
const EMPTY_SIG = shopifyHmac(SECRET, "");
assert(
  "empty body produces consistent signature",
  signaturesMatch(EMPTY_SIG, shopifyHmac(SECRET, ""))
);

// Signatures are base64 strings
assert(
  "signature is valid base64",
  /^[A-Za-z0-9+/]+=*$/.test(VALID_SIG)
);

// Signatures are 44 chars (SHA-256 → 32 bytes → 44 base64 chars)
assert(
  "signature is 44 characters (SHA-256 base64)",
  VALID_SIG.length === 44
);

// Length mismatch is caught before timingSafeEqual
assert(
  "length mismatch returns false without throwing",
  !signaturesMatch(VALID_SIG, "short")
);

// ---------------------------------------------------------------------------
// Topic-specific payload shapes (unit)
// ---------------------------------------------------------------------------
console.log("\n── Per-topic payload unit tests ─────────────────────────────────\n");

const TOPICS = [
  {
    topic: "customers/data_request",
    path: "/webhooks/customers/data_request",
    payload: {
      shop_id: 1,
      shop_domain: "test.myshopify.com",
      customer: { id: 207119551, email: "john@example.com", phone: "555-625-1199" },
      orders_requested: [299938, 280500, 220201],
    },
  },
  {
    topic: "customers/redact",
    path: "/webhooks/customers/redact",
    payload: {
      shop_id: 1,
      shop_domain: "test.myshopify.com",
      customer: { id: 207119551, email: "john@example.com", phone: "555-625-1199" },
      orders_to_redact: [299938, 280500, 220201],
    },
  },
  {
    topic: "shop/redact",
    path: "/webhooks/shop/redact",
    payload: {
      shop_id: 1,
      shop_domain: "test.myshopify.com",
    },
  },
  {
    topic: "app/uninstalled",
    path: "/webhooks/app/uninstalled",
    payload: { shop_id: 1, shop_domain: "test.myshopify.com" },
  },
  {
    topic: "app/scopes_update",
    path: "/webhooks/app/scopes_update",
    payload: {
      from_scopes: "write_products",
      to_scopes: "write_products,write_metaobjects",
    },
  },
];

for (const { topic, payload } of TOPICS) {
  const body = JSON.stringify(payload);
  const sig = shopifyHmac(SECRET, body);
  assert(
    `${topic}: valid signature generated`,
    sig.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(sig)
  );
  assert(
    `${topic}: tampered body rejected`,
    !signaturesMatch(sig, shopifyHmac(SECRET, body + " "))
  );
}

// ---------------------------------------------------------------------------
// 2. INTEGRATION TESTS — requires running server + correct secret in env
// ---------------------------------------------------------------------------
if (!RUN_INTEGRATION) {
  console.log(
    "\n── Integration tests skipped ────────────────────────────────────\n" +
    "  Run with:  SHOPIFY_API_SECRET=<secret> APP_URL=http://localhost:3000 node test-webhooks.mjs --integration\n"
  );
} else {
  console.log(
    `\n── Integration tests (${APP_URL}) ───────────────────────────────────\n`
  );

  for (const { topic, path, payload } of TOPICS) {
    const body = JSON.stringify(payload);
    const validSig = shopifyHmac(SECRET, body);

    // -- Valid request → should return 200
    try {
      const res = await post(
        `${APP_URL}${path}`,
        {
          "X-Shopify-Hmac-SHA256": validSig,
          "X-Shopify-Topic": topic,
          "X-Shopify-Shop-Domain": payload.shop_domain ?? "test.myshopify.com",
          "X-Shopify-Webhook-Id": crypto.randomUUID(),
          "X-Shopify-Api-Version": "2026-04",
        },
        body
      );
      assert(
        `${topic}: valid signature → 200`,
        res.status === 200,
        `got ${res.status}`
      );
    } catch (err) {
      assert(`${topic}: valid signature → 200`, false, err.message);
    }

    // -- Invalid signature → should return 401
    try {
      const res = await post(
        `${APP_URL}${path}`,
        {
          "X-Shopify-Hmac-SHA256": shopifyHmac("wrong_secret", body),
          "X-Shopify-Topic": topic,
          "X-Shopify-Shop-Domain": payload.shop_domain ?? "test.myshopify.com",
          "X-Shopify-Webhook-Id": crypto.randomUUID(),
          "X-Shopify-Api-Version": "2026-04",
        },
        body
      );
      assert(
        `${topic}: invalid signature → 401`,
        res.status === 401,
        `got ${res.status}`
      );
    } catch (err) {
      assert(`${topic}: invalid signature → 401`, false, err.message);
    }

    // -- Missing signature header → should return 401
    try {
      const res = await post(
        `${APP_URL}${path}`,
        {
          "X-Shopify-Topic": topic,
          "X-Shopify-Shop-Domain": payload.shop_domain ?? "test.myshopify.com",
        },
        body
      );
      assert(
        `${topic}: missing signature header → 401`,
        res.status === 401,
        `got ${res.status}`
      );
    } catch (err) {
      assert(`${topic}: missing signature header → 401`, false, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n────────────────────────────────────────────────────────────────────`);
console.log(`  ${passed}/${total} passed${failed > 0 ? `  (${failed} failed)` : ""}`);
console.log(`────────────────────────────────────────────────────────────────────\n`);
process.exit(failed > 0 ? 1 : 0);
