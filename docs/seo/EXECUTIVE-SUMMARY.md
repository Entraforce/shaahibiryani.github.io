# Executive Summary — Enterprise Search Visibility Project

Date: 2026-10-30
Covers Phases 0–15 of `docs/seo/00-master-prompt.md`. This is the
orienting document — read this first, then follow into individual
phase docs for full evidence. Organized by what kind of action each
item needs, per the master prompt's own structure.

**One important correction this document makes**: a separate,
independent audit Osman ran in parallel this same week (documented in
`docs/seo/audit-fixes-2026-10-29.md`) produced real, valuable data this
project didn't otherwise have access to — including an actual Google
Search Console baseline. That data is incorporated below, with direct
verification of its claims where this project could check them (one
discrepancy was found and corrected, not glossed over — see
"Recommended changes").

---

## Completed changes

Everything in this section is already live on `main`, verified after
implementation:

- **Content-integrity fixes**: removed fabricated venue-relationship
  claims from all 19 catering pages (Phase 5); fixed a stale
  hardcoded rating in the homepage FAQ and hardened the refresh
  automation so it can't drift again (Phase 6); added missing visible
  FAQ content to `dine-in.html` (Phase 6).
- **Foundational fixes from Phase 0**: broken links corrected, a real
  404 page, daily review-rating automation, `robots.txt` crawl hygiene,
  localized meta descriptions, internal-link rebalancing.
- **Structured data completeness** (Phase 2): filled missing
  `logo`/`hasMap`/`servesCuisine`/`priceRange`/`image` fields across
  the homepage and all 37 city-page stubs; fixed real schema drift on
  `reserve.html`.
- **New conversion tracking** (Phase 12): Order button clicks,
  Directions clicks, and menu-section views are now measured via GA4
  events — none were tracked before.
- **From the concurrent audit pass**: corrected drive-time/mileage
  claims on all 37 city pages against real driving routes; added one
  authentic owner photo per city page; shortened 18 `biryani-*` meta
  descriptions to ≤160 characters; real accessibility fixes (homepage
  Lighthouse accessibility score 84→97, color-contrast corrections,
  sold-out row fading fixed).

## Verified findings (no action needed)

- **Zero open P0 (critical) issues** — see Phase 15's backlog. Every
  critical issue found this project was fixed as it was found.
- **Zero duplicate analytics tags** — exactly one GA4 ID and one Google
  Ads ID exist anywhere sitewide (Phase 13).
- Call-tracking, catering-form submissions, and purchase conversions
  are all reliably tracked with real confirmation, not guesses (Phase
  12).
- The image pipeline is already well-engineered — responsive WebP,
  lazy loading, genuinely descriptive alt text (Phase 10).
- City-page network (37 pages) is complete with zero keyword
  cannibalization (Phase 5).
- **`venues.html`'s list of 11 named venues is confirmed real** by Osman
  (2026-10-30) — unlike the fabricated venue names already removed from
  the catering pages in Phase 5, this list required no changes.
- **robots.txt AI-crawler policy decided (2026-10-30): keep fully open.**
  No code change needed — the current wildcard already allows every AI
  crawler, and Phase 7 already confirmed real payoff from that openness
  (Perplexity, Bing AI Mode, and Google AI Overview all cite Shaahi
  accurately today). The content at stake is restaurant marketing copy,
  not proprietary work, so the training-data trade-off that matters for
  publishers doesn't really apply here.
- **A real competitive moat exists**: of 4 real competitors deep-audited
  (Bawarchi Biryanis, Biryaniify, Just Punjabi Foods, Dil Se Desi),
  none mention halal certification and none have visible structured
  data or a city-page network (Phase 14).
- Homepage testimonial quotes are confirmed by Osman as real customer
  quotes — clarified by the concurrent audit pass's cross-check against
  all 558 Google reviews that they are not verbatim Google review text
  specifically (likely sourced elsewhere, e.g. comment cards or direct
  feedback). Not a fabrication risk; just a clarified provenance detail.
- `llms.txt` already existed and is accurate (Phase 8).
- No video content exists sitewide — the video-SEO checklist is simply
  not applicable (Phase 10).
- **Real Search Console baseline now exists** (from the concurrent
  pass, URL-prefix property, trailing 3 months to 2026-10-27): 622
  clicks, 69.3K impressions, 0.9% CTR, average position 7.1. Homepage
  takes 566 of 622 clicks; city pages get impressions (55–621 each)
  but mostly 0–4 clicks. 48 pages indexed; non-indexed pages are
  expected redirects/duplicates, not errors. **Core Web Vitals field
  data: "not enough usage data"** — meaning Phase 1's CLS/LCP findings
  remain lab-only (Lighthouse), not yet confirmed by real users, and
  speed is not currently a ranking input for this site either way.

## Recommended changes (proposed, awaiting a decision)

Full detail and effort estimates are in Phase 15's backlog
(`implementation-backlog.md`) — summarized here by what's needed:

