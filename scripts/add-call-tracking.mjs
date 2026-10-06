#!/usr/bin/env node
// Adds phone-click conversion tracking to every page with a tel: link.
//
// Why this exists: the Oct 2026 Ads audit found the catering pages' best CTA
// is the phone number, and Google has no way to know anyone ever clicked it —
// every call-driven order or catering lead is invisible to the account. This
// listens for clicks on any <a href="tel:..."> and fires a Google Ads
// conversion, the same way the catering quote form already does
// (see the gtag('event','conversion',{'send_to':'AW-17075652554/...'}) call
// after a successful quote submission).
//
// The conversion label is a placeholder until the Conversion Action exists in
// Google Ads (Tools > Conversions > + > Phone calls > Clicks on a phone
// number on your website). Once that's created, run:
//   node scripts/set-call-conversion-label.mjs AW-17075652554/XXXXXXXXXX
// to swap the placeholder everywhere in one shot.
//
//   node scripts/add-call-tracking.mjs          insert into every target page
//   node scripts/add-call-tracking.mjs --check  fail if any page is missing it
//
// Deliberately NOT dynamic number insertion (Google swapping the *displayed*
// number per visitor) — this site's phone number must stay identical
// everywhere per CLAUDE.md's NAP-consistency rule, so only the click is
// tracked, never the number itself.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

export const PLACEHOLDER_LABEL = 'AW-17075652554/REPLACE_WITH_CALL_CLICK_LABEL';

export const MARKER_START = '<!-- CALLTRACK:START -->';
export const MARKER_END = '<!-- CALLTRACK:END -->';

export function snippet(label) {
  return `${MARKER_START}
<script>
(function(){
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!a || typeof gtag !== 'function') return;
    gtag('event','conversion',{'send_to':'${label}'});
  });
})();
</script>
${MARKER_END}
`;
}

// Fixed top-level pages known to carry a tel: link, plus every generated city
// page (catering-<city>.html, biryani-<city>.html) — those are flat files
// with no shared include, so each needs its own copy.
export function targetFiles() {
  const fixed = ['index.html', 'hall.html', 'venues.html', 'careers.html', 'reserve.html', 'privacy.html'];
  const cityPages = readdirSync(repo).filter(
    (f) => /^(catering|biryani)-.*\.html$/.test(f),
  );
  return [...fixed, ...cityPages].sort();
}

function main() {
  const files = targetFiles();
  const missing = [];
  const updated = [];
  const alreadyOk = [];

  for (const file of files) {
    const path = resolve(repo, file);
    const html = readFileSync(path, 'utf8');

    if (html.includes(MARKER_START)) {
      alreadyOk.push(file);
      continue;
    }

    if (check) {
      missing.push(file);
      continue;
    }

    const idx = html.lastIndexOf('</body>');
    if (idx === -1) {
      missing.push(`${file} (no </body> found)`);
      continue;
    }
    const out = html.slice(0, idx) + snippet(PLACEHOLDER_LABEL) + html.slice(idx);
    writeFileSync(path, out);
    updated.push(file);
  }

  if (check) {
    if (missing.length === 0) {
      console.log(`Call tracking present on all ${files.length} target pages.`);
      return;
    }
    console.error(`Call tracking MISSING on ${missing.length} page(s): ${missing.join(', ')}`);
    console.error('Run: node scripts/add-call-tracking.mjs');
    process.exit(1);
  }

  if (updated.length) console.log(`Inserted call tracking into ${updated.length} page(s): ${updated.join(', ')}`);
  if (alreadyOk.length) console.log(`Already present on ${alreadyOk.length} page(s) — left unchanged.`);
  if (missing.length) {
    console.error(`FAILED on ${missing.length} page(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Guarded so set-call-conversion-label.mjs can import PLACEHOLDER_LABEL and
// targetFiles() without this file's own main() running as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
