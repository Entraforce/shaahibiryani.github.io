#!/usr/bin/env node
// Generates the QR code for every table, plus a sheet to print them from.
//
//   node scripts/build-table-qr.mjs
//
// The codes are how a guest gets into dine-in ordering: scanning the one on
// their table tells the app which table they are at, and the app then checks
// the device's location to confirm they really are in the restaurant before
// letting them order to it. See lib/dine-in-access.ts in shaahi-biryani-app.
//
// WHY A SCRIPT AND NOT FOURTEEN IMAGES SOMEONE MADE ONCE. The website's other
// QR (assets/menu-qr.png) was produced by hand in some web tool and left no
// way to remake it — so if the URL behind it ever changes, nobody can tell
// what it points at without scanning it, and regenerating means redoing the
// work from memory. These are reproducible: the URL lives here, in one line,
// and the codes are rebuilt from it.
//
// ERROR CORRECTION IS 'H' on purpose — the highest level, ~30% recoverable.
// These sit on restaurant tables and will be smudged with ghee, scratched by
// plates and splashed with chai. A code that stops working is a guest who
// cannot order.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(repo, 'assets/table-qr');

// All fourteen tables on the floor plan (dining_tables migration).
const MIN_TABLE = 1;
const MAX_TABLE = 14;

/**
 * Points at the website, NOT at shaahibiryaniapp:// directly.
 *
 * A custom scheme does nothing at all on a phone without the app installed —
 * the camera simply shrugs, and a guest sitting at a table with a dead code is
 * the one outcome worth designing against. table.html always opens, hands the
 * app its table when the app is there, and offers to install it when it is not.
 */
const urlFor = (n) => `https://shaahibiryanidfw.com/table.html?t=${n}`;

mkdirSync(OUT, { recursive: true });

const tables = [];
for (let n = MIN_TABLE; n <= MAX_TABLE; n++) {
  const file = resolve(OUT, `table-${n}.svg`);
  execFileSync('npx', ['-y', 'qrcode', '-e', 'H', '-t', 'svg', '-o', file, urlFor(n)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  tables.push({ n, file: `table-${n}.svg`, url: urlFor(n) });
}

// A sheet the owner can open and print. One code per table, each labelled, cut
// lines left to the scissors — a tent card is a job for a printer, not for us.
const sheet = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Table QR codes · Shaahi Biryani</title>
<style>
  @page { size: letter; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  .note { font-size: 9.5pt; color: #555; margin: 0 0 14pt; max-width: 155mm; line-height: 1.5; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10mm; }
  .cell { border: 1px dashed #bbb; border-radius: 3mm; padding: 6mm 4mm; text-align: center; break-inside: avoid; }
  .cell img { width: 42mm; height: 42mm; display: block; margin: 0 auto 3mm; }
  .t { font-size: 15pt; font-weight: 800; letter-spacing: .02em; }
  .s { font-size: 8pt; color: #666; margin-top: 1mm; }
  @media print { .note { display: none; } }
</style>
</head>
<body>
  <h1>Scan to order · Table codes</h1>
  <p class="note">
    Print, cut along the dashed lines and put each code on its own table &mdash; the number on
    the card must match the table it sits on, or orders reach the wrong table. Codes work only
    inside the restaurant: the app checks the guest&rsquo;s location before letting them order
    to a table. Regenerate with <code>node scripts/build-table-qr.mjs</code>.
  </p>
  <div class="grid">
${tables
  .map(
    (t) => `    <div class="cell">
      <img src="${t.file}" alt="QR code for table ${t.n}" />
      <div class="t">Table ${t.n}</div>
      <div class="s">Scan to order from your seat</div>
    </div>`,
  )
  .join('\n')}
  </div>
</body>
</html>
`;
writeFileSync(resolve(OUT, 'print-sheet.html'), sheet);

console.log(`table QR codes — ${tables.length} SVGs + print-sheet.html in assets/table-qr/`);
console.log(`each points at ${urlFor('<n>')}`);
