// uber-webhook — Uber Direct tells us where the courier is and what happened.
//
// 1. Authenticate: HMAC-SHA256 of the RAW body with UBER_DIRECT_WEBHOOK_SECRET
//    must equal x-uber-signature (or x-postmates-signature). Otherwise 401 and
//    nothing is read.
// 2. Replay guard: every event id is stored once (uber_webhook_events);
//    Uber's retries and replays are acknowledged and ignored.
// 3. Find the order by uber_delivery_id and record uber_status, tracking URL
//    and courier; move the ORDER forward only (out_for_delivery at pickup,
//    delivered at drop-off). A courier cancel/return flags the order for staff
//    instead of cancelling it: the food still exists.
// Unknown or sandbox/live mismatched deliveries are acknowledged (200) and
// ignored, so Uber stops retrying.
//
// Deploy: supabase functions deploy uber-webhook --no-verify-jwt
// Register the function URL in Uber Direct Dashboard → Developer → Webhooks
// for event.delivery_status and event.courier_update.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore-file
// @ts-ignore — shared plain-JS modules
import { verifyUberSignature } from "../_shared/uber-direct.js";
// @ts-ignore
import { orderStatusFromUber, uberNeedsStaff } from "../_shared/delivery-policy.js";
import { notifyDelivery } from "../_shared/delivery-notify.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const SECRET = Deno.env.get("UBER_DIRECT_WEBHOOK_SECRET") ?? "";

function ok(note = "ok") { return new Response(JSON.stringify({ ok: true, note }), { status: 200, headers: { "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  if (!(await verifyUberSignature(raw, req.headers, SECRET))) return new Response("Invalid signature", { status: 401 });

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  // Test and live events never cross. Checked against the ORDER's own mode
  // (below), so couriers already on the road keep updating even after the
  // delivery switch is turned off.

  const deliveryId = ev?.delivery_id ?? ev?.data?.id;
  const eventId = String(ev?.id ?? `${deliveryId}:${ev?.kind}:${ev?.status}:${ev?.created}`);
  const { error: dupErr } = await supabase.from("uber_webhook_events").insert({ event_id: eventId, kind: ev?.kind ?? null, delivery_id: deliveryId ?? null });
  if (dupErr?.code === "23505") return ok("duplicate");
  if (dupErr) return new Response("Store failed", { status: 500 }); // Uber retries 5xx

  if (!deliveryId) return ok("no delivery id");
  const { data: order } = await supabase.from("orders").select("*").eq("uber_delivery_id", deliveryId).maybeSingle();
  if (!order) return ok("unknown delivery");
  if ((ev?.live_mode === true) !== (order.uber_mode === "live")) return ok(`${ev?.live_mode ? "live" : "test"} event ignored for a ${order.uber_mode} order`);

  const d = ev?.data ?? {};
  const uberStatus = ev?.status ?? d?.status ?? order.uber_status;
  // Merge into what we already know so a location ping never erases the ETAs.
  const prev = (order.uber_courier ?? {}) as Record<string, unknown>;
  const courier = {
    ...prev,
    ...(d?.courier ? { name: d.courier.name ?? prev.name ?? null, vehicle: d.courier.vehicle_type ?? prev.vehicle ?? null } : {}),
    ...(ev?.location ?? d?.courier?.location ? { location: ev?.location ?? d.courier.location } : {}),
    ...(d?.pickup_eta ? { pickup_eta: d.pickup_eta } : {}),
    ...(d?.dropoff_eta ? { dropoff_eta: d.dropoff_eta } : {}),
    updated: new Date().toISOString(),
  };

  const patch: Record<string, unknown> = { uber_status: uberStatus, uber_updated_at: new Date().toISOString() };
  if (d?.tracking_url) patch.uber_tracking_url = d.tracking_url;
  patch.uber_courier = courier;
  const next = orderStatusFromUber(uberStatus, order.status);
  if (next) patch.status = next;
  if (uberNeedsStaff(uberStatus) && order.status !== "cancelled") {
    patch.uber_dispatch_state = "needs_staff";
    patch.uber_dispatch_error = `uber:${uberStatus}:${d?.cancelation_reason?.secondary_reason ?? d?.undeliverable_reason ?? ""}`.slice(0, 200);
  }
  const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
  if (error) {
    // Forget the event so Uber's retry is processed rather than seen as a duplicate.
    await supabase.from("uber_webhook_events").delete().eq("event_id", eventId);
    return new Response("Update failed", { status: 500 });
  }
  if (next === "out_for_delivery") await notifyDelivery(supabase, order, "picked_up");
  if (next === "delivered") await notifyDelivery(supabase, order, "delivered");
  if (patch.uber_dispatch_state === "needs_staff") await notifyDelivery(supabase, order, "problem");
  return ok(next ? `order -> ${next}` : `uber_status ${uberStatus}`);
});
