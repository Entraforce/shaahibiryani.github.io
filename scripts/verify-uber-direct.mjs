// Offline tests for the Uber Direct sandbox integration: the shared client and
// the delivery rules, with Uber's API faked. No network, no secrets.
//   node scripts/verify-uber-direct.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  makeUberClient, uberMode, classifyUberError, toE164, formatUberAddress,
  verifyUberSignature, UberDirectError, UBER_TOKEN_URL,
} from '../supabase/functions/_shared/uber-direct.js';
import {
  STORE, customerDeliveryFeeCents, DEFAULT_POLICY, policyFromEnv, maxFeeForMiles, courierTipCents, pickupReadyAt, quoteUsableForCheckout, normaliseDeliveryAddress, addressKey,
  canDispatch, requoteDecision, orderStatusFromUber, uberNeedsStaff, courierCancellable,
  deliveryRequestFor, MAX_DISPATCH_ATTEMPTS, orderTax, deliveryLedger, pilotAccess, autoRefundDecision, TAX_RATE,
} from '../supabase/functions/_shared/delivery-policy.js';

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}

// ── A fake Uber: records calls, answers from a script ──
function fakeUber(script) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body, auth: init?.headers?.Authorization });
    const r = script(url, init, calls);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return { fetch, calls };
}
const T0 = Date.parse('2026-10-31T17:00:00Z');
const creds = { customerId: 'cust_test', clientId: 'cid_test', clientSecret: 'secret_test_value', mode: 'sandbox' };
const tokenOk = { status: 200, body: { access_token: 'tok_1', expires_in: 2592000, token_type: 'Bearer' } };
const quoteBody = { kind: 'delivery_quote', id: 'dqt_1', fee: 799, currency: 'usd', expires: '2026-10-31T17:15:00Z', dropoff_eta: '2026-10-31T17:44:00Z', duration: 44, pickup_duration: 18 };

// ── Mode guard ──
await check('mode: only "sandbox" or "live" enable; unset/typo are disabled', () => {
  assert.equal(uberMode('sandbox'), 'sandbox'); assert.equal(uberMode(' SANDBOX '), 'sandbox');
  for (const v of [undefined, '', 'production', 'sandbx']) assert.equal(uberMode(v), 'disabled', String(v));
});
await check('client refuses to call Uber when mode is disabled', async () => {
  const u = fakeUber(() => tokenOk);
  const c = makeUberClient({ ...creds, mode: 'production', fetch: u.fetch });
  await assert.rejects(() => c.createQuote({}), (e) => e instanceof UberDirectError && e.code === 'disabled');
  assert.equal(u.calls.length, 0);
});
await check('client refuses when credentials are missing', async () => {
  const c = makeUberClient({ mode: 'sandbox', fetch: async () => { throw new Error('should not fetch'); } });
  await assert.rejects(() => c.token(), (e) => e.code === 'auth');
});

// ── OAuth ──
await check('OAuth: client_credentials + eats.deliveries, token cached and reused', async () => {
  const u = fakeUber((url) => url === UBER_TOKEN_URL ? tokenOk : { status: 200, body: quoteBody });
  const c = makeUberClient({ ...creds, fetch: u.fetch, now: () => T0 });
  await c.createQuote({}); await c.createQuote({});
  const tokenCalls = u.calls.filter((x) => x.url === UBER_TOKEN_URL);
  assert.equal(tokenCalls.length, 1);
  const p = new URLSearchParams(tokenCalls[0].body);
  assert.equal(p.get('grant_type'), 'client_credentials'); assert.equal(p.get('scope'), 'eats.deliveries');
  assert.equal(u.calls[1].auth, 'Bearer tok_1');
});
await check('OAuth: a 401 forces one token refresh and one retry', async () => {
  let n = 0;
  const u = fakeUber((url) => url === UBER_TOKEN_URL ? { status: 200, body: { access_token: 'tok_' + (++n), expires_in: 2592000 } }
    : (n === 1 ? { status: 401, body: { code: 'unauthorized' } } : { status: 200, body: quoteBody }));
  const c = makeUberClient({ ...creds, fetch: u.fetch, now: () => T0 });
  const q = await c.createQuote({});
  assert.equal(q.quoteId, 'dqt_1'); assert.equal(n, 2);
});
await check('OAuth failure never puts the client secret in the error', async () => {
  const u = fakeUber(() => ({ status: 401, body: { error: 'invalid_client' } }));
  const c = makeUberClient({ ...creds, fetch: u.fetch });
  try { await c.token(); assert.fail('should throw'); } catch (e) {
    assert.equal(e.code, 'auth'); assert.ok(!JSON.stringify({ m: e.message, d: e.detail }).includes(creds.clientSecret));
  }
});

