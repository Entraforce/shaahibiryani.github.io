// LIVE sandbox test against Uber Direct's TEST environment (robo courier, no
// real driver, no charge). Reads TEST credentials from a private file outside
// git and never prints them:
//   ~/.config/shaahi/uber-direct-sandbox.env   (chmod 600)
// Usage: node scripts/sandbox-uber-direct.mjs
// Skips (exit 0) when the credentials file is empty.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeUberClient, formatUberAddress, UberDirectError } from '../supabase/functions/_shared/uber-direct.js';
import { STORE, deliveryRequestFor, customerDeliveryFeeCents } from '../supabase/functions/_shared/delivery-policy.js';

const file = join(homedir(), '.config/shaahi/uber-direct-sandbox.env');
const env = {};
try {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* missing file → skip below */ }
if (!env.UBER_DIRECT_CUSTOMER_ID || !env.UBER_DIRECT_CLIENT_ID || !env.UBER_DIRECT_CLIENT_SECRET) {
  console.log('SKIP  sandbox credentials not set in ~/.config/shaahi/uber-direct-sandbox.env');
  process.exit(0);
}

const uber = makeUberClient({
  mode: 'sandbox',
  customerId: env.UBER_DIRECT_CUSTOMER_ID, clientId: env.UBER_DIRECT_CLIENT_ID, clientSecret: env.UBER_DIRECT_CLIENT_SECRET,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
async function step(name, fn) {
  try { const note = await fn(); passed++; console.log('ok  ', name, note ? `— ${note}` : ''); }
  catch (e) { failed++; console.log('FAIL', name, '—', e instanceof UberDirectError ? `${e.code} (HTTP ${e.status}) ${e.message}` : e.message); }
}

const pickup = formatUberAddress(STORE.address);
// A real address ~3 miles from the restaurant (Plano city hall area) and one far outside DFW.
const near = { street: '1520 K Ave', city: 'Plano', state: 'TX', zip: '75074' };
const far = { street: '301 W 2nd St', city: 'Austin', state: 'TX', zip: '78701' };
const runId = `sbx-${Date.now()}`;
let quote, del, del2;

await step('OAuth token (client_credentials, eats.deliveries)', async () => { await uber.token(true); return 'token received (not shown)'; });

await step('quote: restaurant → Plano address', async () => {
  quote = await uber.createQuote({ pickupAddress: pickup, dropoffAddress: formatUberAddress(near), pickupPhone: STORE.phone, dropoffPhone: '+14695550100' });
  assert.ok(quote.quoteId?.startsWith('dqt_'), 'quote id');
  assert.ok(quote.feeCents > 0); assert.ok(Date.parse(quote.expiresAt) > Date.now());
  return `fee $${(quote.feeCents / 100).toFixed(2)} (customer pays ${customerDeliveryFeeCents(quote.feeCents) == null ? 'OUT OF AREA' : '$' + (customerDeliveryFeeCents(quote.feeCents) / 100).toFixed(2)}), ~${quote.durationMin} min, expires ${quote.expiresAt}`;
});

await step('quote: far address is refused or priced out of area', async () => {
  try {
    const q = await uber.createQuote({ pickupAddress: pickup, dropoffAddress: formatUberAddress(far), pickupPhone: STORE.phone, dropoffPhone: '+14695550100' });
    assert.equal(customerDeliveryFeeCents(q.feeCents), null, `fee ${q.feeCents} should be over the 10-mile tier`);
    return `quoted $${(q.feeCents / 100).toFixed(2)} → our rule says out of area`;
  } catch (e) { if (e instanceof UberDirectError) return `Uber refused: ${e.code}`; throw e; }
});

const order = { id: `${runId}-a`, guest_name: 'Sandbox Test', guest_phone_e164: '+14695550100', subtotal: 24.5, delivery_address: { ...near, notes: 'Sandbox test, no real delivery' } };
await step('create delivery with robo courier (auto)', async () => {
  const req = deliveryRequestFor(order, [{ item_name: 'Chicken Pakora 16 oz Box', quantity: 2 }], formatUberAddress);
  del = await uber.createDelivery({ ...req, quoteId: quote.quoteId, testSpecifications: { robo_courier_specification: { mode: 'auto' } } });
  assert.ok(del.id); assert.notEqual(del.live_mode, true);
  return `${del.id} status=${del.status} tracking=${del.tracking_url ? 'yes' : 'no'}`;
});

await step('duplicate protection: same order id again does not make a second courier', async () => {
  const req = deliveryRequestFor(order, [{ item_name: 'Chicken Pakora 16 oz Box', quantity: 2 }], formatUberAddress);
  try {
    const again = await uber.createDelivery({ ...req, quoteId: quote.quoteId, testSpecifications: { robo_courier_specification: { mode: 'auto' } } });
    assert.equal(again.id, del.id, `Uber created a second delivery ${again.id} — rely on our DB guard (unique index + claim)`);
    return 'Uber returned the same delivery';
  } catch (e) { if (e instanceof UberDirectError) return `Uber refused the repeat: ${e.code}`; throw e; }
});

await step('robo courier progresses (poll Get Delivery ~2.5 min)', async () => {
  const seen = [];
  for (let i = 0; i < 16; i++) {
    const d = await uber.getDelivery(del.id);
    if (seen.at(-1) !== d.status) seen.push(d.status);
    if (d.status === 'delivered') break;
    await sleep(10_000);
  }
  assert.ok(seen.includes('delivered') || seen.length > 1, `statuses: ${seen.join(' → ')}`);
  return seen.join(' → ');
});

await step('cancel a second delivery before pickup', async () => {
  const q2 = await uber.createQuote({ pickupAddress: pickup, dropoffAddress: formatUberAddress(near), pickupPhone: STORE.phone, dropoffPhone: '+14695550100' });
  const o2 = { ...order, id: `${runId}-b` };
  del2 = await uber.createDelivery({ ...deliveryRequestFor(o2, [{ item_name: 'Test', quantity: 1 }], formatUberAddress), quoteId: q2.quoteId,
    testSpecifications: { robo_courier_specification: { mode: 'custom', enroute_for_pickup_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      pickup_imminent_at: new Date(Date.now() + 11 * 60_000).toISOString(), pickup_at: new Date(Date.now() + 12 * 60_000).toISOString(),
      dropoff_imminent_at: new Date(Date.now() + 13 * 60_000).toISOString(), dropoff_at: new Date(Date.now() + 14 * 60_000).toISOString() } } });
  const c = await uber.cancelDelivery(del2.id);
  assert.equal(c.status, 'canceled');
  return `${del2.id} → ${c.status}`;
});

await step('expired/invalid quote is refused at delivery creation', async () => {
  try {
    await uber.createDelivery({ ...deliveryRequestFor({ ...order, id: `${runId}-c` }, [{ item_name: 'Test', quantity: 1 }], formatUberAddress), quoteId: 'dqt_does_not_exist_000' });
    throw new Error('Uber accepted a bogus quote id');
  } catch (e) { if (e instanceof UberDirectError) return `refused: ${e.code} (HTTP ${e.status})`; throw e; }
});

console.log(`\n${passed}/${passed + failed} sandbox steps passed (TEST environment, robo courier — no real delivery)`);
if (failed) process.exit(1);
