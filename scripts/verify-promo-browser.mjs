// Browser tests for the promo popups (BOGO weekend, Tuesday Roll Deal Oct 20 + daily Under $10), with an
// injected clock so every date case runs today. Needs puppeteer-core and a local
// Chrome; run it from a folder where puppeteer-core is installed:
//   node verify-promo-browser.mjs http://127.0.0.1:8111/ [shotsDir] [only=unit,ae,...]
// Serve the repo first (any static server). Pure date/visibility rules are also
// covered without a browser by scripts/verify-promo-logic.mjs.
import puppeteer from 'puppeteer-core';
const [base, shotsArg, onlyArg] = process.argv.slice(2);
const shots = shotsArg && !shotsArg.startsWith('only=') ? shotsArg : null;
const only = (onlyArg || (shotsArg && shotsArg.startsWith('only=') ? shotsArg : '') || '').replace(/^only=/, '');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BLOCK = /googletagmanager|google-analytics|doubleclick|googleadservices|googlesyndication/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT = { // America/Chicago is CDT (UTC-5) on these dates
  oct17noon: Date.parse('2026-10-17T17:00:00Z'), oct17_2359: Date.parse('2026-10-18T04:59:30Z'),
  oct18_0000: Date.parse('2026-10-18T05:00:30Z'), oct18_2359: Date.parse('2026-10-19T04:59:00Z'),
  oct19_0000: Date.parse('2026-10-19T05:00:00Z'), oct19noon: Date.parse('2026-10-19T17:00:00Z'),
  oct19_2359: Date.parse('2026-10-20T04:59:00Z'), oct20_0000: Date.parse('2026-10-20T05:00:10Z'), oct20_morning: Date.parse('2026-10-20T14:30:00Z'),
  oct20_afternoon: Date.parse('2026-10-20T20:00:00Z'), oct20_2359: Date.parse('2026-10-21T04:59:00Z'), oct21_0000: Date.parse('2026-10-21T05:00:00Z') };
let browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const R = []; const ok = (name, pass, detail = '') => { R.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); };

async function ctx() { return browser.createBrowserContext(); }
async function tab(c, w, clock, opts = {}) {
  const p = await c.newPage(); const mobile = w < 800;
  await p.setViewport({ width: w, height: opts.h || (mobile ? 844 : 900), isMobile: mobile, hasTouch: mobile, deviceScaleFactor: opts.dpr || 2 });
  await p.setRequestInterception(true);
  p._reqs = []; p._errors = [];
  p.on('request', (r) => { p._reqs.push(r.url()); BLOCK.test(r.url()) ? r.abort() : r.continue(); });
  p.on('pageerror', (e) => p._errors.push(String(e.message || e)));
  p._clockId = (await p.evaluateOnNewDocument((t) => { window.__shaahiPromoNow = t; }, clock)).identifier;
  await p.evaluateOnNewDocument((consent) => {
    try { if (consent) localStorage.setItem('shaahi_cookie_consent', consent); } catch (e) {}
    window.__cls = 0; window.__heroAt = null;
    document.addEventListener('hero:ready', () => { window.__heroAt = performance.now(); });
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
    window.__lcp = null;
    try { new PerformanceObserver((l) => { const e = l.getEntries().pop(); window.__lcp = e && (e.element ? (e.element.id || e.element.className || e.element.tagName) + ' ' + (e.url || '').split('/').pop() : e.url); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  }, opts.consent || null);
  return p;
}
async function setClock(p, t) { await p.removeScriptToEvaluateOnNewDocument(p._clockId); p._clockId = (await p.evaluateOnNewDocument((t) => { window.__shaahiPromoNow = t; }, t)).identifier; }
const state = (p) => p.evaluate(() => {
  const v = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.classList.contains('pm-in'); };
  return { bogo: v('pmBogo'), tue: v('pmTue'), u10: v('pmU10'), t: performance.now(), heroAt: window.__heroAt, ls: localStorage.getItem('shaahiPromoUnder10LastShownDate'), ss: sessionStorage.getItem('shaahiPromoBogoShown'), ssTue: sessionStorage.getItem('shaahiPromoTuesdayRollShown') };
});
async function waitFor(p, key, ms) { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await state(p); if (s[key]) return s; if (key === 'u10' && (s.bogo || s.tue)) return { ...s, conflict: true }; if (key === 'tue' && s.bogo) return { ...s, conflict: true }; await sleep(100); } return null; }
async function watch(p, ms) { const t0 = Date.now(); const seen = { bogo: false, tue: false, u10: false, both: false }; while (Date.now() - t0 < ms) { const s = await state(p); seen.bogo ||= s.bogo; seen.tue ||= s.tue; seen.u10 ||= s.u10; seen.both ||= ((s.bogo || s.tue) && s.u10) || (s.bogo && s.tue); await sleep(150); } return seen; }
async function closeX(p, id) { await p.click('#' + id + ' .pm-x'); await sleep(400); }
const shot = (p, n) => shots ? p.screenshot({ path: `${shots}/${n}.png` }) : null;

async function layout(p, id) {
  return p.evaluate((id) => {
    const ov = document.getElementById(id), box = ov.querySelector('.pm-box'), x = ov.querySelector('.pm-x');
    const r = (e) => e.getBoundingClientRect(); const b = r(box), xr = r(x);
    const out = { vw: innerWidth, vh: innerHeight, box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] };
    out.noOverflow = document.documentElement.scrollWidth <= innerWidth;
    out.boxInView = b.left >= 7 && b.top >= 7 && b.right <= innerWidth - 7 && b.bottom <= innerHeight - 7;
    out.xOk = xr.width >= 44 && xr.height >= 44 && xr.top >= 0 && xr.right <= innerWidth && xr.left >= b.left;
    out.noInnerScroll = box.scrollHeight <= box.clientHeight + 1;
    out.buttons = [...ov.querySelectorAll('button')].map((e) => Math.round(r(e).height)).every((h) => h >= 44);
    out.clipped = [...ov.querySelectorAll('h2,p,span,figcaption,button')].filter((e) => e.offsetParent && !e.classList.contains('sr-only') && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length;
    const imgs = [...ov.querySelectorAll('img')].filter((i) => i.offsetParent);
    out.imgs = imgs.map((i) => ({ loaded: i.complete && i.naturalWidth > 0, aspect: +(r(i).width / r(i).height).toFixed(3), natural: +(i.naturalWidth / i.naturalHeight).toFixed(3), w: Math.round(r(i).width), cur: (i.currentSrc || '').split('/').pop() }));
    if (id === 'pmBogo' || id === 'pmTue') out.flyerWidth = Math.round(r(ov.querySelector('.pm-flyer')).width);
    out.textTooSmall = [...ov.querySelectorAll('figcaption,.pm-note')].some((e) => parseFloat(getComputedStyle(e).fontSize) < 11);
    return out;
  }, id);
}
async function a11y(p, id) {
  return p.evaluate(async (id) => {
    const ov = document.getElementById(id), dlg = ov.querySelector('[role="dialog"]');
    const res = { role: !!dlg && dlg.getAttribute('aria-modal') === 'true', label: !!(dlg && document.getElementById(dlg.getAttribute('aria-labelledby'))?.textContent.trim()) };
    res.focusIn = dlg.contains(document.activeElement);
    const navLink = document.querySelector('nav a, nav button'); if (navLink) navLink.focus(); res.bgBlocked = !navLink || !navLink.contains(document.activeElement) || dlg.contains(document.activeElement);
    res.bgInert = [...document.body.children].filter((e) => e !== ov && !['SCRIPT', 'STYLE'].includes(e.tagName)).every((e) => e.inert);
    const bub = document.getElementById('chat-bubble'); if (bub) { const b = bub.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); res.mayaBehind = !!top && ov.contains(top); res.mayaZ = getComputedStyle(bub).zIndex; }
    res.ovZ = getComputedStyle(ov).zIndex;
    return res;
  }, id);
}
async function tabCycle(p, id) {
  const inside = [];
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); inside.push(await p.evaluate((id) => document.getElementById(id).contains(document.activeElement), id)); }
  for (let i = 0; i < 3; i++) { await p.keyboard.down('Shift'); await p.keyboard.press('Tab'); await p.keyboard.up('Shift'); inside.push(await p.evaluate((id) => document.getElementById(id).contains(document.activeElement), id)); }
  return inside.every(Boolean);
}
const mayaRect = (p) => p.evaluate(() => { const b = document.getElementById('chat-bubble'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), getComputedStyle(b).visibility, document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('#chat-bubble') ? 'on-top' : 'covered']; });

