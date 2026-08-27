#!/usr/bin/env node
// Regenerates the menu-derived regions of index.html locally, doing exactly what
// the publish-menu edge function does when the owner presses Publish in /kadmin.
//
// Why this exists: those regions are generated, so hand-editing them is a bug
// with a delay on it — the next Publish silently reverts the edit. That already
// happened twice (menu photo alt text, and intrinsic width/height), and neither
// was noticed because nothing compared the two.
//
//   node scripts/render-index.mjs          rewrite index.html
//   node scripts/render-index.mjs --check   fail if index.html is out of date
//
// --check is the guard: it re-renders from the same live data and asserts the
// committed file already matches. Run it before committing anything that
// touches the renderer.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMenuData, renderAll } from '../supabase/functions/_shared/render-menu.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = resolve(repo, 'index.html');
const check = process.argv.includes('--check');

const html = readFileSync(INDEX, 'utf8');

// Both values are already public — they ship inside this very page and are the
// browser's own read-only credentials. Read them from there rather than keeping
// a second copy that can drift.
const url = html.match(/var SB_URL='([^']+)'/)?.[1];
const key = html.match(/var SB_ANON='([^']+)'/)?.[1];
if (!url || !key) throw new Error('index.html: could not find SB_URL / SB_ANON');

const data = await fetchMenuData(url, key);
const out = renderAll(html, data);

if (check) {
  if (out === html) {
    console.log('index.html is up to date with the renderer and the live menu data.');
  } else {
    const a = html.split('\n'), b = out.split('\n');
    const diffs = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(i + 1);
    console.error(`index.html is STALE — ${diffs.length} line(s) differ from what the renderer produces.`);
    console.error(`First differing lines: ${diffs.slice(0, 8).join(', ')}`);
    console.error('Run: node scripts/render-index.mjs');
    process.exit(1);
  }
} else if (out === html) {
  console.log('index.html already up to date — nothing written.');
} else {
  writeFileSync(INDEX, out);
  console.log(`index.html regenerated — ${data.items.length} menu rows, ${data.categories.length} categories.`);
}
