#!/usr/bin/env node
// Checks this site's customer-facing pickup estimate against the single source
// of truth in the app repo.
//
// The pickup estimate was once hardcoded independently in three places and
// drifted into three different answers — the app said 30-45 minutes, this site
// said 20–30, and Ask Shaahi confidently said 5–10. The owner set the standard
// at 20–30. lib/business-facts.ts in the app repo now owns that number; this
// script fails if the page stops agreeing with it.
//
//   node scripts/verify-business-facts.mjs
//
// Same shape as scripts/build-menu-facts.mjs, which already reads the sibling
// repo for the authoritative menu.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_FACTS = '/Users/osmanmohammed/github/shaahi-biryani-app/lib/business-facts.ts';

let src;
try {
  src = readFileSync(APP_FACTS, 'utf8');
} catch {
  console.error(`SKIP  the app repo is not checked out at ${APP_FACTS}, cannot compare.`);
  process.exit(0);   // a missing sibling repo is not a website failure
}

const num = (name) => {
  const m = src.match(new RegExp(`${name}:\\s*(\\d+)`));
  if (!m) throw new Error(`${APP_FACTS}: could not read ${name}`);
  return Number(m[1]);
};
const range = `${num('minMinutes')}–${num('maxMinutes')}`;

const html = readFileSync(resolve(repo, 'index.html'), 'utf8');

// Any minutes range quoted on the page must be the standard one. Catering lead
// times are stated in hours and days, so they are not caught by this.
const quoted = [...html.matchAll(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*minutes/g)]
  .map((m) => `${m[1]}–${m[2]}`);

const wrong = quoted.filter((q) => q !== range);
if (wrong.length) {
  console.error(`FAIL  page quotes ${[...new Set(wrong)].join(', ')} minutes; the standard is ${range}.`);
  console.error(`      Change lib/business-facts.ts in the app repo, not this page.`);
  process.exit(1);
}
if (!quoted.length) {
  console.error(`FAIL  the page no longer states a pickup estimate at all (expected ${range} minutes).`);
  process.exit(1);
}

// And the wording must be an estimate, not a promise.
const idx = html.indexOf(`${range}</strong>`) !== -1
  ? html.indexOf(`${range}</strong>`) : html.indexOf(`${range} minutes`);
const around = html.slice(Math.max(0, idx - 200), idx + 200);
if (!/typically|about|approx/i.test(around)) {
  console.error(`FAIL  the pickup estimate reads as a promise; it must say "typically" or "about".`);
  process.exit(1);
}

console.log(`pickup estimate on the site is ${range} minutes, phrased as an estimate — matches the app's source of truth.`);
