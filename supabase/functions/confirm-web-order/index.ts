// confirm-web-order — website (guest) order payment confirmation.
//
// Called by the website immediately after the customer's card payment succeeds.
// It does NOT trust the browser's word: it retrieves the order's PaymentIntent
// straight from Stripe and only marks the order paid if Stripe itself reports
// the charge succeeded. This is the website's primary "mark paid" path (the app
// uses its own flow; a Stripe webhook can be added later as a belt-and-suspenders
// safety net for the rare browser-closed-mid-confirm case).
//
// Deploy: supabase functions deploy confirm-web-order --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY_WEB, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY_WEB") ?? Deno.env.get("STRIPE_SECRET_KEY")!,
  { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() },
);

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId : null;
    if (!orderId) return json({ error: "Missing orderId." }, 400);

    // The PaymentIntent id is read from the ORDER, never from the request, so a
    // caller cannot point an order at someone else's successful charge. The
    // request supplies only which order to re-check.
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, payment_status, stripe_payment_intent, total, subtotal, tax, delivery_fee, tip")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) return json({ error: oErr.message }, 500);
    if (!order) return json({ error: "Order not found." }, 404);

    if (order.payment_status === "paid") return json({ ok: true, paid: true });
    if (!order.stripe_payment_intent) return json({ error: "Order has no payment." }, 400);

    // Ask Stripe — the source of truth — whether this charge actually succeeded.
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent);

    // ── Every check below must pass before money is called received ────────
    if (pi.status !== "succeeded") {
      return json({ ok: true, paid: false, status: pi.status });
    }
    // Test-mode charges must never mark a live order paid (or vice versa).
    if (pi.livemode !== (Deno.env.get("STRIPE_LIVEMODE") !== "false")) {
      console.error("livemode mismatch on", order.id);
      return json({ ok: true, paid: false, status: "environment_mismatch" });
    }
    if ((pi.currency ?? "").toLowerCase() !== "usd") {
      console.error("currency mismatch on", order.id);
      return json({ ok: true, paid: false, status: "currency_mismatch" });
    }
    // The captured amount must match what this order actually costs. Guards
    // against an order being re-pointed at a cheaper intent, and against a
    // total having been altered after the intent was created.
    const captured = pi.amount_received ?? pi.amount ?? 0;
    const expected = Math.round(Number(order.total ?? 0) * 100);
    if (expected > 0 && captured !== expected) {
      console.error("amount mismatch on", order.id, { captured, expected });
      return json({ ok: true, paid: false, status: "amount_mismatch" });
    }

    // Only flip a still-pending row. If the webhook won the race this matches
    // nothing, which is the correct outcome — it is already paid.
    const { error: uErr } = await supabase
      .from("orders")
      .update({ payment_status: "paid", paid_amount_cents: captured })
      .eq("id", order.id)
      .eq("payment_status", "pending");
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ ok: true, paid: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
