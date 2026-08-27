#!/usr/bin/env node
// Menu policy, checked against the page a guest actually receives.
//
// Two decisions live here, and both had already gone wrong once:
//
//   Signature  The app and the site each kept their own list and disagreed on
//              four dishes out of five. There is now one list, in the app's
//              lib/menu-featured.ts, generated into menu-facts.js. The menu
//              manager's free-text "Signature" badge is ignored on purpose.
//
//   Sold out   The site used to delete a sold-out dish from the page, so a guest
//              could not tell "we're out today" from "we never served it". It is
//              now shown, marked, and not orderable. A dish taken off for good
//              (inactive) is the one that disappears.
//
//   node scripts/verify-menu-policy.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const facts = readFileSync(resolve(repo, 'supabase/functions/_shared/menu-facts.js'), 'utf8');

const out = [];
const check = (name, pass, detail = '') => {
  out.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const CANONICAL = ['chicken-tikka-masala', 'goat-dum-biryani', 'golden-shaahi-platter',
  'mixed-grill-platter', 'sitaphal-rabdi'];

// ── the canonical list ──────────────────────────────────────────
const sigIds = [...(facts.match(/SIGNATURE_ITEM_IDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '')
  .matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
check('menu-facts carries exactly the five canonical Signature dishes',
  JSON.stringify(sigIds) === JSON.stringify([...CANONICAL].sort()), sigIds.join(', '));

// ── the rendered page ───────────────────────────────────────────
const SIG_MARK = '&#10022; Signature';
const sigMarks = [...html.matchAll(new RegExp(SIG_MARK, 'g'))].length;
check('the page shows exactly five Signature marks', sigMarks === 5, `${sigMarks} found`);

const staleBadges = [...html.matchAll(/<span class="mbadge">Signature<\/span>/g)].length;
check('no menu-manager "Signature" badge is rendered', staleBadges === 0,
  `${staleBadges} found`);

// Each mark must sit on a canonical dish — on its row, or on the subhead of a
// dish sold in several pack sizes.
const marked = [];
let i = -1;
while ((i = html.indexOf(SIG_MARK, i + 1)) > 0) {
  const before = html.slice(Math.max(0, i - 1500), i);
  const onSubhead = before.lastIndexOf('msubhead') > before.lastIndexOf('data-label=');
  if (onSubhead) {
    // The rows under it name the dish; find the first one after the mark.
    const after = html.slice(i, i + 3000);
    marked.push(after.match(/data-name="([^"]+)"/)?.[1] || '?');
  } else {
    marked.push([...before.matchAll(/data-name="([^"]+)"/g)].pop()?.[1] || '?');
  }
}
const pidMap = JSON.parse(html.match(/var PID_MAP=(\{[\s\S]*?\});/)?.[1] || '{}');
const markedIds = [...new Set(marked.map((n) => {
  const e = pidMap[n]; const pid = e && Object.values(e)[0];
  return String(pid || '').split('|')[0];
}))].sort();
check('every Signature mark sits on a canonical dish',
  JSON.stringify(markedIds) === JSON.stringify([...CANONICAL].sort()), markedIds.join(', '));

// ── sold out ────────────────────────────────────────────────────
const soldRows = [...html.matchAll(/<div class="mi soldout"[\s\S]*?<\/div><div class="mprice">[^<]*<\/div><\/div>/g)]
  .map((m) => m[0]);
check('sold-out dishes are still on the page', soldRows.length > 0, `${soldRows.length} row(s)`);
check('every sold-out row says so in words',
  soldRows.every((r) => /<span class="mbadge out">Sold out<\/span>/.test(r)));
check('no sold-out row offers an add control',
  soldRows.every((r) => !r.includes('mi-add')));
check('every sold-out row is flagged for the modal and the cart guard',
  soldRows.every((r) => r.includes('data-soldout="1"')));
check('a screen reader hears "Sold out" before the price',
  soldRows.every((r) => {
    const a = r.match(/aria-label="([^"]*)"/)?.[1] || '';
    return a.includes('Sold out') && a.indexOf('Sold out') < a.indexOf('$');
  }));
check('sold-out state is not conveyed by colour alone',
  /\.mbadge\.out\{/.test(html) && /\.mi\.soldout\{/.test(html) &&
  soldRows.every((r) => /Sold out/.test(r)));

// The add path must refuse it even if the button is reached another way.
check('add-to-cart refuses a sold-out dish',
  /ov\.dataset\.soldout==='1'\) return;/.test(html));
check('the item modal disables Add and hides the quantity stepper',
  /soldOut\?'Sold out'/.test(html) && /qrow\.style\.display=\(ds\.soldout==='1'\)\?'none':''/.test(html));

const failed = out.filter((o) => !o.pass);
console.log(`\n${out.length - failed.length}/${out.length} menu-policy checks passed`);
if (failed.length) process.exit(1);
