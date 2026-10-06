#!/usr/bin/env node
// Swaps the call-click-tracking placeholder label for the real one, everywhere
// at once, once the Conversion Action exists in Google Ads.
//
// Create it first: Google Ads > Tools & Settings > Conversions > + >
// Phone calls > "Clicks on a phone number on your website" > Account
// AW-17075652554. Ads will show you the full "AW-17075652554/XXXXXXXXXX"
// value on the summary page.
//
//   node scripts/set-call-conversion-label.mjs AW-17075652554/XXXXXXXXXX
//
// Safe to run more than once — it's a plain string replace, so re-running
// with the same label is a no-op, and running with a new label later (e.g.
// the conversion action gets recreated) just swaps it again everywhere.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLACEHOLDER_LABEL, targetFiles } from './add-call-tracking.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2];

if (!label || !/^AW-\d+\/[A-Za-z0-9_-]+$/.test(label)) {
  console.error('Usage: node scripts/set-call-conversion-label.mjs AW-17075652554/XXXXXXXXXX');
  console.error(`Got: ${label ?? '(nothing)'}`);
  process.exit(1);
}

let changedFiles = 0;
let totalReplacements = 0;

for (const file of targetFiles()) {
  const path = resolve(repo, file);
  const html = readFileSync(path, 'utf8');
  const count = html.split(PLACEHOLDER_LABEL).length - 1;
  if (count === 0) continue;
  writeFileSync(path, html.split(PLACEHOLDER_LABEL).join(label));
  changedFiles++;
  totalReplacements += count;
}

if (totalReplacements === 0) {
  console.log('No placeholder occurrences found — already swapped, or add-call-tracking.mjs has not been run.');
} else {
  console.log(`Replaced ${totalReplacements} occurrence(s) of the placeholder across ${changedFiles} file(s) with ${label}.`);
}
