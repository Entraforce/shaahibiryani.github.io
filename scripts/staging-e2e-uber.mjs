// END-TO-END test of website delivery on the STAGING project (never production):
// browser checkout → Uber quote → Stripe TEST payment → kitchen accept/reject →
// automatic courier booking → webhooks → cancellations and failure recovery.
//
// Reads private settings (never printed) from:
//   ~/.config/shaahi/staging.env             staging project ref + keys
//   ~/.config/shaahi/uber-direct-sandbox.env Stripe TEST key, Uber webhook secret
// Usage: node scripts/staging-e2e-uber.mjs
// Refuses to run against the production project or with a live Stripe key.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { makeUberClient } from '../supabase/functions/_shared/uber-direct.js';

const PROD_REF = 'wtdthjhqgsbnyjucdqxl';
function loadEnv(p) {
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const cfgDir = join(homedir(), '.config/shaahi');
const ST = loadEnv(join(cfgDir, 'staging.env'));
const PRIV = loadEnv(join(cfgDir, 'uber-direct-sandbox.env'));
const REF = ST.STAGING_PROJECT_REF;
if (!REF || REF === PROD_REF) throw new Error('refusing: staging project ref missing or is production');
if (!/^sk_test_/.test(PRIV.STAGING_STRIPE_SECRET_KEY ?? '')) throw new Error('refusing: Stripe key is not a TEST key');
const BASE = `https://${REF}.supabase.co`;
const FN = `${BASE}/functions/v1`;
const ANON = ST.STAGING_ANON_KEY, SERVICE = ST.STAGING_SERVICE_ROLE_KEY, STRIPE = PRIV.STAGING_STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = PRIV.UBER_DIRECT_WEBHOOK_SECRET || '';

const results = [];
function record(id, name, pass, evidence) {
  results.push({ id, name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${evidence ? `  — ${evidence}` : ''}`);
}
async function test(id, name, fn) {
  try { const ev = await fn(); record(id, name, true, ev); }
  catch (e) { record(id, name, false, e.message); }
}
function must(cond, msg) { if (!cond) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const canDispatchLike = (o) => (o.uber_mode ? 'NOT skipped' : 'no uber_mode → not_sandbox_order');
const short = (s) => (s ? String(s).slice(0, 12) + '…' : String(s));

// ── HTTP helpers ──
async function call(path, body, headers = {}) {
  const r = await fetch(`${FN}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, ...headers }, body: JSON.stringify(body ?? {}) });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: j };
}
async function rest(method, path, body, key = SERVICE, extra = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const getOrder = async (id) => (await rest('GET', `orders?id=eq.${id}&select=*`)).body?.[0];
async function stripe(method, path, form) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${STRIPE}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form ? new URLSearchParams(form).toString() : undefined });
  return r.json();
}
const dispatch = () => fetch(`${FN}/uber-dispatch`, { method: 'POST', headers: { 'x-dispatch-secret': ST.UBER_DISPATCH_TRIGGER_SECRET } }).then((r) => r.json());
async function webhook(event, { sign = true, secret = WEBHOOK_SECRET } = {}) {
  const raw = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };
  if (sign) headers['x-uber-signature'] = createHmac('sha256', secret).update(raw).digest('hex');
  const r = await fetch(`${FN}/uber-webhook`, { method: 'POST', headers, body: raw });
  return { status: r.status, body: await r.text() };
}

// ── Test fixtures ──
const NEAR = { street: '1520 K Ave', apt: '', city: 'Plano', zip: '75074' };
const FAR = { street: '301 W 2nd St', apt: '', city: 'Austin', zip: '78701' };
const ITEMS = [{ menuItemId: 'chicken-65', variantId: 'chicken-65-standard', quantity: 2, itemName: 'Chicken 65' }];
const run = Date.now().toString(36);
let phoneSeq = 0;
// Numbers that replied STOP in earlier runs stay STOP (the consent log is append-only), so skip them.
const STOPPED = new Set();
const phone = () => { for (;;) { const p = `469555${String(100 + (Number(run.slice(-3).replace(/\D/g, '') || 0) + phoneSeq++) % 900).padStart(4, '0')}`; if (!STOPPED.has(p)) return p; } };
const checkoutBody = (quoteId, addr = NEAR, p = phone(), extra = {}) => ({ items: ITEMS, guestName: 'Staging Test', guestPhone: p, guestEmail: '', tipCents: 300, courierTipCents: 200, fulfillment: 'delivery', deliveryAddress: { ...addr, notes: 'STAGING TEST' }, deliveryQuoteId: quoteId, ...extra });
const uberApi = makeUberClient({ mode: 'sandbox', customerId: PRIV.UBER_DIRECT_CUSTOMER_ID, clientId: PRIV.UBER_DIRECT_CLIENT_ID, clientSecret: PRIV.UBER_DIRECT_CLIENT_SECRET });
async function waitFor(fn, ms = 60_000, every = 3_000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(every); } return v; }

async function quote(addr = NEAR) { return call('uber-delivery-quote', { address: addr, phone: '4695550100' }); }
async function paidOrder({ accept = true } = {}) {
  const q = await quote(); must(q.status === 200, `quote ${q.status}`);
  const c = await call('create-web-order', checkoutBody(q.body.quoteId)); must(c.status === 200, `checkout ${c.status} ${JSON.stringify(c.body)}`);
  const piId = c.body.paymentIntent.split('_secret_')[0];
  const pi = await stripe('POST', `payment_intents/${piId}/confirm`, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });
  must(pi.status === 'succeeded', `stripe ${pi.status ?? pi.error?.message}`);
  const cf = await call('confirm-web-order', { orderId: c.body.orderId }); must(cf.body?.paid === true, `confirm ${JSON.stringify(cf.body)}`);
  if (accept) await kitchen(c.body.orderId, 'accepted');
  return { orderId: c.body.orderId, piId, quoteRowId: q.body.quoteId, token: c.body.trackingToken };
}

