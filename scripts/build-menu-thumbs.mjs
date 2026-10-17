#!/usr/bin/env node
// Small WebP derivatives of the menu photographs, for the homepage's category
// rail (shown ~72px) and Signature cards (shown ≤ 320px wide).
//
// Why: assets/menu-photos are full-size JPEGs, 150–300 KB each. Showing twelve
// of them as 72px circles would make the homepage megabytes heavier to draw a
// row of thumbnails. These are the SAME photographs, resized and re-encoded —
// no cropping, no retouching, no new imagery.
//
//   -240.webp  category rail   (72px at DPR 3 = 216px)
//   -640.webp  Signature cards (≤ 320px at DPR 2)
//
// The page derives the thumbnail path from a menu row's own photo URL, and
// falls back to that original photo if a derivative is missing — so a dish
// photo added later in /kadmin still shows, just at full weight, until this is
// re-run.
//
//   node scripts/build-menu-thumbs.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(repo, 'assets/menu-photos');
const OUT = resolve(repo, 'assets/menu-thumbs');
const SIZES = [240, 640];
const QUALITY = 78;

mkdirSync(OUT, { recursive: true });
let n = 0, before = 0, after = 0;
for (const f of readdirSync(SRC).sort()) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
  const src = resolve(SRC, f);
  const stem = basename(f, extname(f));
  for (const w of SIZES) {
    const out = resolve(OUT, `${stem}-${w}.webp`);
    // -resize W 0 keeps the aspect ratio; never upscale a small source.
    execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-sharp_yuv', '-resize', String(w), '0', src, '-o', out]);
    after += statSync(out).size;
  }
  before += statSync(src).size;
  n++;
}
if (!existsSync(OUT)) throw new Error('no output');
console.log(`${n} photos → ${n * SIZES.length} derivatives in assets/menu-thumbs/ ` +
  `(${(after / 1024).toFixed(0)} KB total; originals ${(before / 1024).toFixed(0)} KB)`);
