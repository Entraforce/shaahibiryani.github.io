// render-menu.js — regenerates every menu-derived region of index.html from the
// web_menu_* tables. Shared by the publish-menu edge function (Deno) and local
// verification scripts (Node). Plain ESM JavaScript, no dependencies.
//
// Regions rewritten by renderAll(html, data):
//   1. <!-- GEN:MENU START/END -->    menu tabs + category panes (all items)
//   2. <!-- GEN:SPLASH START/END -->  splash-screen bestseller price list
//   3. var PID_MAP={...};             cart item-id lookup (regex, no marker)
//   4. "hasMenuSection": [...]        Google schema menu (balanced-bracket splice)
//   5. bestseller cards               price/desc/size attrs patched per data-name
//
// data = { categories: [{code,label,sort}], items: [...], cards: [...] }
// Items with available=false are omitted from the rendered menu (and checkout
// rejects them server-side). Hidden categories: ctr, sys.

import { PHOTO_DIMS, VEGETARIAN_PIDS } from "./menu-facts.js";

const HIDDEN_CATS = new Set(["ctr", "sys"]);

// Categories where a vegetarian mark helps someone choose. Bottled drinks are
// vegetarian too, but marking a water bottle "VEG" is clutter, not information —
// and a menu covered in badges stops communicating anything.
const DIETARY_MARK_CATS_EXCLUDED = new Set(["bev"]);

// True only when the authoritative app data says vegetarian AND the dish's own
// copy does not contradict it (that second check happens in
// scripts/build-menu-facts.mjs, which builds VEGETARIAN_PIDS). Anything absent
// from the set shows NO dietary mark at all — an absent mark is honest, a wrong
// one is harmful to someone avoiding meat on religious or ethical grounds.
function isVerifiedVegetarian(r) {
  if (!r.pid || DIETARY_MARK_CATS_EXCLUDED.has(r.category)) return false;
  return VEGETARIAN_PIDS.has(String(r.pid));
}

// Leaf mark + the word VEG. Never colour alone: a colour-only signal is invisible
// to a colour-blind guest and to a screen reader both.
const VEG_MARK =
  '<span class="mveg" role="img" aria-label="Vegetarian">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M20 4c0 9-5.5 14-12 14-1.2 0-2.3-.2-3.3-.5C6 12 11 8.5 17 7.5 11.6 7.9 6.6 10.6 4 15.2 3.4 13.9 3 12.5 3 11 3 6.6 7 4 12 4h8z"/>' +
  '</svg>VEG</span>';

// A dish with no photograph gets a branded mark, never a stand-in dish image:
// showing someone a different dish is worse than showing none. Same box as a
// real thumbnail so rows stay the same height.
const PHOTO_PLACEHOLDER =
  '<span class="mi-thumb mi-thumb-empty" role="img" aria-label="Photo coming soon">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 3.2l1.9 5.1 5.1 1.9-5.1 1.9L12 17.2l-1.9-5.1L5 10.2l5.1-1.9L12 3.2z"/>' +
  '</svg></span>';

