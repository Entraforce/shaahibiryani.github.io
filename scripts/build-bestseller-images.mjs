#!/usr/bin/env node
// WebP versions of the homepage bestseller-carousel photos (assets/dishes/).
//
// Why: the carousel showed ten full-size JPEGs (82–290 KB, up to 1320×1918)
// as 190px-tall card backgrounds, ~2 MB in all. These are the SAME
// photographs, resized to 800px wide — the width of the carousel's other five
// photos (assets/sb-bestseller-*.webp) — and re-encoded. No cropping, no
// retouching, no new imagery. The JPEGs stay where they are.
//
//   node scripts/build-bestseller-images.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(repo, 'assets/dishes');
const WIDTH = 800;
const QUALITY = 80;

let before = 0, after = 0;
for (const f of readdirSync(DIR).sort()) {
  if (!/\.jpe?g$/i.test(f)) continue;
  const src = resolve(DIR, f);
  const out = resolve(DIR, `${basename(f, extname(f))}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-sharp_yuv', '-resize', String(WIDTH), '0', src, '-o', out]);
  before += statSync(src).size; after += statSync(out).size;
  console.log(`${f.padEnd(30)} ${(statSync(src).size / 1024).toFixed(0).padStart(4)} KB → ${(statSync(out).size / 1024).toFixed(0).padStart(3)} KB`);
}
console.log(`total ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`);
