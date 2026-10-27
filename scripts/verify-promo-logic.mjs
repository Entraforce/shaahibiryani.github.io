// Checks the promo popups' pure rules — the exact code between the
// promo-logic markers in index.html, run as-is (no browser, no dependencies):
// the Central Time calendar day, the BOGO window (Fri–Sun Oct 23–25 2026, off from
// 12:00 AM Central Oct 19), the Tuesday Roll Deal day (Oct 20 2026 only, off
// from 12:00 AM Central Oct 21), and the "is it really on screen?" test that once
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
const { centralDate, bogoActive, tuesdayActive, riceActive, dkcActive, onScreen, paidU10Landing } = ctx;

let n = 0; const check = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const at = (iso) => Date.parse(iso);

check('Central calendar day, not UTC (7 PM CDT Oct 18 = midnight UTC Oct 19)', () => {
  assert.equal(centralDate(at('2026-10-19T00:00:00Z')), '2026-10-18');
  assert.equal(centralDate(at('2026-10-18T05:00:00Z')), '2026-10-18');   // 12:00 AM CDT
  assert.equal(centralDate(at('2026-10-18T04:59:59Z')), '2026-10-17');   // 11:59:59 PM CDT
});
check('BOGO off before Fri Oct 23 Central', () => assert.equal(bogoActive(at('2026-10-23T04:59:59Z')), false));
check('BOGO on Fri Oct 23 12:00 AM Central', () => assert.equal(bogoActive(at('2026-10-23T05:00:00Z')), true));
check('BOGO on Saturday Oct 24 and Sunday Oct 25 (Central)', () => {
  for (const iso of ['2026-10-24T17:00:00Z', '2026-10-25T17:00:00Z']) assert.equal(bogoActive(at(iso)), true, iso);
});
check('BOGO still on Sun Oct 25 11:59 PM Central', () => assert.equal(bogoActive(at('2026-10-26T04:59:59Z')), true));
check('BOGO off from Mon Oct 26 12:00 AM Central, and every day after', () => {
  for (const iso of ['2026-10-26T05:00:00Z', '2026-10-26T17:00:00Z', '2026-11-02T12:00:00Z', '2027-10-23T17:00:00Z']) assert.equal(bogoActive(at(iso)), false, iso);
});
check('Last weekend (Oct 17–18) is no longer a BOGO day', () => {
  for (const iso of ['2026-10-17T17:00:00Z', '2026-10-18T17:00:00Z']) assert.equal(bogoActive(at(iso)), false, iso);
});
check('BOGO and Tuesday windows never overlap', () => {
  for (let t = at('2026-10-16T00:00:00Z'); t < at('2026-10-28T00:00:00Z'); t += 15 * 60 * 1000) assert.equal(bogoActive(t) && tuesdayActive(t), false, new Date(t).toISOString());
});
check('Rice Deal off before Oct 21 Central (incl. the Tuesday Roll Deal day)', () => {
  for (const iso of ['2026-10-21T04:59:59Z', '2026-10-20T17:00:00Z', '2026-10-17T17:00:00Z']) assert.equal(riceActive(at(iso)), false, iso);
});
check('Rice Deal on from Oct 21 12:00 AM Central through Thu Oct 22 9:59:59 PM Central', () => {
  for (const iso of ['2026-10-21T05:00:00Z', '2026-10-21T17:00:00Z', '2026-10-22T04:59:59Z', '2026-10-22T17:00:00Z', '2026-10-23T02:59:59Z']) assert.equal(riceActive(at(iso)), true, iso);
});
check('Rice Deal off from Thu Oct 22 10:00 PM Central, and every day after', () => {
  for (const iso of ['2026-10-23T03:00:00Z', '2026-10-23T04:30:00Z', '2026-10-28T17:00:00Z', '2027-10-21T17:00:00Z']) assert.equal(riceActive(at(iso)), false, iso);
});
check('Rice Deal never overlaps BOGO or Tuesday', () => {
  for (let t = at('2026-10-16T00:00:00Z'); t < at('2026-10-28T00:00:00Z'); t += 15 * 60 * 1000) assert.equal(riceActive(t) && (bogoActive(t) || tuesdayActive(t)), false, new Date(t).toISOString());
});
check('Dum Ka Chicken BOGO off before Tue Oct 27 Central (incl. Monday, when the store is closed)', () => {
  for (const iso of ['2026-10-27T04:59:59Z', '2026-10-26T17:00:00Z', '2026-10-25T17:00:00Z']) assert.equal(dkcActive(at(iso)), false, iso);
});
check('Dum Ka Chicken BOGO on all of Tue Oct 27 Central', () => {
  for (const iso of ['2026-10-27T05:00:00Z', '2026-10-27T16:30:00Z', '2026-10-28T02:59:00Z', '2026-10-28T04:59:59Z']) assert.equal(dkcActive(at(iso)), true, iso);
});
check('Dum Ka Chicken BOGO off from Wed Oct 28 12:00 AM Central, and every day after', () => {
  for (const iso of ['2026-10-28T05:00:00Z', '2026-10-28T17:00:00Z', '2026-11-03T17:00:00Z', '2027-10-27T17:00:00Z']) assert.equal(dkcActive(at(iso)), false, iso);
});
check('Dum Ka Chicken BOGO never overlaps the other flyers', () => {
  for (let t = at('2026-10-16T00:00:00Z'); t < at('2026-11-05T00:00:00Z'); t += 15 * 60 * 1000) assert.equal(dkcActive(t) && (bogoActive(t) || tuesdayActive(t) || riceActive(t)), false, new Date(t).toISOString());
});
check('Under $10 ad landings are recognised (#under10 or an under10 utm_campaign)', () => {
  for (const [h, q] of [['#under10', ''], ['#UNDER10', ''], ['#under-10', ''], ['', '?utm_campaign=under10'], ['', '?utm_source=meta&utm_campaign=Under_10_Oct'],
    ['', '?utm_campaign=under-10'], ['', '?utm_campaign=under%20%2410'], ['', '?utm_campaign=Under+$10+DFW'], ['#menu', '?utm_campaign=under10']]) assert.equal(paidU10Landing(h, q), true, h + q);
});
check('Normal visitors are not treated as Under $10 ad landings', () => {
  for (const [h, q] of [['', ''], ['#menu', ''], ['#contact', ''], ['#under100', ''], ['', '?utm_campaign=bogo_weekend'], ['', '?utm_campaign=under100'],
    ['', '?utm_source=under10'], ['', '?utm_campaign=family_pack_oct'], ['', '?utm_campaign=']]) assert.equal(paidU10Landing(h, q), false, h + q);
});
check('DST: Central midnight is 05:00Z in CDT and 06:00Z in CST (Nov 1 2026 change)', () => {
  assert.equal(centralDate(at('2026-11-02T05:59:59Z')), '2026-11-01');   // 11:59:59 PM CST Nov 1
  assert.equal(centralDate(at('2026-11-02T06:00:00Z')), '2026-11-02');   // 12:00 AM CST Nov 2
  assert.equal(centralDate(at('2026-03-08T07:59:59Z')), '2026-03-08');   // spring-forward day still one calendar day
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
