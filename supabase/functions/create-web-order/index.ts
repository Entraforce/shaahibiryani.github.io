// create-web-order — website (guest) online ordering.
//
// Flow:
//   1. Website POSTs item references (+ guest name/phone). NEVER a price.
//   2. We price the order from the web_menu_items table (owner-editable via
//      /kadmin) — the customer's browser can't tamper with it. The static
//      PRICES map is kept only as a fallback for keys missing from the table
//      (or if the table read fails), so ordering never goes down.
//   3. We create a Stripe PaymentIntent and insert a PENDING/unpaid order +
//      order_items into the SAME tables the kitchen dashboard reads.
//   4. The browser confirms the card against the returned client secret.
//   5. stripe-webhook flips the order's payment_status to 'paid' → it appears
//      on the dashboard (which only shows paid guest orders) with a chime.
//
// Deploy WITHOUT JWT verification (guests have no Supabase login); the security
// boundary is that pricing is server-side and the DB write uses the service role:
//   supabase functions deploy create-web-order --no-verify-jwt
//
// Secrets used (all already set for the other functions):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PRICES } from "../_shared/prices.ts";
// deno-lint-ignore-file
// @ts-ignore — shared plain-JS module (also used by publish-menu and locally)
import { inScheduleWindow, scheduleLabel } from "../_shared/render-menu.js";
// @ts-ignore — shared plain-JS module (also run by scripts/verify-order-rules.mjs)
import { addOnLimitError, addOnOnlyError } from "../_shared/order-rules.js";
// @ts-ignore — shared plain-JS modules (also run by scripts/verify-uber-direct.mjs)
import { uberMode, toE164 } from "../_shared/uber-direct.js";
// @ts-ignore
import { normaliseDeliveryAddress, addressKey, customerDeliveryFeeCents, quoteUsableForCheckout, policyFromEnv, courierTipCents as courierTipFrom, orderTax } from "../_shared/delivery-policy.js";
// @ts-ignore
import { pilotGate, NEW_DELIVERY_ORDERS, PILOT_MAX_ORDERS } from "../_shared/uber-env.ts";

// Website delivery via Uber Direct is SANDBOX-ONLY in this build and off unless
// UBER_DIRECT_MODE=sandbox|live. Sandbox delivery requires a TEST Stripe key
// and live delivery a LIVE one, so a real customer never pays for a test
// courier and a test card never books a real one. Live also requires the pilot
// gate. Pickup is untouched by everything below.
const UBER_MODE = uberMode(Deno.env.get("UBER_DIRECT_MODE"));
const POLICY = policyFromEnv((k: string) => Deno.env.get(k));
const STRIPE_KEY_IS_LIVE = /^(sk|rk)_live_/.test(
  Deno.env.get("STRIPE_SECRET_KEY_WEB") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "",
);

// The website uses its OWN Stripe key (STRIPE_SECRET_KEY_WEB = the live, real
// account) so it is fully independent of the app's create-payment-intent, which
// keeps using STRIPE_SECRET_KEY. Falls back to STRIPE_SECRET_KEY if the web key
// isn't set (e.g. local/test).
const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY_WEB") ?? Deno.env.get("STRIPE_SECRET_KEY")!,
  {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  },
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Kept in sync with create-payment-intent (which enforces the same rules).
const TAX_RATE = 0.0825;
const TIP_MAX_CENTS = 100_000;

type LineRef = {
  menuItemId?: unknown;
  variantId?: unknown;
  quantity?: unknown;
  itemName?: unknown;      // display only — price always comes from PRICES
  variantName?: unknown;   // display only
  specialInstructions?: unknown;
};


