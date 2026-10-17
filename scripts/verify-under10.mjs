#!/usr/bin/env node
// Under $10 parity guard: the website's Under $10 experience must be exactly the
// app's program — same sizes, same prices — and nothing else.
//
// Sources compared:
//   canonical list   app lib/offers.ts UNDER_10 (the one definition)
//   app prices       app create-payment-intent/prices.ts (what the app charges)
//                    and app lib/menu-data.ts (what the app shows)
//   facts            supabase/functions/_shared/menu-facts.js UNDER_10_PIDS
//   website rows     web_menu_items, read live with the page's own read-only key
//   website page     index.html rows marked data-under10 by render-menu.js
//
// Fails, naming every mismatch, when:
//   - an UNDER_10 size has no website row (or only an inactive one)
//   - the app's charged price, the app's shown price and the website's
//     published price disagree
//   - a website row the program relies on is priced $10 or more
//   - menu-facts.js no longer matches the app's list (rebuild needed)
//   - the page marks a row that is not on the list, is sold out or is >= $10
//   - the page fails to mark a row that qualifies (page needs regenerating)
//   - Beef Fry's website rows or Clover mapping disappear
// A sold-out size is reported but is not a failure — it is the owner's call.
//
//   node scripts/verify-under10.mjs
//   node scripts/verify-under10.mjs --with-pending <migration.sql>
//       also applies the INSERTs of a not-yet-applied migration to the live
//       rows in memory, and checks the page the renderer WOULD produce.
//   node scripts/verify-under10.mjs --html <page.html>   check another page file
//   node scripts/verify-under10.mjs --rows <rows.json>   use a full copy of
//       web_menu_items (e.g. a migration dry run) instead of the live rows
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMenuData, renderAll } from '../supabase/functions/_shared/render-menu.js';
import { UNDER_10_PIDS } from '../supabase/functions/_shared/menu-facts.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = '/Users/osmanmohammed/github/shaahi-biryani-app';
const args = process.argv.slice(2);
const pendingIdx = args.indexOf('--with-pending');
const pending = pendingIdx >= 0 ? args[pendingIdx + 1] : null;

const fails = [];
const notes = [];
const fail = (m) => fails.push(m);

