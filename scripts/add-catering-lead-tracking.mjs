#!/usr/bin/env node
// Wires every catering-<city>.html page to record a structured lead (with
// ad-click attribution) alongside the existing formsubmit.co email, so a
// later "mark this lead won for $X" can be turned into a Google Ads offline
// conversion upload. See supabase/functions/create-catering-lead and
// supabase/migrations/20261006000000_catering_leads.sql.
//
// Two things, both purely additive — the existing formsubmit.co email flow
// is byte-for-byte unchanged:
//
//   1. The SAME click-id/UTM capture index.html already runs (shaahi_attrib
//      in localStorage, 90-day window, consent-gated), copied verbatim so a
//      visitor whose first landing is a catering page still gets attributed.
//   2. A non-blocking fetch() on #caterForm's submit event — fires alongside
//      the real formsubmit.co POST, never preventDefault()s it, so a failure
//      here only costs attribution, never the guest's quote request.
//
//   node scripts/add-catering-lead-tracking.mjs          insert everywhere
//   node scripts/add-catering-lead-tracking.mjs --check  fail if any page lacks it
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const SB_URL = 'https://wtdthjhqgsbnyjucdqxl.supabase.co';
// Publishable anon key — already shipped in index.html's own page source
// (see SB_ANON there); not a secret.
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZHRoamhxZ3NibnlqdWNkcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjcxMzcsImV4cCI6MjA5MjQ0MzEzN30.1WYVcbrulkg0l7QB-scj4KcJCnMwFKSLHXucEdEZV3Q';

const ATTRIB_MARKER_START = '<!-- CATERATTRIB:START -->';
const ATTRIB_MARKER_END = '<!-- CATERATTRIB:END -->';

// Verbatim copy of index.html's attribution-capture IIFE (lines ~49-89 as of
// commit c8c61dd) — same KEY, same logic, so localStorage is shared
// seamlessly across the whole site regardless of which page a visitor lands
// on first.
const attribSnippet = `${ATTRIB_MARKER_START}
<script>
/* WHERE THIS CUSTOMER CAME FROM — remembered until they actually order.
   Copied verbatim from index.html (see that file for the full rationale) so
   a visitor whose first landing is THIS page is still attributed. */
(function(){
  var KEY='shaahi_attrib', WINDOW_DAYS=90;
  function allowed(){ try{ return localStorage.getItem('shaahi_cookie_consent')==='granted'; }catch(e){ return false; } }
  function read(){ try{ return JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ return null; } }
  try{
    var q=new URLSearchParams(location.search);
    var click=q.get('gclid')||q.get('gbraid')||q.get('wbraid')||'';
    var src=q.get('utm_source')||'', med=q.get('utm_medium')||'', camp=q.get('utm_campaign')||'';
    var term=q.get('utm_term')||'';
    if(!click&&!src&&!med){ src=document.referrer?'referral':'direct'; med=document.referrer?'referral':'none'; }
    if(!allowed()) return;
    var now=Date.now(), prev=read();
    if(prev&&prev.first&&(now-prev.first.at)>WINDOW_DAYS*864e5) prev=null;  // expired
    var touch={click:click,source:src,medium:med,campaign:camp,term:term,
               referrer:(document.referrer||'').slice(0,200),landing:location.pathname,at:now};
    var next={first:(prev&&prev.first)?prev.first:touch, last:touch};
    if(!next.last.click&&prev&&prev.last&&prev.last.click) next.last.click=prev.last.click;
    localStorage.setItem(KEY,JSON.stringify(next));
  }catch(e){/* attribution is never worth breaking a page over */}
  window.shaahiAttribution=function(){ try{ return allowed()?read():null; }catch(e){ return null; } };
})();
</script>
${ATTRIB_MARKER_END}
`;

const LEAD_MARKER_START = '<!-- CATERLEAD:START -->';
const LEAD_MARKER_END = '<!-- CATERLEAD:END -->';