// Real dimensions let the browser reserve the box before the photo decodes.
// CSS already fixes the displayed size, so these only supply aspect ratio.
function renderThumb(src, alt) {
  if (!src) return PHOTO_PLACEHOLDER;
  const d = PHOTO_DIMS[src];
  const dims = d ? ` width="${d[0]}" height="${d[1]}"` : "";
  return `<img class="mi-thumb" src="${escAttr(src)}"${dims} alt="${escAttr(alt)}" loading="lazy" decoding="async">`;
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// "$22.00" style for menu rows
function fmt2(p) { return "$" + Number(p).toFixed(2); }
// "$22" / "$4.50" style for cards, splash, schema
function fmtShort(p) {
  const n = Number(p);
  return "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
}
function schemaPrice(p) {
  const n = Number(p);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function visibleItems(data) {
  return data.items.filter((r) =>
    r.kind === "item" && r.available && !HIDDEN_CATS.has(r.category));
}
function paneRows(data, code) {
  return data.items
    .filter((r) => r.category === code &&
      (r.kind === "subhead" || (r.kind === "item" && r.available)))
    .sort((a, b) => a.sort - b.sort);
}
// Categories with no available items (e.g. Specials with nothing running)
// disappear from the menu entirely.
function visibleCategories(data) {
  return data.categories
    .filter((c) => !HIDDEN_CATS.has(c.code))
    .filter((c) => paneRows(data, c.code).some((r) => r.kind === "item"))
    .sort((a, b) => a.sort - b.sort);
}

// ── schedules ────────────────────────────────────────────────────
// schedule = {days:[0..6 Sun..Sat], start:"11:30", end:"15:00"}; null = always.
// Times are America/Chicago (the restaurant's clock).
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(hm) {
  const [h, m] = hm.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ampm}` : `${h12} ${ampm}`;
}

export function scheduleLabel(s) {
  if (!s || (!s.days?.length && !s.start && !s.end)) return "";
  const parts = [];
  let days = [...new Set(s.days || [])].sort((a, b) => a - b);
  if (days.length && days.length < 7) {
    // Sat+Sun should read "Sat–Sun", not "Sun, Sat": treat Sunday as day 7
    // when Saturday is also present so weekend runs group naturally.
    if (days.includes(0) && days.includes(6)) {
      days = days.filter((d) => d !== 0).concat(7);
    }
    const runs = [];
    for (const d of days) {
      const last = runs[runs.length - 1];
      if (last && d === last[1] + 1) last[1] = d;
      else runs.push([d, d]);
    }
    parts.push(runs.map(([a, b]) =>
      a === b ? DAY_NAMES[a % 7] : `${DAY_NAMES[a % 7]}–${DAY_NAMES[b % 7]}`).join(", "));
  }
  if (s.start && s.end) parts.push(`${fmtTime(s.start)}–${fmtTime(s.end)}`);
  else if (s.start) parts.push(`from ${fmtTime(s.start)}`);
  else if (s.end) parts.push(`until ${fmtTime(s.end)}`);
  return parts.join(" ");
}

export function inScheduleWindow(s, now = new Date()) {
  if (!s) return true;
  const chi = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t) => chi.find((p) => p.type === t)?.value;
  const day = DAY_NAMES.indexOf(get("weekday"));
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  if (s.days?.length && !s.days.includes(day)) return false;
  const toMins = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  if (s.start && mins < toMins(s.start)) return false;
  if (s.end && mins >= toMins(s.end)) return false;
  return true;
}

// r.name is the stable identity the cart + PID_MAP key on (data-name); the
// visible label is rebuilt from display + note + badge.
export function itemDataName(r) {
  return r.name;
}

// ── Naan-or-Rice picker ─────────────────────────────────────────
// Chicken + Goat curries always come with a Naan-or-Rice choice; within
// Grill, only the items grouped under the "Platters" subhead do (the
// individual kabab rows below it are excluded on purpose). Same price
// either way, so this never touches pricing — it just records which side
// the guest picked (as variant_name) for the kitchen to see.
const SIDE_CHOICE_CATS = new Set(["chk", "lmb"]);
const SIDE_CHOICE_SUBHEADS = new Set(["Platters"]);
// Dishes that sit inside a side-choice category but are served as a bowl on
// their own, so a naan-or-rice pick is meaningless. Keyed by the menu-item
// half of the pid (not the display name) so renaming the dish on the menu
// can't silently switch the picker back on.
const NO_SIDE_CHOICE_ITEMS = new Set(["goat-haleem"]);

// Maps each item row to the subhead text it currently sits under, per
// category (subheads reset per category and only items — not the subhead
// rows themselves — are keyed).
function buildSubheadMap(data) {
  const map = new Map();
  for (const c of data.categories) {
    let cur = "";
    for (const r of paneRows(data, c.code)) {
      if (r.kind === "subhead") cur = r.name;
      else map.set(r, cur);
    }
  }
  return map;
}

function offersSideChoice(r, subheadMap) {
  if (NO_SIDE_CHOICE_ITEMS.has(String(r.pid || "").split("|")[0])) return false;
  if (SIDE_CHOICE_CATS.has(r.category)) return true;
  return SIDE_CHOICE_SUBHEADS.has(subheadMap.get(r) || "");
}

// ── Catering trays ──────────────────────────────────────────────────
// The catering category stores one row per pan size (pid `cat-<dish>|half`
// and `|full`) so each size can be priced and toggled independently, but a
// guest should see ONE line per dish with a Half/Full picker. Rows are
// paired on the dish half of the pid; a dish sold in only one size (Fruit
// Custard) simply yields a one-entry picker rather than a missing option.
const TRAY_CAT = "ctg";
const TRAY_LABELS = { half: "Half Tray", full: "Full Tray" };

function trayGroups(rows) {
  const groups = [];
  const byDish = new Map();
  for (const r of rows) {
    if (r.kind !== "item" || !r.pid) continue;
    const [dish, portion] = String(r.pid).split("|");
    if (!TRAY_LABELS[portion]) continue;
    let g = byDish.get(dish);
    if (!g) {
      g = { dish, lead: r, sizes: [] };
      byDish.set(dish, g);
      groups.push(g);
    }
    g.sizes.push({ label: TRAY_LABELS[portion], pid: r.pid, price: r.price });
  }
  // Half before Full regardless of row order.
  const order = ["Half Tray", "Full Tray"];
  for (const g of groups) g.sizes.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return groups;
}

// web_menu_items.name is UNIQUE, so a tray row is named "<Dish> Half Tray"
// and the dish name lives in `display`. The cart, PID_MAP and the kitchen
// ticket all key off data-name, which therefore has to be both unique across
// the menu and readable — "Chana Masala (Catering)" distinguishes the tray
// from the à la carte dish of the same name.
export function trayDataName(r) {
  return `${r.display || r.name} (Catering)`;
}

function renderTrayLine(g, catLabel) {
  const r = g.lead;
  const dn = escAttr(trayDataName(r));
  const label = String(r.display || r.name).trim();
  const sizes = {};
  for (const s of g.sizes) sizes[s.label] = fmt2(s.price);
  const from = fmt2(Math.min(...g.sizes.map((s) => s.price)));
  let min = escText(label);
  if (r.note) min += ` <span class="mnote">${escText(r.note)}</span>`;
  const sizesAttr = ` data-sizes='${JSON.stringify(sizes).replace(/'/g, "&#39;")}'`;
  const imageAttr = r.image_url ? ` data-image="${escAttr(r.image_url)}"` : "";
  // Catering trays carry pids of their own (cat-*) that the app's menu has no
  // row for, so no dietary claim can be verified for them — and none is made.
  const spoken = [label, r.note, "from " + from, "choose Half or Full Tray"]
    .filter(Boolean).join(", ");
  return `    <div class="mi" role="button" tabindex="0" aria-label="${escAttr(spoken)}" ` +
    `data-name="${dn}" data-label="${escAttr(label)}" data-price="${escAttr(from)}" ` +
    `data-cat="${escAttr(catLabel || "")}" ` +
    `data-desc=""${sizesAttr}${imageAttr} onclick="openItemModal(this)" ` +
    `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openItemModal(this);}">` +
    renderThumb(r.image_url, label) +
    `<div class="mib"><div class="min">${min}</div>` +
    `<span class="mi-add" aria-hidden="true">+</span>` +
    `</div><div class="mprice">${escText(from)}</div></div>`;
}