- **Wedding & Event Catering hub page — done** (2026-10-30, commit
  `2a9e7d5`), no longer open. Built at `/wedding-catering`, linked from
  `hall.html`, `venues.html`, and the homepage's catering section. Worth
  re-running Phase 7's AI-visibility test once it's indexed to confirm
  the gap actually closed — building the page doesn't guarantee that on
  its own.
- **Font-loading CLS fix is done** (2026-10-30, commit `af99c06`) —
  switched `font-display: swap` to `optional` and added preconnect/
  preload across all 47 "Midnight theme" pages. While doing this, found
  that `index.html`'s Manrope font already had a more thorough fix
  (a matched-metrics fallback font) implemented separately, tied to an
  in-progress visual redesign (`<html class="fresh">`, already live on
  the homepage only) — the old dark/gold "Midnight" look is kept
  dormant in the same stylesheet purely as a one-class rollback switch.
  Worth knowing this redesign exists and is partially live when
  deciding what to do with the dead-CSS item below.
- **Dead "Midnight theme" CSS removal** (P1, from the concurrent audit
  pass) — still open. ~125KB of CSS for the old theme ships on every
  page even though the homepage no longer uses it, identified as the
  actual root cause of ~62% of mobile LCP delay. That session
  deliberately deferred this as "a separate project"; now that the
  font-loading CLS fix is done, this is the next real performance item.
- **Hero carousel → `<img>` conversion** (P2) — still proposed, full spec
  in Phase 10's doc. **Both the Hyderabadi dum biryani FAQ and the
  Family Meal Packs page have since been added** (2026-10-30, commits
  `f2367d7` and `141a384`) — no longer open. The Family Meal Packs page
  hardcodes current menu prices the same way `dine-in.html` already
  does — neither auto-syncs with `/kadmin`, so both need a manual price
  update if Family/Jumbo Pack pricing changes.
- **Form label accessibility fix is done** (2026-10-30, commit
  `c906442`) — added matching `id`/`for` pairs to Name, Phone, Email,
  Event Date, Number of Guests, Type of Event, and Additional Details
  across all 19 catering city pages, `wedding-catering.html`, and both
  forms on `index.html`. This corrects an earlier concurrent session's
  commit message, which claimed this was already done — direct
  verification at the time found it wasn't.
- **The homepage's "Send a Message" contact form is fixed** (2026-10-30,
  commit `2cb4436`) — it previously wasn't wired up at all (no real
  `<form>`, no `name` attributes, submit button just showed a JS
  `alert()`). Now wired to `formsubmit.co` the same proven way every
  catering form on the site already works, with its own distinct
  `?contact=thanks` redirect so it can't cross-trigger the catering
  form's thank-you state.

## Blocked tasks

- Any Apple Business Connect change — no ABC login has existed at any
  point in this project.
- Google Search Console's domain-level property (`sc-domain:`) is not
  accessible from the Google account used — only the URL-prefix
  property is, per the concurrent pass's finding. This limits some
  future GSC analysis (e.g. non-www/http variants) until resolved.

## Tasks requiring account access

- **Google Business Profile**: price-range mismatch, `www` website
  field, "No private dining room" attribute — all need Osman's GBP
  login.
- **Bing**: Webmaster Tools verification and Bing Places existence
  confirmation both need direct access to Bing's tools.
- **Postmates**: confirming and correcting the likely-wrong hours needs
  merchant-portal access (the public listing URL checked was dead).
- **zabihah.com**: adding a phone number needs whatever access manages
  that listing.
- **Recurring GSC/GA4 reporting automation**: possible, following the
  same pattern as the review-rating refresher, but needs a Google Cloud
  OAuth/service-account setup walked through with Osman.

## Tasks requiring business-owner approval

These aren't blocked by access — they're proposals waiting on Osman's
decision:

- The dead Midnight-theme CSS removal (font-loading fix is done; this
  is the remaining sitewide-CSS item).
- Converting the hero carousel to `<img>` elements.
- Confirming whether Apple Maps' "Outdoor Dining" attribute is accurate.

## Items that could not be verified

- Whether the Postmates wrong-hours listing is still live today — the
  direct URL returned HTTP 410 (Gone) when checked; the "wrong hours"
  evidence came from a search-index snapshot that may be stale.
- Whether a Bing Places listing exists at all — searches were
  inconclusive either way.
- Current accuracy of DoorDash/Uber Eats/Grubhub per-city delivery
  coverage claims — these looked genuinely checked rather than
  boilerplate, but platform coverage drifts over time and wasn't
  independently re-verified.
- Current status of the Google Ads payment-method failure flagged in
  Phase 3 — unrelated to SEO, urgent, status unknown since it was first
  raised.
- Whether the new `CTATRACK` event-tracking block (Phase 12) actually
  fires correctly in a live browser — validated by code review and the
  project's static guard script, not by an actual browser session.

---

## Where to go next

Phase 15's `implementation-backlog.md` has the full prioritized list
with effort/impact estimates. Phase 18's 30/60/90-day roadmap (next)
will sequence the "Tasks requiring business-owner approval" items above
into a realistic timeline.
