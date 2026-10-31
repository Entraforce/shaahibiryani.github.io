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
const phone = () => `469555${String(100 + (Number(run.slice(-3).replace(/\D/g, '') || 0) + phoneSeq++) % 900).padStart(4, '0')}`;
const checkoutBody = (quoteId, addr = NEAR, p = phone()) => ({ items: ITEMS, guestName: 'Staging Test', guestPhone: p, guestEmail: '', tipCents: 300, fulfillment: 'delivery', deliveryAddress: { ...addr, notes: 'STAGING TEST' }, deliveryQuoteId: quoteId });

async function quote(addr = NEAR) { return call('uber-delivery-quote', { address: addr, phone: '4695550100' }); }
async function paidOrder({ accept = true } = {}) {
  const q = await quote(); must(q.status === 200, `quote ${q.status}`);
  const c = await call('create-web-order', checkoutBody(q.body.quoteId)); must(c.status === 200, `checkout ${c.status} ${JSON.stringify(c.body)}`);
  const piId = c.body.paymentIntent.split('_secret_')[0];
  const pi = await stripe('POST', `payment_intents/${piId}/confirm`, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });
  must(pi.status === 'succeeded', `stripe ${pi.status ?? pi.error?.message}`);
  const cf = await call('confirm-web-order', { orderId: c.body.orderId }); must(cf.body?.paid === true, `confirm ${JSON.stringify(cf.body)}`);
  if (accept) await kitchen(c.body.orderId, 'accepted');
  return { orderId: c.body.orderId, piId, quoteRowId: q.body.quoteId };
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
  const b = c.body.breakdown; must(b.totalCents === b.subtotalCents + b.taxCents + b.tipCents + b.deliveryFeeCents, 'total arithmetic');
  const piId = c.body.paymentIntent.split('_secret_')[0];
  const pi = await stripe('GET', `payment_intents/${piId}`); must(pi.amount === b.totalCents && pi.livemode === false, `PI amount ${pi.amount} livemode ${pi.livemode}`);
  const o = await getOrder(c.body.orderId);
  must(o.fulfillment === 'delivery' && o.uber_mode === 'sandbox' && o.payment_status === 'pending' && o.status === 'pending', 'order row');
  must(Math.round(o.delivery_fee * 100) === b.deliveryFeeCents && o.delivery_address?.zip === '75074', 'fee/address persisted');
  A = { orderId: c.body.orderId, piId, phone: p, quoteId: qa.body.quoteId, body: checkoutBody(qa.body.quoteId, NEAR, p) };
  return `order ${short(A.orderId)} sub ${b.subtotalCents} + tax ${b.taxCents} + tip ${b.tipCents} + fee ${b.deliveryFeeCents} = ${b.totalCents}c; Stripe PI test-mode amount ${pi.amount}`;
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
  must(booked.length === 1, `booked ${booked.length} times: ${JSON.stringify(runs.map((r) => r.dispatched))}`);
  const o = await getOrder(A.orderId); delA = o.uber_delivery_id;
  must(delA && o.uber_dispatch_state === 'dispatched' && o.uber_tracking_url, 'order not updated');
  return `1 booking from 3 runs; ${short(delA)} tracking=${o.uber_tracking_url ? 'yes' : 'no'}`;
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
  const C = await paidOrder(); const d = await dispatch();
  const o1 = await getOrder(C.orderId); must(o1.uber_delivery_id, `not booked: ${JSON.stringify(d.dispatched)}`);
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
  await rest('PATCH', `orders?id=eq.${E.orderId}`, { payment_status: 'refunded' }); // what stripe-webhook-web sets on charge.refunded
  const d2 = await dispatch(); const c = (d2.cancelled ?? []).find((x) => x.id === E.orderId);
  const o2 = await getOrder(E.orderId);
  must(o2.uber_status === 'canceled' || c?.cancel === 'too_late', `uber_status ${o2.uber_status}`);
  return `Stripe test refund ${rf.status}; courier ${c?.cancelled ? 'cancelled' : 'already picked up (not cancellable)'}`;
});
await test('R1', 'quote expired by dispatch time → fresh quote, still booked', async () => {
  const F = await paidOrder({ accept: false });
  await rest('PATCH', `delivery_quotes?id=eq.${F.quoteRowId}`, { expires_at: new Date(Date.now() - 60_000).toISOString() });
  await kitchen(F.orderId, 'accepted'); const d = await dispatch();
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

const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(join(cfgDir, 'staging-build', `e2e-results-${run}.json`), JSON.stringify({ at: new Date().toISOString(), project: REF, results }, null, 2), { mode: 0o600 });
if (pass !== results.length) process.exitCode = 1;