// ── Quotes ──
await check('quote: hits /v1/customers/{id}/delivery_quotes and normalises fee/ETA/expiry', async () => {
  const u = fakeUber((url) => url === UBER_TOKEN_URL ? tokenOk : { status: 200, body: quoteBody });
  const c = makeUberClient({ ...creds, fetch: u.fetch });
  const q = await c.createQuote({ pickupAddress: 'a', dropoffAddress: 'b', pickupPhone: '+1', dropoffPhone: '+2' });
  assert.match(u.calls[1].url, /\/v1\/customers\/cust_test\/delivery_quotes$/);
  assert.deepEqual([q.quoteId, q.feeCents, q.durationMin, q.expiresAt], ['dqt_1', 799, 44, '2026-10-31T17:15:00Z']);
});
await check('a live_mode=true response is refused by the sandbox build', async () => {
  const u = fakeUber((url) => url === UBER_TOKEN_URL ? tokenOk : { status: 200, body: { ...quoteBody, live_mode: true } });
  const c = makeUberClient({ ...creds, fetch: u.fetch });
  await assert.rejects(() => c.createQuote({}), (e) => e.code === 'live_mode');
});
await check('error classes: expired / undeliverable / couriers busy / duplicate / rate limit / auth', () => {
  assert.equal(classifyUberError(400, { code: 'expired_quote', message: 'The quote has expired' }), 'quote_expired');
  assert.equal(classifyUberError(400, { code: 'address_undeliverable' }), 'address_undeliverable');
  assert.equal(classifyUberError(422, { message: 'Dropoff is outside of delivery area' }), 'address_undeliverable');
  assert.equal(classifyUberError(400, { code: 'couriers_busy', message: 'No couriers available' }), 'couriers_unavailable');
  assert.equal(classifyUberError(409, {}), 'duplicate');
  assert.equal(classifyUberError(429, { code: 'customer_limited' }), 'rate_limited');
  assert.equal(classifyUberError(401, {}), 'auth');
  assert.equal(classifyUberError(503, {}), 'upstream');
});

// ── Addresses / phones ──
await check('address: structured JSON with suite; same input → same string (quote == delivery)', () => {
  const s = formatUberAddress(STORE.address);
  assert.deepEqual(JSON.parse(s), { street_address: ['3421 E Renner Rd', 'Suite 110'], city: 'Plano', state: 'TX', zip_code: '75074', country: 'US' });
  assert.equal(formatUberAddress({ ...STORE.address }), s);
  assert.equal(formatUberAddress({ street: '1 Main', city: 'Plano', zip: '7507' }), null);
});
await check('customer address validation: needs number, city, 5-digit ZIP, Texas', () => {
  assert.ok(normaliseDeliveryAddress({ street: '100 Legacy Dr', city: 'Plano', zip: '75024' }).address);
  assert.match(normaliseDeliveryAddress({ street: 'Legacy Dr', city: 'Plano', zip: '75024' }).error, /house or building number/);
  assert.match(normaliseDeliveryAddress({ street: '1 A', city: '', zip: '75024' }).error, /city/);
  assert.match(normaliseDeliveryAddress({ street: '1 A', city: 'Plano', zip: '750' }).error, /ZIP/);
  assert.match(normaliseDeliveryAddress({ street: '1 A', city: 'Tulsa', state: 'OK', zip: '74101' }).error, /Texas/);
  assert.equal(addressKey({ street: '100 Legacy Dr.', city: 'PLANO', zip: '75024' }), addressKey({ street: '100 legacy dr', city: 'plano', zip: '75024' }));
});
await check('phone → E.164 for the driver', () => {
  assert.equal(toE164('(469) 960-3300'), '+14699603300'); assert.equal(toE164('1-469-960-3300'), '+14699603300');
  assert.equal(toE164('960-3300'), null);
});

