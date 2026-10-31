// uber-delivery-quote — the website asks "what does delivery to this address
// cost, and when would it arrive?" before the customer pays.
//
// Flow: validate the address → Uber Direct quote (restaurant → customer) →
// store it in delivery_quotes → return { quoteId, feeCents, etaMinutes,
// expiresAt }. create-web-order later charges ONLY a fee that came from one of
// these rows, for the same address, while it is still valid.
//
// Runs when UBER_DIRECT_MODE is sandbox or live (live only behind the pilot gate).
// Deploy WITHOUT JWT verification (guests have no login):
//   supabase functions deploy uber-delivery-quote --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore-file
// @ts-ignore — shared plain-JS modules
import { formatUberAddress, toE164, UberDirectError } from "../_shared/uber-direct.js";
// @ts-ignore
import { STORE, normaliseDeliveryAddress, addressKey, customerDeliveryFeeCents } from "../_shared/delivery-policy.js";
import { uberClientFor, UBER_MODE, POLICY, pilotGate, NEW_DELIVERY_ORDERS } from "../_shared/uber-env.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// A public endpoint that spends Uber API calls: a global brake keeps a script
// from burning the sandbox limit (200 requests / 10 min per application).
const MAX_QUOTES_PER_10_MIN = 60;

// What each Uber error means to the person typing their address.
const CUSTOMER_MESSAGE: Record<string, string> = {
  address_undeliverable: "Sorry, we can't deliver to that address. Please check it, or choose pickup.",
  couriers_unavailable: "No delivery drivers are available right now. Please try again in a few minutes, or choose pickup.",
  rate_limited: "Delivery pricing is busy. Please try again in a minute.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (UBER_MODE === "disabled" || !NEW_DELIVERY_ORDERS) return json({ error: "Delivery isn't available yet. Please choose pickup." }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const gate = pilotGate(body?.pilotCode, body?.phone);
    if (!gate.ok) return json({ error: "Delivery isn't available yet. Please choose pickup.", code: gate.reason }, 403);
    const norm = normaliseDeliveryAddress(body?.address);
    if (norm.error) return json({ error: norm.error }, 400);
    const dropoffAddress = formatUberAddress(norm.address);
    if (!dropoffAddress) return json({ error: "Please check the address." }, 400);
    const dropoffPhone = toE164(body?.phone) ?? STORE.phone; // the driver's number for the customer, if given

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabase.from("delivery_quotes").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= MAX_QUOTES_PER_10_MIN) return json({ error: CUSTOMER_MESSAGE.rate_limited }, 429);

    // The courier is asked to arrive when the food will be ready, so Uber's
    // drop-off estimate already includes the kitchen's prep time.
    const readyAt = new Date(Date.now() + POLICY.prepMinutes * 60_000).toISOString();
    const uber = uberClientFor(supabase);
    const q = await uber.createQuote({
      pickupAddress: formatUberAddress(STORE.address),
      dropoffAddress,
      pickupPhone: STORE.phone,
      dropoffPhone,
      pickupReadyAt: readyAt,
    });

    const fee = customerDeliveryFeeCents(q.feeCents, POLICY);
    if (fee === null) return json({ error: `Sorry, that address is outside our delivery area (about ${POLICY.maxMiles} miles). Please choose pickup.`, code: "out_of_area" }, 400);

    const { data: row, error } = await supabase.from("delivery_quotes").insert({
      uber_quote_id: q.quoteId,
      uber_mode: UBER_MODE,
      fee_cents: q.feeCents,
      address: norm.address,
      address_key: addressKey(norm.address),
      dropoff_eta: q.dropoffEta,
      duration_min: q.durationMin,
      expires_at: q.expiresAt,
    }).select("id").single();
    if (error || !row) return json({ error: "Could not save the delivery price. Please try again." }, 500);

    // Minutes from now to the door, prep included (Uber's drop-off estimate
    // for a pickup at readyAt). Falls back to prep + Uber's trip duration.
    const etaMs = Date.parse(q.dropoffEta ?? "") - Date.now();
    const etaMinutes = Number.isFinite(etaMs) && etaMs > 0
      ? Math.round(etaMs / 60_000)
      : POLICY.prepMinutes + Number(q.durationMin ?? 0);
    return json({
      quoteId: row.id,
      feeCents: fee,
      etaMinutes,
      prepMinutes: POLICY.prepMinutes,
      dropoffEta: q.dropoffEta,
      expiresAt: q.expiresAt,
      minSubtotalCents: POLICY.minSubtotalCents,
      courierTips: POLICY.courierTips,
      sandbox: UBER_MODE === "sandbox",
    });
  } catch (e) {
    if (e instanceof UberDirectError) {
      console.error("uber quote failed:", e.code, e.status);
      return json({ error: CUSTOMER_MESSAGE[e.code] ?? "Couldn't get a delivery price right now. Please try again, or choose pickup.", code: e.code }, e.code === "address_undeliverable" ? 400 : 502);
    }
    console.error("uber-delivery-quote error:", (e as Error)?.message);
    return json({ error: "Couldn't get a delivery price right now." }, 500);
  }
});
