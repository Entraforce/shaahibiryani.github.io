#!/usr/bin/env node
// Encodes the hero photographs to WebP from the original masters.
//
// The homepage shipped ~8.9 MB of hero photography because four of the five
// slides were saved as PNG — a lossless format, for photographs. At 1448×1086
// each was ~2.2 MB; the one slide that happened to be a JPEG was 0.17 MB for the
// same pixel count. Nothing was wrong with the photographs; the container was.
//
// NO RESIZING. Counter-intuitively the masters are already too SMALL, not too
// large: the hero is `background-size:cover` in a portrait viewport, so a phone
// crops the width and scales by height — a 390×844 screen at DPR 3 needs 2532
// device pixels of height from an 1086px-tall source, a 2.3× upscale. Serving a
// downscaled "mobile" derivative would make the phone hero look worse than the
// desktop one. So this converts format only, at native resolution.
//
// Quality 82 with -sharp_yuv: chosen by comparing 72/78/82/88 on a real slide.
// The hero also sits under three stacked dark overlays (up to 97% at the edges),
// so artefacts are far less visible here than on an unobstructed photo — but the
// quality is set for the photograph, not for the overlay.
//
//   node scripts/build-hero-images.mjs
// Masters stay in the repo so this can be re-run at a different quality.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY = 82;

// master → published slide, in slideshow order.
export const HERO_SLIDES = [
  ['2C5D89A2-5C7A-483A-B9AF-7C3814DB5DBE.PNG', 'assets/hero-01.webp'],
  ['A4F5F127-8CDE-4458-BB83-BBCF6F2A63D6.PNG', 'assets/hero-02.webp'],
  ['PHOTO-2026-07-08-18-39-53 3.jpeg',         'assets/hero-03.webp'],
  ['D1E486FC-2DC5-44D8-A0D0-BC6E0E6256E5.PNG', 'assets/hero-04.webp'],
  ['2386FC84-CB53-432B-8358-97187E76A26B.PNG', 'assets/hero-05.webp'],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let before = 0, after = 0;
  for (const [master, out] of HERO_SLIDES) {
    const src = resolve(repo, master);
    if (!existsSync(src)) throw new Error(`master missing: ${master} — it is the only source for ${out}`);
    execFileSync('cwebp', ['-q', String(QUALITY), '-m', '6', '-sharp_yuv',
      '-metadata', 'none', src, '-o', resolve(repo, out)], { stdio: 'ignore' });
    const b = statSync(src).size, a = statSync(resolve(repo, out)).size;
    before += b; after += a;
    console.log(`${out.padEnd(22)} ${(b / 1024).toFixed(0).padStart(6)} KB -> ${(a / 1024).toFixed(0).padStart(5)} KB` +
      `  (${(100 - (a / b) * 100).toFixed(1)}% smaller)`);
  }
  console.log(`\ntotal hero: ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB ` +
    `(${(100 - (after / before) * 100).toFixed(1)}% smaller), quality ${QUALITY}, no resizing`);
}