// data-name is IDENTITY — it keys PID_MAP, the cart and the kitchen ticket, and
// web_menu_items.name is unique so some rows carry a badge word inside it
// ("Zafrani Mutton Signature"). data-label is what a guest should ever READ, so
// the modal, the cart line and the order sent to the kitchen say "Zafrani
// Mutton" while the lookup key stays untouched.
function itemLabel(r) {
  return String(r.display || r.name).trim();
}

function renderItemLine(r, offersSides, catLabel, group) {
  const dn = escAttr(r.name);
  const label = itemLabel(r);
  const price = fmt2(r.price);
  const desc = r.description || "";
  const veg = isVerifiedVegetarian(r);
  let min = escText(label);
  if (r.note) min += ` <span class="mnote">${escText(r.note)}</span>`;
  if (r.badge) {
    const cls = r.badge === "Check Avail." ? "mbadge av" : "mbadge";
    min += ` <span class="${cls}">${escText(r.badge)}</span>`;
  }
  if (veg) min += ` ${VEG_MARK}`;
  const schedLabel = scheduleLabel(r.schedule);
  if (schedLabel) min += ` <span class="mnote">${escText(schedLabel)}</span>`;
  const schedAttr = r.schedule
    ? ` data-schedule='${JSON.stringify(r.schedule).replace(/'/g, "&#39;")}' data-schedule-label="${escAttr(schedLabel)}"`
    : "";
  const sizesAttr = offersSides
    ? ` data-sizes='${JSON.stringify({ Naan: price, Rice: price })}'`
    : "";
  const imageAttr = r.image_url ? ` data-image="${escAttr(r.image_url)}"` : "";
  const mdesc = desc ? `<div class="mdesc">${escText(desc)}</div>` : "";
  // Rows under a subhead are labelled by portion alone — "Regular", "Family
  // Pack" — and mean nothing without the dish above them. Carry the subhead so
  // search can match "goat biryani" and a screen reader says which biryani.
  const grp = (group || "").trim();
  // The whole row is the control. Spoken once, with everything that decides an
  // order: what it is, what it costs, and whether it is vegetarian.
  const spoken = [grp, label, r.note, price, veg ? "Vegetarian" : "", r.badge]
    .filter(Boolean).join(", ");
  return `    <div class="mi" role="button" tabindex="0" aria-label="${escAttr(spoken)}" ` +
    `data-name="${dn}" data-label="${escAttr(label)}" data-price="${escAttr(price)}" ` +
    `data-cat="${escAttr(catLabel || "")}"${grp ? ` data-group="${escAttr(grp)}"` : ""}` +
    `${veg ? ' data-veg="1"' : ""} ` +
    `data-desc="${escAttr(desc)}"${schedAttr}${sizesAttr}${imageAttr} onclick="openItemModal(this)" ` +
    `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openItemModal(this);}">` +
    renderThumb(r.image_url, label) +
    `<div class="mib"><div class="min">${min}</div>` +
    mdesc +
    `<span class="mi-add" aria-hidden="true">+</span>` +
    `</div><div class="mprice">${escText(price)}</div></div>`;
}