const want = (n) => !only || only.split(',').includes(n);

// ── UNIT: date logic ─────────────────────────────────────────────────────
if (want('unit')) {
  const c = await ctx(); const p = await tab(c, 1440, CT.oct17noon); await p.goto(base, { waitUntil: 'domcontentloaded' });
  const u = await p.evaluate((CT) => { const P = window.shaahiPromo; const o = {}; for (const k in CT) o[k] = [P.centralDate(CT[k]), P.bogoActive(CT[k])]; o.utcMidnightOct19 = [P.centralDate(Date.parse('2026-10-19T00:00:00Z')), P.bogoActive(Date.parse('2026-10-19T00:00:00Z'))]; o.oct16_2359 = [P.centralDate(Date.parse('2026-10-17T04:59:59Z')), P.bogoActive(Date.parse('2026-10-17T04:59:59Z'))]; return o; }, CT);
  console.log('date table', JSON.stringify(u));
  ok('UNIT Oct 16 11:59:59 PM CT → BOGO not yet active', u.oct16_2359[0] === '2026-10-16' && !u.oct16_2359[1]);
  ok('UNIT Oct 17 noon CT → 2026-10-17, BOGO active', u.oct17noon[0] === '2026-10-17' && u.oct17noon[1]);
  ok('UNIT Oct 18 11:59 PM CT → 2026-10-18, BOGO active', u.oct18_2359[0] === '2026-10-18' && u.oct18_2359[1]);
  ok('UNIT Oct 19 12:00 AM CT → 2026-10-19, BOGO OFF', u.oct19_0000[0] === '2026-10-19' && !u.oct19_0000[1]);
  ok('UNIT 7 PM CT Oct 18 (= midnight UTC Oct 19) still Oct 18 in Central, BOGO active', u.utcMidnightOct19[0] === '2026-10-18' && u.utcMidnightOct19[1]);
  const d = await p.evaluate((CT) => { localStorage.setItem('shaahiPromoUnder10LastShownDate', '2026-10-17'); const P = window.shaahiPromo; const r = [P.under10Due(CT.oct17noon), P.under10Due(CT.oct17_2359), P.under10Due(CT.oct18_0000)]; localStorage.removeItem('shaahiPromoUnder10LastShownDate'); return r; }, CT);
  ok('UNIT Under $10 seen Oct 17 → not due at noon / 11:59:30 PM, due at 12:00:30 AM Oct 18 (calendar day, not 24h)', !d[0] && !d[1] && d[2], JSON.stringify(d));
  await c.close();
}