const leadSnippet = `${LEAD_MARKER_START}
<script>
(function(){
  var form = document.getElementById('caterForm');
  if (!form) return;
  form.addEventListener('submit', function(){
    try{
      var fd = new FormData(form);
      var body = {
        city: fd.get('City / Area') || '',
        name: fd.get('Name') || '',
        phone: fd.get('Phone') || '',
        email: fd.get('email') || '',
        eventDate: fd.get('Event Date') || '',
        guestCount: fd.get('Number of Guests') || '',
        eventType: fd.get('Event Type') || '',
        details: fd.get('Additional Details') || '',
        attribution: (typeof window.shaahiAttribution === 'function' ? window.shaahiAttribution() : null)
      };
      // Fire-and-forget: never blocks or interferes with the real submit to
      // formsubmit.co. keepalive so it survives the page navigating away.
      fetch('${SB_URL}/functions/v1/create-catering-lead', {
        method: 'POST',
        headers: {'Content-Type':'application/json','apikey':'${SB_ANON}','Authorization':'Bearer ${SB_ANON}'},
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function(){});
    }catch(e){/* never let lead tracking interfere with the real quote request */}
  });
})();
</script>
${LEAD_MARKER_END}
`;

// Line-ending agnostic (these files mix CRLF/LF) — anchor on the gtag config
// call itself, then the next </script> close after it, whatever separates them.
const GTAG_ANCHOR_RE = /gtag\('config', 'G-3NJRL7V5NB'\);\s*<\/script>/;
const FORM_ID_NEEDLE = 'id="caterForm"';

export function targetFiles() {
  return readdirSync(repo).filter((f) => /^catering-.*\.html$/.test(f)).sort();
}

function insertAttribution(html) {
  if (html.includes(ATTRIB_MARKER_START)) return html;
  const m = GTAG_ANCHOR_RE.exec(html);
  if (!m) return null;
  const at = m.index + m[0].length;
  return html.slice(0, at) + '\n' + attribSnippet + html.slice(at);
}

function insertLeadTracking(html) {
  if (html.includes(LEAD_MARKER_START)) return html;
  if (!html.includes(FORM_ID_NEEDLE)) return null; // no catering form on this page
  const idx = html.lastIndexOf('</body>');
  if (idx === -1) return null;
  return html.slice(0, idx) + leadSnippet + html.slice(idx);
}

function main() {
  const files = targetFiles();
  const updated = [];
  const alreadyOk = [];
  const failed = [];

  for (const file of files) {
    const path = resolve(repo, file);
    let html = readFileSync(path, 'utf8');
    const hadAttrib = html.includes(ATTRIB_MARKER_START);
    const hadLead = html.includes(LEAD_MARKER_START);

    if (hadAttrib && hadLead) {
      alreadyOk.push(file);
      continue;
    }

    if (check) {
      failed.push(file);
      continue;
    }

    const withAttrib = insertAttribution(html);
    if (withAttrib === null) { failed.push(`${file} (no gtag anchor)`); continue; }
    const withLead = insertLeadTracking(withAttrib);
    if (withLead === null) { failed.push(`${file} (no caterForm)`); continue; }

    writeFileSync(path, withLead);
    updated.push(file);
  }

  if (check) {
    if (failed.length === 0) {
      console.log(`Catering lead tracking present on all ${files.length} catering pages.`);
      return;
    }
    console.error(`Catering lead tracking MISSING on ${failed.length} page(s): ${failed.join(', ')}`);
    console.error('Run: node scripts/add-catering-lead-tracking.mjs');
    process.exit(1);
  }

  if (updated.length) console.log(`Wired ${updated.length} page(s): ${updated.join(', ')}`);
  if (alreadyOk.length) console.log(`Already present on ${alreadyOk.length} page(s) — left unchanged.`);
  if (failed.length) {
    console.error(`FAILED on ${failed.length} page(s): ${failed.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