export function renderMenuSection(data) {
  const cats = visibleCategories(data);
  const subheadMap = buildSubheadMap(data);
  const out = [];
  // A tablist, so "which category am I in" reaches a screen reader instead of
  // living only in the gold underline. aria-selected is kept in step by the tab
  // click handler in index.html.
  out.push(`  <div class="menu-tabs rv" id="mtabs" role="tablist" aria-label="Menu categories">`);
  cats.forEach((c, i) => {
    const sel = i === 0;
    out.push(`    <button class="mtab${sel ? " active" : ""}" role="tab" id="mtab-${escAttr(c.code)}" ` +
      `aria-selected="${sel}" aria-controls="p-${escAttr(c.code)}" tabindex="${sel ? "0" : "-1"}" ` +
      `data-t="${escAttr(c.code)}">${escText(c.label)}</button>`);
  });
  out.push(`  </div>`);
  cats.forEach((c, ci) => {
    out.push(`  <div class="mpane${ci === 0 ? " active" : ""}" id="p-${escAttr(c.code)}" ` +
      `role="tabpanel" aria-labelledby="mtab-${escAttr(c.code)}"><div class="mlist">`);
    if (c.note) out.push(`    <div class="msecnote">${escText(c.note)}</div>`);
    let first = true;
    const isTray = c.code === TRAY_CAT;
    // Trays are emitted one line per dish, so buffer each subhead's item rows
    // and flush them paired instead of rendering row-by-row.
    let pending = [];
    const flush = () => {
      if (!pending.length) return;
      for (const g of trayGroups(pending)) out.push(renderTrayLine(g, c.label));
      pending = [];
    };
    for (const r of paneRows(data, c.code)) {
      if (r.kind === "subhead") {
        flush();
        // `display` wins: catering subheads carry a suffixed `name` purely to
        // satisfy the UNIQUE constraint on web_menu_items.name.
        const sh = escText(r.display || r.name);
        let line = first
          ? `    <div class="msubhead">${sh}</div>`
          : `    <div class="msubhead" style="margin-top:24px;">${sh}</div>`;
        if (r.note) line += `<div class="msubnote">${escText(r.note)}</div>`;
        out.push(line);
      } else if (isTray) {
        pending.push(r);
      } else {
        out.push(renderItemLine(r, offersSideChoice(r, subheadMap), c.label, subheadMap.get(r)));
      }
      first = false;
    }
    flush();
    out.push(`  </div></div>`);
  });
  return out.join("\n");
}