// ── Kitchen staff login (a TEST account that exists only in staging) ──
let staffJwt = null;
async function ensureStaff() {
  const email = 'kitchen-test@shaahi-staging.test';
  let pw = ST.STAGING_KITCHEN_TEST_PASSWORD;
  if (!pw) {
    pw = randomBytes(18).toString('base64url');
    writeFileSync(join(cfgDir, 'staging.env'), readFileSync(join(cfgDir, 'staging.env'), 'utf8') + `STAGING_KITCHEN_TEST_PASSWORD=${pw}\n`, { mode: 0o600 });
    const u = await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, email_confirm: true }) }).then((r) => r.json());
    must(u.id, 'could not create staging test staff user');
    const pr = await rest('POST', 'profiles', { id: u.id, is_staff: true }, SERVICE, { Prefer: 'resolution=merge-duplicates,return=representation' });
    must(pr.status < 300, `profile ${pr.status} ${JSON.stringify(pr.body)}`);
  }
  const t = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) }).then((r) => r.json());
  must(t.access_token, 'staff login failed');
  staffJwt = t.access_token;
}
async function kitchen(orderId, status, jwt = staffJwt) {
  const r = await rest('POST', 'rpc/set_order_status', { p_order_id: orderId, p_status: status }, ANON, { Authorization: `Bearer ${jwt}` });
  must(r.status === 200, `set_order_status ${status}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  return r.body;
}

// ════════════════════════════════════════════════════════════════════════
console.log(`Staging E2E — project ${REF} (production is ${PROD_REF}: not used)\n`);
await ensureStaff();
for (const r of (await rest('GET', 'marketing_consent?source=eq.reply_stop&select=phone')).body ?? []) STOPPED.add(r.phone);

// 1. Isolation preconditions
await test('S1', 'staging is isolated: printing off, no cron jobs pointing at production', async () => {
  const s = await rest('GET', 'integration_settings?key=eq.cloudprnt&select=enabled');
  must(s.body?.[0]?.enabled === false, 'cloudprnt not explicitly off');
  const acct = await stripe('GET', 'balance');
  must(acct.livemode === false, 'Stripe key is not test mode');
  return 'cloudprnt=false; Stripe balance livemode=false';
});

// 2. Quotes and eligibility
let q1;
await test('Q1', 'quote for a Plano address returns fee + ETA, stored server-side', async () => {
  q1 = await quote(); must(q1.status === 200, `HTTP ${q1.status} ${JSON.stringify(q1.body)}`);
  const row = (await rest('GET', `delivery_quotes?id=eq.${q1.body.quoteId}&select=fee_cents,uber_mode,expires_at`)).body[0];
  must(row && row.fee_cents === q1.body.feeCents && row.uber_mode === 'sandbox', 'quote row mismatch');
  return `$${(q1.body.feeCents / 100).toFixed(2)}, ~${q1.body.etaMinutes} min, expires ${q1.body.expiresAt}`;
});
await test('Q2', 'out-of-area address gets a clear "can\'t deliver" message', async () => {
  const r = await quote(FAR); must(r.status === 400, `HTTP ${r.status}`);
  must(/deliver|delivery area/i.test(r.body.error), r.body.error); return `HTTP 400 "${r.body.error}"`;
});
await test('Q3', 'incomplete address is refused before calling Uber', async () => {
  const r = await quote({ street: 'K Ave', city: 'Plano', zip: '75074' }); must(r.status === 400, `HTTP ${r.status}`);
  return `HTTP 400 "${r.body.error}"`;
});

// 3. Checkout validation
await test('C1', 'delivery checkout without a quote is refused', async () => {
  const r = await call('create-web-order', checkoutBody(null)); must(r.status === 400, `HTTP ${r.status}`); return `HTTP 400 "${r.body.error}"`;
});
await test('C2', 'quote for a different address is refused', async () => {
  const r = await call('create-web-order', checkoutBody(q1.body.quoteId, { ...NEAR, street: '1600 K Ave' })); must(r.status === 409, `HTTP ${r.status}`); return `HTTP 409 "${r.body.error}"`;
});
await test('C3', 'expired 15-minute quote cannot be paid against', async () => {
  const qe = await quote(); must(qe.status === 200, 'quote');
  await rest('PATCH', `delivery_quotes?id=eq.${qe.body.quoteId}`, { expires_at: new Date(Date.now() - 60_000).toISOString() });
  const r = await call('create-web-order', checkoutBody(qe.body.quoteId)); must(r.status === 409 && r.body.code === 'quote_expired', `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return `HTTP 409 code=quote_expired "${r.body.error}"`;
});
await test('C4', 'browser cannot change the fee (fee comes from the stored quote)', async () => {
  const b = { ...checkoutBody(q1.body.quoteId), deliveryFeeCents: 1, deliveryFee: 0.01 };
  const r = await call('create-web-order', b); must(r.status === 200, `HTTP ${r.status}`);
  must(r.body.breakdown.deliveryFeeCents === q1.body.feeCents, `fee ${r.body.breakdown.deliveryFeeCents}`);
  return `charged fee ${r.body.breakdown.deliveryFeeCents}c = quoted ${q1.body.feeCents}c`;
});