// ── TEST A–E: one guest, mobile 390, Oct 17 ──────────────────────────────
if (want('ae')) {
  const c = await ctx(); const p = await tab(c, 390, CT.oct17noon);
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  const before = await state(p);
  const s = await waitFor(p, 'bogo', 8000);
  ok('A: BOGO appears on first visit Oct 17', !!s, s ? `shown at ${Math.round(s.t)} ms; hero painted at ${Math.round(s.heroAt)} ms` : '');
  ok('A: hero rendered before BOGO, BOGO ~1.5–2 s+ after load', s && s.heroAt != null && s.heroAt < s.t && s.t >= 1500);
  ok('A: Under $10 not shown behind/with BOGO', s && !s.u10 && !before.u10);
  const res = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /hero-01|bogo-chicken/.test(e.name)).map((e) => [e.name.split('/').pop(), Math.round(e.startTime), Math.round(e.responseEnd)]));
  const hero = res.find((r) => /hero-01/.test(r[0])), fly = res.find((r) => /bogo/.test(r[0]));
  ok('A: flyer requested only after the hero photo finished', hero && fly && fly[1] >= hero[2], JSON.stringify(res));
  await sleep(450); await shot(p, '1-bogo-390');
  const L = await layout(p, 'pmBogo'); console.log('  layout', JSON.stringify(L));
  const A = await a11y(p, 'pmBogo'); console.log('  a11y', JSON.stringify(A));
  ok('A11y BOGO: dialog/aria-modal/label, focus inside, background inert, Maya behind backdrop', A.role && A.label && A.focusIn && A.bgBlocked && A.bgInert && A.mayaBehind !== false);
  ok('A11y BOGO: Tab / Shift+Tab stay inside', await tabCycle(p, 'pmBogo'));
  const lcpA = await p.evaluate(() => window.__lcp); ok('A: LCP is not the flyer', !/bogo/.test(String(lcpA)), String(lcpA));
  const y0 = await p.evaluate(() => scrollY);
  await closeX(p, 'pmBogo'); const tClose = Date.now();
  const st1 = await state(p);
  ok('B: BOGO closes, session flag set', !st1.bogo && st1.ss === '1');
  ok('A11y: focus restored, scroll position kept', await p.evaluate(() => !document.getElementById('pmBogo').contains(document.activeElement)) && (await p.evaluate(() => scrollY)) === y0);
  await sleep(600); await shot(p, '2-after-bogo-close-390');
  const mr = await mayaRect(p); ok('Maya back on top after BOGO closes', mr && mr[5] === 'on-top', JSON.stringify(mr));
  ok('B: Under $10 date NOT recorded before it is shown', st1.ls === null);
  const early = await watch(p, 6500);
  ok('B: Under $10 not shown immediately after BOGO (first ~7 s)', !early.u10);
  const s2 = await waitFor(p, 'u10', 8000);
  const dt = (Date.now() - tClose) / 1000;
  ok('B: Under $10 appears ~8–12 s after BOGO close', s2 && !s2.conflict && dt >= 8 && dt <= 12.5, dt.toFixed(1) + ' s');
  ok('B: date recorded when actually shown = 2026-10-17', s2 && s2.ls === '2026-10-17');
  await sleep(450); await shot(p, '3-under10-390');
  const L2 = await layout(p, 'pmU10'); console.log('  layout', JSON.stringify(L2));
  const A2 = await a11y(p, 'pmU10'); console.log('  a11y', JSON.stringify(A2));
  ok('A11y U10: dialog/aria-modal/label, focus inside, background inert, Maya behind', A2.role && A2.label && A2.focusIn && A2.bgBlocked && A2.bgInert && A2.mayaBehind !== false);
  ok('A11y U10: Tab / Shift+Tab stay inside', await tabCycle(p, 'pmU10'));
  const parity = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#menu .mi[data-under10]')];
    const live = rows.filter((r) => !r.dataset.soldout && !r.classList.contains('soldout'));
    const price = (s) => parseFloat(String(s).replace(/[^0-9.]/g, ''));
    const ps = live.map((r) => price(r.dataset.price));
    const ov = document.getElementById('pmU10');
    const caps = [...ov.querySelectorAll('figure')].map((f) => f.querySelector('figcaption').textContent + ' · ' + f.querySelector('b').textContent);
    const capsOk = caps.every((c) => { const [n, pr] = c.split(' · '); return live.some((r) => r.dataset.label.split(' — ')[0] === n && r.dataset.price === pr && price(pr) < 10 && (window.shaahiUnder10.photoOf(r))); });
    return { marked: rows.length, live: live.length, count: ov.querySelector('[data-pm-count]').textContent, range: ov.querySelector('[data-pm-range]').textContent,
      expect: '$' + Math.min(...ps).toFixed(2) + '–$' + Math.max(...ps).toFixed(2), caps, capsOk, allUnder10: ps.every((x) => x > 0 && x < 10), band: document.getElementById('fxU10Lead').textContent,
      cta: ov.querySelector('.pm-cta').textContent.replace(/\s+/g, ' ').trim() };
  });
  console.log('  parity', JSON.stringify(parity));
  ok('U10 popup data = canonical rows (21, range, photos from Under $10 rows)', parity.marked === 21 && parity.live === 21 && parity.count === '21' && parity.range === parity.expect && parity.capsOk && parity.allUnder10 && parity.caps.length === 3 && /21/.test(parity.band) && parity.cta.startsWith('EXPLORE ALL 21'));
  const scrollBefore = await p.evaluate(() => scrollY);
  await p.keyboard.press('Escape'); await sleep(400);
  ok('A11y U10: Escape closes, scroll unchanged', !(await state(p)).u10 && (await p.evaluate(() => scrollY)) === scrollBefore);
  await sleep(400); await shot(p, '4-after-under10-close-390');
  const mr2 = await mayaRect(p); ok('Maya back on top after Under $10 closes', mr2 && mr2[5] === 'on-top', JSON.stringify(mr2));
  const cls1 = await p.evaluate(() => window.__cls); ok('No layout shift from either popup (CLS < 0.01 over whole visit)', cls1 < 0.01, cls1.toFixed(4));
  ok('No script errors', p._errors.length === 0, p._errors.join(' | '));

  // C + D: refresh, same session, same day
  await p.reload({ waitUntil: 'domcontentloaded' });
  const w1 = await watch(p, 14000);
  ok('C: refresh same session → BOGO does not repeat', !w1.bogo);
  ok('D: Under $10 already shown today → not again after refresh', !w1.u10);
  // D2: new tab = new browser session, same day
  const p2 = await tab(c, 390, CT.oct17noon); await p2.goto(base, { waitUntil: 'domcontentloaded' });
  const s3 = await waitFor(p2, 'bogo', 8000); ok('New browser session, still Oct 17 → BOGO may show again', !!s3);
  await closeX(p2, 'pmBogo'); const w2 = await watch(p2, 13500);
  ok('D: revisit same day (new session) → Under $10 still not repeated', !w2.u10);
  await p2.close();
  // E: next Central calendar day, same browser
  await setClock(p, CT.oct18_0000); await p.reload({ waitUntil: 'domcontentloaded' });
  const s4 = await waitFor(p, 'u10', 9000);
  ok('E: 12:00:30 AM Oct 18 → Under $10 eligible again (BOGO already seen this session, not repeated)', s4 && !s4.conflict && s4.ls === '2026-10-18', s4 ? `shown ${Math.round(s4.t)} ms after load` : 'not shown');
  await c.close();
}

