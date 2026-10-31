// delivery-status — what the customer's tracking page shows.
//
// Access: order id + the 32-hex tracking token minted at checkout (only in the
// customer's confirmation page and their order texts). Wrong or missing token
// → 404, identical to "no such order", so ids cannot be probed.
// Returns the minimum a customer needs: no phone, no full address, no email,
// no payment details, courier first name only.
// Deploy: supabase functions deploy delivery-status --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  "Cache-Control": "no-store",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const id = String(body?.o ?? ""), token = String(body?.t ?? "");
  const notFound = () => json({ error: "We couldn't find that order. Please use the link from your confirmation." }, 404);
  if (!UUID.test(id) || !/^[0-9a-f]{32}$/.test(token)) return notFound();

  const { data: o } = await supabase.from("orders")
    .select("id, status, fulfillment, payment_status, refund_status, created_at, tracking_token, uber_status, uber_tracking_url, uber_courier, uber_dispatch_state, delivery_address")
    .eq("id", id).maybeSingle();
  if (!o || !o.tracking_token || !sameText(o.tracking_token, token)) return notFound();

  const c = (o.uber_courier ?? {}) as Record<string, any>;
  const a = (o.delivery_address ?? {}) as Record<string, any>;
  return json({
    orderNumber: String(o.id).slice(-6).toUpperCase(),
    placedAt: o.created_at,
    kitchenStatus: o.status,
    paid: o.payment_status === "paid",
    refunded: o.refund_status === "full",
    courierStatus: o.uber_status ?? null,
    needsAttention: o.uber_dispatch_state === "needs_staff",
    trackingUrl: o.uber_tracking_url ?? null,
    courierName: c.name ? String(c.name).split(" ")[0] : null,
    pickupEta: c.pickup_eta ?? null,
    dropoffEta: c.dropoff_eta ?? null,
    deliverTo: [a.street, a.city].filter(Boolean).join(", ") || null,
  });
});
