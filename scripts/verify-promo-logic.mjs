// Checks the promo popups' pure rules — the exact code between the
// promo-logic markers in index.html, run as-is (no browser, no dependencies):
// the Central Time calendar day, the BOGO window (Oct 17–18 2026, off from
// 12:00 AM Central Oct 19), and the "is it really on screen?" test that once
// mistook a closed cart drawer under a classic scrollbar for an open one.
//   node scripts/verify-promo-logic.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const m = /\/\* promo-logic:start[^*]*\*\/([\s\S]*?)\/\* promo-logic:end \*\//.exec(html);
assert.ok(m, 'promo-logic markers not found in index.html');
const ctx = vm.createContext({ Intl, Date, Math });
vm.runInContext(m[1], ctx);
const { centralDate, bogoActive, onScreen } = ctx;

let n = 0; const check = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const at = (iso) => Date.parse(iso);

check('Central calendar day, not UTC (7 PM CDT Oct 18 = midnight UTC Oct 19)', () => {
  assert.equal(centralDate(at('2026-10-19T00:00:00Z')), '2026-10-18');
  assert.equal(centralDate(at('2026-10-18T05:00:00Z')), '2026-10-18');   // 12:00 AM CDT
  assert.equal(centralDate(at('2026-10-18T04:59:59Z')), '2026-10-17');   // 11:59:59 PM CDT
});
check('BOGO off before Oct 17 Central', () => assert.equal(bogoActive(at('2026-10-17T04:59:59Z')), false));
check('BOGO on Oct 17 12:00 AM Central', () => assert.equal(bogoActive(at('2026-10-17T05:00:00Z')), true));
check('BOGO still on Oct 18 11:59 PM Central', () => assert.equal(bogoActive(at('2026-10-19T04:59:59Z')), true));
check('BOGO off from Oct 19 12:00 AM Central, and every day after', () => {
  for (const iso of ['2026-10-19T05:00:00Z', '2026-10-19T17:00:00Z', '2026-11-02T12:00:00Z', '2027-10-17T17:00:00Z']) assert.equal(bogoActive(at(iso)), false, iso);
});
check('Under $10 daily rule is a calendar day, not 24 hours', () => {
  const seen = centralDate(at('2026-10-17T05:30:00Z'));            // 12:30 AM Oct 17
  assert.equal(centralDate(at('2026-10-18T04:59:00Z')) === seen, true);  // 11:59 PM same day: not due
  assert.equal(centralDate(at('2026-10-18T05:00:30Z')) === seen, false); // 12:00:30 AM next day: due
});
check('classic scrollbar: closed cart drawer parked past the visible edge is CLOSED', () => {
  // The real case found in review: 3440px window, 4px scrollbar, visible page 3436px,
  // cart drawer (420px) at right:-420px → its left edge sits at 3436.
  const W = 3436, H = 1262, innerWidth = 3440;
  const drawer = { left: 3436, right: 3856, top: 0, bottom: 1262 };
  assert.equal(onScreen(drawer, W, H), false);
  // ...and the old window-width measurement is exactly what got this wrong
  assert.equal(drawer.left < innerWidth - 1, true);
  // a 15px classic scrollbar too
  assert.equal(onScreen({ left: 1425, right: 1845, top: 0, bottom: 900 }, 1425, 900), false);
});
check('open drawer / dialog / chat on screen is OPEN', () => {
  assert.equal(onScreen({ left: 3016, right: 3436, top: 0, bottom: 1262 }, 3436, 1262), true);   // cart open
  assert.equal(onScreen({ left: 0, right: 390, top: 0, bottom: 844 }, 390, 844), true);           // full-screen dialog
  assert.equal(onScreen({ left: 1062, right: 1393, top: 545, bottom: 863 }, 1425, 900), true);     // chat window
});
check('slivers of 8px or less do not count', () => {
  assert.equal(onScreen({ left: 1417, right: 1837, top: 0, bottom: 900 }, 1425, 900), false);
  assert.equal(onScreen({ left: 0, right: 390, top: 838, bottom: 1200 }, 390, 844), false);
});
console.log(`\n${n}/${n} promo-logic checks passed`);