// Interaction path (scroll) after BOGO close, Oct 18 11:59 PM
if (want('scroll')) {
  const c = await ctx(); const p = await tab(c, 390, CT.oct18_2359); await p.goto(base, { waitUntil: 'domcontentloaded' });
  const s = await waitFor(p, 'bogo', 8000); ok('Oct 18 11:59 PM CT → BOGO still shows', !!s);
  await closeX(p, 'pmBogo'); const t0 = Date.now();
  await sleep(1000); await p.evaluate(() => window.scrollBy(0, innerHeight * .6)); const w = await watch(p, 1500);
  ok('Scroll 1 s after closing BOGO does NOT pop Under $10 (breathing room)', !w.u10);
  await sleep(1200); await p.evaluate(() => window.scrollBy(0, innerHeight * .6));
  const s2 = await waitFor(p, 'u10', 3000); const dt = (Date.now() - t0) / 1000;
  ok('Meaningful scroll ~4 s after closing BOGO → Under $10 shows', s2 && !s2.conflict, dt.toFixed(1) + ' s after close');
  await c.close();
}

// F + G: Oct 19
if (want('fg')) {
  const c = await ctx(); const p = await tab(c, 390, CT.oct19_0000); await p.goto(base, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now(); const s = await waitFor(p, 'u10', 9000); const dt = (Date.now() - t0) / 1000;
  ok('F: Oct 19 12:00 AM → Under $10 is the first popup, ~4–6 s after load', s && !s.conflict && s.t >= 4000 && s.t <= 7000, s ? Math.round(s.t) + ' ms after navigation' : 'none');
  ok('F: BOGO flyer never requested on Oct 19', !p._reqs.some((u) => /bogo-chicken/.test(u)));
  await sleep(400);
  const before = await p.evaluate(() => document.getElementById('under10').getBoundingClientRect().top);
  await p.click('#pmU10 .pm-cta'); await sleep(1800);
  const g = await p.evaluate(() => { const sec = document.getElementById('under10'); const r = sec.getBoundingClientRect(); const nav = document.querySelector('nav'); return { top: Math.round(r.top), navH: nav ? nav.offsetHeight : 0, focus: document.activeElement && document.activeElement.id, hidden: document.getElementById('pmU10').hidden, featVisible: document.getElementById('fxU10').getBoundingClientRect().top < innerHeight }; });
  ok('G: EXPLORE ALL 21 closes popup, scrolls to the live Under $10 band, focuses its heading', g.hidden && g.top >= 0 && g.top <= g.navH + 40 && g.focus === 'fx-u10-title' && g.featVisible, JSON.stringify({ before: Math.round(before), ...g }));
  await shot(p, '7-explore-all-390');
  const w = await watch(p, 9000); ok('F: BOGO never appears on Oct 19 (watched ~16 s total)', !w.bogo && !w.u10);
  await c.close();
  const c2 = await ctx(); const p2 = await tab(c2, 1440, CT.oct19noon); await p2.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(2200); await p2.evaluate(() => window.scrollBy(0, innerHeight * .5));
  const s2 = await waitFor(p2, 'u10', 3000); ok('F: Oct 19 meaningful scroll → Under $10 earlier than the 5 s timer', s2 && s2.t < 4800, s2 ? Math.round(s2.t) + ' ms' : 'none');
  await c2.close();
}

// Desktop screenshots + analytics (consent granted vs not)
if (want('desk')) {
  const c = await ctx(); const p = await tab(c, 1440, CT.oct17noon, { consent: 'granted', dpr: 1 }); await p.goto(base, { waitUntil: 'domcontentloaded' });
  await waitFor(p, 'bogo', 8000); await sleep(450); await shot(p, '5-bogo-1440');
  console.log('  layout', JSON.stringify(await layout(p, 'pmBogo')));
  await closeX(p, 'pmBogo'); await sleep(500); await shot(p, '5b-after-bogo-close-1440');
  await sleep(3200); await p.evaluate(() => window.scrollBy(0, innerHeight * .5));
  await waitFor(p, 'u10', 9000); await sleep(450); await shot(p, '6-under10-1440');
  console.log('  layout', JSON.stringify(await layout(p, 'pmU10')));
  await p.click('#pmU10 .pm-x'); await sleep(500);
  const ev = await p.evaluate(() => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && /^promo_/.test(a[1])).map((a) => a[1]));
  ok('Analytics with consent: promo_bogo_view, promo_bogo_close, promo_under10_view, promo_under10_close', ['promo_bogo_view', 'promo_bogo_close', 'promo_under10_view', 'promo_under10_close'].every((e) => ev.includes(e)), ev.join(','));
  await c.close();
  const c2 = await ctx(); const p2 = await tab(c2, 1440, CT.oct19_0000, { consent: 'denied', dpr: 1 }); await p2.goto(base, { waitUntil: 'domcontentloaded' });
  await waitFor(p2, 'u10', 9000); await p2.click('#pmU10 .pm-cta'); await sleep(800);
  const ev2 = await p2.evaluate(() => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && /^promo_/.test(a[1])).map((a) => a[1]));
  ok('Analytics without consent: no promo events sent', ev2.length === 0, ev2.join(','));
  const c3 = await ctx(); const p3 = await tab(c3, 1440, CT.oct19_0000, { consent: 'granted', dpr: 1 }); await p3.goto(base, { waitUntil: 'domcontentloaded' });
  await waitFor(p3, 'u10', 9000); await p3.click('#pmU10 .pm-cta'); await sleep(800);
  const ev3 = await p3.evaluate(() => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && /^promo_/.test(a[1])).map((a) => a[1]));
  ok('Analytics with consent: promo_under10_click on Explore', ev3.includes('promo_under10_click'), ev3.join(','));
  await c2.close(); await c3.close();
}