// ── canonical list (parsed exactly as build-menu-facts.mjs does) ──
const offers = readFileSync(`${APP}/lib/offers.ts`, 'utf8');
const block = offers.match(/export const UNDER_10\b[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!block) throw new Error('app lib/offers.ts: cannot find UNDER_10');
const canonical = [...block[1].replace(/\/\/[^\n]*/g, '').matchAll(/\{([^{}]*)\}/g)].map((m) => {
  const f = (k) => m[1].match(new RegExp(`${k}:\\s*'([^']+)'`))?.[1];
  return { section: f('section'), pid: `${f('menuItemId')}|${f('variantId')}` };
});

// ── app prices ──
const pricesSrc = readFileSync(`${APP}/supabase/functions/create-payment-intent/prices.ts`, 'utf8');
const appCharged = {};
for (const m of pricesSrc.matchAll(/"([^"]+\|[^"]+)":\s*([0-9.]+)/g)) appCharged[m[1]] = Number(m[2]);
const menuSrc = readFileSync(`${APP}/lib/menu-data.ts`, 'utf8');
const marker = 'export const MENU: MenuData =';
const MENU = JSON.parse(menuSrc.slice(menuSrc.indexOf('{', menuSrc.indexOf(marker))).trim().replace(/;$/, ''));
const appShown = {}, appName = {};
for (const it of MENU.items) for (const v of it.variants) {
  appShown[`${it.id}|${v.id}`] = Number(v.price);
  appName[`${it.id}|${v.id}`] = `${it.name}${v.isDefault ? '' : ` — ${v.name}`}`;
}

// ── facts in step with the app ──
const canonPids = canonical.map((c) => c.pid);
if (JSON.stringify(canonPids) !== JSON.stringify(UNDER_10_PIDS)) {
  const add = canonPids.filter((p) => !UNDER_10_PIDS.includes(p));
  const drop = UNDER_10_PIDS.filter((p) => !canonPids.includes(p));
  fail(`menu-facts.js UNDER_10_PIDS is stale vs the app's UNDER_10` +
    (add.length ? ` — missing ${add.join(', ')}` : '') + (drop.length ? ` — extra ${drop.join(', ')}` : '') +
    ((!add.length && !drop.length) ? ' — order differs' : '') + '. Run: node scripts/build-menu-facts.mjs');
}

// ── website rows ──
const htmlIdx = args.indexOf('--html');
let html = readFileSync(htmlIdx >= 0 ? args[htmlIdx + 1] : resolve(repo, 'index.html'), 'utf8');
const url = html.match(/var SB_URL='([^']+)'/)?.[1];
const key = html.match(/var SB_ANON='([^']+)'/)?.[1];
const rowsIdx = args.indexOf('--rows');
const data = await fetchMenuData(url, key);
if (rowsIdx >= 0) {
  // A full post-migration copy of web_menu_items (e.g. from a dry run of a
  // pending migration in a scratch database) instead of the live rows.
  data.items = JSON.parse(readFileSync(args[rowsIdx + 1], 'utf8'));
  for (const r of data.items) if (r.price != null) r.price = Number(r.price);
  html = renderAll(html, data);
  notes.push(`rows taken from ${args[rowsIdx + 1].split('/').pop()} (${data.items.length}); page re-rendered from them`);
}
if (pending) {
  const sql = readFileSync(pending, 'utf8');
  const ins = sql.match(/INSERT INTO public\.web_menu_items\s*\(([^)]*)\)\s*VALUES([\s\S]*?);/);
  if (!ins) throw new Error(`${pending}: no INSERT INTO public.web_menu_items`);
  const cols = ins[1].split(',').map((c) => c.trim());
  const tuples = [...ins[2].matchAll(/\(([\s\S]*?)\)(?=\s*,\s*\(|\s*$)/g)].map((m) => m[1]);
  const parseVal = (v) => {
    v = v.trim();
    if (/^null$/i.test(v)) return null;
    if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
    if (/^'/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    return Number(v);
  };
  const splitTop = (t) => { const out = []; let cur = '', q = false;
    for (const ch of t) { if (ch === "'") q = !q; if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out; };
  let id = -1;
  for (const t of tuples) {
    const vals = splitTop(t).map(parseVal);
    const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    data.items = data.items.filter((r) => r.pid !== row.pid);
    data.items.push({ id: id--, badge: null, image_url: null, schedule: null, ...row });
  }
  data.items.sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
  html = renderAll(html, data);
  notes.push(`pending migration overlaid in memory: ${tuples.length} row(s) from ${pending.split('/').pop()}`);
}
const rowsByPid = {};
for (const r of data.items) if (r.pid) (rowsByPid[r.pid] ||= []).push(r);
const catNames = Object.fromEntries((data.categories || []).map((c) => [c.code, c.name || c.label || c.code]));

// ── page marks ──
const pidMap = JSON.parse(html.match(/var PID_MAP=(\{[\s\S]*?\});/)[1]);
const marked = {};
for (const m of html.matchAll(/<div class="mi[^"]*"[^>]*>/g)) {
  const tag = m[0];
  const rank = tag.match(/data-under10="(\d+)"/)?.[1];
  if (!rank) continue;
  const name = tag.match(/data-name="([^"]*)"/)[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // A dish sold with a Naan/Rice choice maps both sides to the same pid.
  const pids = [...new Set(Object.values(pidMap[name] || {}))];
  if (pids.length !== 1) { fail(`page: marked row "${name}" does not resolve to exactly one pid`); continue; }
  marked[pids[0]] = { rank: Number(rank), soldOut: /data-soldout="1"/.test(tag),
    price: Number(tag.match(/data-price="\$?([0-9.]+)"/)?.[1]) };
}
for (const [pid, m] of Object.entries(marked)) {
  if (!canonPids.includes(pid)) fail(`page: ${pid} is marked Under $10 but is not on the app's UNDER_10 list`);
  if (m.soldOut) fail(`page: ${pid} is marked Under $10 while sold out`);
  if (!(m.price < 10)) fail(`page: ${pid} is marked Under $10 at $${m.price}`);
  if (canonPids.indexOf(pid) + 1 !== m.rank) fail(`page: ${pid} marked at position ${m.rank}, app order is ${canonPids.indexOf(pid) + 1}`);
}

// ── per item ──
const table = [];
for (const c of canonical) {
  const live = (rowsByPid[c.pid] || []).filter((r) => r.inactive !== true);
  const r = live[0];
  const charged = appCharged[c.pid], shown = appShown[c.pid];
  const web = r ? Number(r.published_price ?? r.price) : null;
  const staged = r ? Number(r.price) : null;
  const problems = [];
  if (charged == null) problems.push('no app charged price');
  if (shown == null) problems.push('not on app menu');
  if (charged != null && shown != null && charged !== shown) problems.push(`app shows $${shown} but charges $${charged}`);
  if (!r) problems.push('no website row');
  if (live.length > 1) problems.push(`${live.length} website rows`);
  if (r && charged != null && web !== charged) problems.push(`website $${web} vs app $${charged}`);
  if (r && staged !== web) problems.push(`website staged price $${staged} differs from published $${web}`);
  if (r && !(web < 10)) problems.push(`website price $${web} is not under $10`);
  const available = r ? (r.available !== false) : null;
  if (r && !available) notes.push(`${c.pid} is sold out on the website (shown in the menu, left out of Under $10)`);
  const shouldMark = !!r && available && web < 10;
  if (shouldMark && !marked[c.pid]) problems.push('qualifies but the page does not mark it (regenerate index.html)');
  if (!shouldMark && marked[c.pid]) problems.push('page marks it but it does not qualify');
  problems.forEach((p) => fail(`${c.pid}: ${p}`));
  table.push({ item: appName[c.pid] || c.pid, pid: c.pid, app: charged, web, cat: r ? (catNames[r.category] || r.category) : '—',
    avail: r ? (available ? 'available' : 'SOLD OUT') : '—', ok: problems.length === 0 });
}

// ── Beef Fry ──
for (const pid of ['beef-fry|beef-fry-standard', 'beef-fry|beef-fry-single']) {
  if (!(rowsByPid[pid] || []).some((r) => r.inactive !== true)) fail(`Beef Fry: no website row for ${pid}`);
  if (appCharged[pid] == null) fail(`Beef Fry: app has no charged price for ${pid}`);
}
const cloverMig = readFileSync(`${APP}/supabase/migrations/20261019000000_map_beef_fry_to_clover.sql`, 'utf8');
for (const pid of ['beef-fry|beef-fry-standard', 'beef-fry|beef-fry-single']) {
  if (!new RegExp(`'${pid.replace('|', '\\|')}',\\s*'XKQVKS5KJBEKE'`).test(cloverMig)) fail(`Beef Fry: Clover mapping for ${pid} missing from 20261019000000`);
}

// ── report ──
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('#', 3) + pad('Item', 44) + pad('Canonical ID', 58) + pad('App', 8) + pad('Web', 8) + pad('Category', 12) + pad('Availability', 13) + 'Parity');
table.forEach((t, i) => console.log(pad(i + 1, 3) + pad(t.item, 44) + pad(t.pid, 58) + pad(t.app != null ? `$${t.app}` : '—', 8) +
  pad(t.web != null ? `$${t.web}` : '—', 8) + pad(t.cat, 12) + pad(t.avail, 13) + (t.ok ? 'PASS' : 'FAIL')));
const mapped = table.filter((t) => t.web != null).length;
const parity = table.filter((t) => t.web != null && t.web === t.app).length;
console.log(`\n${mapped}/${table.length} mapped · ${parity}/${table.length} price parity · ${Object.keys(marked).length} rows marked on the page`);
notes.forEach((n) => console.log('note: ' + n));
if (fails.length) {
  console.error(`\n${fails.length} mismatch(es):`);
  fails.forEach((f) => console.error('  FAIL ' + f));
  process.exit(1);
}
console.log('Under $10 parity: all checks passed');