// Cards: resolve display price from item rows by pid (single edit point).
function priceByPid(data) {
  const m = {};
  for (const r of data.items) if (r.pid && r.price != null) m[r.pid] = Number(r.price);
  return m;
}
function availByPid(data) {
  const m = {};
  for (const r of data.items) if (r.pid) m[r.pid] = !!r.available;
  return m;
}
export function cardPricing(card, data) {
  const prices = priceByPid(data);
  const avail = availByPid(data);
  if (card.sizes && card.sizes.length) {
    const sizes = {};
    let min = null, anyAvail = false;
    for (const s of card.sizes) {
      const p = prices[s.pid];
      if (p == null) continue;
      sizes[s.label] = fmtShort(p);
      if (avail[s.pid]) anyAvail = true;
      if (min == null || p < min) min = p;
    }
    return { display: "From " + fmtShort(min), sizes, available: anyAvail, minPrice: min };
  }
  const p = prices[card.pid];
  return { display: p == null ? "" : fmtShort(p), sizes: null,
           available: !!avail[card.pid], minPrice: p };
}

export function renderSplash(data) {
  const out = [`<div class="sb-pr-list">`];
  for (const card of [...data.cards].sort((a, b) => a.sort - b.sort)) {
    if (!card.splash_name) continue;
    const pr = cardPricing(card, data);
    if (!pr.available || pr.minPrice == null) continue;
    const disp = card.sizes && card.sizes.length ? "From " + fmtShort(pr.minPrice) : fmtShort(pr.minPrice);
    out.push(`<div class="sb-pr-item"><span class="sb-pr-name">${escText(card.splash_name)}</span><span class="sb-pr-price">${escText(disp)}</span></div>`);
  }
  out.push(`</div>`);
  return out.join("\n");
}

export function renderPidMap(data) {
  const map = {};
  for (const card of [...data.cards].sort((a, b) => a.sort - b.sort)) {
    if (card.sizes && card.sizes.length) {
      const e = {};
      for (const s of card.sizes) e[s.label] = s.pid;
      map[card.name] = e;
    } else if (card.pid) {
      map[card.name] = { "": card.pid };
    }
  }
  const subheadMap = buildSubheadMap(data);
  // Catering trays first: the paired menu line offers Half/Full Tray, so the
  // map has to key those exact labels back to their per-size pids.
  for (const g of trayGroups(data.items.filter((r) => r.category === TRAY_CAT))) {
    const dn = trayDataName(g.lead);
    if (dn in map) continue;
    const e = {};
    for (const s of g.sizes) e[s.label] = s.pid;
    map[dn] = e;
  }
  for (const r of data.items) {
    if (r.kind !== "item" || !r.pid || HIDDEN_CATS.has(r.category)) continue;
    // Trays were paired above; their raw per-size rows must not also land in
    // the map under "<Dish> Half Tray", which no rendered line can produce.
    if (r.category === TRAY_CAT) continue;
    const dn = itemDataName(r);
    if (dn in map) continue;
    map[dn] = offersSideChoice(r, subheadMap)
      ? { Naan: r.pid, Rice: r.pid }
      : { "": r.pid };
  }
  return "var PID_MAP=" + JSON.stringify(map) + ";";
}

export function renderSchemaMenu(data) {
  const cats = visibleCategories(data);
  const sections = [];
  for (const c of cats) {
    const items = paneRows(data, c.code).filter((r) => r.kind === "item");
    if (!items.length) continue;
    // Schema names: display name + portion note, but no badge words
    // ("Popular", "Signature") — those are site UI, not the dish name.
    const mi = items.map((r) => [
      `        {`,
      `          "@type": "MenuItem",`,
      `          "name": ${JSON.stringify([r.display || r.name, r.note].filter(Boolean).join(" "))},`,
      `          "description": ${JSON.stringify(r.description || "")},`,
      `          "suitableForDiet": "https://schema.org/HalalDiet",`,
      `          "offers": {"@type":"Offer","price":${JSON.stringify(schemaPrice(r.price))},"priceCurrency":"USD"}`,
      `        }`,
    ].join("\n")).join(",\n");
    sections.push([
      `    {`,
      `      "@type": "MenuSection",`,
      `      "name": ${JSON.stringify(c.label)},`,
      `      "hasMenuItem": [`,
      mi,
      `      ]`,
      `    }`,
    ].join("\n"));
  }
  return `"hasMenuSection": [\n${sections.join(",\n")}\n  ]`;
}

