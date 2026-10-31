// uber-dispatch — books the Uber Direct courier for paid, kitchen-accepted
// website delivery orders, and cancels couriers for orders the kitchen
// cancelled or that were refunded. Run every minute by pg_cron (like
// clover-sync); safe to run twice at once.
//
// A courier is booked ONLY when ALL hold (delivery-policy.canDispatch):
//   delivery order · payment_status = paid · kitchen has accepted it
//   (accepted / preparing / ready — never "pending") · no courier yet ·
//   not handed to staff · created in the current Uber mode (sandbox or live).
// Exactly-once: claim_uber_dispatch() lets one caller own an order; Uber gets
// external_id + idempotency_key = the order id; a unique index refuses a
// second delivery id for the same order.
//
// Sandbox deliveries use Uber's robo courier unless UBER_DIRECT_ROBO=off.
//
// Also, when DELIVERY_AUTO_REFUND=on: a PAID delivery the kitchen rejected
// BEFORE any courier was booked is refunded in full automatically, once
// (claim_auto_refund + a Stripe idempotency key). The existing Stripe webhook
// then records refund_status and loyalty exactly as for any other refund. A
// failed refund is left as auto_refund_state='failed' for staff to refund
// by hand in the Refunds tool; it is never retried automatically.
// Deploy:  supabase functions deploy uber-dispatch --no-verify-jwt
// Auth:    header x-dispatch-secret must equal UBER_DISPATCH_TRIGGER_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
// deno-lint-ignore-file
// @ts-ignore — shared plain-JS modules
import { formatUberAddress, toE164, UberDirectError } from "../_shared/uber-direct.js";
// @ts-ignore
import { canDispatch, autoRefundDecision, requoteDecision, quoteUsableForCheckout, deliveryRequestFor, courierCancellable, addressKey, pickupReadyAt, MAX_DISPATCH_ATTEMPTS, STORE } from "../_shared/delivery-policy.js";
import { uberClientFor, UBER_MODE, POLICY } from "../_shared/uber-env.ts";
import { notifyDelivery, retryFailedNotifications } from "../_shared/delivery-notify.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const TRIGGER_SECRET = Deno.env.get("UBER_DISPATCH_TRIGGER_SECRET") ?? "";
const ROBO = (Deno.env.get("UBER_DIRECT_ROBO") ?? "auto").toLowerCase() !== "off";
const AUTO_REFUND = ["on", "true", "1"].includes(String(Deno.env.get("DELIVERY_AUTO_REFUND") ?? "").toLowerCase());
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY_WEB") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() }) : null;