// ── Money ──
await check('fee: pass-through of Uber quote; default 5-mile limit = $7.99 tier, configurable', () => {
  assert.equal(customerDeliveryFeeCents(799), 799); assert.equal(customerDeliveryFeeCents(899), null);
  const ten = { ...DEFAULT_POLICY, maxMiles: 10 };
  assert.equal(customerDeliveryFeeCents(1099, ten), 1099); assert.equal(customerDeliveryFeeCents(1100, ten), null);
  assert.equal(maxFeeForMiles(6), 899); assert.equal(customerDeliveryFeeCents(0), null); assert.equal(customerDeliveryFeeCents('x'), null);
});
await check('policy from settings: defaults, overrides, bad values ignored', () => {
  assert.deepEqual({ ...policyFromEnv(() => undefined) }, { ...DEFAULT_POLICY });
  const p = policyFromEnv((k) => ({ DELIVERY_MIN_SUBTOTAL_CENTS: '2500', DELIVERY_PREP_MINUTES: '-5', DELIVERY_COURIER_TIPS: 'off' })[k]);
  assert.equal(p.minSubtotalCents, 2500); assert.equal(p.prepMinutes, 25); assert.equal(p.courierTips, false);
});
await check('courier tip: optional, capped, off when policy disables it', () => {
  assert.equal(courierTipCents(300), 300); assert.equal(courierTipCents(-1), 0); assert.equal(courierTipCents('abc'), 0);
  assert.equal(courierTipCents(999999), 5000); assert.equal(courierTipCents(300, { ...DEFAULT_POLICY, courierTips: false }), 0);
});
await check('courier pickup time = kitchen accept time + prep; immediate when ready', () => {
  const acc = '2026-10-31T17:00:00Z';
  assert.equal(pickupReadyAt(acc, 'accepted', DEFAULT_POLICY, Date.parse(acc)), '2026-10-31T17:25:00.000Z');
  assert.equal(pickupReadyAt(acc, 'ready', DEFAULT_POLICY, Date.parse('2026-10-31T17:10:00Z')), '2026-10-31T17:10:00.000Z');
  assert.equal(pickupReadyAt(acc, 'accepted', DEFAULT_POLICY, Date.parse('2026-10-31T17:40:00Z')), '2026-10-31T17:40:00.000Z');
});
await check('expired quote cannot be paid against (2-minute margin)', () => {
  const exp = '2026-10-31T17:15:00Z';
  assert.equal(quoteUsableForCheckout(exp, Date.parse('2026-10-31T17:10:00Z')), true);
  assert.equal(quoteUsableForCheckout(exp, Date.parse('2026-10-31T17:13:30Z')), false);
  assert.equal(quoteUsableForCheckout('garbage', T0), false);
});
await check('re-quote at dispatch: never silently absorb by default; staff decides any rise', () => {
  assert.equal(requoteDecision(799, 899).reason, 'fee_rose');
  assert.deepEqual(requoteDecision(799, 899, { ...DEFAULT_POLICY, requoteAbsorbCents: 200 }), { ok: true, absorbedCents: 100 });
  assert.deepEqual(requoteDecision(799, 799), { ok: true, absorbedCents: 0 });
  assert.deepEqual(requoteDecision(799, 699), { ok: true, absorbedCents: 0 });
  assert.equal(requoteDecision(799, 1099).reason, 'fee_rose');
  assert.equal(requoteDecision(1099, 1299).reason, 'out_of_area');
});

