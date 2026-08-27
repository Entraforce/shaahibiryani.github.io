#!/usr/bin/env node
// Cross-checks the cart's money against the server's, over thousands of baskets.
//
// The cart once displayed $118.00 + $9.74 = $127.73 while the card was charged
// $127.74. Two independent float expressions, each rounded on its own: the tax
// landed a hair above the half-cent and rounded up, the total landed a hair
// below and rounded down.
//
// This runs the browser's orderTotals() — lifted out of index.html, not a copy —
// against create-web-order's own arithmetic, and fails if they ever disagree by
// a single cent.
//
//   node scripts/verify-cart-math.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const fn = resolve(repo, 'supabase/functions/create-web-order/index.ts');
const server = readFileSync(fn, 'utf8');

// Pull the real functions out of the page rather than restating them here — a
// restatement would agree with itself forever and prove nothing.
const grab = (name) => {
  const at = html.indexOf(`function ${name}(`);
  if (at === -1) throw new Error(`index.html: function ${name} not found`);
  let depth = 0, i = html.indexOf('{', at);
  const start = at;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`index.html: could not read the body of ${name}`);
};

const TAX_RATE = Number(html.match(/var TAX_RATE\s*=\s*([\d.]+)/)?.[1]);
if (!TAX_RATE) throw new Error('index.html: TAX_RATE not found');
const serverRate = Number(server.match(/TAX_RATE\s*=\s*([\d.]+)/)?.[1]);
if (serverRate !== TAX_RATE) {
  console.error(`FAIL  tax rate drift: page ${TAX_RATE} vs create-web-order ${serverRate}`);
  process.exit(1);
}

// eslint-disable-next-line no-new-func
const ctx = new Function(`
  const TAX_RATE = ${TAX_RATE};
  const _p = (v) => Number(String(v).replace(/[^0-9.]/g, '')) || 0;
  ${grab('_cents')} ${grab('_fmtCents')} ${grab('orderTotals')}
  return { orderTotals, _fmtCents };
`)();

// create-web-order: subtotal from rounded unit prices, tax rounded once, then
// integer addition only.
const serverTotals = (items, tipPercent) => {
  let subtotalCents = 0;
  for (const i of items) subtotalCents += Math.round(i.price * 100) * i.qty;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const tipCents = Math.max(0, Math.round(subtotalCents * (tipPercent / 100)));
  return { subtotalCents, taxCents, tipCents, totalCents: subtotalCents + taxCents + tipCents };
};

let checked = 0;
const bad = [];
for (let cents = 1; cents <= 40000; cents += 3) {
  for (const tip of [0, 10, 15, 18, 20]) {
    const items = [{ price: cents / 100, qty: 1 }];
    const page = ctx.orderTotals(items.map(i => ({ price: `$${i.price.toFixed(2)}`, qty: i.qty })), tip, 0);
    const srv = serverTotals(items, tip);
    checked++;
    if (page.totalCents !== srv.totalCents || page.taxCents !== srv.taxCents) {
      bad.push(`$${(cents / 100).toFixed(2)} tip ${tip}%: page ${page.totalCents} vs server ${srv.totalCents}`);
    }
    // The visible lines must also sum to the visible total.
    const shown = ['subtotalCents', 'taxCents', 'tipCents', 'deliveryFeeCents']
      .reduce((a, k) => a + Number(ctx._fmtCents(page[k]).slice(1)), 0);
    if (Math.abs(shown - page.totalCents / 100) > 0.0001) {
      bad.push(`$${(cents / 100).toFixed(2)} tip ${tip}%: displayed lines ${shown.toFixed(2)} vs total ${ctx._fmtCents(page.totalCents)}`);
    }
    if (bad.length > 4) break;
  }
  if (bad.length > 4) break;
}

// The exact case that was reported.
const reported = ctx.orderTotals([{ price: '$118.00', qty: 1 }], 0, 0);
if (reported.totalCents !== 12774) bad.push(`the reported basket: ${reported.totalCents} (want 12774)`);

if (bad.length) {
  console.error(`FAIL  cart math disagrees with the server:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`cart math matches create-web-order across ${checked} baskets, and the ` +
            `$118.00 case totals ${ctx._fmtCents(reported.totalCents)}.`);