function spliceMarked(html, marker, replacement) {
  const start = `<!-- GEN:${marker} START -->`;
  const end = `<!-- GEN:${marker} END -->`;
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < 0 || j < i) throw new Error(`marker ${marker} not found`);
  return html.slice(0, i + start.length) + "\n" + replacement + "\n" + html.slice(j);
}

function spliceSchema(html, replacement) {
  const key = `"hasMenuSection": [`;
  const i = html.indexOf(key);
  if (i < 0) throw new Error("hasMenuSection not found");
  let depth = 0, j = i + key.length - 1;
  for (; j < html.length; j++) {
    if (html[j] === "[") depth++;
    else if (html[j] === "]") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error("hasMenuSection bracket scan failed");
  return html.slice(0, i) + replacement + html.slice(j + 1);
}

function splicePidMap(html, replacement) {
  const re = /var PID_MAP=\{[\s\S]*?\};/;
  if (!re.test(html)) throw new Error("PID_MAP not found");
  return html.replace(re, replacement);
}

function patchCards(html, data) {
  const secStart = html.indexOf('<section id="bestsellers">');
  const secEnd = html.indexOf("</section>", secStart);
  if (secStart < 0 || secEnd < 0) throw new Error("bestsellers section not found");
  let sec = html.slice(secStart, secEnd);
  for (const card of data.cards) {
    const pr = cardPricing(card, data);
    const nameEsc = escAttr(card.name);
    const openTagRe = new RegExp(
      `<div class="bsl-card" data-name="${nameEsc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
    const m = sec.match(openTagRe);
    if (!m) throw new Error(`bestseller card not found: ${card.name}`);
    let tag = `<div class="bsl-card" data-name="${nameEsc}" data-price="${escAttr(pr.display)}" ` +
      `data-desc="${escAttr(card.description || "")}" data-cat="${escAttr(card.cat_label || "")}"`;
    if (pr.sizes) tag += ` data-sizes='${JSON.stringify(pr.sizes)}'`;
    if (!pr.available) tag += ` style="display:none;"`;
    tag += `>`;
    const cardStart = sec.indexOf(m[0]);
    const nextCard = sec.indexOf('<div class="bsl-card"', cardStart + 10);
    const cardEnd = nextCard < 0 ? sec.length : nextCard;
    let block = sec.slice(cardStart, cardEnd).replace(openTagRe, tag);
    block = block.replace(/<span class="bsl-price">[^<]*<\/span>/,
      `<span class="bsl-price">${escText(pr.display)}</span>`);
    block = block.replace(/<p class="bsl-desc">[^<]*<\/p>/,
      `<p class="bsl-desc">${escText(card.description || "")}</p>`);
    sec = sec.slice(0, cardStart) + block + sec.slice(cardEnd);
  }
  return html.slice(0, secStart) + sec + html.slice(secEnd);
}

export function renderAll(html, data) {
  let out = html;
  out = spliceMarked(out, "MENU", renderMenuSection(data));
  out = spliceMarked(out, "SPLASH", renderSplash(data));
  out = splicePidMap(out, renderPidMap(data));
  out = spliceSchema(out, renderSchemaMenu(data));
  out = patchCards(out, data);
  return out;
}

// Fetch menu data from Supabase REST (anon read). Works in Deno and Node 18+.
export async function fetchMenuData(supabaseUrl, apiKey) {
  async function get(path) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`fetch ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }
  const [categories, items, cards] = await Promise.all([
    get("web_menu_categories?select=*&order=sort"),
    get("web_menu_items?select=*&order=sort"),
    get("web_menu_cards?select=*&order=sort"),
  ]);
  for (const r of items) if (r.price != null) r.price = Number(r.price);
  return { categories, items, cards };
}