// Responsive matrix, both popups
if (want('matrix')) {
  for (const [w, h] of [[320, 568], [320, 640], [390, 844], [430, 932], [768, 1024], [1024, 768], [1024, 1366], [1440, 900]]) {
    const c = await ctx(); const p = await tab(c, w, CT.oct17noon, { h }); await p.goto(base, { waitUntil: 'domcontentloaded' });
    const s = await waitFor(p, 'bogo', 8000); await sleep(400);
    const L = s ? await layout(p, 'pmBogo') : null;
    const f = L && L.imgs[0];
    const bogoOk = L && L.noOverflow && L.boxInView && L.xOk && L.noInnerScroll && L.buttons && !L.clipped && f.loaded && Math.abs(f.aspect / f.natural - 1) < 0.01;
    ok(`BOGO ${w}x${h}`, bogoOk, L ? `flyer ${L.flyerWidth}px wide (${(L.flyerWidth / w * 100).toFixed(0)}vw), box ${L.box.join(',')}, img ${f.cur}` : 'not shown');
    if (w === 320 && h === 568) await shot(p, 'm-bogo-320x568');
    await closeX(p, 'pmBogo'); await sleep(3200); await p.evaluate(() => window.scrollBy(0, innerHeight * .5));
    const s2 = await waitFor(p, 'u10', 9000); await sleep(600);
    const L2 = s2 ? await layout(p, 'pmU10') : null;
    const u10Ok = L2 && L2.noOverflow && L2.boxInView && L2.xOk && L2.noInnerScroll && L2.buttons && !L2.clipped && !L2.textTooSmall && L2.imgs.length === 3 && L2.imgs.every((i) => i.loaded && Math.abs(i.aspect - 1) < 0.02);
    ok(`U10  ${w}x${h}`, u10Ok, L2 ? `box ${L2.box.join(',')}, photos ${L2.imgs.map((i) => i.w + 'px ' + i.cur).join(' / ')}` : 'not shown');
    if (w === 320 && h === 568) await shot(p, 'm-under10-320x568');
    if (!bogoOk || !u10Ok) console.log('   detail', JSON.stringify({ L, L2 }));
    await c.close();
  }
}
// Never on top of the cart or a dish dialog: it waits for them to close.
if (want('busy')) {
  const c = await ctx(); const p = await tab(c, 390, CT.oct17noon); await p.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(900); await p.evaluate(() => openCartDrawer());
  const w = await watch(p, 5000); ok('Cart open → BOGO waits (not shown over the cart)', !w.bogo && !w.u10);
  await p.evaluate(() => document.getElementById('cartDrawer').classList.remove('open')); const s = await waitFor(p, 'bogo', 4000);
  ok('Cart closed → BOGO then appears', !!s);
  await closeX(p, 'pmBogo'); await sleep(8500);
  await p.evaluate(() => openItemModal(document.querySelector('#menu .mi[data-under10]')));
  const w2 = await watch(p, 5000); ok('Dish dialog open → Under $10 waits', !w2.u10);
  await p.evaluate(() => document.getElementById('itemModalClose').click()); const s2 = await waitFor(p, 'u10', 4000);
  ok('Dish dialog closed → Under $10 then appears', !!s2);
  ok('No script errors', p._errors.length === 0, p._errors.join(' | '));
  await c.close();
}
// Checkout and Maya: the popup waits while either is open.
if (want('busy')) {
  const c = await ctx(); const p = await tab(c, 390, CT.oct17noon); await p.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await p.evaluate(() => { const r = [...document.querySelectorAll('#menu .mi')].find((x) => x.dataset.name === 'Regular Goat Biryani'); openItemModal(r); });
  await sleep(300); await p.evaluate(() => document.getElementById('modalAddBtn').click()); await sleep(300);
  await p.evaluate(() => document.getElementById('cartToggle').click()); await sleep(300);
  await p.evaluate(() => document.querySelector('.cart-checkout').click());
  const open = await p.evaluate(() => document.getElementById('waModalOverlay').style.opacity === '1');
  const w = await watch(p, 5000); ok('Checkout open → BOGO waits', open && !w.bogo && !w.u10, open ? '' : 'checkout did not open');
  await p.evaluate(() => { closeWaModal(); document.getElementById('cartDrawer').classList.remove('open'); });
  const s = await waitFor(p, 'bogo', 4000); ok('Checkout closed → BOGO then appears', !!s);
  ok('Stripe still not loaded (checkout opened, no payment step)', !p._reqs.some((u) => /js\.stripe\.com/.test(u)));
  await c.close();
  const c2 = await ctx(); const p2 = await tab(c2, 1440, CT.oct19noon); await p2.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(1500); await p2.evaluate(() => toggleChat());
  const chatOpen = await p2.evaluate(() => document.getElementById('chat-window').classList.contains('open'));
  const w2 = await watch(p2, 6000); ok('Maya chat open → Under $10 waits', chatOpen && !w2.u10);
  await p2.evaluate(() => toggleChat()); const s2 = await waitFor(p2, 'u10', 4000);
  ok('Maya chat closed → Under $10 then appears, Maya launcher restored after', !!s2);
  await p2.click('#pmU10 .pm-x'); await sleep(500);
  const mr = await mayaRect(p2); ok('Maya launcher on top again after the popup', mr && mr[5] === 'on-top', JSON.stringify(mr));
  await c2.close();
}

