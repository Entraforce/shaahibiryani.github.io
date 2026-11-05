// Browser tests for the homepage promo popups, driven by the page itself: the
// dated flyers are read from the FLYERS list in index.html and their days are
// found with the page's own window.shaahiPromo.*Active rules, so nothing here
// names a campaign and the test never goes stale when a flyer is added or
// expires. An injected clock (window.__shaahiPromoNow) makes every case run
// today. Needs puppeteer-core and a local Chrome; run it from a folder where
// puppeteer-core is installed:
//   node verify-promo-browser.mjs http://127.0.0.1:8111/ [path/to/index.html]
// Serve the repo first (any static server that maps /page to page.html).
// Pure date rules are also covered without a browser by verify-promo-logic.mjs.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://127.0.0.1:8111/';
const indexPath = process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BLOCK = /googletagmanager|google-analytics|doubleclick|googleadservices|googlesyndication/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

// FLYERS, in the page's priority order: { id, active } (active = the shaahiPromo rule name).
const src = fs.readFileSync(indexPath, 'utf8');
const block = /var FLYERS=\[([\s\S]*?)\n\s*\];/.exec(src);
if (!block) { console.log('FAIL could not find FLYERS in index.html'); process.exit(1); }
const FLYERS = [...block[1].matchAll(/id:'(\w+)',\s*key:\w+,\s*active:(\w+)/g)].map((m) => ({ id: m[1], active: m[2] }));
if (!FLYERS.length) { console.log('FAIL FLYERS list is empty or unreadable'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const R = [];
const ok = (name, pass, detail = '') => { R.push(!!pass); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); };

async function tab(c, w, clock) {
  const p = await c.newPage(); const mobile = w < 800;
  await p.setViewport({ width: w, height: mobile ? 844 : 900, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  await p.setRequestInterception(true);
  p._errors = [];
  p.on('request', (r) => (BLOCK.test(r.url()) ? r.abort() : r.continue()));
  p.on('pageerror', (e) => p._errors.push(String(e.message || e)));
  await p.evaluateOnNewDocument((t) => {
    window.__shaahiPromoNow = t;
    try { localStorage.setItem('shaahi_cookie_consent', 'granted'); } catch (e) {}
  }, clock);
  return p;
}
const ids = ['pmU10', ...FLYERS.map((f) => f.id)];
const showing = (p) => p.evaluate((ids) => ids.filter((id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.classList.contains('pm-in'); }), ids);
async function waitShown(p, id, ms) {
  const t0 = Date.now(); const seen = new Set(); let both = false;
  while (Date.now() - t0 < ms) {
    const s = await showing(p); s.forEach((x) => seen.add(x)); if (s.length > 1) both = true;
    if (id && s.includes(id)) return { shown: true, seen, both };
    await sleep(150);
  }
  return { shown: false, seen, both };
}
async function layout(p, id) {
  return p.evaluate((id) => {
    const ov = document.getElementById(id), box = ov.querySelector('.pm-box'), x = ov.querySelector('.pm-x');
    const b = box.getBoundingClientRect(), xr = x.getBoundingClientRect();
    return { inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
      closeOk: xr.width >= 44 && xr.height >= 44, close: [Math.round(xr.width), Math.round(xr.height)], noHScroll: document.documentElement.scrollWidth <= innerWidth,
      dialog: !!ov.querySelector('[role="dialog"][aria-modal="true"]') };
  }, id);
}

// ── Find each flyer's active days with the page's own rules ───────────────
const probe = await tab(await browser.createBrowserContext(), 1280, Date.now());
await probe.goto(base, { waitUntil: 'domcontentloaded' });
await probe.waitForFunction(() => window.shaahiPromo && typeof window.shaahiPromo.centralDate === 'function', { timeout: 15000 });
// Noon Central (18:00 UTC is noon CST and 1 PM CDT) on every day from 60 days back to 30 ahead.
const scan = await probe.evaluate((flyers, DAY) => {
  const P = window.shaahiPromo, today = Date.parse(P.centralDate(Date.now()) + 'T18:00:00Z'), days = [];
  for (let t = today - 60 * DAY; t <= today + 30 * DAY; t += DAY)
    days.push({ t, date: P.centralDate(t), on: flyers.filter((f) => typeof P[f.active] === 'function' && P[f.active](t)).map((f) => f.id) });
  return { today, days, missing: flyers.filter((f) => typeof P[f.active] !== 'function').map((f) => f.active) };
}, FLYERS, DAY);
await probe.close();
ok('every FLYERS entry has a shaahiPromo date rule', !scan.missing.length, scan.missing.join(', '));

const firstWinner = (d) => FLYERS.find((f) => d.on.includes(f.id));
// The newest flyer: the last day in range on which any flyer is on, and the one that wins that day.
const lastOnDay = [...scan.days].reverse().find((d) => d.on.length);
const quietDay = lastOnDay && scan.days.find((d) => d.t > lastOnDay.t && !d.on.length);
const todayRow = scan.days.find((d) => d.t === scan.today);
console.log('flyers:', FLYERS.length, '· today', todayRow.date, 'shows', (firstWinner(todayRow) || { id: 'none' }).id,
  '· newest flyer day', lastOnDay ? lastOnDay.date + ' (' + firstWinner(lastOnDay).id + ')' : 'none', '· first quiet day after', quietDay ? quietDay.date : 'none');

// ── 1. The active flyer appears, lays out, closes, and Under $10 follows ──
for (const w of [390, 1440]) {
  if (!lastOnDay) { ok(`[${w}] an active flyer exists to test`, false, 'no flyer is on in the scanned range'); break; }
  const want = firstWinner(lastOnDay).id;
  const c = await browser.createBrowserContext();
  const p = await tab(c, w, lastOnDay.t);
  await p.goto(base, { waitUntil: 'networkidle2' });
  const a = await waitShown(p, want, 9000);
  ok(`[${w}] active flyer ${want} appears on ${lastOnDay.date}`, a.shown, [...a.seen].join(','));
  if (a.shown) {
    await sleep(800); // let the open animation finish before measuring
    const L = await layout(p, want);
    ok(`[${w}] ${want} fits the screen, 44px close button, modal dialog, no sideways scroll`, L.inView && L.closeOk && L.dialog && L.noHScroll, JSON.stringify(L));
    await p.click(`#${want} .pm-x`); await sleep(500);
    ok(`[${w}] ${want} closes with its X`, !(await showing(p)).includes(want));
    const u = await waitShown(p, 'pmU10', 16000);
    ok(`[${w}] daily Under $10 popup follows the flyer`, u.shown, [...u.seen].join(','));
    ok(`[${w}] never two popups at once`, !a.both && !u.both);
    if (u.shown) { await p.click('#pmU10 .pm-x'); await sleep(400); }
    // Same tab session, same day: the flyer is once per session, Under $10 once per day.
    await p.reload({ waitUntil: 'networkidle2' });
    const again = await waitShown(p, null, 9000);
    ok(`[${w}] after reload: neither popup repeats the same session/day`, !again.seen.size, [...again.seen].join(','));
  }
  ok(`[${w}] no page errors`, !p._errors.length, p._errors.slice(0, 2).join(' | '));
  await c.close();
}

// ── 2. Expired flyers stay off ────────────────────────────────────────────
if (quietDay) {
  const c = await browser.createBrowserContext();
  const p = await tab(c, 390, quietDay.t);
  await p.goto(base, { waitUntil: 'networkidle2' });
  const s = await waitShown(p, 'pmU10', 12000);
  const flyerSeen = [...s.seen].filter((x) => x !== 'pmU10');
  ok(`on ${quietDay.date}, after every flyer has ended, no flyer appears`, !flyerSeen.length, flyerSeen.join(','));
  ok(`on ${quietDay.date}, Under $10 still shows on its own`, s.shown);
  await c.close();
} else ok('a day with no flyer exists after the newest one (scanned 30 days ahead)', false);

// Every flyer is off the day after its own last day unless another flyer took that day.
const expiredLeaks = [];
for (const f of FLYERS) {
  const onDays = scan.days.filter((d) => d.on.includes(f.id));
  if (!onDays.length) continue;
  const next = scan.days.find((d) => d.t > onDays[onDays.length - 1].t);
  if (next && next.on.includes(f.id)) expiredLeaks.push(f.id);
}
ok('each flyer is off the day after its last day (page rules)', !expiredLeaks.length, expiredLeaks.join(','));

// ── 3. Under $10 protection: an Under $10 ad landing gets no popup on arrival ──
if (lastOnDay) {
  for (const entry of ['#under10', '?utm_campaign=under10']) {
    const c = await browser.createBrowserContext();
    const p = await tab(c, 390, lastOnDay.t);
    await p.goto(base + entry, { waitUntil: 'networkidle2' });
    const s = await waitShown(p, null, 7000);
    const sec = await p.evaluate(() => { const r = document.getElementById('under10').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    ok(`Under $10 landing (${entry}): no popup covers it on arrival, section in view`, !s.seen.size && (entry !== '#under10' || sec), [...s.seen].join(','));
    await c.close();
  }
}

await browser.close();
const failed = R.filter((x) => !x).length;
console.log(failed ? `${failed} of ${R.length} promo browser checks FAILED` : `${R.length}/${R.length} promo browser checks passed`);
process.exit(failed ? 1 : 0);
