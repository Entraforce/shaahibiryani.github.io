#!/usr/bin/env node
// Phase 2 enterprise SEO: structured data / knowledge graph audit.
// Read-only — extracts every JSON-LD block from every HTML page, parses it,
// and reports @type inventory, @id consistency, and Restaurant field
// completeness. Writes nothing to the site.
import { readFileSync, readdirSync } from 'node:fs';

const files = readdirSync('.').filter((f) => f.endsWith('.html')).sort();

const RESTAURANT_FIELDS = [
  'name', 'url', 'logo', 'image', 'telephone', 'address', 'geo',
  'openingHoursSpecification', 'servesCuisine', 'menu',
  'acceptsReservations', 'priceRange', 'sameAs', 'hasMap', '@id',
];

function extractLdJsonBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  return blocks;
}

function collectTypes(node, acc) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, acc));
    return;
  }
  if (node && typeof node === 'object') {
    if (node['@type']) {
      const t = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      t.forEach((x) => acc.add(x));
    }
    for (const k of Object.keys(node)) {
      if (k === '@type') continue;
      collectTypes(node[k], acc);
    }
  }
}

function findRestaurantNodes(node, acc) {
  if (Array.isArray(node)) {
    node.forEach((n) => findRestaurantNodes(n, acc));
    return;
  }
  if (node && typeof node === 'object') {
    const t = node['@type'];
    const types = Array.isArray(t) ? t : [t];
    if (types.includes('Restaurant') || types.includes('LocalBusiness')) {
      acc.push(node);
    }
    for (const k of Object.keys(node)) {
      findRestaurantNodes(node[k], acc);
    }
  }
}

const report = [];

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const blocks = extractLdJsonBlocks(html);
  const entry = { file, blockCount: blocks.length, parseErrors: [], types: [], restaurantNodes: [] };

  for (const [i, raw] of blocks.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      entry.parseErrors.push({ blockIndex: i, error: e.message });
      continue;
    }
    const typeSet = new Set();
    collectTypes(parsed, typeSet);
    entry.types.push(...typeSet);

    const restNodes = [];
    findRestaurantNodes(parsed, restNodes);
    for (const node of restNodes) {
      const present = RESTAURANT_FIELDS.filter((f) => node[f] !== undefined);
      const missing = RESTAURANT_FIELDS.filter((f) => node[f] === undefined);
      entry.restaurantNodes.push({
        id: node['@id'] || null,
        name: node.name || null,
        geo: node.geo || null,
        present,
        missing,
      });
    }
  }
  entry.types = [...new Set(entry.types)];
  report.push(entry);
}

console.log(JSON.stringify(report, null, 2));
