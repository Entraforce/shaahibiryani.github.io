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


// ── Logical checkout identity ───────────────────────────────────────────────
// One logical checkout must yield at most one PaymentIntent, however many
// times the browser asks. The browser has no session, so the identity is
// derived server-side from what actually defines this checkout: who is buying
// and exactly what is in the basket. Same customer + same basket + same tip +
// same fulfilment = same key = Stripe replays the original PaymentIntent
// instead of creating a second one. Change the basket and the key changes,
// which is precisely when a new PaymentIntent SHOULD be created.
//
// Deliberately not random, and deliberately not client-supplied.
async function checkoutKey(parts: {
  phone: string; items: LineRef[]; tipCents: number; fulfillment: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    p: parts.phone,
    f: parts.fulfillment,
    t: parts.tipCents,
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

    const guestName = clean(body?.guestName, 80);
    const guestPhone = clean(body?.guestPhone, 40);
    const guestEmail = clean(body?.guestEmail, 120);
    if (!guestName || !guestPhone) {
      return json({ error: "Name and phone are required." }, 400);
    }

    // ── Price every line from the owner-editable menu table ──
    // One read serves the whole order; the static PRICES map only fills in
    // keys the table doesn't have (e.g. cached pages ordering a removed item).
    // published_price is what the live site shows; `price` may hold a staged
    // edit awaiting Publish. Charge what the customer saw.
    const dbPrices: Record<
      string,
      { price: number; available: boolean; schedule: unknown }
    > = {};
    const { data: menuRows, error: menuErr } = await supabase
      .from("web_menu_items")
      .select("pid, price, published_price, available, schedule")
      .not("pid", "is", null);
    if (!menuErr && menuRows) {
      for (const r of menuRows) {
        const p = r.published_price ?? r.price;
        if (r.pid != null && p != null) {
          dbPrices[r.pid] = {
            price: Number(p),
            available: !!r.available,
            schedule: r.schedule ?? null,
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
        item_name: clean(line.itemName, 120) ?? String(line.menuItemId),
        variant_name: clean(line.variantName, 80),
        unit_price: price,
        quantity: qty,
        line_total: price * qty,
        special_instructions: clean(line.specialInstructions, 280),
      });
    }
    if (subtotalCents <= 0) return json({ error: "Empty order." }, 400);

    const taxCents = Math.round(subtotalCents * TAX_RATE);

    let tipCents = Number(body?.tipCents);
    if (!Number.isFinite(tipCents) || tipCents < 0) tipCents = 0;
    tipCents = Math.min(Math.round(tipCents), TIP_MAX_CENTS);

    // Website is pickup-only for now (no delivery fee).
    const totalCents = subtotalCents + taxCents + tipCents;
    if (totalCents < 50) return json({ error: "Order total too low." }, 400);

    // Optional scheduled pickup time (ISO string).
    const scheduledFor = clean(body?.scheduledFor, 40);

    // Item summary — shows up on the customer's emailed Stripe receipt so they
    // can see WHAT they ordered, not just the amount.
    const itemSummary = itemRows
      .map((r) => `${r.quantity}x ${r.item_name}`)
      .join(", ");
    const description = `Shaahi Biryani pickup order — ${itemSummary}`.slice(0, 900);

    // ── Stripe PaymentIntent ──
    // The idempotency key is stable for this logical checkout, so concurrent
    // or repeated calls collapse onto ONE PaymentIntent rather than racing
    // into several. Stripe replays the original response for 24h.
    const ckey = await checkoutKey({
      phone: guestPhone,
      items: items as LineRef[],
      tipCents: Math.round(Number(body?.tipCents) || 0),
      fulfillment: "pickup",
    });

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
      },
    }, { idempotencyKey: ckey });

    // Stripe may have replayed an existing PaymentIntent. If an order already
    // exists for it, return that one instead of inserting a second row — this
    // is the reuse path, not an error path. orders_stripe_payment_intent_key
    // remains the last line of defence if two inserts still race.
    const { data: existing } = await supabase
      .from("orders")
      .select("id, order_number, subtotal, tax, delivery_fee, tip, total, payment_status")
      .eq("stripe_payment_intent", paymentIntent.id)
      .maybeSingle();
    if (existing) {
      return json({
        paymentIntent: paymentIntent.client_secret,
        orderId: existing.id,
        orderNumber: existing.order_number,
        reused: true,
        alreadyPaid: existing.payment_status === "paid",
        breakdown: {
          subtotalCents: Math.round(Number(existing.subtotal) * 100),
          taxCents: Math.round(Number(existing.tax) * 100),
          tipCents: Math.round(Number(existing.tip) * 100),
          totalCents: Math.round(Number(existing.total) * 100),
        },
      });
    }

    // ── Insert the order (pending + unpaid until the webhook confirms) ──
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: null,
        source: "web",
        guest_name: guestName,
        guest_phone: guestPhone,
        status: "pending",
        fulfillment: "pickup",
        subtotal: subtotalCents / 100,
        tax: taxCents / 100,
        delivery_fee: 0,
        tip: tipCents / 100,
        total: totalCents / 100,
        delivery_address: null,
        scheduled_for: scheduledFor,
        points_redeemed: 0,
        points_earned: 0,
        stripe_payment_intent: paymentIntent.id,
        payment_status: "pending",
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      // 23505 on orders_stripe_payment_intent_key means a concurrent request
      // for this same logical checkout inserted first. That is the expected
      // outcome of a race, not a failure: the idempotency key already
      // guaranteed a single PaymentIntent, so the winner's order IS this
      // caller's order. Return it instead of surfacing a database error —
      // otherwise 19 of 20 simultaneous customers see "duplicate key".
      const e = orderErr as { code?: string; message?: string } | null;
      const isDuplicate = e?.code === "23505" ||
        /duplicate key|already exists/i.test(e?.message ?? "");
      if (isDuplicate) {
        // Read-after-write: the request that won the insert may not have
        // committed by the time we look. It commits in milliseconds, so retry
        // briefly rather than failing a customer who did nothing wrong.
        let won: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 6 && !won; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 120));
          const { data } = await supabase
            .from("orders")
            .select("id, order_number, subtotal, tax, delivery_fee, tip, total, payment_status")
            .eq("stripe_payment_intent", paymentIntent.id)
            .maybeSingle();
          won = data ?? null;
        }
        if (won) {
          return json({
            paymentIntent: paymentIntent.client_secret,
            orderId: (won as any).id,
            orderNumber: (won as any).order_number,
            reused: true,
            alreadyPaid: (won as any).payment_status === "paid",
            breakdown: {
              subtotalCents: Math.round(Number((won as any).subtotal) * 100),
              taxCents: Math.round(Number((won as any).tax) * 100),
              tipCents: Math.round(Number((won as any).tip) * 100),
              totalCents: Math.round(Number((won as any).total) * 100),
            },
          });
        }
      }
      return json({ error: orderErr?.message ?? "Could not create order." }, 500);
    }

    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(itemRows.map((r) => ({ ...r, order_id: order.id })));

    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", order.id).then(() => {}, () => {});
      return json({ error: itemsErr.message }, 500);
    }

    return json({
      paymentIntent: paymentIntent.client_secret,
      orderId: order.id,
      orderNumber: String(order.id).slice(-6).toUpperCase(),
      breakdown: { subtotalCents, taxCents, tipCents, totalCents },
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
