#!/usr/bin/env node
// Turns closed catering deals into a Google Ads offline-conversion-import
// CSV — the "upload this is where the largest untracked money is" item from
// the Oct 2026 Ads audit. No Google Ads API access needed: this produces a
// file in the exact format Google Ads' own UI accepts at
// Tools & Settings > Conversions > Uploads > "+ Upload" (choose "Clicks").
//
// Prerequisite: a catering_leads row only produces a CSV line once staff has
// marked it won with a real value — today that's a manual step in the
// Supabase Table Editor (table catering_leads, set status='won' and
// closed_value_cents in cents, e.g. 45000 for $450.00). There is no admin UI
// for this yet.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-offline-conversions.mjs --conversion-name "Catering Order"
//
// The service role key is never accepted as a CLI argument (it would land in
// shell history) — set it as an environment variable each time, or export it
// once in your own shell profile.
//
// --conversion-name must exactly match the name of a Conversion Action you
// create once in Google Ads (Tools & Settings > Conversions > + > Import >
// "Other data sources or CRMs" > "Track conversions from clicks"), BEFORE
// the first upload — Google Ads offline import matches by this name.
//
// Output: private-data/offline-conversions/offline-conversions-<ts>.csv
// (gitignored — this file has names, phone numbers and click ids in it).
// Rows actually written are then marked exported_at so running this again
// later never re-uploads the same conversion twice.
//
// KNOWN LIMITATION: catering_leads.attribution.last.click is whichever of
// gclid / gbraid / wbraid the landing URL had (see the capture logic in
// index.html / scripts/add-catering-lead-tracking.mjs) — the three are
// merged into one field, so this script cannot tell which kind it is and
// writes all of them into the "Google Click ID" column. That column is
// correct for an ordinary gclid; a gbraid/wbraid click (iOS, app-to-web)
// would need separate "GBRAID"/"WBRAID" columns to import correctly. Until
// the capture logic is split to record which parameter matched, treat any
// upload as gclid-only and expect iOS app-to-web conversions to undercount.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wtdthjhqgsbnyjucdqxl.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const conversionName = arg('--conversion-name');
const currency = arg('--currency') || 'USD';

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Set it as an environment variable (never as a CLI argument) and try again.');
  process.exit(1);
}
if (!conversionName) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-offline-conversions.mjs --conversion-name "Catering Order"');
  console.error('--conversion-name must exactly match a Conversion Action already created in Google Ads.');
  process.exit(1);
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Google Ads wants "yyyy-mm-dd hh:mm:ss+|-hh:mm". UTC sidesteps DST bugs —
// Google Ads accepts any valid offset, it doesn't have to be local time.
function conversionTime(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

async function main() {
  const query = new URLSearchParams({
    status: 'eq.won',
    exported_at: 'is.null',
    select: 'id,name,closed_value_cents,closed_at,created_at,attribution',
    order: 'closed_at.asc',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/catering_leads?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    console.error(`Supabase query failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const leads = await res.json();

  if (leads.length === 0) {
    console.log("No un-exported 'won' catering leads found. Nothing to do.");
    return;
  }

  const rows = [];
  const skippedNoClickId = [];
  const skippedBadValue = [];

  for (const lead of leads) {
    const click = lead.attribution?.last?.click;
    if (!click) { skippedNoClickId.push(lead); continue; }
    if (lead.closed_value_cents == null || lead.closed_value_cents < 0) { skippedBadValue.push(lead); continue; }

    rows.push({
      'Google Click ID': click,
      'Conversion Name': conversionName,
      'Conversion Time': conversionTime(lead.closed_at || lead.created_at),
      'Conversion Value': (lead.closed_value_cents / 100).toFixed(2),
      'Conversion Currency Code': currency,
      _id: lead.id,
    });
  }

  if (skippedNoClickId.length) {
    console.log(`Skipped ${skippedNoClickId.length} won lead(s) with no stored click id (untracked — organic/direct/phone-only, nothing to upload): ${skippedNoClickId.map((l) => l.name).join(', ')}`);
  }
  if (skippedBadValue.length) {
    console.log(`Skipped ${skippedBadValue.length} won lead(s) missing closed_value_cents — set it in the Supabase Table Editor first: ${skippedBadValue.map((l) => l.name).join(', ')}`);
  }
  if (rows.length === 0) {
    console.log('Nothing exportable this run.');
    return;
  }

  const outDir = resolve(repo, 'private-data', 'offline-conversions');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = conversionTime(new Date().toISOString()).replace(/[: ]/g, '-');
  const outFile = resolve(outDir, `offline-conversions-${stamp}.csv`);

  const columns = ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency Code'];
  const csv = [columns.join(',')]
    .concat(rows.map((r) => columns.map((c) => csvField(r[c])).join(',')))
    .join('\r\n');
  writeFileSync(outFile, csv);
  console.log(`Wrote ${rows.length} conversion(s) to ${outFile}`);
  console.log('Upload it at: Google Ads > Tools & Settings > Conversions > Uploads > + Upload > Clicks.');

  // Mark these rows exported so a re-run never double-uploads them.
  const ids = rows.map((r) => r._id);
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/catering_leads?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ exported_at: new Date().toISOString() }),
  });
  if (!patchRes.ok) {
    console.error(`WARNING: wrote the CSV but failed to mark rows exported (${patchRes.status} ${await patchRes.text()}) — re-running this script will re-export the same ${ids.length} conversion(s). Mark exported_at manually in the Table Editor before re-running.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('export-offline-conversions failed:', e);
  process.exit(1);
});
