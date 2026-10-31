// Website delivery rules, shared by create-web-order, uber-delivery-quote,
// uber-dispatch, uber-webhook and their tests. Plain JS, no runtime APIs.
//
// Every decision about MONEY and WHEN A COURIER IS BOOKED lives here, as pure
// functions, so it is tested without a database, Stripe or Uber.

// The restaurant (pickup side of every delivery).
export const STORE = {
  name: "Shaahi Biryani",
  address: { street: "3421 E Renner Rd", apt: "Suite 110", city: "Plano", state: "TX", zip: "75074" },
  phone: "+14699603300",
};

// Uber Direct's rates for this account (Uber Direct dashboard, 2026-10-30).
// Uber prices each quote itself; these tiers are the ceiling we expect and the
// numbers the owner signed up for. A quote above the top tier means the
// address is outside the area we deliver to.
export const UBER_RATE_TIERS = [
  { maxMiles: 5, feeCents: 799 },
  { maxMiles: 6, feeCents: 899 },
  { maxMiles: 7, feeCents: 999 },
  { maxMiles: 10, feeCents: 1099 },
];
export const MAX_DELIVERY_FEE_CENTS = 1099;

// ── Owner policy (staging values approved 2026-10-31). Every number here can
// be overridden per environment with the function secret named alongside it,
// so production can differ without a code change. policyFromEnv() reads them.
export const DEFAULT_POLICY = Object.freeze({
  minSubtotalCents: 2000,   // DELIVERY_MIN_SUBTOTAL_CENTS — food only
  maxMiles: 5,              // DELIVERY_MAX_MILES — Uber's quote has no distance, so
                            //   the tier fee is the proxy: fee ≤ that tier's fee
  requoteAbsorbCents: 0,    // DELIVERY_REQUOTE_ABSORB_CENTS — 0 = never silently absorb
  prepMinutes: 25,          // DELIVERY_PREP_MINUTES — kitchen prep added to every ETA
  courierTips: true,        // DELIVERY_COURIER_TIPS — offer an optional tip for the courier
});

/** The fee ceiling implied by a mileage limit (the tier that covers it). */
export function maxFeeForMiles(miles) {
  const tier = UBER_RATE_TIERS.find((t) => miles <= t.maxMiles) ?? UBER_RATE_TIERS[UBER_RATE_TIERS.length - 1];
  return Math.min(tier.feeCents, MAX_DELIVERY_FEE_CENTS);
}

/** Policy from environment (Deno.env.get or any name → string getter). */
export function policyFromEnv(get) {
  const num = (k, d) => { const v = Number(get(k)); return get(k) != null && get(k) !== "" && Number.isFinite(v) && v >= 0 ? v : d; };
  const flag = (k, d) => { const v = String(get(k) ?? "").toLowerCase(); return v === "" ? d : v === "true" || v === "1" || v === "on"; };
  return Object.freeze({
    minSubtotalCents: num("DELIVERY_MIN_SUBTOTAL_CENTS", DEFAULT_POLICY.minSubtotalCents),
    maxMiles: num("DELIVERY_MAX_MILES", DEFAULT_POLICY.maxMiles),
    requoteAbsorbCents: num("DELIVERY_REQUOTE_ABSORB_CENTS", DEFAULT_POLICY.requoteAbsorbCents),
    prepMinutes: num("DELIVERY_PREP_MINUTES", DEFAULT_POLICY.prepMinutes),
    courierTips: flag("DELIVERY_COURIER_TIPS", DEFAULT_POLICY.courierTips),
  });
}

// The customer pays exactly what Uber quotes (pass-through: Shaahi neither
// earns nor loses on the fee). A quote above the mileage limit's tier means
// the address is outside the delivery area.
export function customerDeliveryFeeCents(quoteFeeCents, policy = DEFAULT_POLICY) {
  const fee = Math.round(Number(quoteFeeCents));
  if (!Number.isFinite(fee) || fee <= 0) return null;
  if (fee > maxFeeForMiles(policy.maxMiles)) return null;
  return fee;
}

