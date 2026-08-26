// Stripe webhook for the WEBSITE (live, real account) — payment safety net.
// Twin of stripe-webhook, but reads STRIPE_SECRET_KEY_WEB + STRIPE_WEBHOOK_SECRET_WEB
// so the website's live account is fully independent of the app's webhook.
//
// Listens for payment_intent.succeeded. If a matching order exists, marks it
// paid (idempotent). If NOT, records the charge in payment_orphans to reconcile.
//
// Deploy WITHOUT JWT verification (Stripe can't send a Supabase JWT); the Stripe
// signature check below is the security boundary:
//   supabase functions deploy stripe-webhook-web --no-verify-jwt
//
// Required secrets:
//   STRIPE_SECRET_KEY_WEB      (live restricted key, real account)
//   STRIPE_WEBHOOK_SECRET_WEB  (whsec_... from the live webhook endpoint)
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, mask } from "../_shared/obs.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_WEB")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_WEB");
  const body = await req.text();

  if (!signature || !webhookSecret) {
    return new Response("Missing signature or secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, {
      status: 400,
    });
  }


  // ── Replay defence ───────────────────────────────────────────────────────
  // Stripe re-delivers events on any non-2xx, on timeouts, and on manual
  // resend. Claim the event id first: the primary key on stripe_events means a
  // second delivery loses the race and returns here before touching an order,
  // so a replay cannot re-award points or re-print a ticket. Signature has
  // already been verified above, so only genuine Stripe events get this far.
  const { error: claimErr } = await supabase
    .from("stripe_events")
    .insert({ event_id: event.id, event_type: event.type, account: "web" });
  if (claimErr) {
    // 23505 = unique_violation: already processed. Ack so Stripe stops retrying.
    if ((claimErr as { code?: string }).code === "23505") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Any other failure: do NOT process, and do NOT ack — let Stripe retry.
    return new Response("Could not record event", { status: 500 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;

    const { data: order } = await supabase
      .from("orders")
      .select("id, payment_status")
      .eq("stripe_payment_intent", pi.id)
      .maybeSingle();

    if (order) {
      if (order.payment_status !== "paid") {
        await supabase
          .from("orders")
          .update({ payment_status: "paid", paid_amount_cents: pi.amount_received ?? pi.amount })
          .eq("id", order.id);
      }
    } else {
      await supabase.from("payment_orphans").upsert(
        {
          payment_intent_id: pi.id,
          user_id: (pi.metadata?.user_id as string) ?? null,
          amount_cents: pi.amount,
          currency: pi.currency,
          metadata: pi.metadata ?? {},
        },
        { onConflict: "payment_intent_id" },
      );
    }
  }

  // ── Payment did not succeed ──────────────────────────────────────────────
  // Recorded so a failed attempt is distinguishable from one still pending.
  // Never touches fulfillment.
  if (event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const next = event.type === "payment_intent.canceled" ? "cancelled" : "failed";
    const { data: order } = await supabase
      .from("orders").select("id, payment_status")
      .eq("stripe_payment_intent", pi.id).maybeSingle();
    if (order && order.payment_status === "pending") {
      await supabase.from("orders").update({ payment_status: next }).eq("id", order.id);
    }
    log("WARNING", "payment_not_succeeded", {
      outcome: next, pi: mask(pi.id), order_found: !!order,
      code: pi.last_payment_error?.code ?? null,
    });
  }

  // ── Refund issued outside our own refund tool ────────────────────────────
  // A refund made straight from the Stripe dashboard must still reach the
  // ledger, or loyalty and refund_status silently drift from reality.
  if (event.type === "charge.refunded") {
    const ch = event.data.object as Stripe.Charge;
    const piId = typeof ch.payment_intent === "string"
      ? ch.payment_intent : ch.payment_intent?.id ?? null;
    const { data: order } = await supabase
      .from("orders").select("id, paid_amount_cents")
      .eq("stripe_payment_intent", piId ?? "__none__").maybeSingle();

    if (!order) {
      log("WARNING", "refund_for_unknown_order", { pi: mask(piId), charge: mask(ch.id) });
    } else {
      const refundedTotal = ch.amount_refunded ?? 0;
      const paid = order.paid_amount_cents ?? 0;
      const state = refundedTotal <= 0 ? "none" : refundedTotal >= paid ? "full" : "partial";
      await supabase.from("orders").update({ refund_status: state }).eq("id", order.id);
      // Recompute loyalty from total economic loss — never a blind decrement.
      const { error: syncErr } = await supabase.rpc("sync_loyalty_for_order",
        { p_order_id: order.id });
      if (syncErr) {
        log("ALERT", "refund_loyalty_sync_failed",
            { order: mask(order.id), err: syncErr.message.slice(0, 120) });
        return new Response("refund sync failed", { status: 500 });
      }
      log("INFO", "refund_recorded",
          { order: mask(order.id), state, refunded_cents: refundedTotal });
    }
  }

  // ── Disputes / chargebacks ───────────────────────────────────────────────
  // Authoritative dispute state comes only from here. The browser has no write
  // path to it, and none of this touches fulfillment.
  if (event.type.startsWith("charge.dispute.")) {
    const dp = event.data.object as Stripe.Dispute;
    const piId = typeof dp.payment_intent === "string"
      ? dp.payment_intent : dp.payment_intent?.id ?? null;
    const chId = typeof dp.charge === "string" ? dp.charge : dp.charge?.id ?? null;

    // Stripe's vocabulary -> the three outcomes that drive money and points.
    // An inquiry ("warning_*") is not yet a loss; only a real loss is a loss.
    const outcome =
      dp.status === "won" || dp.status === "warning_closed" ? "won"
      : dp.status === "lost" ? "lost"
      : "open";

    const { data: order } = await supabase
      .from("orders").select("id")
      .eq("stripe_payment_intent", piId ?? "__none__").maybeSingle();

    if (!order) {
      log("ALERT", "dispute_for_unknown_order",
          { dispute: mask(dp.id), pi: mask(piId), amount_cents: dp.amount });
    }

    const { error: dErr } = await supabase.from("disputes").upsert({
      order_id: order?.id ?? null,
      stripe_dispute_id: dp.id,
      stripe_charge_id: chId,
      stripe_payment_intent: piId,
      amount_cents: dp.amount ?? 0,
      currency: dp.currency ?? null,
      reason: dp.reason ?? null,
      stripe_status: dp.status ?? null,
      outcome,
      closed_at: outcome === "open" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_dispute_id" });

    if (dErr) {
      // Do NOT ack — let Stripe retry rather than lose a chargeback.
      log("ALERT", "dispute_write_failed",
          { dispute: mask(dp.id), err: dErr.message.slice(0, 120) });
      return new Response("dispute write failed", { status: 500 });
    }

    log(outcome === "lost" ? "ALERT" : "WARNING", "dispute_" + outcome, {
      dispute: mask(dp.id), order: mask(order?.id ?? null),
      amount_cents: dp.amount, reason: dp.reason ?? null, stripe_status: dp.status,
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