// The real-Chrome defect: a CLASSIC visible scrollbar makes the window wider than
// the visible page, and the closed cart drawer parked at right:-420px sits under
// that strip. It must count as CLOSED, and BOGO must still appear.
if (want('scrollbar')) {
  await browser.close();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', ignoreDefaultArgs: ['--hide-scrollbars'] });
  for (const [w, h] of [[1440, 900], [3440, 1262]]) {
    const c = await ctx(); const p = await c.newPage();
    await p.setViewport({ width: w, height: h });   // desktop, no touch: classic scrollbar
    await p.evaluateOnNewDocument((t) => { window.__shaahiPromoNow = t; }, CT.oct17noon);
    await p.goto(base, { waitUntil: 'domcontentloaded' }); await sleep(600);
    const g = await p.evaluate(() => { const d = document.getElementById('cartDrawer').getBoundingClientRect(); const W = document.documentElement.clientWidth;
      return { scrollbar: innerWidth - W, drawerLeft: Math.round(d.left), W, underScrollbar: d.left >= W && d.left < innerWidth - 1,
        classified: window.shaahiPromo.onScreen(d, W, document.documentElement.clientHeight) ? 'OPEN' : 'CLOSED' }; });
    ok(`classic scrollbar ${w}px: scrollbar is really visible`, g.scrollbar > 0, g.scrollbar + 'px');
    ok(`classic scrollbar ${w}px: closed cart drawer sits under the scrollbar strip and is classified CLOSED`, g.underScrollbar && g.classified === 'CLOSED', JSON.stringify(g));
    const s = await waitFor(p, 'bogo', 6000); ok(`classic scrollbar ${w}px: BOGO appears normally`, !!s, s ? Math.round(s.t) + ' ms' : 'never appeared');
    if (s) { await p.click('#pmBogo .pm-x'); await sleep(300); }
    await p.evaluate(() => document.getElementById('cartDrawer').classList.add('open')); await sleep(600);
    const o = await p.evaluate(() => { const d = document.getElementById('cartDrawer').getBoundingClientRect(); return window.shaahiPromo.onScreen(d, document.documentElement.clientWidth, document.documentElement.clientHeight); });
    ok(`classic scrollbar ${w}px: genuinely open cart drawer is classified OPEN`, o);
    await c.close();
  }
}