// Kept for older imports; the policy's minSubtotalCents is authoritative.
export const DELIVERY_MIN_SUBTOTAL_CENTS = DEFAULT_POLICY.minSubtotalCents;

// Courier tip: optional, separate from the restaurant-staff tip, passed to
// Uber in full. Capped so a typo cannot charge a customer $500.
export const COURIER_TIP_MAX_CENTS = 5000;
export function courierTipCents(v, policy = DEFAULT_POLICY) {
  if (!policy.courierTips) return 0;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, COURIER_TIP_MAX_CENTS) : 0;
}

/** When the food will be ready for the courier (ISO), given when the kitchen accepted. */
export function pickupReadyAt(acceptedAt, status, policy = DEFAULT_POLICY, now = Date.now()) {
  if (status === "ready") return new Date(now).toISOString();
  const base = Date.parse(acceptedAt ?? "");
  const ready = (Number.isFinite(base) ? base : now) + policy.prepMinutes * 60_000;
  return new Date(Math.max(now, ready)).toISOString();
}

// A quote is good for 15 minutes. Don't charge against one with under two
// minutes left: the customer still has to type a card in.
export const QUOTE_CHECKOUT_MARGIN_MS = 2 * 60 * 1000;
export function quoteUsableForCheckout(expiresAt, now = Date.now()) {
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t - QUOTE_CHECKOUT_MARGIN_MS > now;
}

// At dispatch the original quote has usually expired (the food takes longer
// than 15 minutes). We then re-quote. If Uber now wants more than the customer
// paid, Shaahi absorbs up to policy.requoteAbsorbCents (default 0: never
// silently); beyond it, the order waits for staff.
export const REQUOTE_ABSORB_CENTS = DEFAULT_POLICY.requoteAbsorbCents;

/** Address the customer typed → normalised {street, apt, city, state, zip, notes} or an error message. */
export function normaliseDeliveryAddress(a) {
  const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const addr = { street: s(a?.street, 120), apt: s(a?.apt, 40), city: s(a?.city, 60), state: s(a?.state || "TX", 2).toUpperCase(), zip: s(a?.zip, 10), notes: s(a?.notes, 280) };
  if (!addr.street || !/\d/.test(addr.street)) return { error: "Please enter a street address with a house or building number." };
  if (!addr.city) return { error: "Please enter the city." };
  if (!/^\d{5}(-\d{4})?$/.test(addr.zip)) return { error: "Please enter a 5-digit ZIP code." };
  if (addr.state !== "TX") return { error: "We only deliver within Texas (DFW)." };
  return { address: addr };
}