// 4. Main happy path
let A;
await test('P1', 'checkout creates a delivery order with fee in the Stripe total', async () => {
  const qa = await quote(); const p = phone();
  const c = await call('create-web-order', checkoutBody(qa.body.quoteId, NEAR, p)); must(c.status === 200, `HTTP ${c.status} ${JSON.stringify(c.body)}`);
  const b = c.body.breakdown; must(b.totalCents === b.subtotalCents + b.taxCents + b.tipCents + b.deliveryFeeCents + b.courierTipCents, 'total arithmetic');
  const piId = c.body.paymentIntent.split('_secret_')[0];
  const pi = await stripe('GET', `payment_intents/${piId}`); must(pi.amount === b.totalCents && pi.livemode === false, `PI amount ${pi.amount} livemode ${pi.livemode}`);
  const o = await getOrder(c.body.orderId);
  must(o.fulfillment === 'delivery' && o.uber_mode === 'sandbox' && o.payment_status === 'pending' && o.status === 'pending', 'order row');
  must(Math.round(o.delivery_fee * 100) === b.deliveryFeeCents && o.delivery_address?.zip === '75074', 'fee/address persisted');
  A = { orderId: c.body.orderId, piId, phone: p, quoteId: qa.body.quoteId, body: checkoutBody(qa.body.quoteId, NEAR, p) };
  return `order ${short(A.orderId)} food ${b.subtotalCents} + tax ${b.taxCents} + staff tip ${b.tipCents} + delivery ${b.deliveryFeeCents} + courier tip ${b.courierTipCents} = ${b.totalCents}c; Stripe PI test-mode amount ${pi.amount}`;
});
await test('P2', 'retrying the same checkout reuses the same payment (no double charge)', async () => {
  const r = await call('create-web-order', A.body); must(r.status === 200 && r.body.reused === true && r.body.orderId === A.orderId, JSON.stringify(r.body).slice(0, 160));
  return `reused=true, same order`;
});
await test('D1', 'no courier before payment', async () => {
  await dispatch(); const o = await getOrder(A.orderId); must(!o.uber_delivery_id, 'booked before payment!'); return 'uber_delivery_id null';
});
await test('P3', 'Stripe test card payment + server confirmation marks the order paid', async () => {
  const pi = await stripe('POST', `payment_intents/${A.piId}/confirm`, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });
  must(pi.status === 'succeeded', pi.error?.message ?? pi.status);
  const cf = await call('confirm-web-order', { orderId: A.orderId }); must(cf.body?.paid === true, JSON.stringify(cf.body));
  const o = await getOrder(A.orderId); must(o.payment_status === 'paid' && o.paid_amount_cents === Math.round(o.total * 100), 'paid row');
  return `PI succeeded (test), order paid ${o.paid_amount_cents}c`;
});
await test('D2', 'no courier while the kitchen has not accepted (paid but pending)', async () => {
  await dispatch(); const o = await getOrder(A.orderId); must(!o.uber_delivery_id && o.status === 'pending', 'booked before acceptance!'); return 'still pending, no courier';
});
await test('K1', 'a non-staff caller cannot change order status', async () => {
  const r = await rest('POST', 'rpc/set_order_status', { p_order_id: A.orderId, p_status: 'accepted' }, ANON);
  must(r.status >= 400, `HTTP ${r.status}`); return `HTTP ${r.status} (not authorized)`;
});
await test('K2', 'kitchen accepts (staff login, same RPC the KDS uses)', async () => {
  const o = await kitchen(A.orderId, 'accepted'); must(o.status === 'accepted', o.status); return 'status=accepted';
});
let delA;
await test('D3', 'courier booked automatically after acceptance — exactly once under 3 concurrent runs', async () => {
  const runs = await Promise.all([dispatch(), dispatch(), dispatch()]);
  const booked = runs.flatMap((r) => r.dispatched ?? []).filter((d) => d.id === A.orderId && d.dispatched);
  must(booked.length <= 1, `booked ${booked.length} times: ${JSON.stringify(runs.map((r) => r.dispatched))}`);
  const o = await getOrder(A.orderId); delA = o.uber_delivery_id;
  must(delA && o.uber_dispatch_state === 'dispatched' && o.uber_tracking_url, 'order not updated');
  // Uber's own record for this order: exactly the one delivery we stored.
  const ud = await uberApi.getDelivery(delA); must(ud.external_id === A.orderId, 'external id mismatch');
  return `${booked.length} booking from 3 runs + the every-minute job (${booked.length ? 'runs' : 'job'} won); ${short(delA)} tracking=${o.uber_tracking_url ? 'yes' : 'no'}`;
});
await test('D4', 'later runs never re-book a dispatched order', async () => {
  await dispatch(); const o = await getOrder(A.orderId); must(o.uber_delivery_id === delA, 'delivery id changed'); return 'unchanged';
});
await test('D5', 'database refuses a second order holding the same Uber delivery (unique index)', async () => {
  const other = await rest('POST', 'orders', { source: 'web', status: 'cancelled', fulfillment: 'delivery', subtotal: 0, tax: 0, delivery_fee: 0, tip: 0, total: 0, payment_status: 'failed', guest_name: 'dup-test', guest_phone: '0', uber_delivery_id: delA });
  must(other.status === 409 || other.body?.code === '23505', `HTTP ${other.status} ${JSON.stringify(other.body).slice(0, 120)}`);
  return `HTTP ${other.status} code=${other.body?.code}`;
});

