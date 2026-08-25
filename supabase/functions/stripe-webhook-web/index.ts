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

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
