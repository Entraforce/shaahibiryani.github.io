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

const HIDDEN_CATS = new Set(["ctr", "sys"]);

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
function visibleCategories(data) {
  return data.categories
    .filter((c) => !HIDDEN_CATS.has(c.code))
    .sort((a, b) => a.sort - b.sort);
}

// r.name is the stable identity the cart + PID_MAP key on (data-name); the
// visible label is rebuilt from display + note + badge.
export function itemDataName(r) {
  return r.name;
}

function renderItemLine(r) {
  const dn = escAttr(r.name);
  const price = fmt2(r.price);
  const desc = r.description || "";
  let min = escText(r.display || r.name);
  if (r.note) min += ` <span class="mnote">${escText(r.note)}</span>`;
  if (r.badge) {
    const cls = r.badge === "Check Avail." ? "mbadge av" : "mbadge";
    min += ` <span class="${cls}">${escText(r.badge)}</span>`;
  }
  const mdesc = desc ? `<div class="mdesc">${escText(desc)}</div>` : "";
  return `    <div class="mi" data-name="${dn}" data-price="${escAttr(price)}" ` +
    `data-desc="${escAttr(desc)}" onclick="openItemModal(this)">` +
    `<div class="mib"><div class="min">${min}</div>` +
    mdesc +
    `<button class="mi-add" onclick="event.stopPropagation();openItemModal(this.closest('.mi'))">+</button>` +
    `</div><div class="mprice">${escText(price)}</div></div>`;
}

export function renderMenuSection(data) {
  const cats = visibleCategories(data);
  const out = [];
  out.push(`  <div class="menu-tabs rv" id="mtabs">`);
  cats.forEach((c, i) => {
    out.push(`    <button class="mtab${i === 0 ? " active" : ""}" data-t="${escAttr(c.code)}">${escText(c.label)}</button>`);
  });
  out.push(`  </div>`);
  cats.forEach((c, ci) => {
    out.push(`  <div class="mpane${ci === 0 ? " active" : ""}" id="p-${escAttr(c.code)}"><div class="mlist">`);
    if (c.note) out.push(`    <div class="msecnote">${escText(c.note)}</div>`);
    let first = true;
    for (const r of paneRows(data, c.code)) {
      if (r.kind === "subhead") {
        let line = first
          ? `    <div class="msubhead">${escText(r.name)}</div>`
          : `    <div class="msubhead" style="margin-top:24px;">${escText(r.name)}</div>`;
        if (r.note) line += `<div class="msubnote">${escText(r.note)}</div>`;
        out.push(line);
      } else {
        out.push(renderItemLine(r));
      }
      first = false;
    }
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
  for (const r of data.items) {
    if (r.kind !== "item" || !r.pid || HIDDEN_CATS.has(r.category)) continue;
    const dn = itemDataName(r);
    if (!(dn in map)) map[dn] = { "": r.pid };
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