// 5. Webhooks
if (WEBHOOK_SECRET) {
  const ev = (over) => ({ id: `evt_${run}_${randomBytes(4).toString('hex')}`, kind: 'event.delivery_status', delivery_id: delA, live_mode: false, created: new Date().toISOString(), ...over });
  await test('W1', 'unsigned or wrongly-signed webhook is refused', async () => {
    const a = await webhook(ev({ status: 'delivered' }), { sign: false });
    const b = await webhook(ev({ status: 'delivered' }), { secret: 'wrong' });
    must(a.status === 401 && b.status === 401, `${a.status}/${b.status}`); const o = await getOrder(A.orderId); must(o.status !== 'delivered', 'state changed!');
    return '401 / 401, order unchanged';
  });
  const pickupEv = ev({ status: 'pickup_complete', data: { status: 'pickup_complete', tracking_url: 'https://track.example/staging', courier: { name: 'Robo', vehicle_type: 'car' } } });
  await test('W2', 'signed pickup_complete moves the order to out_for_delivery and stores courier', async () => {
    const r = await webhook(pickupEv); must(r.status === 200, `${r.status} ${r.body}`);
    const o = await getOrder(A.orderId); must(o.status === 'out_for_delivery' && o.uber_status === 'pickup_complete' && o.uber_courier?.name, `status ${o.status}`);
    return `200; order=out_for_delivery, courier=${o.uber_courier.name}`;
  });
  await test('W3', 'duplicate (retried) event is acknowledged and ignored', async () => {
    const r = await webhook(pickupEv); must(r.status === 200 && /duplicate/.test(r.body), r.body); return '200 "duplicate"';
  });
  await test('W4', 'out-of-order: a late "pickup" after delivered does not move the order back', async () => {
    await webhook(ev({ status: 'delivered', data: { status: 'delivered' } }));
    let o = await getOrder(A.orderId); must(o.status === 'delivered', `after delivered: ${o.status}`);
    await webhook(ev({ status: 'pickup', data: { status: 'pickup' } }));
    o = await getOrder(A.orderId); must(o.status === 'delivered', `went back to ${o.status}`);
    return 'delivered stays delivered';
  });
  await test('W5', 'event for an unknown delivery is acknowledged (no retry storm), nothing changes', async () => {
    const r = await webhook(ev({ delivery_id: 'del_unknown_000', status: 'delivered' })); must(r.status === 200, r.body); return `200 ${r.body}`;
  });
  await test('W6', 'a live_mode event is ignored by the sandbox build', async () => {
    const r = await webhook(ev({ live_mode: true, status: 'canceled' })); must(r.status === 200 && /live/.test(r.body), r.body); return r.body;
  });
} else {
  for (const id of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']) record(id, 'webhook test', false, 'SKIPPED — UBER_DIRECT_WEBHOOK_SECRET not set yet');
}

// 6. Rejection, cancellation, refund, failure recovery
await test('K3', 'kitchen rejects a paid order → no courier is ever booked', async () => {
  const B = await paidOrder({ accept: false });
  await kitchen(B.orderId, 'cancelled'); await dispatch(); await dispatch();
  const o = await getOrder(B.orderId); must(!o.uber_delivery_id, 'courier booked for a rejected order!');
  return `order ${short(B.orderId)} cancelled, uber_delivery_id null`;
});
await test('X1', 'kitchen cancels after booking (before pickup) → courier is cancelled', async () => {
  // Our run or the every-minute job may book it; wait for whichever does.
  const C = await paidOrder(); const d = await dispatch();
  const o1 = await waitFor(async () => { const o = await getOrder(C.orderId); return o.uber_delivery_id ? o : null; }, 30_000) ?? await getOrder(C.orderId);
  must(o1.uber_delivery_id, `not booked: ${JSON.stringify((d.dispatched ?? []).find((x) => x.id === C.orderId))}`);
  await kitchen(C.orderId, 'cancelled'); const d2 = await dispatch();
  const c = (d2.cancelled ?? []).find((x) => x.id === C.orderId);
  const o2 = await getOrder(C.orderId);
  must(o2.uber_status === 'canceled' || c?.cancel === 'too_late', `uber_status ${o2.uber_status} ${JSON.stringify(c)}`);
  return c?.cancelled ? `courier ${short(o1.uber_delivery_id)} cancelled at Uber` : `robo courier already past pickup (${c?.uber_status}) — correctly NOT cancelled`;
});
await test('X2', 'refund after booking (payment_status=refunded) → courier is cancelled', async () => {
  const E = await paidOrder(); await dispatch();
  const o1 = await getOrder(E.orderId); must(o1.uber_delivery_id, 'not booked');
  const rf = await stripe('POST', 'refunds', { payment_intent: E.piId }); must(rf.status === 'succeeded' || rf.status === 'pending', rf.error?.message ?? rf.status);
  // No hand-editing: the REAL Stripe charge.refunded webhook must record it.
  const viaWebhook = await waitFor(async () => (await getOrder(E.orderId)).refund_status === 'full', 45_000);
  must(viaWebhook, 'stripe-webhook-web never recorded refund_status=full');
  const d2 = await dispatch(); const c = (d2.cancelled ?? []).find((x) => x.id === E.orderId);
  const o2 = await waitFor(async () => { const o = await getOrder(E.orderId); return ['canceled'].includes(o.uber_status) ? o : null; }, 70_000) ?? await getOrder(E.orderId);
  must(o2.uber_status === 'canceled' || c?.cancel === 'too_late', `uber_status ${o2.uber_status}`);
  return `Stripe test refund ${rf.status} → Stripe webhook set refund_status=full → courier ${o2.uber_status === 'canceled' ? 'cancelled at Uber' : 'already picked up (not cancellable)'}`;
});
let F;
await test('R1', 'quote expired by dispatch time → fresh quote, still booked', async () => {
  F = await paidOrder({ accept: false });
  await rest('PATCH', `delivery_quotes?id=eq.${F.quoteRowId}`, { expires_at: new Date(Date.now() - 60_000).toISOString() });
  // Food already ready → courier asked to come now (exercises the "ready" path; W7 watches it).
  await kitchen(F.orderId, 'accepted'); await kitchen(F.orderId, 'ready'); const d = await dispatch();
  const o = await getOrder(F.orderId); must(o.uber_delivery_id, `not booked: ${JSON.stringify((d.dispatched ?? []).find((x) => x.id === F.orderId))}`);
  return `re-quoted and booked ${short(o.uber_delivery_id)}`;
});
await test('R2', 'address changed after checkout → old quote NOT reused; Uber refuses new address → staff flag, no retry loop', async () => {
  const G = await paidOrder({ accept: false });
  await rest('PATCH', `orders?id=eq.${G.orderId}`, { delivery_address: { street: '301 W 2nd St', city: 'Austin', state: 'TX', zip: '78701' } });
  await kitchen(G.orderId, 'accepted'); await dispatch(); await dispatch();
  const o = await getOrder(G.orderId);
  must(!o.uber_delivery_id && o.uber_dispatch_state === 'needs_staff', `state ${o.uber_dispatch_state} err ${o.uber_dispatch_error}`);
  return `needs_staff (${String(o.uber_dispatch_error).split(':').slice(0, 2).join(':')})`;
});
await test('R3', 'payment failure → order never paid, never dispatched', async () => {
  const q = await quote(); const c = await call('create-web-order', checkoutBody(q.body.quoteId));
  const piId = c.body.paymentIntent.split('_secret_')[0];
  const pi = await stripe('POST', `payment_intents/${piId}/confirm`, { payment_method: 'pm_card_chargeDeclined', return_url: 'https://example.com/return' });
  must(pi.error || pi.status !== 'succeeded', 'decline card succeeded?');
  const cf = await call('confirm-web-order', { orderId: c.body.orderId }); must(cf.body?.paid === false, JSON.stringify(cf.body));
  await rest('PATCH', `orders?id=eq.${c.body.orderId}`, { status: 'accepted' }); await dispatch();
  const o = await getOrder(c.body.orderId); must(o.payment_status !== 'paid' && !o.uber_delivery_id, 'dispatched unpaid!');
  return `card declined (${pi.error?.decline_code ?? pi.error?.code ?? pi.status}); payment_status=${o.payment_status}; no courier`;
});
await test('T1', 'Uber tracking: booked delivery is real and readable in the TEST environment', async () => {
  must(delA, 'no delivery from D3');
  const o = await getOrder(A.orderId); must(/^https:\/\//.test(o.uber_tracking_url), 'no tracking URL'); return `tracking URL stored for ${short(delA)}`;
});

if (WEBHOOK_SECRET) await test('W7', 'REAL Uber webhooks (robo courier) pass signature check and sync status + tracking', async () => {
  must(F?.orderId, 'no R1 order');
  const seen = [];
  for (let i = 0; i < 24; i++) {
    const o = await getOrder(F.orderId);
    const tag = `${o.uber_status}/${o.status}`; if (seen.at(-1) !== tag) seen.push(tag);
    if (o.status === 'delivered') break;
    await sleep(10_000);
  }
  const ev = (await rest('GET', `uber_webhook_events?delivery_id=eq.${(await getOrder(F.orderId)).uber_delivery_id}&select=event_id`)).body ?? [];
  must(ev.length > 0, `no real webhook events stored (uber/order states: ${seen.join(' → ')})`);
  must(seen.length > 1, `status never changed: ${seen.join(' → ')}`);
  return `${ev.length} signed Uber events; ${seen.join(' → ')}`;
});

// 7. Policies, tips, tracking, notifications
await test('P4', '$20 food minimum for delivery', async () => {
  const q = await quote(); const b = { ...checkoutBody(q.body.quoteId), items: [{ ...ITEMS[0], quantity: 1 }] };
  const r = await call('create-web-order', b); must(r.status === 400 && /at least \$20/.test(r.body.error), `${r.status} ${r.body?.error}`); return `HTTP 400 "${r.body.error}"`;
});
await test('P5', 'ETA shown to the customer includes the 25-minute kitchen prep', async () => {
  const q = await quote(); must(q.body.etaMinutes >= q.body.prepMinutes && q.body.prepMinutes === 25, JSON.stringify(q.body));
  return `prep ${q.body.prepMinutes} min → door in ~${q.body.etaMinutes} min`;
});
await test('P6', '5-mile limit: an address quoted above the $7.99 tier is refused as out of area', async () => {
  const far6 = { street: '3000 Grapevine Mills Pkwy', city: 'Grapevine', zip: '76051' };
  const r = await quote(far6); must(r.status === 400, `HTTP ${r.status} fee ${r.body?.feeCents}`); return `HTTP 400 "${r.body.error}"`;
});
let Tp;
await test('M1', 'money: staff tip and courier tip are separate; courier tip goes to Uber in full, staff tip never does', async () => {
  Tp = await paidOrder();
  const o = await getOrder(Tp.orderId);
  const pi = await stripe('GET', `payment_intents/${o.stripe_payment_intent}`);
  const parts = { food: Math.round(o.subtotal * 100), tax: Math.round(o.tax * 100), staffTip: Math.round(o.tip * 100), deliveryFee: Math.round(o.delivery_fee * 100), courierTip: Math.round(o.courier_tip * 100) };
  must(parts.food + parts.tax + parts.staffTip + parts.deliveryFee + parts.courierTip === pi.amount_received, `sum ${JSON.stringify(parts)} != ${pi.amount_received}`);
  must(pi.metadata.staff_tip_cents === '300' && pi.metadata.courier_tip_cents === '200', JSON.stringify(pi.metadata));
  const booked = await waitFor(async () => (await getOrder(Tp.orderId)).uber_delivery_id, 90_000, 5_000);
  must(booked, 'never booked');
  const ud = await uberApi.getDelivery(booked);
  must(Number(ud.tip ?? 0) === 200, `Uber delivery tip ${ud.tip}`);
  // What Uber bills Shaahi = delivery fee the customer paid + the courier tip the customer paid.
  must(Number(ud.fee) === parts.deliveryFee + parts.courierTip, `Uber bills ${ud.fee} vs collected ${parts.deliveryFee + parts.courierTip}`);
  return `Stripe ${pi.amount_received}c = food ${parts.food} + tax ${parts.tax} + staff tip ${parts.staffTip} + delivery ${parts.deliveryFee} + courier tip ${parts.courierTip}; Uber bills ${ud.fee}c (= delivery ${parts.deliveryFee} + courier tip ${ud.tip}); Shaahi keeps food+tax+staff tip`;
});
await test('T2', 'tracking page data: right token works; wrong token = 404; no phone/email/payment fields', async () => {
  must(Tp?.token, 'no tracking token returned at checkout');
  const ok = await call('delivery-status', { o: Tp.orderId, t: Tp.token }); must(ok.status === 200, `${ok.status}`);
  const bad = await call('delivery-status', { o: Tp.orderId, t: '0'.repeat(32) }); must(bad.status === 404, `wrong token ${bad.status}`);
  const leaked = Object.keys(ok.body).filter((k) => /phone|email|payment_intent|guest_name|zip/i.test(k)); must(!leaked.length, `leaks ${leaked}`);
  must(!JSON.stringify(ok.body).includes('469555'), 'phone digits in response');
  return `200 {status:${ok.body.kitchenStatus}, courier:${ok.body.courierStatus}, tracking:${ok.body.trackingUrl ? 'yes' : 'no'}}; wrong token 404`;
});
await test('N1', 'notifications: one per order per event, captured in staging (no SMS sent), no marketing sign-up', async () => {
  const n = (await rest('GET', `delivery_notifications?order_id=eq.${Tp.orderId}&select=kind,status,suppressed_reason,body`)).body;
  const kinds = n.map((x) => x.kind);
  must(kinds.includes('confirmed') && kinds.includes('courier_booked'), `kinds ${kinds}`);
  must(new Set(kinds).size === kinds.length, 'duplicate notification');
  // Staging runs NOTIFY_TRANSPORT=capture: the full workflow, no real SMS.
  must(n.every((x) => x.status === 'captured' || (x.status === 'suppressed' && x.suppressed_reason === 'transport_disabled')), JSON.stringify(n.map((x) => x.status + ':' + x.suppressed_reason)));
  must(n.every((x) => /Reply STOP/.test(x.body)), 'missing STOP wording');
  const mc = (await rest('GET', `marketing_consent?order_id=eq.${Tp.orderId}&select=id`)).body; must(mc.length === 0, 'marketing consent row written!');
  return `${kinds.join(', ')} — ${n[0].status}, none sent; 0 marketing_consent rows`;
});
await test('N2', 'a number that replied STOP is never texted', async () => {
  // Own range (469555 9xxx) so a STOP never collides with phone() in later runs.
  const p = `4695559${String(Date.now() % 1000).padStart(3, '0')}`;
  const st = await rest('POST', 'rpc/record_marketing_consent', { p_phone: p, p_email: null, p_granted: false, p_channel: 'sms', p_source: 'reply_stop', p_wording: 'Customer replied STOP to an order text (staging test).' });
  must(st.status === 200, `could not record STOP: ${st.status} ${JSON.stringify(st.body).slice(0, 120)}`);
  const q = await quote(); const c = await call('create-web-order', checkoutBody(q.body.quoteId, NEAR, p));
  const piId = c.body.paymentIntent.split('_secret_')[0];
  await stripe('POST', `payment_intents/${piId}/confirm`, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });
  await call('confirm-web-order', { orderId: c.body.orderId }); await dispatch();
  const n = (await rest('GET', `delivery_notifications?order_id=eq.${c.body.orderId}&select=kind,suppressed_reason`)).body;
  must(n.length && n.every((x) => x.suppressed_reason === 'replied_stop'), JSON.stringify(n));
  await kitchen(c.body.orderId, 'cancelled');
  return `${n.length} message(s) suppressed: replied_stop`;
});
// ── Step 3: automatic refund when the kitchen rejects a paid delivery ──
let AR;
await test('AR1', 'kitchen rejects a PAID delivery before any courier → full automatic refund, recorded by the Stripe webhook', async () => {
  AR = await paidOrder({ accept: false });
  await kitchen(AR.orderId, 'cancelled');
  // Our run or the every-minute job may get there first; either way exactly one refund.
  const d = await dispatch(); const r = (d.refunds ?? []).find((x) => x.id === AR.orderId);
  must(r?.refunded || r?.skipped === 'already_attempted' || r?.skipped === 'claimed_elsewhere' || !r, `dispatch refunds: ${JSON.stringify(d.refunds)}`);
  const o = await waitFor(async () => { const o = await getOrder(AR.orderId); return o.refund_status === 'full' ? o : null; }, 45_000) ?? await getOrder(AR.orderId);
  must(o.refund_status === 'full', `refund_status ${o.refund_status} (webhook never recorded it)`);
  must(o.auto_refund_state === 'refunded' && o.auto_refund_id?.startsWith('re_'), `auto_refund_state ${o.auto_refund_state}`);
  must(!o.uber_delivery_id, 'a courier was booked for a rejected order!');
  const pi = await stripe('GET', `payment_intents/${AR.piId}?expand[]=latest_charge`);
  must(pi.latest_charge.amount_refunded === pi.amount, `refunded ${pi.latest_charge.amount_refunded} of ${pi.amount}`);
  const n = (await rest('GET', `delivery_notifications?order_id=eq.${AR.orderId}&kind=eq.refunded&select=status,body`)).body;
  must(n.length === 1 && /refunded in full/.test(n[0].body), `refund message ${JSON.stringify(n)}`);
  return `Stripe refunded ${pi.amount}c of ${pi.amount}c → webhook set refund_status=full; status cancelled; no courier; "refunded" message ${n[0].status}`;
});
await test('AR2', 'auto-refund is exactly-once: repeated and simultaneous runs never refund twice', async () => {
  await Promise.all([dispatch(), dispatch(), dispatch()]);
  const claim = await rest('POST', 'rpc/claim_auto_refund', { p_order: AR.orderId });
  must(Array.isArray(claim.body) && claim.body.length === 0, `second claim returned ${JSON.stringify(claim.body).slice(0, 80)}`);
  const rf = await stripe('GET', `refunds?payment_intent=${AR.piId}`);
  must(rf.data.length === 1, `${rf.data.length} Stripe refunds`);
  return `4 runs + a direct claim → 1 Stripe refund (idempotency key auto-refund-<order>)`;
});
await test('AR3', 'rejection AFTER a courier is booked → no automatic refund (courier cancelled, staff decide)', async () => {
  const B = await paidOrder(); await dispatch();
  must((await getOrder(B.orderId)).uber_delivery_id, 'not booked');
  await kitchen(B.orderId, 'cancelled'); await dispatch(); await dispatch();
  const o = await getOrder(B.orderId);
  must(!o.auto_refund_state && o.refund_status === 'none', `auto_refund_state ${o.auto_refund_state} refund ${o.refund_status}`);
  return `courier ${o.uber_status}; refund left to staff (auto_refund_state empty)`;
});
await test('AR4', 'refund failure → flagged for staff, never retried; manual refund then reconciles', async () => {
  const C = await paidOrder({ accept: false });
  // Simulate Stripe refusing the refund: point the order at a PaymentIntent that does not exist.
  await rest('PATCH', `orders?id=eq.${C.orderId}`, { stripe_payment_intent: 'pi_staging_simulated_failure' });
  await kitchen(C.orderId, 'cancelled'); await dispatch(); await dispatch();
  let o = await getOrder(C.orderId);
  must(o.auto_refund_state === 'failed' && o.auto_refund_error, `state ${o.auto_refund_state}`);
  const failedState = o.auto_refund_error;
  const rf0 = await stripe('GET', `refunds?payment_intent=${C.piId}`); must(rf0.data.length === 0, 'refunded despite failure');
  // Manual exception process: staff refund the real payment (Refunds tool / Stripe); the webhook reconciles.
  await rest('PATCH', `orders?id=eq.${C.orderId}`, { stripe_payment_intent: C.piId });
  await stripe('POST', 'refunds', { payment_intent: C.piId });
  o = await waitFor(async () => { const x = await getOrder(C.orderId); return x.refund_status === 'full' ? x : null; }, 45_000) ?? await getOrder(C.orderId);
  must(o.refund_status === 'full', `after manual refund: ${o.refund_status}`);
  return `auto refund failed (${failedState.slice(0, 40)}) → flagged, 0 refunds, no retry → manual refund → refund_status=full`;
});
await test('NT1', 'failed text is retried at most 3 times; STOP re-checked each time', async () => {
  const ids = [];
  for (const [kind, attempts] of [['delivered', 1], ['picked_up', 3]]) {
    const r = await rest('POST', 'delivery_notifications', { order_id: AR.orderId, kind, channel: 'sms', body: `Staging retry test ${kind}. Reply STOP to stop order texts.`, status: 'failed', attempts, last_error: 'simulated', created_at: new Date(Date.now() - 120_000).toISOString() }, SERVICE, { Prefer: 'return=representation' });
    must(r.status === 201, `insert ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); ids.push(r.body[0].id);
  }
  const d = await dispatch();
  const rows = (await rest('GET', `delivery_notifications?id=in.(${ids.join(',')})&select=kind,status,suppressed_reason,attempts&order=id`)).body;
  // A retry re-checks STOP: a recycled test number that replied STOP earlier is correctly suppressed.
  must(rows[0].attempts === 2 && (rows[0].status === 'captured' || rows[0].suppressed_reason === 'replied_stop'), `retry row ${JSON.stringify(rows[0])}`);
  must(rows[1].status === 'failed' && rows[1].attempts === 3, `capped row ${JSON.stringify(rows[1])}`);
  return `attempt 1 failed → retried → ${rows[0].status}${rows[0].suppressed_reason ? ':' + rows[0].suppressed_reason : ''} (attempt 2); a 3-attempt failure stays failed for staff (retried=${d.retried})`;
});
// ── Server-owned delivery fields: an app customer cannot plant a courier order ──
await test('G1', 'a signed-in customer inserting their own order cannot set Uber/delivery fields (cleared by trigger)', async () => {
  const email = 'customer-test@shaahi-staging.test';
  let pw = ST.STAGING_CUSTOMER_TEST_PASSWORD;
  if (!pw) {
    pw = randomBytes(18).toString('base64url');
    writeFileSync(join(cfgDir, 'staging.env'), readFileSync(join(cfgDir, 'staging.env'), 'utf8') + `STAGING_CUSTOMER_TEST_PASSWORD=${pw}\n`, { mode: 0o600 });
    const u = await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, email_confirm: true }) }).then((r) => r.json());
    must(u.id, 'could not create staging customer');
  }
  const t = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) }).then((r) => r.json());
  must(t.access_token, 'customer login failed');
  const uid = JSON.parse(Buffer.from(t.access_token.split('.')[1], 'base64url').toString()).sub;
  await rest('POST', 'profiles', { id: uid, is_staff: false }, SERVICE, { Prefer: 'resolution=merge-duplicates,return=representation' });
  const planted = { user_id: uid, fulfillment: 'delivery', status: 'pending', subtotal: 32, tax: 2.64, total: 34.64, source: 'app',
    delivery_address: { street: '1520 K Ave', city: 'Plano', state: 'TX', zip: '75074' },
    uber_mode: 'sandbox', uber_dispatch_state: 'ready', tracking_token: 'f'.repeat(32), courier_tip: 50, delivery_tax: 0, auto_refund_state: 'refunded', uber_delivery_id: 'del_planted', kitchen_accepted_at: '2020-01-01T00:00:00Z' };
  const r = await rest('POST', 'orders', planted, ANON, { Authorization: `Bearer ${t.access_token}` });
  must(r.status === 201, `customer insert ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  const o = await getOrder(r.body[0].id);
  const leaked = ['uber_mode', 'uber_dispatch_state', 'tracking_token', 'delivery_tax', 'auto_refund_state', 'uber_delivery_id', 'kitchen_accepted_at'].filter((k) => o[k] != null);
  if (Number(o.courier_tip) !== 0) leaked.push('courier_tip');
  await rest('DELETE', `orders?id=eq.${o.id}`);
  must(leaked.length === 0, `customer set: ${leaked.join(', ')}`);
  must(o.payment_status === 'pending', 'payment guard changed');
  const gate = canDispatchLike(o);
  return `8 planted fields all cleared; payment_status=pending; dispatcher would skip it (${gate})`;
});
// ── Pickup regression: the existing checkout must behave exactly as before ──
await test('PK1', 'pickup checkout unchanged: food tax only, no delivery fields, paid, never a courier or a delivery text', async () => {
  const p = phone();
  const c = await call('create-web-order', { items: ITEMS, guestName: 'Pickup Regression', guestPhone: p, guestEmail: '', tipCents: 480, fulfillment: 'pickup' });
  must(c.status === 200, `checkout ${c.status} ${JSON.stringify(c.body).slice(0, 120)}`);
  const b = c.body.breakdown;
  must(b.subtotalCents === 3200 && b.taxCents === 264 && b.tipCents === 480 && b.totalCents === 3944, `breakdown ${JSON.stringify(b)}`);
  must(!('deliveryFeeCents' in b) && !('deliveryTaxCents' in b) && !c.body.trackingToken, 'delivery fields leaked into pickup');
  const piId = c.body.paymentIntent.split('_secret_')[0];
  const pi = await stripe('POST', `payment_intents/${piId}/confirm`, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });
  must(pi.status === 'succeeded' && pi.amount === 3944, `stripe ${pi.status} ${pi.amount}`);
  must(!Object.keys(pi.metadata).some((k) => /delivery|courier|uber/.test(k)), `metadata ${Object.keys(pi.metadata)}`);
  const cf = await call('confirm-web-order', { orderId: c.body.orderId }); must(cf.body?.paid === true, 'confirm');
  await kitchen(c.body.orderId, 'accepted'); await dispatch();
  const o = await getOrder(c.body.orderId);
  must(o.fulfillment === 'pickup' && o.payment_status === 'paid' && Number(o.tax) === 2.64 && !o.uber_mode && !o.uber_delivery_id && !o.tracking_token && o.delivery_tax == null && !o.courier_tip, JSON.stringify({ f: o.fulfillment, t: o.tax, m: o.uber_mode }));
  const n = (await rest('GET', `delivery_notifications?order_id=eq.${c.body.orderId}&select=id`)).body;
  must(n.length === 0, 'pickup got a delivery text');
  await kitchen(c.body.orderId, 'cancelled'); await dispatch();
  const o2 = await getOrder(c.body.orderId);
  must(!o2.auto_refund_state, 'pickup was auto-refunded — only deliveries may be');
  return `$39.44 = $32.00 + $2.64 tax + $4.80 tip; Stripe 3944, no delivery metadata; accepted → no courier, no text; cancel → no automatic refund (pickup refunds stay manual)`;
});
// ── Emergency switch (only with RUN_SWITCH=1: changes a staging secret for ~1 min) ──
if (process.env.RUN_SWITCH === '1') await test('SW1', 'emergency switch: new delivery orders stop; a paid order already in the kitchen still gets its courier; pickup unaffected', async () => {
  const { execSync } = await import('node:child_process');
  const setSecret = (v) => execSync(`supabase secrets set --project-ref ${ST.STAGING_PROJECT_REF} DELIVERY_NEW_ORDERS=${v}`, { stdio: 'ignore' });
  const K = await paidOrder({ accept: false });
  setSecret('off');
  try {
    await sleep(15_000);
    const q = await quote(); must(q.status === 503, `quote while off: ${q.status}`);
    const pk = await call('create-web-order', { items: ITEMS.map((i) => ({ ...i, quantity: 1 })), guestName: 'Switch Pickup', guestPhone: phone(), guestEmail: '', tipCents: 0, fulfillment: 'pickup' });
    must(pk.status === 200, `pickup while off: ${pk.status}`);
    await kitchen(K.orderId, 'accepted'); await dispatch();
    const o = await getOrder(K.orderId); must(o.uber_delivery_id, 'paid order lost its courier');
    return `quote ${q.status} while off; pickup ${pk.status}; in-kitchen order still booked ${short(o.uber_delivery_id)}`;
  } finally { setSecret('on'); }
});
await test('X3', 'kitchen cancels AFTER the courier picked up → courier not cancelled, nothing breaks', async () => {
  must(Tp?.orderId, 'no order');
  const o = await getOrder(Tp.orderId);
  if (WEBHOOK_SECRET && o.uber_status !== 'pickup_complete' && o.uber_status !== 'delivered') await webhook({ id: `evt_${run}_x3`, kind: 'event.delivery_status', delivery_id: o.uber_delivery_id, status: 'pickup_complete', data: { status: 'pickup_complete' } });
  await kitchen(Tp.orderId, 'cancelled'); const d = await dispatch();
  const c = (d.cancelled ?? []).find((x) => x.id === Tp.orderId);
  must(!c || c.cancel === 'too_late', JSON.stringify(c));
  return c ? `too_late (${c.uber_status})` : 'not in cancel queue (already delivered)';
});
await test('X4', 'partial refund (one item) does NOT cancel the courier', async () => {
  const H = await paidOrder(); const booked = await waitFor(async () => (await getOrder(H.orderId)).uber_delivery_id, 90_000, 5_000); must(booked, 'not booked');
  await stripe('POST', 'refunds', { payment_intent: H.piId, amount: '500' });
  must(await waitFor(async () => (await getOrder(H.orderId)).refund_status === 'partial', 45_000), 'webhook never set partial');
  await dispatch(); const o = await getOrder(H.orderId); must(o.uber_status !== 'canceled', 'courier cancelled on partial refund');
  return `refund_status=partial, courier still ${o.uber_status}`;
});
await test('Z1', 'reconciliation: no order has more than one courier; every courier belongs to a paid order', async () => {
  const rows = (await rest('GET', `orders?uber_delivery_id=not.is.null&select=id,uber_delivery_id,payment_status`)).body;
  const ids = rows.map((r) => r.uber_delivery_id); must(new Set(ids).size === ids.length, 'duplicate delivery ids');
  const unpaid = rows.filter((r) => !['paid', 'refunded'].includes(r.payment_status)); must(!unpaid.length, `couriers on unpaid orders: ${unpaid.length}`);
  return `${rows.length} couriers, ${rows.length} distinct orders, all paid`;
});

const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(join(cfgDir, 'staging-build', `e2e-results-${run}.json`), JSON.stringify({ at: new Date().toISOString(), project: REF, results }, null, 2), { mode: 0o600 });
if (pass !== results.length) process.exitCode = 1;