// ── When a courier may be booked ──
const paidAccepted = { id: 'o1', fulfillment: 'delivery', payment_status: 'paid', status: 'accepted', uber_mode: 'sandbox', uber_dispatch_attempts: 0 };
await check('dispatch only after payment AND kitchen acceptance', () => {
  assert.equal(canDispatch(paidAccepted, T0).ok, true);
  assert.equal(canDispatch({ ...paidAccepted, payment_status: 'pending' }, T0).reason, 'not_paid');
  assert.equal(canDispatch({ ...paidAccepted, payment_status: 'failed' }, T0).reason, 'not_paid');
  assert.equal(canDispatch({ ...paidAccepted, status: 'pending' }, T0).reason, 'kitchen_not_accepted');
  for (const s of ['preparing', 'ready']) assert.equal(canDispatch({ ...paidAccepted, status: s }, T0).ok, true, s);
});
await check('no duplicate courier: already dispatched / in flight / staff hold / too many tries', () => {
  assert.equal(canDispatch({ ...paidAccepted, uber_delivery_id: 'del_1' }, T0).reason, 'already_dispatched');
  assert.equal(canDispatch({ ...paidAccepted, uber_dispatch_claimed_at: new Date(T0 - 30_000).toISOString() }, T0).reason, 'in_flight');
  assert.equal(canDispatch({ ...paidAccepted, uber_dispatch_claimed_at: new Date(T0 - 5 * 60_000).toISOString() }, T0).ok, true);
  assert.equal(canDispatch({ ...paidAccepted, uber_dispatch_state: 'needs_staff' }, T0).reason, 'needs_staff');
  assert.equal(canDispatch({ ...paidAccepted, uber_dispatch_attempts: MAX_DISPATCH_ATTEMPTS }, T0).reason, 'too_many_attempts');
});
await check('cancelled, pickup and non-sandbox orders never dispatch', () => {
  assert.equal(canDispatch({ ...paidAccepted, status: 'cancelled' }, T0).reason, 'cancelled');
  assert.equal(canDispatch({ ...paidAccepted, refund_status: 'full' }, T0).reason, 'refunded');
  assert.equal(canDispatch({ ...paidAccepted, refund_status: 'partial' }, T0).ok, true);
  assert.equal(canDispatch({ ...paidAccepted, fulfillment: 'pickup' }, T0).reason, 'not_delivery');
  assert.equal(canDispatch({ ...paidAccepted, uber_mode: null }, T0).reason, 'not_sandbox_order');
});
await check('delivery request: idempotency key + external id = order id; same address format as quote', () => {
  const o = { id: 'a1b2c3d4-0000', guest_name: 'Test Guest', guest_phone_e164: '+14695550100', subtotal: 24.5, delivery_address: { street: '100 Legacy Dr', city: 'Plano', state: 'TX', zip: '75024', notes: 'Gate 12' } };
  const r = deliveryRequestFor(o, [{ item_name: 'Chicken Pakora', quantity: 2 }], formatUberAddress);
  assert.equal(r.externalId, o.id); assert.equal(r.idempotencyKey, 'shaahi-web-' + o.id);
  assert.equal(r.dropoffAddress, formatUberAddress(o.delivery_address)); assert.equal(r.manifestTotalCents, 2450);
  assert.equal(r.dropoffNotes, 'Gate 12'); assert.equal(r.pickupPhone, '+14699603300');
});

// ── Courier progress → order status ──
await check('Uber status moves the order forward only', () => {
  assert.equal(orderStatusFromUber('pickup_complete', 'ready'), 'out_for_delivery');
  assert.equal(orderStatusFromUber('delivered', 'out_for_delivery'), 'delivered');
  assert.equal(orderStatusFromUber('pickup_complete', 'delivered'), null);       // late webhook
  assert.equal(orderStatusFromUber('delivered', 'cancelled'), null);
  assert.equal(orderStatusFromUber('pending', 'accepted'), null);
  assert.equal(orderStatusFromUber('canceled', 'ready'), null);                  // never cancels our order
  assert.equal(uberNeedsStaff('canceled'), true); assert.equal(uberNeedsStaff('returned'), true);
});
await check('kitchen cancel cancels the courier only before pickup', () => {
  for (const s of ['pending', 'pickup', undefined]) assert.equal(courierCancellable(s), true, String(s));
  for (const s of ['pickup_complete', 'dropoff', 'delivered']) assert.equal(courierCancellable(s), false, s);
});

