(function () {
  "use strict";

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  const AFFILYFLOW_SCRIPT_VERSION = "1.0.8";
  const LOG_PREFIX = `[Affilyflow ${AFFILYFLOW_SCRIPT_VERSION}]`;

  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG =
    window.AFFILYFLOW_DEBUG === true ||
    urlParams.get("af_debug") === "1" ||
    urlParams.get("affilyflow_debug") === "1";

  function ts() {
    return new Date().toISOString();
  }

  function log(...args) {
    if (DEBUG) console.log(LOG_PREFIX, ts(), ...args);
  }
  function warn(...args) {
    if (DEBUG) console.warn(LOG_PREFIX, ts(), ...args);
  }
  function err(...args) {
    console.error(LOG_PREFIX, ts(), ...args);
  }

  function group(title, fn) {
    if (!DEBUG) return fn();
    console.groupCollapsed(`${LOG_PREFIX} ${ts()} ${title}`);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }

  // ------------------------------------------------------------
  // Global debug state (so you can inspect from console)
  // ------------------------------------------------------------
  window.__AFFILYFLOW__ = window.__AFFILYFLOW__ || {};
  window.__AFFILYFLOW__.version = AFFILYFLOW_SCRIPT_VERSION;
  window.__AFFILYFLOW__.debug = DEBUG;
  window.__AFFILYFLOW__.last = window.__AFFILYFLOW__.last || {};

  // ------------------------------------------------------------
  // Global error catchers (only attach once)
  // ------------------------------------------------------------
  if (!window.__AFFILYFLOW__._errorsAttached) {
    window.__AFFILYFLOW__._errorsAttached = true;

    window.addEventListener("error", (e) => {
      err("window.error", {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error ? String(e.error) : null,
      });
    });

    window.addEventListener("unhandledrejection", (e) => {
      err("unhandledrejection", e.reason);
    });
  }

  // ------------------------------------------------------------
  // Helpers: cookies
  // ------------------------------------------------------------
  function setCookie(name, value, days) {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }

    // NOTE: SameSite/Secure not set. That's usually fine for first-party cookies.
    // If you need cross-site attribution in modern browsers, you need a different approach.
    const cookieString = `${name}=${encodeURIComponent(value || "")}${expires}; path=/;`;
    document.cookie = cookieString;

    const stored = getCookie(name);
    log(`setCookie("${name}")`, { intended: value, stored, days });
    return stored;
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(";").shift());
    return null;
  }

  function hashString(str) {
    let hash = 0;
    if (!str || !str.length) return hash.toString();
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function getStoreMeta() {
    return {
      store_url: window.location.origin,
      hostname: window.location.hostname,
      shopify_store: (window.Shopify && window.Shopify.shop) ? window.Shopify.shop : null
    };
  }

  // ------------------------------------------------------------
  // Fetch helper with logs
  // ------------------------------------------------------------
  async function fetchWithLogs(url, options, label) {
    const started = performance.now();
    const reqPreview = options && options.body ? String(options.body).slice(0, 600) : null;

    log(`FETCH START [${label}]`, {
      url,
      method: options && options.method,
      headers: options && options.headers,
      bodyPreview: reqPreview
    });

    try {
      const res = await fetch(url, options);
      const ms = Math.round(performance.now() - started);

      let textPreview = null;
      try {
        const text = await res.clone().text();
        textPreview = text ? text.slice(0, 600) : null;
      } catch (e) {
        // ignore
      }

      log(`FETCH END [${label}]`, {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        ms,
        responseTextPreview: textPreview
      });

      return res;
    } catch (e) {
      const ms = Math.round(performance.now() - started);
      err(`FETCH ERROR [${label}] after ${ms}ms`, e);
      throw e;
    }
  }

  // ------------------------------------------------------------
  // Heartbeat
  // ------------------------------------------------------------
  function sendHeartbeat(type = "heartbeat") {
    const meta = getStoreMeta();
    const payload = {
      timestamp: new Date().toISOString(),
      type,
      version: AFFILYFLOW_SCRIPT_VERSION,
      store_url: meta.store_url,
      hostname: meta.hostname,
      shopify_store: meta.shopify_store
    };

    window.__AFFILYFLOW__.last.heartbeat = payload;

    group(`Heartbeat: ${type}`, () => log("Payload", payload));

    return fetchWithLogs(
      "https://xepn-38qp-in4n.f2.xano.io/api:-WVr0FO_/scriptping",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // keepalive can help on unload situations (not required)
        keepalive: true
      },
      `scriptping:${type}`
    ).catch((e) => {
      warn(`Heartbeat failed (${type})`, e);
      return null;
    });
  }

  // Expose manual test in console: __AFFILYFLOW__.testPing()
  window.__AFFILYFLOW__.testPing = function () {
    log("Manual testPing called");
    return sendHeartbeat("manual_test");
  };

  // ------------------------------------------------------------
  // Click tracking init
  // ------------------------------------------------------------
  function init() {
    group("BOOT", () => {
      log("INIT start");
      log("Location", window.location.href);
      log("readyState", document.readyState);
      log("Referrer", document.referrer || "Direct");
      log("cookieEnabled", navigator.cookieEnabled);
      log("document.cookie (raw)", document.cookie);
      log("Shopify", window.Shopify ? { shop: window.Shopify.shop } : null);
      log("DEBUG", DEBUG);
    });

    // Installed once per session
    try {
      const key = "affilyflow_script_installed";
      const existing = sessionStorage.getItem(key);
      log("sessionStorage flag", existing);

      if (!existing) {
        sendHeartbeat("installed");
        sessionStorage.setItem(key, "1");
        log("sessionStorage flag set => 1");
      }
    } catch (e) {
      warn("sessionStorage not available", e);
    }

    // Always ping on load
    sendHeartbeat("heartbeat");

    // Ping every 5 minutes
    setInterval(() => sendHeartbeat("interval"), 5 * 60 * 1000);

    // Params
    const p = new URLSearchParams(window.location.search);

    const affiliateId = p.get("aff_id");
    const network = p.get("network");
    const store = p.get("store");
    const fullUrl = window.location.href;
    const referrer = document.referrer || "Direct";

    window.__AFFILYFLOW__.last.params = Object.fromEntries(p.entries());

    group("PARAMS", () => {
      log("aff_id", affiliateId);
      log("network", network);
      log("store", store);
      log("full_url", fullUrl);
      log("referrer", referrer);
      log("all params", Object.fromEntries(p.entries()));
    });

    // Set attribution cookies
    if (affiliateId && network && store) {
      group("COOKIES: set attribution", () => {
        setCookie("affiliate_id", affiliateId, 40);
        setCookie("network", network, 40);
        setCookie("store", store, 40);
        setCookie("full_url", fullUrl, 40);
        setCookie("referrer", referrer, 40);
        setCookie("affiliate_set_at", new Date().toISOString(), 40);
      });
    } else {
      warn("Skipping attribution cookies. Missing one or more params.", {
        affiliateId, network, store
      });
    }

    // Ensure referrer always exists
    if (!getCookie("referrer")) {
      log("referrer cookie missing, setting it");
      setCookie("referrer", referrer, 40);
    } else {
      log("referrer cookie exists", getCookie("referrer"));
    }

    // Gate: only click tracking when network=affilyflow
    const networkIsAffilyflow = !!(network && network.toLowerCase() === "affilyflow");

    group("GATING", () => {
      log("networkIsAffilyflow", networkIsAffilyflow);
      log("has affiliateId", !!affiliateId);
      log("has store", !!store);
    });

    if (!(networkIsAffilyflow && affiliateId && store)) {
      warn("Click tracking SKIPPED by gating.");
      return;
    }

    // ------------------------------------------------------------
    // IMPROVED DEDUPE: Only based on affiliate_id + store
    // This prevents duplicate clicks on refresh/navigation within same affiliate session
    // but allows new clicks when affiliate_id changes
    // ------------------------------------------------------------
    const clickKey = `${affiliateId}|${store}`;
    const clickCookieName = "af_click_" + hashString(clickKey);
    const existingClick = getCookie(clickCookieName);

    group("DEDUPE", () => {
      log("clickKey (affiliate + store only)", clickKey);
      log("clickCookieName", clickCookieName);
      log("existingClickCookie", existingClick);
      
      // Log previous click data if exists
      if (existingClick) {
        const parsed = safeJsonParse(existingClick);
        if (parsed) {
          log("Previous click data", {
            aff_id: parsed.aff_id,
            store: parsed.store,
            timestamp: parsed.timestamp,
            daysAgo: parsed.timestamp ? 
              Math.floor((Date.now() - new Date(parsed.timestamp).getTime()) / (1000 * 60 * 60 * 24)) : 
              null
          });
        } else {
          log("Previous click value (legacy format)", existingClick);
        }
      } else {
        log("No previous click found - will track new click");
      }
    });

    if (existingClick) {
      warn(`Click already recorded for affiliate ${affiliateId} on store ${store}. Skipping duplicate.`);
      return;
    }

    // Build payload
    const payload = {
      aff_id: affiliateId,
      network: network,
      store: store,
      full_url: fullUrl,
      referrer: referrer,
      user_agent: navigator.userAgent || "",
      language: navigator.language || "",
      screen_width: (window.screen && window.screen.width) || null,
      screen_height: (window.screen && window.screen.height) || null,
      time_zone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || "",
      page_title: document.title || "",
      timestamp: new Date().toISOString()
    };

    // UTM extras
    const utmKeys = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"];
    for (const k of utmKeys) {
      const v = p.get(k);
      if (v) payload[k] = v;
    }

    window.__AFFILYFLOW__.last.clickPayload = payload;

    group("CLICK PAYLOAD", () => log(payload));

    // Send click
    fetchWithLogs(
      "https://xepn-38qp-in4n.f2.xano.io/api:-WVr0FO_/clicks/click",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      },
      "clicks/click"
    )
      .then(async (response) => {
        if (!response) {
          warn("No response object returned from fetch (unexpected).");
          return null;
        }

        if (!response.ok) {
          warn("Click API responded NOT ok", {
            status: response.status,
            statusText: response.statusText
          });
          return null;
        }

        // Only set dedupe cookie on success - store metadata for debugging
        const clickData = JSON.stringify({
          aff_id: affiliateId,
          store: store,
          timestamp: new Date().toISOString(),
          initial_url: fullUrl
        });
        setCookie(clickCookieName, clickData, 40);
        log("Dedupe cookie set successfully", { clickCookieName, data: clickData });

        // Try parse response for debugging
        let text = null;
        try { text = await response.clone().text(); } catch (e) {}
        const json = text ? safeJsonParse(text) : null;

        log("Click API success", { responseTextPreview: text ? text.slice(0, 600) : null, json });
        window.__AFFILYFLOW__.last.clickResponse = json || text || true;

        return json;
      })
      .catch((e) => {
        err("Click API network error", e);
      });
  }

  // ------------------------------------------------------------
  // Ensure init runs even if DOMContentLoaded already passed
  // ------------------------------------------------------------
  log("External file loaded", { href: location.href, readyState: document.readyState, DEBUG });

  try {
    if (document.readyState === "loading") {
      log("Waiting for DOMContentLoaded...");
      document.addEventListener("DOMContentLoaded", init);
    } else {
      log("DOM already ready, running init immediately...");
      init();
    }
  } catch (e) {
    err("Fatal init error", e);
  }
})();