// ── Basket fingerprint ──────────────────────────────────────────────────────
// One logical checkout must yield at most one PaymentIntent, however many
// times the browser asks. The browser has no session, so the identity is
// derived server-side from what actually defines this checkout: who is buying
// and exactly what is in the basket. Same customer + same basket + same tip +
// same fulfilment = same key = Stripe replays the original PaymentIntent
// instead of creating a second one. Change the basket and the key changes,
// which is precisely when a new PaymentIntent SHOULD be created.
//
// Deliberately not random, and deliberately not client-supplied.
async function basketFingerprint(parts: {
  phone: string; items: LineRef[]; tipCents: number; fulfillment: string;
  delivery?: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    p: parts.phone,
    f: parts.fulfillment,
    t: parts.tipCents,
    // Delivery only: the address + quote, so a changed address is a new
    // checkout. Absent for pickup, keeping pickup fingerprints unchanged.
    ...(parts.delivery ? { d: parts.delivery } : {}),
    // sorted so key order in the request cannot change the fingerprint
    i: parts.items
      .map((l) => `${String(l.menuItemId)}|${String(l.variantId)}x${Number(l.quantity)}`)
      .sort(),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return "sbco_" + Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "No items." }, 400);
    }
    // An order of add-on naans alone is refused before anything is priced,
    // written or sent to Stripe — the same rule as the app's checkout.
    const addOnErr = addOnOnlyError(items);
    if (addOnErr) return json({ error: addOnErr }, 400);

    const guestName = clean(body?.guestName, 80);
    const guestPhone = clean(body?.guestPhone, 40);
    const guestEmail = clean(body?.guestEmail, 120);
    if (!guestName || !guestPhone) {
      return json({ error: "Name and phone are required." }, 400);
    }
    // Only an explicit true counts. Anything else — absent, "false", a
    // truthy-looking string — is "they did not tick it", which is not the same
    // as "they said no" and is never recorded as a refusal.
    const marketingOptIn = body?.marketingOptIn === true;

    // Where this guest came from, captured by the page and passed straight
    // through. Size-capped and shape-checked rather than trusted: it arrives
    // from the browser, so it is input, not fact. Null when they declined
    // advertising cookies, which is a legitimate answer and not an error.
    let attribution: unknown = null;
    try {
      const a = body?.attribution;
      if (a && typeof a === "object" && !Array.isArray(a)) {
        const s = JSON.stringify(a);
        if (s.length <= 2000) attribution = JSON.parse(s);
      }
    } catch { /* unparseable attribution is simply absent */ }

    // ── Price every line from the owner-editable menu table ──
    // One read serves the whole order; the static PRICES map only fills in
    // keys the table doesn't have (e.g. cached pages ordering a removed item).
    // published_price is what the live site shows; `price` may hold a staged
    // edit awaiting Publish. Charge what the customer saw.
    const dbPrices: Record<
      string,
      { price: number; available: boolean; schedule: unknown; category: string | null }
    > = {};
    const { data: menuRows, error: menuErr } = await supabase
      .from("web_menu_items")
      .select("pid, price, published_price, available, schedule, inactive, category")
      .not("pid", "is", null);
    if (!menuErr && menuRows) {
      for (const r of menuRows) {
        const p = r.published_price ?? r.price;
        if (r.pid != null && p != null) {
          dbPrices[r.pid] = {
            price: Number(p),
            // A permanently removed dish is not orderable, whatever the
            // sold-out toggle happens to say. It is off every menu, so a
            // request for one can only come from a stale page or a crafted
            // call — pricing, tax and idempotency are untouched by this.
            available: !!r.available && r.inactive !== true,
            schedule: r.schedule ?? null,
            category: r.category ?? null,
          };
        }
      }
    }

    let subtotalCents = 0;
    let count = 0;
    const itemRows: Array<Record<string, unknown>> = [];

    // Catering trays are cooked to order, so only a few can be bought online
    // (mirrors the ceilings on the site); bigger orders need a phone call and
    // 4-5 days. Enforced here too so editing the page can't slip an unfillable
    // order past the kitchen. Ceilings are per pan size because one full tray
    // of biryani already feeds 15-20 — the usual party order (one full plus a
    // few halves) has to pass.
    const MAX_FULL_TRAYS = 2, MAX_HALF_TRAYS = 4;
    let fullTrays = 0, halfTrays = 0;
    for (const line of items as LineRef[]) {
      if (!String(line.menuItemId).startsWith("cat-")) continue;
      const q = Number(line.quantity);
      if (!Number.isFinite(q) || q < 1) continue;
      if (line.variantId === "full") fullTrays += q;
      else if (line.variantId === "half") halfTrays += q;
    }
    const over: string[] = [];
    if (fullTrays > MAX_FULL_TRAYS) {
      over.push(`${fullTrays} full trays (max ${MAX_FULL_TRAYS} online)`);
    }
    if (halfTrays > MAX_HALF_TRAYS) {
      over.push(`${halfTrays} half trays (max ${MAX_HALF_TRAYS} online)`);
    }
    if (over.length) {
      return json({
        error: `Your order has ${over.join(" and ")}. Larger orders need ` +
          `4–5 days' notice so we can prep properly — please call ` +
          `(469) 960-3300 and we'll take care of you.`,
      }, 400);
    }

    // One add-on naan per curry/grill dish, as at the register. Needs the
    // menu table's categories, so it only runs when that read succeeded.
    if (!menuErr && menuRows) {
      const limitErr = addOnLimitError(items, (pid: string) => dbPrices[pid]?.category ?? null);
      if (limitErr) return json({ error: limitErr }, 400);
    }

    for (const line of items as LineRef[]) {
      const key = `${String(line.menuItemId)}|${String(line.variantId)}`;
      const entry = dbPrices[key];
      if (entry && !entry.available) {
        const label = clean(line.itemName, 120) ?? key;
        return json({ error: `${label} is sold out right now — please remove it from your cart.` }, 400);
      }
      if (entry && entry.schedule && !inScheduleWindow(entry.schedule)) {
        const label = clean(line.itemName, 120) ?? key;
        const when = scheduleLabel(entry.schedule);
        return json({
          error: `${label} is only available ${when} — please remove it from your cart.`,
        }, 400);
      }
      const price = entry ? entry.price : PRICES[key];
      const qty = Number(line.quantity);
      if (price == null) return json({ error: `Unknown item: ${key}` }, 400);
      if (!Number.isInteger(qty) || qty < 1 || qty > 200) {
        return json({ error: "Invalid quantity." }, 400);
      }
      const unitCents = Math.round(price * 100);
      subtotalCents += unitCents * qty;
      count += qty;

      itemRows.push({
        item_id: null,
        variant_id: null,
        // `key` is the pid this line was PRICED from, so recording it keeps the
        // order line and the price provably about the same menu row. Clover
        // firing joins on it rather than re-deriving identity from a name.
        pid: key,
        item_name: clean(line.itemName, 120) ?? String(line.menuItemId),
        variant_name: clean(line.variantName, 80),
        unit_price: price,
        quantity: qty,
        line_total: price * qty,
        special_instructions: clean(line.specialInstructions, 280),
      });
    }
    if (subtotalCents <= 0) return json({ error: "Empty order." }, 400);

    // Pickup: tax on food, as always. Delivery adds tax on the delivery fee below.
    let taxCents = Math.round(subtotalCents * TAX_RATE);
    let deliveryTaxCents = 0;

    let tipCents = Number(body?.tipCents);
    if (!Number.isFinite(tipCents) || tipCents < 0) tipCents = 0;
    tipCents = Math.min(Math.round(tipCents), TIP_MAX_CENTS);

    // ── Delivery (Uber Direct, sandbox) ──
    // The fee is never taken from the browser: it comes from a delivery_quotes
    // row that uber-delivery-quote wrote, for this exact address, still valid.
    const fulfillment = body?.fulfillment === "delivery" ? "delivery" : "pickup";
    let deliveryFeeCents = 0;
    let courierTipCents = 0;
    let delivery: null | { address: Record<string, string>; quoteRowId: string; key: string; phoneE164: string } = null;
    if (fulfillment === "delivery") {
      if (UBER_MODE === "disabled" || !NEW_DELIVERY_ORDERS) return json({ error: "Delivery isn't available yet. Please choose pickup." }, 400);
      // Test couriers only with test cards; real couriers only with real cards.
      if ((UBER_MODE === "sandbox") === STRIPE_KEY_IS_LIVE) return json({ error: "Delivery isn't available yet. Please choose pickup." }, 400);
      const gate = pilotGate(body?.pilotCode, guestPhone);
      if (!gate.ok) return json({ error: "Delivery isn't available yet. Please choose pickup.", code: gate.reason }, 403);
      if (PILOT_MAX_ORDERS !== null) {
        const { count, error: capErr } = await supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("fulfillment", "delivery").eq("uber_mode", UBER_MODE).eq("payment_status", "paid");
        if (capErr || (count ?? 0) >= PILOT_MAX_ORDERS) return json({ error: "Delivery isn't available yet. Please choose pickup.", code: "pilot_full" }, 403);
      }
      const norm = normaliseDeliveryAddress(body?.deliveryAddress);
      if (norm.error) return json({ error: norm.error }, 400);
      const phoneE164 = toE164(guestPhone);
      if (!phoneE164) return json({ error: "Please enter a 10-digit US phone number for the driver." }, 400);
      if (subtotalCents < POLICY.minSubtotalCents) {
        return json({ error: `Delivery orders need at least $${(POLICY.minSubtotalCents / 100).toFixed(0)} of food.` }, 400);
      }
      const quoteRowId = clean(body?.deliveryQuoteId, 64);
      if (!quoteRowId) return json({ error: "Please get a delivery price for your address first." }, 400);
      const { data: q } = await supabase
        .from("delivery_quotes")
        .select("id, fee_cents, address_key, expires_at, uber_mode, used_by_order")
        .eq("id", quoteRowId)
        .maybeSingle();
      if (!q || q.uber_mode !== UBER_MODE) return json({ error: "Please get a delivery price for your address first." }, 400);
      if (q.address_key !== addressKey(norm.address)) return json({ error: "Your address changed. Please get a new delivery price." }, 409);
      if (!quoteUsableForCheckout(q.expires_at)) return json({ error: "Your delivery price expired. Please refresh it.", code: "quote_expired" }, 409);
      const fee = customerDeliveryFeeCents(q.fee_cents, POLICY);
      if (fee === null) return json({ error: "Sorry, that address is outside our delivery area." }, 400);
      deliveryFeeCents = fee;
      // Optional tip for the Uber courier — passed to Uber in full. The
      // restaurant-staff tip (tipCents) stays separate and never goes to Uber.
      courierTipCents = courierTipFrom(body?.courierTipCents, POLICY);
      // Texas taxes a delivery charge the seller bills for taxable food.
      const t = orderTax(subtotalCents, deliveryFeeCents, POLICY, TAX_RATE);
      taxCents = t.taxCents;
      deliveryTaxCents = t.deliveryTaxCents;
      delivery = { address: norm.address, quoteRowId: q.id, key: addressKey(norm.address) + "#" + q.id + "#ct" + courierTipCents, phoneE164 };
    }

    // Tips are never taxed. taxCents includes deliveryTaxCents for delivery.
    const totalCents = subtotalCents + taxCents + tipCents + deliveryFeeCents + courierTipCents;
    if (totalCents < 50) return json({ error: "Order total too low." }, 400);

    // Optional scheduled pickup time (ISO string).
    const scheduledFor = clean(body?.scheduledFor, 40);

    // Item summary — shows up on the customer's emailed Stripe receipt so they
    // can see WHAT they ordered, not just the amount.
    const itemSummary = itemRows
      .map((r) => `${r.quantity}x ${r.item_name}`)
      .join(", ");
    const description = `Shaahi Biryani ${fulfillment} order — ${itemSummary}`.slice(0, 900);

    // ── Stripe PaymentIntent ──
    // The idempotency key is stable for this logical checkout, so concurrent
    // or repeated calls collapse onto ONE PaymentIntent rather than racing
    // into several. Stripe replays the original response for 24h.
    const fingerprint = await basketFingerprint({
      phone: guestPhone,
      items: items as LineRef[],
      tipCents: Math.round(Number(body?.tipCents) || 0),
      fulfillment,
      delivery: delivery?.key,
    });

    // Atomically become the creator of this checkout, or discover that someone
    // else already is. Postgres blocks the losing INSERT on the unique index
    // until the winner commits, so a loser always reads committed state —
    // there is no visibility gap to retry around.
    const { data: claimRows, error: claimErr } = await supabase
      .rpc("claim_checkout_attempt", { p_fingerprint: fingerprint, p_phone: guestPhone });
    if (claimErr || !claimRows?.length) {
      console.error("claim_checkout_attempt failed:", claimErr?.message, claimErr?.details, claimErr?.hint);
      return json({ error: "Could not start checkout." }, 500);
    }
    const claim = claimRows[0];

    if (!claim.out_is_creator) {
      // Someone else owns creation. If they have finished, hand back their
      // result so every concurrent caller converges on one payment.
      if (claim.out_status === "awaiting_payment" && claim.out_secret) {
        return json({
          paymentIntent: claim.out_secret,
          orderId: claim.out_order_id,
          orderNumber: claim.out_order_number,
          checkoutAttemptId: claim.out_attempt_id,
          reused: true,
          breakdown: claim.out_breakdown,
          ...(claim.out_breakdown?.trackingToken ? { trackingToken: claim.out_breakdown.trackingToken } : {}),
        });
      }
      // Still being created. 202 + poll, never a 500.
      return json({
        status: "creating",
        checkoutAttemptId: claim.out_attempt_id,
        retryAfterMs: 400,
      }, 202);
    }

    // The Stripe idempotency key is the ATTEMPT id, not the basket. Retries of
    // this purchase converge; a deliberate re-order of the same basket gets a
    // new attempt once this one is paid, and therefore a new PaymentIntent.
    const ckey = `cwo:${claim.out_attempt_id}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      description,
      // Stripe emails the customer a receipt automatically (when receipts are
      // enabled in Stripe → Settings → Customer emails).
      receipt_email: guestEmail || undefined,
      metadata: {
        source: "web",
        guest_name: guestName,
        guest_email: guestEmail || "",
        item_count: String(count),
        checkout_key: ckey,
        // Carried into Stripe as well as our own table so the permission is
        // visible wherever the customer is being looked at. Our table is the
        // record of evidence; this is a convenience copy.
        marketing_opt_in: marketingOptIn ? "yes" : "no",
        ...(delivery ? { fulfillment: "delivery", delivery_fee_cents: String(deliveryFeeCents), courier_tip_cents: String(courierTipCents), staff_tip_cents: String(tipCents), delivery_tax_cents: String(deliveryTaxCents), uber_mode: UBER_MODE } : {}),
      },
    }, { idempotencyKey: ckey });

    // Secret half of the customer's tracking link (delivery orders only).
    const trackingToken = delivery
      ? Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("")
      : null;

    // ── Insert the order (pending + unpaid until the webhook confirms) ──
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: null,
        source: "web",
        guest_name: guestName,
        guest_phone: guestPhone,
        status: "pending",
        fulfillment,
        subtotal: subtotalCents / 100,
        tax: taxCents / 100,
        delivery_fee: deliveryFeeCents / 100,
        tip: tipCents / 100,
        total: totalCents / 100,
        delivery_address: delivery ? delivery.address : null,
        // Delivery-only columns (from the Uber Direct migration); pickup rows
        // never mention them, so pickup works whether or not it is applied.
        ...(delivery ? { delivery_quote_id: delivery.quoteRowId, uber_mode: UBER_MODE, courier_tip: courierTipCents / 100, delivery_tax: deliveryTaxCents / 100, tracking_token: trackingToken } : {}),
        scheduled_for: scheduledFor,
        points_redeemed: 0,
        points_earned: 0,
        stripe_payment_intent: paymentIntent.id,
        payment_status: "pending",
        attribution,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      await supabase.rpc("fail_checkout_attempt", {
        p_attempt_id: claim.out_attempt_id,
        p_error: orderErr?.message ?? "insert failed",
      });
      return json({ error: "Could not create order." }, 500);
    }

    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(itemRows.map((r) => ({ ...r, order_id: order.id })));

    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", order.id).then(() => {}, () => {});
      return json({ error: itemsErr.message }, 500);
    }

    // ── Permission to market to this guest ──
    //
    // The sentence below must stay character-identical to the checkbox label
    // in index.html. What is defensible under the TCPA is not that somebody
    // ticked a box but what the box SAID, and this is the copy that gets
    // quoted back. Recorded against the order so there is a transaction to
    // point at, and on BOTH channels because the website asks for an email
    // too — the checkbox text says "text me", so SMS is the explicit grant and
    // email rides along under CAN-SPAM, which does not require prior consent.
    //
    // Never allowed to fail the order: the guest is mid-checkout with a
    // PaymentIntent already created, and losing a marketing permission is not
    // a reason to lose a dinner.
    if (marketingOptIn) {
      const CONSENT_WORDING_V1 =
        "Text me offers and updates from Shaahi Biryani at this number. " +
        "Not required to place an order. Message and data rates may apply. " +
        "Reply STOP to opt out.";
      await supabase.rpc("record_marketing_consent", {
        p_phone: guestPhone,
        p_email: guestEmail || null,
        p_granted: true,
        p_channel: guestEmail ? "both" : "sms",
        p_source: "web_checkout",
        p_wording: CONSENT_WORDING_V1,
        p_order_id: order.id,
      }).then(() => {}, () => {});
    }

    if (delivery) {
      // One quote, one order. Not fatal if it races: the fee is already fixed.
      await supabase.from("delivery_quotes").update({ used_by_order: order.id })
        .eq("id", delivery.quoteRowId).is("used_by_order", null).then(() => {}, () => {});
    }

    await supabase.rpc("complete_checkout_attempt", {
      p_attempt_id: claim.out_attempt_id,
      p_intent: paymentIntent.id,
      p_secret: paymentIntent.client_secret,
      p_order: order.id,
      p_order_no: null,
      p_amount: totalCents,
      p_breakdown: {
        subtotalCents, taxCents, tipCents, totalCents,
        ...(delivery ? { deliveryFeeCents, deliveryTaxCents, courierTipCents, trackingToken } : {}),
      },
    });

    return json({
      paymentIntent: paymentIntent.client_secret,
      orderId: order.id,
      orderNumber: String(order.id).slice(-6).toUpperCase(),
      breakdown: { subtotalCents, taxCents, tipCents, totalCents, ...(delivery ? { deliveryFeeCents, deliveryTaxCents, courierTipCents } : {}) },
      ...(trackingToken ? { trackingToken } : {}),
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
