#!/usr/bin/env node
// Phase 1 technical SEO: systematic metadata audit across every HTML page.
// Read-only — reports findings as JSON, writes nothing to the site.
import { readFileSync, readdirSync } from 'node:fs';

const NOINDEX_FILES = new Set(['404.html', 'kadmin.html', 'table.html']);

const files = readdirSync('.').filter((f) => f.endsWith('.html')).sort();

function extract(html, re, group = 1) {
  const m = html.match(re);
  return m ? m[group].trim() : null;
}

function allMatches(html, re) {
  const out = [];
  let m;
  const r = new RegExp(re, 'g');
  while ((m = r.exec(html))) out.push(m[1]);
  return out;
}

const pages = [];

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const title = extract(html, /<title>([^<]*)<\/title>/i);
  const description = extract(
    html,
    /<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i,
    2
  );
  const canonical = extract(
    html,
    /<link\s+rel=["']canonical["']\s+href=(["'])([\s\S]*?)\1/i,
    2
  );
  const robotsMeta = extract(
    html,
    /<meta\s+name=["']robots["']\s+content=(["'])([\s\S]*?)\1/i,
    2
  );
  const viewport = /<meta\s+name=["']viewport["']/i.test(html);
  const ogTitle = extract(
    html,
    /<meta\s+property=["']og:title["']\s+content=(["'])([\s\S]*?)\1/i,
    2
  );
  const ogImage = extract(
    html,
    /<meta\s+property=["']og:image["']\s+content=(["'])([\s\S]*?)\1/i,
    2
  );
  const h1s = allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).map((s) =>
    s.replace(/<[^>]+>/g, '').trim()
  );
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
  const imgTags = allMatches(html, /(<img\s[^>]*>)/i);
  const imgsNoAlt = imgTags.filter((t) => !/\balt=/i.test(t)).length;
  const imgsEmptyAlt = imgTags.filter((t) => /\balt=["']\s*["']/i.test(t)).length;
  const jsonLdCount = (html.match(/<script[^>]+type=["']application\/ld\+json["']/gi) || [])
    .length;

  pages.push({
    file,
    expectedIndexable: !NOINDEX_FILES.has(file),
    title,
    titleLength: title ? title.length : 0,
    description,
    descriptionLength: description ? description.length : 0,
    canonical,
    robotsMeta,
    viewport,
    ogTitle,
    ogImage,
    h1Count: h1s.length,
    h1Text: h1s[0] || null,
    h2Count,
    imgCount: imgTags.length,
    imgsNoAlt,
    imgsEmptyAlt,
    jsonLdCount,
  });
}

// --- Cross-page checks ---
const titleCounts = {};
const descCounts = {};
for (const p of pages) {
  if (p.title) titleCounts[p.title] = (titleCounts[p.title] || 0) + 1;
  if (p.description) descCounts[p.description] = (descCounts[p.description] || 0) + 1;
}
const dupTitles = Object.entries(titleCounts).filter(([, c]) => c > 1);
const dupDescriptions = Object.entries(descCounts).filter(([, c]) => c > 1);

const report = {
  totalPages: pages.length,
  pages,
  dupTitles,
  dupDescriptions,
};

console.log(JSON.stringify(report, null, 2));