// ── TUESDAY ROLL DEAL (Oct 20 2026 only) ─────────────────────────────────
if (want('tue')) {
  const u = await (async () => { const c = await ctx(); const p = await tab(c, 1440, CT.oct20_morning); await p.goto(base, { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate((CT) => { const P = window.shaahiPromo; const o = {}; for (const k of ['oct19_2359', 'oct20_0000', 'oct20_morning', 'oct20_afternoon', 'oct20_2359', 'oct21_0000']) o[k] = [P.centralDate(CT[k]), P.tuesdayActive(CT[k]), P.bogoActive(CT[k])]; return o; }, CT); await c.close(); return r; })();
  console.log('tuesday date table', JSON.stringify(u));
  ok('TUE UNIT Oct 19 11:59 PM CT → absent', u.oct19_2359[0] === '2026-10-19' && !u.oct19_2359[1]);
  ok('TUE UNIT Oct 20 12:00 AM / morning / afternoon / 11:59 PM CT → eligible', ['oct20_0000', 'oct20_morning', 'oct20_afternoon', 'oct20_2359'].every((k) => u[k][0] === '2026-10-20' && u[k][1] && !u[k][2]));
  ok('TUE UNIT Oct 21 12:00 AM CT → inactive', u.oct21_0000[0] === '2026-10-21' && !u.oct21_0000[1]);

  // Main flow, mobile 390, Oct 20 morning
  const c = await ctx(); const p = await tab(c, 390, CT.oct20_morning);
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  const s = await waitFor(p, 'tue', 8000);
  ok('TUE A: Tuesday Roll Deal is the first popup on Oct 20', !!s && !s.u10 && !s.bogo, s ? `shown at ${Math.round(s.t)} ms; hero painted at ${Math.round(s.heroAt)} ms` : 'not shown');
  ok('TUE A: after the hero painted, ~1.5 s+ after load', s && s.heroAt != null && s.heroAt < s.t && s.t >= 1500);
  const res = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /hero-01|tuesday-roll|bogo-chicken/.test(e.name)).map((e) => [e.name.split('/').pop(), Math.round(e.startTime), Math.round(e.responseEnd)]));
  const hero = res.find((r) => /hero-01/.test(r[0])), fly = res.find((r) => /tuesday-roll/.test(r[0]));
  ok('TUE A: flyer requested only after the hero photo finished; BOGO flyer never requested', hero && fly && fly[1] >= hero[2] && !res.some((r) => /bogo-chicken/.test(r[0])), JSON.stringify(res));
  const flyer = await p.evaluate(() => { const i = document.querySelector('#pmTue .pm-flyer'); const ov = document.getElementById('pmTue');
    return { cur: (i.currentSrc || '').split('/').pop(), alt: i.alt, note: ov.querySelector('.pm-note').textContent, act: ov.querySelector('.pm-act').textContent.replace(/\s+/g, ' ').trim(), html: ov.outerHTML }; });
  ok('TUE A: the $5.99 Version A flyer is the one shown', /^tuesday-roll-deal-599-oct20-(720|1040)\.webp$/.test(flyer.cur), flyer.cur);
  ok('TUE A: copy says 1 Chicken Boti Roll, $5.99, naan or paratha, takeout only, Oct 20 2026, ask for the deal, IG handle', ['1 Chicken Boti Roll', '$5.99', 'naan or paratha', 'Takeout only', 'October 20, 2026', 'Ask for the Tuesday Roll Deal', '@shaahibiryani_planotx'].every((w) => flyer.alt.includes(w)));
  ok('TUE A: no withdrawn $9.99 combo wording (fries, drink, $9.99, combo)', !/9\.99|fries|drink|soda|combo|2\.99/i.test(flyer.alt + ' ' + flyer.html.replace(/<img[^>]*>/, '')), flyer.alt);
  ok('TUE A: no Entraforce, no 2-roll wording, no order-online / add-to-cart action', !/entraforce/i.test(flyer.html) && !/2 chicken|two chicken|boti rolls/i.test(flyer.html) && !/order online|add to cart|buy now|claim|get deal/i.test(flyer.html) && !/data-pm-go="(under10|menu|order)"/.test(flyer.html), flyer.act + ' | ' + flyer.note);
  await sleep(450); await shot(p, 'tue-1-390');
  const L = await layout(p, 'pmTue'); console.log('  layout', JSON.stringify(L));
  const A = await a11y(p, 'pmTue'); console.log('  a11y', JSON.stringify(A));
  ok('TUE A11y: dialog/aria-modal/label, focus inside, background inert, Maya behind backdrop', A.role && A.label && A.focusIn && A.bgBlocked && A.bgInert && A.mayaBehind !== false);
  ok('TUE A11y: Tab / Shift+Tab stay inside', await tabCycle(p, 'pmTue'));
  const lcp = await p.evaluate(() => window.__lcp); ok('TUE A: LCP is not the flyer', !/tuesday-roll/.test(String(lcp)), String(lcp));
  const y0 = await p.evaluate(() => scrollY);
  await p.keyboard.press('Escape'); await sleep(400); const tClose = Date.now();
  const st1 = await state(p);
  ok('TUE B: Escape closes, session flag set, focus restored outside, scroll kept', !st1.tue && st1.ssTue === '1' && (await p.evaluate(() => !document.getElementById('pmTue').contains(document.activeElement))) && (await p.evaluate(() => scrollY)) === y0);
  const mr = await mayaRect(p); ok('TUE: Maya back on top after close', mr && mr[5] === 'on-top', JSON.stringify(mr));
  const early = await watch(p, 6500); ok('TUE B: Under $10 not shown right after Tuesday (first ~7 s), never both', !early.u10 && !early.both);
  const s2 = await waitFor(p, 'u10', 8000); const dt = (Date.now() - tClose) / 1000;
  ok('TUE B: Under $10 appears ~8–12 s after Tuesday closes, alone', s2 && !s2.conflict && dt >= 8 && dt <= 12.5, dt.toFixed(1) + ' s');
  ok('TUE B: Under $10 recorded for Central day 2026-10-20', s2 && s2.ls === '2026-10-20');
  await p.keyboard.press('Escape'); await sleep(400);
  const cls = await p.evaluate(() => window.__cls); ok('TUE: no layout shift over the visit (CLS < 0.01)', cls < 0.01, cls.toFixed(4));
  ok('TUE: no script errors', p._errors.length === 0, p._errors.join(' | '));
  await p.reload({ waitUntil: 'domcontentloaded' });
  const w1 = await watch(p, 14000); ok('TUE C: refresh in the same session → Tuesday does not repeat (and Under $10 not again today)', !w1.tue && !w1.u10);
  await c.close();
  // New session (new browser context = private window) → shows again
  const cN = await ctx(); const pN = await tab(cN, 390, CT.oct20_afternoon); await pN.goto(base, { waitUntil: 'domcontentloaded' });
  ok('TUE D: new session, Oct 20 afternoon → shows again', !!(await waitFor(pN, 'tue', 8000))); await cN.close();
  // Scroll path after close
  const cS = await ctx(); const pS = await tab(cS, 390, CT.oct20_2359); await pS.goto(base, { waitUntil: 'domcontentloaded' });
  ok('TUE: Oct 20 11:59 PM CT → still shows', !!(await waitFor(pS, 'tue', 8000)));
  await closeX(pS, 'pmTue'); const t0 = Date.now();
  await sleep(1000); await pS.evaluate(() => window.scrollBy(0, innerHeight * .6)); const ws = await watch(pS, 1500);
  ok('TUE: scroll 1 s after closing does NOT pop Under $10', !ws.u10);
  await sleep(1200); await pS.evaluate(() => window.scrollBy(0, innerHeight * .6));
  const sS = await waitFor(pS, 'u10', 3000); ok('TUE: meaningful scroll ~4 s after closing → Under $10 shows, alone', sS && !sS.conflict, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  await cS.close();
  // Before / after the day: no Tuesday DOM, no flyer request, Under $10 primary
  for (const [label, t] of [['Oct 19 11:59 PM', CT.oct19_2359], ['Oct 20 12:00 AM', CT.oct20_0000], ['Oct 21 12:00 AM', CT.oct21_0000]]) {
    const cx = await ctx(); const px = await tab(cx, 390, t); await px.goto(base, { waitUntil: 'domcontentloaded' });
    if (label === 'Oct 20 12:00 AM') { ok('TUE: Oct 20 12:00 AM CT → shows', !!(await waitFor(px, 'tue', 8000))); await cx.close(); continue; }
    const su = await waitFor(px, 'u10', 9000); const w = await watch(px, 2000);
    const dom = await px.evaluate(() => !!document.getElementById('pmTue'));
    ok(`TUE: ${label} CT → no Tuesday popup, no Tuesday DOM, flyer never requested, Under $10 first`, su && !su.conflict && !w.tue && !dom && !px._reqs.some((r) => /tuesday-roll/.test(r)), su ? Math.round(su.t) + ' ms' : 'u10 not shown');
    await cx.close();
  }
  // Analytics: consent granted vs denied
  const cg = await ctx(); const pg = await tab(cg, 1440, CT.oct20_morning, { consent: 'granted', dpr: 1 }); await pg.goto(base, { waitUntil: 'domcontentloaded' });
  await waitFor(pg, 'tue', 8000); await sleep(450); await shot(pg, 'tue-2-1440'); await closeX(pg, 'pmTue');
  const ev = await pg.evaluate(() => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && /^promo_/.test(a[1])).map((a) => a[1]));
  ok('TUE analytics with consent: promo_tuesday_roll_shown + promo_tuesday_roll_closed', ev.includes('promo_tuesday_roll_shown') && ev.includes('promo_tuesday_roll_closed'), ev.join(','));
  await cg.close();
  const cd = await ctx(); const pd = await tab(cd, 1440, CT.oct20_morning, { consent: 'denied', dpr: 1 }); await pd.goto(base, { waitUntil: 'domcontentloaded' });
  await waitFor(pd, 'tue', 8000); await closeX(pd, 'pmTue');
  const ev2 = await pd.evaluate(() => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && /^promo_/.test(a[1])).map((a) => a[1]));
  ok('TUE analytics without consent: no promo events', ev2.length === 0, ev2.join(','));
  await cd.close();
  const cx = await ctx(); const px = await tab(cx, 1440, CT.oct21_0000, { consent: 'granted', dpr: 1 }); await px.goto(base, { waitUntil: 'domcontentloaded' });
  await waitFor(px, 'u10', 9000); await sleep(500);
  const ev3 = await px.evaluate(() => (window.dataLayer || []).filter((a) => a && a[0] === 'event' && /^promo_tuesday/.test(a[1])).map((a) => a[1]));
  ok('TUE analytics after expiry: no Tuesday events', ev3.length === 0, ev3.join(','));
  await cx.close();
}
if (want('tuematrix')) {
  for (const [w, h] of [[320, 568], [320, 640], [390, 844], [430, 932], [768, 1024], [1024, 768], [1024, 1366], [1440, 900], [1920, 1080]]) {
    const c = await ctx(); const p = await tab(c, w, CT.oct20_morning, { h }); await p.goto(base, { waitUntil: 'domcontentloaded' });
    const s = await waitFor(p, 'tue', 8000); await sleep(400);
    const L = s ? await layout(p, 'pmTue') : null; const f = L && L.imgs[0];
    const pass = L && L.noOverflow && L.boxInView && L.xOk && L.noInnerScroll && L.buttons && !L.clipped && f.loaded && Math.abs(f.aspect / f.natural - 1) < 0.01;
    ok(`TUE ${w}x${h}`, pass, L ? `flyer ${L.flyerWidth}px wide, box ${L.box.join(',')}, img ${f.cur}` : 'not shown');
    if ([320, 430, 768].includes(w) && (h === 568 || h === 932 || h === 1024)) await shot(p, `tue-m-${w}x${h}`);
    if (!pass) console.log('   detail', JSON.stringify(L));
    await c.close();
  }
}
if (want('tuebusy')) {
  const c = await ctx(); const p = await tab(c, 390, CT.oct20_morning); await p.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(900); await p.evaluate(() => openCartDrawer());
  const w = await watch(p, 5000); ok('TUE: cart open → waits', !w.tue && !w.u10);
  await p.evaluate(() => document.getElementById('cartDrawer').classList.remove('open'));
  ok('TUE: cart closed → Tuesday appears', !!(await waitFor(p, 'tue', 4000)));
  await c.close();
  const c1 = await ctx(); const p1 = await tab(c1, 390, CT.oct20_morning); await p1.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(900); await p1.evaluate(() => openItemModal(document.querySelector('#menu .mi[data-under10]')));
  const w1 = await watch(p1, 5000); ok('TUE: dish dialog open → waits', !w1.tue);
  await p1.evaluate(() => document.getElementById('itemModalClose').click());
  ok('TUE: dish dialog closed → Tuesday appears', !!(await waitFor(p1, 'tue', 4000)));
  await c1.close();
  const c2 = await ctx(); const p2 = await tab(c2, 390, CT.oct20_morning); await p2.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await p2.evaluate(() => { const r = [...document.querySelectorAll('#menu .mi')].find((x) => x.dataset.name === 'Regular Goat Biryani'); openItemModal(r); });
  await sleep(300); await p2.evaluate(() => document.getElementById('modalAddBtn').click()); await sleep(300);
  await p2.evaluate(() => document.getElementById('cartToggle').click()); await sleep(300);
  await p2.evaluate(() => document.querySelector('.cart-checkout').click());
  const open = await p2.evaluate(() => document.getElementById('waModalOverlay').style.opacity === '1');
  const w2 = await watch(p2, 5000); ok('TUE: checkout open → waits', open && !w2.tue && !w2.u10, open ? '' : 'checkout did not open');
  await p2.evaluate(() => { closeWaModal(); document.getElementById('cartDrawer').classList.remove('open'); });
  ok('TUE: checkout closed → Tuesday appears', !!(await waitFor(p2, 'tue', 4000)));
  ok('TUE: Stripe still not loaded (checkout opened, no payment step)', !p2._reqs.some((u) => /js\.stripe\.com/.test(u)));
  await c2.close();
  const c3 = await ctx(); const p3 = await tab(c3, 1440, CT.oct20_morning); await p3.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(900); await p3.evaluate(() => toggleChat());
  const chatOpen = await p3.evaluate(() => document.getElementById('chat-window').classList.contains('open'));
  const w3 = await watch(p3, 5000); ok('TUE: Maya open → waits', chatOpen && !w3.tue);
  await p3.evaluate(() => toggleChat()); ok('TUE: Maya closed → Tuesday appears', !!(await waitFor(p3, 'tue', 4000)));
  await c3.close();
  // reduced motion: no transitions
  const c4 = await ctx(); const p4 = await tab(c4, 390, CT.oct20_morning); await p4.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p4.goto(base, { waitUntil: 'domcontentloaded' }); await waitFor(p4, 'tue', 8000);
  const rm = await p4.evaluate(() => [getComputedStyle(document.getElementById('pmTue')).transitionDuration, getComputedStyle(document.querySelector('#pmTue .pm-box')).transform]);
  ok('TUE: reduced motion respected (no transition, no transform)', rm[0] === '0s' && rm[1] === 'none', JSON.stringify(rm));
  await c4.close();
}
await browser.close();
const f = R.filter((r) => !r.pass); console.log(`\n${R.length - f.length}/${R.length} passed` + (f.length ? '\nFAILED:\n' + f.map((r) => ' - ' + r.name + ' ' + r.detail).join('\n') : ''));