// ── Webhook authentication ──
await check('webhook: valid HMAC-SHA256 hex accepted (both header names); tampered/missing refused', async () => {
  const secret = 'whsec_test', raw = '{"kind":"event.delivery_status","status":"pickup","delivery_id":"del_1"}';
  const sig = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(await verifyUberSignature(raw, { 'x-uber-signature': sig }, secret), true);
  assert.equal(await verifyUberSignature(raw, { 'x-postmates-signature': sig.toUpperCase() }, secret), true);
  assert.equal(await verifyUberSignature(raw + ' ', { 'x-uber-signature': sig }, secret), false);
  assert.equal(await verifyUberSignature(raw, { 'x-uber-signature': sig }, 'other'), false);
  assert.equal(await verifyUberSignature(raw, {}, secret), false);
  assert.equal(await verifyUberSignature(raw, { 'x-uber-signature': sig }, ''), false);
});

// ── Step 3: tax, money breakdown, pilot gate, auto-refund, live/test separation ──
await check('tax: pickup unchanged (food only), browser order #C9D668 numbers', () => {
  assert.equal(orderTax(3200, 0).taxCents, 264);
  const t = orderTax(3200, 799);                  // $32 food + $7.99 delivery
  assert.deepEqual(t, { foodTaxCents: 264, deliveryTaxCents: 66, taxCents: 330 });
  assert.equal(orderTax(3200, 799, { ...DEFAULT_POLICY, deliveryFeeTaxable: false }).taxCents, 264);
  assert.equal(TAX_RATE, 0.0825);
});
await check('tax: split always adds up (one rounding over the taxable base)', () => {
  for (let f = 2000; f < 6000; f += 37) for (const d of [0, 599, 799, 999]) {
    const t = orderTax(f, d);
    assert.equal(t.foodTaxCents + t.deliveryTaxCents, t.taxCents);
    assert.equal(t.taxCents, Math.round((f + d) * 0.0825));
  }
});
await check('pilot code: captured from #fragment in <head> before analytics, then wiped from the address bar', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const capture = html.indexOf("sessionStorage.setItem('shaahiPilot'"), ga = html.indexOf('googletagmanager'), attr = html.indexOf('shaahiAttribution=');
  assert.ok(capture > 0 && capture < ga && capture < attr, 'pilot capture must run before Google Analytics and attribution');
  assert.match(html.slice(capture, capture + 200), /history\.replaceState\(null, '', location\.pathname\)/);
  assert.ok(!/[?&]code=/.test(html.slice(html.indexOf('pilotCode:'), html.indexOf('pilotCode:') + 120)), 'code must not be put in a URL');
});
await check('tax: page formula equals server formula (index.html orderTotals)', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /var taxCents = Math\.round\(\(subtotalCents \+ feeCents\) \* TAX_RATE\);/);
});
await check('ledger: #C9D668 with delivery tax separates every bucket', () => {
  const L = deliveryLedger({ foodCents: 3200, foodTaxCents: 264, deliveryTaxCents: 66, staffTipCents: 576, deliveryFeeCents: 799, courierTipCents: 300, stripeFeeCents: 181 });
  assert.equal(L.gross, 5205);
  assert.equal(L.passThroughUber, 1099);
  assert.equal(L.salesTaxLiability, 330);
  assert.equal(L.staffTips, 576);
  assert.equal(L.netFoodProceeds, 3019);
  assert.equal(L.stripeFeeOnPassThrough, 38);
  assert.equal(L.balances, true);
});
await check('pilot gate: live never public; code AND listed phone required', () => {
  assert.deepEqual(pilotAccess({ mode: 'live', pilotOn: false, codeOk: true, phoneListed: true }), { ok: false, reason: 'live_requires_pilot' });
  assert.equal(pilotAccess({ mode: 'live', pilotOn: false, codeOk: false, phoneListed: false }).ok, false); // flag off → no live booking path at all
  assert.equal(pilotAccess({ mode: 'live', pilotOn: true, codeOk: false, phoneListed: true , untilMs: Date.now() + 3600e3 }).reason, 'pilot_code');
  assert.equal(pilotAccess({ mode: 'live', pilotOn: true, codeOk: true, phoneListed: false , untilMs: Date.now() + 3600e3 }).reason, 'pilot_phone');
  const until = Date.now() + 3600e3;
  assert.equal(pilotAccess({ mode: 'live', pilotOn: true, codeOk: true, phoneListed: true, untilMs: until }).ok, true);
  assert.equal(pilotAccess({ mode: 'live', pilotOn: true, codeOk: true, phoneListed: true }).reason, 'pilot_window_unset');
  assert.equal(pilotAccess({ mode: 'live', pilotOn: true, codeOk: true, phoneListed: true, untilMs: Date.now() - 1 }).reason, 'pilot_expired');
  assert.equal(pilotAccess({ mode: 'sandbox', pilotOn: false, codeOk: false, phoneListed: false }).ok, true);
});
const rejected = { fulfillment: 'delivery', status: 'cancelled', payment_status: 'paid', refund_status: 'none', uber_delivery_id: null, auto_refund_state: null, stripe_payment_intent: 'pi_1', uber_mode: 'sandbox' };
await check('auto-refund: only a paid delivery rejected before any courier', () => {
  assert.equal(autoRefundDecision(rejected).ok, true);
  assert.equal(autoRefundDecision({ ...rejected, uber_delivery_id: 'del_1' }).reason, 'courier_was_booked');
  assert.equal(autoRefundDecision({ ...rejected, status: 'accepted' }).reason, 'not_cancelled');
  assert.equal(autoRefundDecision({ ...rejected, refund_status: 'partial' }).reason, 'already_refunded');
  assert.equal(autoRefundDecision({ ...rejected, refund_status: 'full' }).reason, 'already_refunded');
  assert.equal(autoRefundDecision({ ...rejected, auto_refund_state: 'failed' }).reason, 'already_attempted');
  assert.equal(autoRefundDecision({ ...rejected, payment_status: 'pending' }).reason, 'not_paid');
  assert.equal(autoRefundDecision({ ...rejected, fulfillment: 'pickup' }).reason, 'not_delivery');
  assert.equal(autoRefundDecision(rejected, 'live').reason, 'other_mode');
});
await check('mode: "live" must be spelled exactly; anything else is disabled', () => {
  assert.equal(uberMode('live'), 'live'); assert.equal(uberMode(' LIVE '), 'live');
  assert.equal(uberMode('production'), 'disabled'); assert.equal(uberMode('lives'), 'disabled');
});
await check('dispatch: a test order never gets a live courier, and vice versa', () => {
  const o = { fulfillment: 'delivery', payment_status: 'paid', status: 'accepted', uber_delivery_id: null, uber_mode: 'sandbox' };
  assert.equal(canDispatch(o, Date.now(), 'sandbox').ok, true);
  assert.equal(canDispatch(o, Date.now(), 'live').reason, 'not_live_order');
  assert.equal(canDispatch({ ...o, uber_mode: 'live' }, Date.now(), 'sandbox').reason, 'not_sandbox_order');
});
await check('client: live build refuses test data (test keys in production)', async () => {
  const { fetch } = fakeUber((url) => /oauth|token/.test(url) ? tokenOk : { status: 200, body: { ...quoteBody, live_mode: false } });
  const uber = makeUberClient({ ...creds, mode: 'live', fetch });
  await assert.rejects(uber.createQuote({ pickupAddress: 'a', dropoffAddress: 'b', pickupPhone: '+1', dropoffPhone: '+1' }), (e) => e.code === 'live_mode');
});

console.log(`\n${passed}/${passed + failed} Uber Direct checks passed`);
if (failed) process.exit(1);
