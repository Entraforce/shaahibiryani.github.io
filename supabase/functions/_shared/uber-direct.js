// Uber Direct (Deliveries API) client shared by the website's delivery
// functions and its tests. Plain JS on fetch + Web Crypto only, so Deno edge
// functions import it and scripts/verify-uber-direct.mjs runs it under Node.
//
// SANDBOX ONLY. This build refuses to run against live Uber credentials: the
// mode must be declared "sandbox", and any response that says live_mode=true
// is treated as a configuration error, never as a delivery.
//
// Docs (read 2026-10-30): developer.uber.com/docs/deliveries — auth guide,
// get-started, robocourier, webhooks, FAQ.

export const UBER_TOKEN_URL = "https://auth.uber.com/oauth/v2/token";
export const UBER_API_BASE = "https://api.uber.com";
export const UBER_SCOPE = "eats.deliveries";

// Tokens last 30 days and "should be cached and re-used"; token requests are
// limited to 100/hour. Refresh a day early.
const TOKEN_EARLY_REFRESH_MS = 24 * 60 * 60 * 1000;

export class UberDirectError extends Error {
  constructor(code, message, { status = 0, detail = null } = {}) {
    super(message);
    this.name = "UberDirectError";
    this.code = code;       // see classifyUberError
    this.status = status;   // HTTP status, 0 if none
    this.detail = detail;   // Uber's error body (never contains our secrets)
  }
}

/**
 * The declared mode. Only "sandbox" enables anything; unset, "live" or a typo
 * is "disabled". Going live is a separate, deliberate change to this file.
 */
export function uberMode(value) {
  return String(value ?? "").trim().toLowerCase() === "sandbox" ? "sandbox" : "disabled";
}

/**
 * Maps an Uber error response to one of our codes, so callers decide by code:
 *   quote_expired · address_undeliverable · couriers_unavailable ·
 *   duplicate · rate_limited · auth · invalid_request · upstream · unknown
 * Uber's public pages don't list every code, so this matches on the code
 * string AND the message, and falls back by HTTP status.
 */
export function classifyUberError(status, body) {
  const code = String(body?.code ?? body?.error ?? "").toLowerCase();
  const msg = String(body?.message ?? body?.error_description ?? "").toLowerCase();
  const t = code + " " + msg;
  if (/expired|quote.*(invalid|not found)/.test(t)) return "quote_expired";
  if (/undeliverable|address|outside|out of (range|area)|not.*serviced|too far|distance/.test(t)) return "address_undeliverable";
  if (/courier|unavailable|no.*driver|busy|capacity/.test(t)) return "couriers_unavailable";
  if (/duplicate|already exists|idempot/.test(t) || status === 409) return "duplicate";
  if (status === 429 || /customer_limited|rate/.test(t)) return "rate_limited";
  if (status === 401 || status === 403 || /invalid_client|unauthorized|invalid_scope/.test(t)) return "auth";
  if (status === 400 || status === 422) return "invalid_request";
  if (status >= 500) return "upstream";
  return "unknown";
}

/** US phone to E.164 (+1XXXXXXXXXX), or null when it isn't a 10-digit number. */
export function toE164(phone) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? "+1" + d : null;
}

/**
 * Our address shape {street, apt, city, state, zip} → Uber's structured JSON
 * string. Quote and delivery must send the SAME string, or Uber reports
 * "delivery location changed" — so both always go through this function.
 */
export function formatUberAddress(a) {
  const street = String(a?.street ?? "").trim();
  const apt = String(a?.apt ?? "").trim();
  const city = String(a?.city ?? "").trim();
  const state = String(a?.state ?? "TX").trim().toUpperCase();
  const zip = String(a?.zip ?? "").trim();
  if (!street || !city || !/^\d{5}(-\d{4})?$/.test(zip) || !/^[A-Z]{2}$/.test(state)) return null;
  return JSON.stringify({
    street_address: apt ? [street, apt] : [street],
    city, state, zip_code: zip, country: "US",
  });
}

/** Constant-time compare of two hex strings. */
function safeEqualHex(a, b) {
  a = String(a ?? "").trim().toLowerCase();
  b = String(b ?? "").trim().toLowerCase();
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret, rawBody) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Webhook authenticity: HMAC-SHA256 of the RAW body with the webhook signing
 * key, hex, compared to x-uber-signature (x-postmates-signature is the older
 * name Uber still sends for delivery_status / courier_update). Never parse
 * and re-serialise the body before checking: Uber warns some parsers alter it.
 */
export async function verifyUberSignature(rawBody, headers, secret) {
  if (!secret) return false;
  const get = (n) => (typeof headers?.get === "function" ? headers.get(n) : headers?.[n]);
  const given = get("x-uber-signature") || get("x-postmates-signature");
  if (!given) return false;
  return safeEqualHex(given, await hmacSha256Hex(secret, rawBody));
}

