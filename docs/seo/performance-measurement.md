# Phase 13 — Analytics and Search Performance

Date: 2026-10-30
Branch: `seo/phase13-analytics` (off `main`)
Scope: verify which analytics/webmaster integrations actually exist in
the code (not guessed at), check for duplicate tracking tags, and spec
out an SEO performance dashboard. **No code changes in this phase** —
everything needed was already confirmed installed and clean.

**Hard limitation, stated up front per the master prompt's own rule**:
I have no login access to Google Search Console, GA4's reporting UI,
Bing Webmaster Tools, Google Business Profile Insights, or Apple
Business Connect Insights. Everything below about what's *installed*
is verified directly from the site's code. Everything about actual
*performance numbers* (impressions, clicks, position, etc.) is
explicitly marked as unmeasured in this phase, not estimated or
invented.

---

## Executive summary

1. **GA4 and Google Ads conversion tracking are both installed
   cleanly, with zero duplicates.** Searched every HTML file
   sitewide for every `G-` (GA4) and `AW-` (Google Ads) ID — exactly
   one of each exists anywhere: `G-3NJRL7V5NB` and
   `AW-17075652554`. No conflicting or leftover second tracking ID from
   an old setup, no double-firing risk. This directly satisfies the
   master prompt's "prevent duplicate analytics events and duplicate
   tracking tags" requirement — confirmed clean, not assumed.
2. **Google Search Console is verified** — a
   `google-site-verification` meta tag exists on `index.html`. Actual
   GSC performance data (impressions, clicks, CTR, position, index
   coverage) requires logging into Search Console directly; not
   fabricated here.
3. **Bing Webmaster Tools is NOT verified** — no `msvalidate.01` meta
   tag or `BingSiteAuth.xml` found anywhere. This is a real,
   low-effort gap worth closing: Phase 7 already found Bing's AI Mode
   citing Shaahi accurately, and Bing Webmaster Tools would surface
   actual Bing-specific indexing and search-performance data that
   nothing currently provides. Typically a 5-minute setup (often via
   an existing Microsoft account, sometimes via importing the same
   verification Google already has).
4. **No Google Tag Manager container exists** — the site uses `gtag.js`
   directly instead. This is not a gap; it's a reasonable, simpler
   architecture for a static site without complex multi-vendor
   tagging needs. Not recommending GTM be added just for its own sake.
5. **Google Business Profile Insights and Apple Business Connect
   Insights** are owner-only dashboards, same as the fields Phases 3
   and 4 already had to check directly rather than via code — not
   something this phase can verify without Osman checking those
   dashboards himself.
6. **PageSpeed Insights / Lighthouse**: already measured in depth in
   Phase 1 (CLS, LCP, INP findings) — not re-run here to avoid
   duplicating that work.

---

## Dashboard spec (template, not populated — no API access this session)

The master prompt asks for a dashboard tracking 13 specific metrics.
Rather than invent plausible-sounding numbers, here's where each one
would actually come from once someone with account access pulls it:

| Metric | Source | Status |
|---|---|---|
| Organic impressions | Google Search Console → Performance report | Not pulled — requires GSC login |
| Organic clicks | Google Search Console → Performance report | Not pulled |
| CTR | Google Search Console (clicks ÷ impressions) | Not pulled |
| Average search position | Google Search Console → Performance report | Not pulled |
| Non-branded search visibility | GSC, filtered to exclude "Shaahi"/"Shaahi Biryani" queries | Not pulled |
| Local search performance | Google Business Profile Insights | Not pulled — owner dashboard |
| Google Maps interactions | Google Business Profile Insights (calls, direction requests, website clicks) | Not pulled |
| Organic conversions | GA4, segmented to organic-search traffic source | Not pulled — but the underlying event tracking is confirmed reliable (Phase 12: call clicks, form submissions, purchases) |
| Catering leads | The new `catering_leads` Supabase table (merged this session) | **This one's real and queryable today** — a live source Osman built, not a GSC/GA4 pull |
| Index coverage | Google Search Console → Pages report | Not pulled |
| Core Web Vitals | PageSpeed Insights / Chrome UX Report | Already measured in Phase 1 (lab data); field data (CrUX) needs real traffic volume and GSC/PSI access to confirm |
| AI citation observations | Manual repeatable test (established in Phase 7) | **Already have a real method** — the 5-query test across Perplexity/Bing/Google AI Overview from Phase 7 is exactly this, just needs re-running periodically, not a new tool |
| Technical errors | Google Search Console → Pages/Coverage report | Not pulled |

**What's usable today without any new account access**: the
`catering_leads` table (real leads, queryable right now) and the
Phase 7 AI-visibility test method (repeatable, already proven out).
Everything else in this table needs Osman to either grant API/login
access in a future session, or pull the numbers himself and hand them
over to populate a real version of this dashboard.

---

## Recommendations

1. **Verify Bing Webmaster Tools** — low effort, real gap, and useful
   given Bing's AI Mode is already working well for this site (Phase
   7).
2. **If recurring performance reporting matters going forward**, the
   same pattern already used for the daily review-rating refresh
   (`scripts/update-review-rating.mjs` + GitHub Actions) could be
   extended to pull GSC Search Analytics API data on a schedule — but
   that needs a Google Cloud OAuth/service-account setup Osman would
   need to walk through, similar to how the Places API key was created
   earlier. Not built in this phase; flagging as a real option if
   recurring GSC data becomes a priority.

---

## Limitations

This phase is explicitly scoped to "what's installed" rather than
"how is it performing," per the master prompt's own rule against
inventing access to analytics accounts. Every number-shaped metric the
master prompt asked for is marked not-pulled above rather than
estimated.
