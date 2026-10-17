#!/usr/bin/env node
// Regression test for the website order function's add-on rule.
//
// create-web-order runs on Deno with Stripe and Supabase imported from URLs, so
// it cannot be loaded here. What CAN be proven locally:
//   1. the rule itself (supabase/functions/_shared/order-rules.js), on the
//      four cases that matter and a few edges;
//   2. that create-web-order imports that exact rule and applies it BEFORE it
//      reads prices, writes an order or calls Stripe — so the browser can never
//      get an add-on-only order past it.
//
//   node scripts/verify-order-rules.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addOnOnlyError, isAddOnLine } from '../supabase/functions/_shared/order-rules.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const line = (pid, quantity = 1) => {
  const [menuItemId, variantId] = pid.split('|');
  return { menuItemId, variantId, quantity };
};
const NAAN = 'regular-naan|regular-naan-addon';
const BUTTER = 'butter-naan|butter-naan-addon';
const GARLIC = 'garlic-naan|garlic-naan-addon';
const MAIN = 'chicken-65|chicken-65-single';          // an Under $10 main
const MAIN2 = 'butter-chicken|butter-chicken-regular'; // a regular main
const MSG = 'Add-on naans come with a main dish. Please add a dish to your order.';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('PASS ', name); };

t('naan only -> rejected', () => assert.equal(addOnOnlyError([line(NAAN)]), MSG));
t('naan only, quantity 6 -> rejected', () => assert.equal(addOnOnlyError([line(NAAN, 6)]), MSG));
t('multiple add-ons only -> rejected', () =>
  assert.equal(addOnOnlyError([line(NAAN), line(BUTTER, 2), line(GARLIC)]), MSG));
t('valid main + naan -> accepted', () => assert.equal(addOnOnlyError([line(MAIN), line(NAAN)]), null));
t('valid main + multiple add-ons -> accepted', () =>
  assert.equal(addOnOnlyError([line(NAAN), line(MAIN2), line(BUTTER, 3), line(GARLIC)]), null));
t('main only -> accepted (rule does not apply)', () => assert.equal(addOnOnlyError([line(MAIN)]), null));
t('regular naan (not an add-on) alone -> not this rule', () =>
  assert.equal(addOnOnlyError([line('regular-naan|regular-naan-standard')]), null));
t('empty / malformed items -> left to the existing "No items." check', () => {
  assert.equal(addOnOnlyError([]), null);
  assert.equal(addOnOnlyError(undefined), null);
});
t('add-on detection is by the -addon variant suffix', () => {
  assert.equal(isAddOnLine(line(NAAN)), true);
  assert.equal(isAddOnLine(line(MAIN)), false);
  assert.equal(isAddOnLine({}), false);
});

// Wiring: the deployed function must import THIS rule and run it first.
const src = readFileSync(resolve(repo, 'supabase/functions/create-web-order/index.ts'), 'utf8');
t('create-web-order imports the shared rule', () =>
  assert.match(src, /import \{ addOnOnlyError \} from "\.\.\/_shared\/order-rules\.js";/));
t('create-web-order refuses before pricing, DB writes and Stripe', () => {
  const guard = src.indexOf('addOnOnlyError(items)');
  assert.ok(guard > 0, 'guard call not found');
  for (const later of ['.from("web_menu_items")', '.rpc("claim_checkout_attempt"',
    'stripe.paymentIntents.create(', '.from("orders")']) {
    const at = src.indexOf(later);
    assert.ok(at > guard, `${later} must come after the add-on guard`);
  }
  assert.match(src.slice(guard, guard + 120), /if \(addOnErr\) return json\(\{ error: addOnErr \}, 400\);/);
});
// Same wording as the app, so a guest hears one answer on both surfaces.
t('message matches the app\'s create-payment-intent', () => {
  const app = readFileSync('/Users/osmanmohammed/github/shaahi-biryani-app/supabase/functions/create-payment-intent/index.ts', 'utf8');
  assert.ok(app.includes(MSG), 'app wording changed — keep the two in step');
});
console.log(`\n${n}/${n} order-rule checks passed`);