/**
 * makeUberClient({ customerId, clientId, clientSecret, mode, fetch, now, tokenStore })
 * tokenStore (optional) = { get(): {token, expiresAt}|null, set(v) } so an
 * edge function can keep one token across invocations instead of asking for a
 * new one each time (Uber limits token requests to 100/hour).
 */
export function makeUberClient(opts) {
  const { customerId, clientId, clientSecret } = opts;
  const mode = uberMode(opts.mode);
  const f = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? (() => Date.now());
  let memo = null;
  const store = opts.tokenStore ?? { get: () => memo, set: (v) => { memo = v; } };

  function requireReady() {
    if (mode !== "sandbox") throw new UberDirectError("disabled", "Uber Direct is not enabled (mode must be 'sandbox').");
    if (!customerId || !clientId || !clientSecret) throw new UberDirectError("auth", "Uber Direct credentials are not configured.");
  }

  async function token(force = false) {
    requireReady();
    const cached = await store.get();
    if (!force && cached?.token && cached.expiresAt - TOKEN_EARLY_REFRESH_MS > now()) return cached.token;
    const res = await f(UBER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials", scope: UBER_SCOPE }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      // Never echo the request: it carries the client secret.
      throw new UberDirectError(classifyUberError(res.status, body), "Uber auth failed", { status: res.status, detail: { error: body.error ?? null } });
    }
    const v = { token: body.access_token, expiresAt: now() + Number(body.expires_in ?? 0) * 1000 };
    await store.set(v);
    return v.token;
  }

  async function call(method, path, payload, retried = false) {
    const t = await token();
    const res = await f(`${UBER_API_BASE}/v1/customers/${encodeURIComponent(customerId)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !retried) {
      await token(true);
      return call(method, path, payload, true);
    }
    if (!res.ok) throw new UberDirectError(classifyUberError(res.status, body), body?.message || `Uber ${method} ${path} failed`, { status: res.status, detail: body });
    // A sandbox build must never act on a live delivery or quote.
    if (body && body.live_mode === true) throw new UberDirectError("live_mode", "Uber returned live_mode=true to a sandbox build; refusing.");
    return body;
  }

  return {
    mode,
    token,

    /** POST /delivery_quotes → normalised quote. Quotes last 15 minutes. */
    async createQuote({ pickupAddress, dropoffAddress, pickupPhone, dropoffPhone, pickupReadyAt, manifestTotalCents, externalStoreId }) {
      const q = await call("POST", "/delivery_quotes", {
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        pickup_phone_number: pickupPhone,
        dropoff_phone_number: dropoffPhone,
        ...(pickupReadyAt ? { pickup_ready_dt: pickupReadyAt } : {}),
        ...(manifestTotalCents ? { manifest_total_value: manifestTotalCents } : {}),
        ...(externalStoreId ? { external_store_id: externalStoreId } : {}),
      });
      return {
        quoteId: q.id,
        feeCents: Number(q.fee),
        currency: q.currency ?? "usd",
        expiresAt: q.expires,
        dropoffEta: q.dropoff_eta ?? null,
        durationMin: q.duration ?? null,
        pickupDurationMin: q.pickup_duration ?? null,
        raw: q,
      };
    },

    /** POST /deliveries. externalId + idempotencyKey = our order id, so a retry can't create a second courier. */
    async createDelivery(d) {
      return call("POST", "/deliveries", {
        quote_id: d.quoteId,
        external_id: d.externalId,
        idempotency_key: d.idempotencyKey,
        pickup_name: d.pickupName,
        pickup_address: d.pickupAddress,
        pickup_phone_number: d.pickupPhone,
        pickup_notes: d.pickupNotes,
        dropoff_name: d.dropoffName,
        dropoff_address: d.dropoffAddress,
        dropoff_phone_number: d.dropoffPhone,
        dropoff_notes: d.dropoffNotes,
        manifest_items: d.manifestItems,
        manifest_reference: d.manifestReference,
        manifest_total_value: d.manifestTotalCents,
        undeliverable_action: "return",
        ...(d.pickupReadyAt ? { pickup_ready_dt: d.pickupReadyAt } : {}),
        ...(d.tipCents ? { tip: d.tipCents } : {}),
        ...(d.testSpecifications ? { test_specifications: d.testSpecifications } : {}),
      });
    },

    getDelivery: (id) => call("GET", `/deliveries/${encodeURIComponent(id)}`),
    cancelDelivery: (id) => call("POST", `/deliveries/${encodeURIComponent(id)}/cancel`, {}),
  };
}