// Errors worth retrying on the next run; everything else goes to staff.
const RETRYABLE = new Set(["couriers_unavailable", "rate_limited", "upstream", "unknown"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function release(id: string, patch: Record<string, unknown>) {
  await supabase.from("orders").update({ uber_dispatch_claimed_at: null, uber_updated_at: new Date().toISOString(), ...patch }).eq("id", id);
  if (patch.uber_dispatch_state === "needs_staff") {
    const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (o) await notifyDelivery(supabase, o, "problem");
  }
}

async function dispatchOne(uber: any, o: any) {
  const gate = canDispatch(o, Date.now(), UBER_MODE);
  if (!gate.ok) return { id: o.id, skipped: gate.reason };

  const { data: claimed } = await supabase.rpc("claim_uber_dispatch", { p_order: o.id });
  if (!claimed?.length) return { id: o.id, skipped: "claimed_elsewhere" };
  const order = { ...claimed[0], guest_phone_e164: toE164(claimed[0].guest_phone) };

  try {
    if (!order.guest_phone_e164) throw new UberDirectError("invalid_request", "Customer phone is not a valid US number");
    const paidFee = Math.round(Number(order.delivery_fee ?? 0) * 100);

    // Ask the courier to arrive when the food will be ready (accept time + prep).
    const readyAt = pickupReadyAt(order.kitchen_accepted_at, order.status, POLICY);

    // Reuse the checkout quote only while it is valid AND still for this
    // order's address (staff may have corrected it); otherwise re-quote. Uber
    // does not check that a quote matches the delivery's dropoff.
    let quoteId: string | null = null;
    let feeCents = paidFee;
    if (order.delivery_quote_id) {
      const { data: q } = await supabase.from("delivery_quotes").select("uber_quote_id, expires_at, address_key").eq("id", order.delivery_quote_id).maybeSingle();
      if (q && quoteUsableForCheckout(q.expires_at) && q.address_key === addressKey(order.delivery_address ?? {})) quoteId = q.uber_quote_id;
    }
    if (!quoteId) {
      const fresh = await uber.createQuote({
        pickupAddress: formatUberAddress(STORE.address),
        dropoffAddress: formatUberAddress(order.delivery_address),
        pickupPhone: STORE.phone,
        dropoffPhone: order.guest_phone_e164,
        pickupReadyAt: readyAt,
      });
      const d = requoteDecision(paidFee, fresh.feeCents, POLICY);
      if (!d.ok) {
        await release(order.id, { uber_dispatch_state: "needs_staff", uber_dispatch_error: `requote:${d.reason}${d.extraCents ? `:+${d.extraCents}c` : ""}` });
        return { id: order.id, needs_staff: d.reason };
      }
      quoteId = fresh.quoteId;
      feeCents = fresh.feeCents;
    }

    const { data: items } = await supabase.from("order_items").select("item_name, quantity").eq("order_id", order.id);
    const req = deliveryRequestFor(order, items, formatUberAddress);
    const del = await uber.createDelivery({
      ...req,
      quoteId,
      pickupReadyAt: readyAt,
      ...(UBER_MODE === "sandbox" && ROBO ? { testSpecifications: { robo_courier_specification: { mode: "auto" } } } : {}),
    });

    const { error: saveErr } = await supabase.from("orders").update({
      uber_delivery_id: del.id,
      uber_status: del.status ?? "pending",
      uber_tracking_url: del.tracking_url ?? null,
      uber_fee_cents: Number(del.fee ?? feeCents),
      uber_courier: { pickup_eta: del.pickup_eta ?? null, dropoff_eta: del.dropoff_eta ?? null, updated: new Date().toISOString() },
      uber_dispatch_state: "dispatched",
      uber_dispatch_error: null,
      uber_dispatch_claimed_at: null,
      uber_updated_at: new Date().toISOString(),
    }).eq("id", order.id).is("uber_delivery_id", null);
    if (saveErr) {
      // The courier exists but we couldn't record it: never retry blindly.
      await release(order.id, { uber_dispatch_state: "needs_staff", uber_dispatch_error: `saved_failed:${del.id}` });
      return { id: order.id, needs_staff: "save_failed", delivery: del.id };
    }
    await notifyDelivery(supabase, { ...order, uber_delivery_id: del.id }, "courier_booked");
    return { id: order.id, dispatched: del.id, status: del.status };
  } catch (e) {
    const code = e instanceof UberDirectError ? e.code : "unknown";
    const giveUp = !RETRYABLE.has(code) || (order.uber_dispatch_attempts ?? 0) >= MAX_DISPATCH_ATTEMPTS;
    await release(order.id, { uber_dispatch_state: giveUp ? "needs_staff" : null, uber_dispatch_error: `${code}:${String((e as Error)?.message ?? "").slice(0, 160)}` });
    return { id: order.id, error: code, needs_staff: giveUp };
  }
}

async function cancelOne(uber: any, o: any) {
  if (!courierCancellable(o.uber_status)) return { id: o.id, cancel: "too_late", uber_status: o.uber_status };
  try {
    const d = await uber.cancelDelivery(o.uber_delivery_id);
    await supabase.from("orders").update({ uber_status: d?.status ?? "canceled", uber_updated_at: new Date().toISOString() }).eq("id", o.id);
    return { id: o.id, cancelled: o.uber_delivery_id };
  } catch (e) {
    const code = e instanceof UberDirectError ? e.code : "unknown";
    await supabase.from("orders").update({ uber_dispatch_state: "needs_staff", uber_dispatch_error: `cancel:${code}` }).eq("id", o.id);
    return { id: o.id, cancel_error: code };
  }
}

async function autoRefundOne(o: any) {
  const gate = autoRefundDecision(o, UBER_MODE);
  if (!gate.ok) return { id: o.id, skipped: gate.reason };
  const { data: claimed } = await supabase.rpc("claim_auto_refund", { p_order: o.id });
  if (!claimed?.length) return { id: o.id, skipped: "claimed_elsewhere" };
  try {
    if (!stripe) throw new Error("stripe_not_configured");
    const r = await stripe.refunds.create(
      { payment_intent: o.stripe_payment_intent, reason: "requested_by_customer",
        metadata: { order_id: o.id, cause: "kitchen_rejected_delivery" } },
      { idempotencyKey: `auto-refund-${o.id}` },
    );
    await supabase.from("orders").update({ auto_refund_state: "refunded", auto_refund_id: r.id, auto_refund_error: null }).eq("id", o.id);
    await notifyDelivery(supabase, o, "refunded");
    return { id: o.id, refunded: r.status };
  } catch (e) {
    const msg = String((e as any)?.code ?? (e as Error)?.message ?? "refund_failed").slice(0, 120);
    await supabase.from("orders").update({ auto_refund_state: "failed", auto_refund_error: msg }).eq("id", o.id);
    console.error("auto refund failed:", msg);
    return { id: o.id, refund_failed: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!TRIGGER_SECRET || req.headers.get("x-dispatch-secret") !== TRIGGER_SECRET) return json({ error: "Forbidden" }, 403);
  if (UBER_MODE === "disabled") return json({ ok: true, mode: "disabled", note: "UBER_DIRECT_MODE is off; nothing dispatched." });

  const uber = uberClientFor(supabase);
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: todo } = await supabase.from("orders")
    .select("*")
    .eq("fulfillment", "delivery").eq("payment_status", "paid").eq("uber_mode", UBER_MODE)
    .is("uber_delivery_id", null).in("status", ["accepted", "preparing", "ready"])
    .gte("created_at", since).limit(20);

  const { data: toCancel } = await supabase.from("orders")
    .select("id, status, payment_status, refund_status, uber_delivery_id, uber_status")
    .eq("fulfillment", "delivery").not("uber_delivery_id", "is", null)
    // A FULL refund cancels the courier; a partial refund (one item) does not.
    .or("status.eq.cancelled,payment_status.eq.refunded,payment_status.eq.failed,refund_status.eq.full")
    .not("uber_status", "in", "(canceled,delivered,returned)")
    .gte("created_at", since).limit(20);

  // "We got your order" text for newly paid delivery orders (deduplicated per order).
  const { data: fresh } = await supabase.from("orders").select("*")
    .eq("fulfillment", "delivery").eq("payment_status", "paid").eq("uber_mode", UBER_MODE)
    .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).limit(50);
  for (const o of fresh ?? []) await notifyDelivery(supabase, o, "confirmed");

  const dispatched = [];
  for (const o of todo ?? []) dispatched.push(await dispatchOne(uber, o));
  const cancelled = [];
  for (const o of toCancel ?? []) cancelled.push(await cancelOne(uber, o));
  // Kitchen rejected a paid delivery before a courier existed → refund it.
  const refunds = [];
  if (AUTO_REFUND) {
    const { data: rejected } = await supabase.from("orders").select("*")
      .eq("fulfillment", "delivery").eq("status", "cancelled").eq("payment_status", "paid")
      .eq("refund_status", "none").eq("uber_mode", UBER_MODE)
      .is("uber_delivery_id", null).is("auto_refund_state", null)
      .gte("created_at", since).limit(20);
    for (const o of rejected ?? []) refunds.push(await autoRefundOne(o));
  }
  const retried = await retryFailedNotifications(supabase);
  return json({ ok: true, mode: UBER_MODE, dispatched, cancelled, refunds, retried });
});
