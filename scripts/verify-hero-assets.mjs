#!/usr/bin/env node
// Guards the hero performance work.
//
// The homepage shipped ~8.9 MB of hero photography because four of five slides
// were PNGs. They are now WebP, and only the first slide loads eagerly. Both
// properties are easy to undo by accident — someone drops a new photo in as a
// PNG, or re-adds a background to every slide — so they are checked here.
//
//   node scripts/verify-hero-assets.mjs
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERO_SLIDES } from './build-hero-images.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const hero = html.slice(html.indexOf('<section id="hero">'), html.indexOf('<div class="hero-overlay-base">'));
const fail = [];

// 1. No master ever referenced from the page — those are the multi-MB originals.
for (const [master] of HERO_SLIDES) {
  if (html.includes(master)) fail.push(`index.html still references the master "${master}" (${(statSync(resolve(repo, master)).size / 1048576).toFixed(1)} MB)`);
}

// 2. Every slide points at a WebP.
const slides = [...hero.matchAll(/<div class="slide[^"]*"([^>]*)>/g)].map((m) => m[1]);
if (slides.length !== HERO_SLIDES.length) fail.push(`expected ${HERO_SLIDES.length} slides, found ${slides.length}`);
for (const [i, attrs] of slides.entries()) {
  const src = (attrs.match(/(?:background-image:url\('|data-bg=")([^'"]+)/) || [])[1];
  if (!src) { fail.push(`slide ${i + 1} has neither a background nor data-bg`); continue; }
  if (!src.endsWith('.webp')) fail.push(`slide ${i + 1} is not WebP: ${src}`);
  const size = statSync(resolve(repo, src)).size;
  if (size > 400 * 1024) fail.push(`${src} is ${(size / 1024).toFixed(0)} KB — hero slides should stay well under 400 KB`);
}

// 3. Only the FIRST slide may load eagerly; the rest must be deferred.
const eager = slides.filter((a) => /background-image:url\(/.test(a)).length;
if (eager !== 1) fail.push(`${eager} slides carry an eager background — only the first should (the other four must use data-bg)`);

const total = slides.map((a) => (a.match(/(?:background-image:url\('|data-bg=")([^'"]+)/) || [])[1])
  .filter(Boolean).reduce((n, f) => { try { return n + statSync(resolve(repo, f)).size; } catch { return n; } }, 0);

if (fail.length) {
  console.error('FAIL  hero asset check:\n  ' + fail.join('\n  '));
  console.error('\n  Re-encode with: node scripts/build-hero-images.mjs');
  process.exit(1);
}
console.log(`hero: ${slides.length} WebP slides totalling ${(total / 1024).toFixed(0)} KB, ` +
  `only the first loads eagerly.`);