/** Stable text for comparing two addresses (quote vs checkout). */
export function addressKey(a) {
  return [a?.street, a?.apt, a?.city, a?.state || "TX", a?.zip].map((x) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")).join("|");
}

// Kitchen statuses at which the food is accepted and a courier may be booked.
// "pending" is NOT one of them: the kitchen has to accept the order first.
export const DISPATCHABLE_STATUSES = ["accepted", "preparing", "ready"];
// A dispatch claim older than this is considered abandoned (function crashed).
export const DISPATCH_CLAIM_TTL_MS = 2 * 60 * 1000;
// Courier unavailable: try again on the next cron runs, then hand to staff.
export const MAX_DISPATCH_ATTEMPTS = 5;

/**
 * May we book an Uber courier for this order right now?
 * Returns { ok: true } or { ok: false, reason }.
 */
export function canDispatch(o, now = Date.now()) {
  if (!o) return { ok: false, reason: "no_order" };
  if (o.fulfillment !== "delivery") return { ok: false, reason: "not_delivery" };
  if (o.payment_status !== "paid") return { ok: false, reason: "not_paid" };
  if (o.status === "cancelled") return { ok: false, reason: "cancelled" };
  // Production records refunds in refund_status (stripe-webhook-web), not payment_status.
  if (o.refund_status === "full") return { ok: false, reason: "refunded" };
  if (!DISPATCHABLE_STATUSES.includes(o.status)) return { ok: false, reason: "kitchen_not_accepted" };
  if (o.uber_delivery_id) return { ok: false, reason: "already_dispatched" };
  if (o.uber_dispatch_state === "needs_staff") return { ok: false, reason: "needs_staff" };
  if ((o.uber_dispatch_attempts ?? 0) >= MAX_DISPATCH_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  const claimed = o.uber_dispatch_claimed_at ? Date.parse(o.uber_dispatch_claimed_at) : NaN;
  if (Number.isFinite(claimed) && now - claimed < DISPATCH_CLAIM_TTL_MS) return { ok: false, reason: "in_flight" };
  // Only orders created while Uber was in sandbox mode are dispatched by this build.
  if (o.uber_mode !== "sandbox") return { ok: false, reason: "not_sandbox_order" };
  return { ok: true };
}

/**
 * Re-quote at dispatch: may we go ahead at the new price?
 * paidFeeCents = what the customer was charged for delivery.
 */
export function requoteDecision(paidFeeCents, newFeeCents, policy = DEFAULT_POLICY) {
  if (!Number.isFinite(newFeeCents) || newFeeCents <= 0) return { ok: false, reason: "bad_quote" };
  if (newFeeCents > MAX_DELIVERY_FEE_CENTS) return { ok: false, reason: "out_of_area" };
  const extra = newFeeCents - (paidFeeCents ?? 0);
  if (extra > policy.requoteAbsorbCents) return { ok: false, reason: "fee_rose", extraCents: extra };
  return { ok: true, absorbedCents: Math.max(0, extra) };
}

// Uber delivery status → our order status. Forward-only: a late or replayed
// webhook can never move an order backwards, and Uber never cancels OUR order
// (a courier cancel is flagged for staff instead; the food still exists).
const ORDER_RANK = { pending: 0, accepted: 1, preparing: 2, ready: 3, out_for_delivery: 4, delivered: 5, cancelled: 9 };
export function orderStatusFromUber(uberStatus, current) {
  const target = { pickup_complete: "out_for_delivery", dropoff: "out_for_delivery", delivered: "delivered" }[uberStatus];
  if (!target || current === "cancelled") return null;
  return (ORDER_RANK[target] ?? -1) > (ORDER_RANK[current] ?? -1) ? target : null;
}

/** Uber statuses that need a person to look at the order. */
export function uberNeedsStaff(uberStatus) {
  return uberStatus === "canceled" || uberStatus === "returned";
}

/** May we still cancel the courier when the kitchen cancels the order? (Before pickup only.) */
export function courierCancellable(uberStatus) {
  return uberStatus === "pending" || uberStatus === "pickup" || uberStatus == null;
}

/** Order + items → the delivery request body fields (minus quote/test specs). */
export function deliveryRequestFor(o, items, fmt) {
  const a = o.delivery_address ?? {};
  return {
    externalId: String(o.id),
    idempotencyKey: `shaahi-web-${o.id}`,
    pickupName: STORE.name,
    pickupAddress: fmt(STORE.address),
    pickupPhone: STORE.phone,
    pickupNotes: `Website order ${String(o.id).slice(0, 8)} — ask at the counter.`,
    dropoffName: String(o.guest_name ?? "Guest").slice(0, 60),
    dropoffAddress: fmt(a),
    dropoffPhone: o.guest_phone_e164,
    dropoffNotes: String(a.notes ?? "").slice(0, 280) || undefined,
    manifestItems: (items ?? []).map((i) => ({ name: String(i.item_name).slice(0, 80), quantity: Number(i.quantity) || 1, size: "small" })),
    manifestReference: String(o.id).slice(0, 8),
    manifestTotalCents: Math.round(Number(o.subtotal ?? 0) * 100),
    // Only the courier tip goes to Uber; the restaurant-staff tip (orders.tip) never does.
    tipCents: Math.round(Number(o.courier_tip ?? 0) * 100) || undefined,
  };
}
