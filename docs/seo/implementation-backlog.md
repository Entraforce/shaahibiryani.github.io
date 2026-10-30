# Phase 15 — Implementation Priorities

Date: 2026-10-30
Branch: `seo/phase15-implementation-priorities` (off `main`)
Scope: a single prioritized backlog consolidating every open
recommendation from Phases 0–14. This is a synthesis document — full
evidence for each item lives in its originating phase doc, linked by
name rather than repeated here.

**Priority framework is the master prompt's own**: P0 Critical, P1
High, P2 Medium, P3 Long-term.

---

## Headline: no open P0 (Critical) items

Every P0-category issue found during this project — broken canonical
links, misleading structured data, fabricated business claims, broken
internal links, a stale aggregate rating — was fixed as it was found,
not left in a backlog. That's genuinely good news, not a gap in this
document: the site's foundational integrity is clean as of this
session. What remains below is real but lower-urgency.

---

## P1 — High

| # | Problem | Source | Recommended solution | Effort | Business impact | Status |
|---|---|---|---|---|---|---|
| 1 | "Indian wedding catering" search intent is absent from Shaahi across plain Google, Perplexity, Bing AI Mode, and Google AI Overview — 4 independent confirmations | Phases 5, 7, 9 | Build the proposed Wedding & Event Catering hub page (`/wedding-catering`) — full spec already written | Medium (1 new page, reuses existing verified facts) | High — best-evidenced gap in the whole project, directly commercial | **Proposed, not built** |
| 2 | Font-loading causes CLS failures on 6 of 8 page/device combinations tested | Phase 1 | Fix font-loading strategy (e.g. `font-display`, preload, self-host) sitewide | Medium (touches shared CSS across templates) | High — CWV affects both rankings and real user experience | **Proposed, not approved** |
| 3 | Google Business Profile price range shows `$` (inexpensive); site says `$$` | Phase 3 | Pick one accurate value and correct the mismatched side | Low | Low-medium — minor trust/expectation mismatch | **Not started, needs Osman's GBP access** |
| 4 | GBP's website field points to `www` subdomain (redirects fine, just an extra hop) | Phase 3 | Update GBP's website field to the bare domain | Low | Low | **Not started, needs Osman's GBP access** |
| 5 | Postmates listing likely shows wrong hours (implies open Mondays) | Phases 8, 11 | Confirm live (listing URL was dead when checked — may already be stale), correct via Postmates merchant portal if still wrong | Low | Medium — directly misleads customers about when you're open | **Needs a live human check first** |
| 6 | Apple Maps category is just "Indian Cuisine" — no halal distinction, much thinner than Google's 9-category set | Phase 4 | Add halal-relevant categories via Apple Business Connect, once claimed | Low (once ABC access exists) | Medium — halal is Shaahi's strongest differentiator (confirmed again in Phase 14) and it's invisible on Apple Maps | **Blocked — no Apple Business Connect login this project has had** |

---

## P2 — Medium

| # | Problem | Source | Recommended solution | Effort | Business impact | Status |
|---|---|---|---|---|---|---|
| 7 | No FAQ anywhere explains Hyderabadi dum biryani vs. other biryani styles — an explicit master-prompt example question, genuinely unanswered | Phase 6 | Add the proposed FAQ entry to `index.html` | Low (copy already drafted) | Medium — AEO/AIO value, educational content AI engines favor | **Proposed, drafted, awaiting wording approval** |
| 8 | Family Pack / Jumbo Pack biryani pricing exists but has no dedicated landing content | Phase 9 | Build the proposed Family Meal Packs page (`/family-meals`) | Medium | Medium — real priced inventory with zero fabrication risk | **Proposed, not built** |
| 9 | Hero carousel uses CSS `background-image`, not `<img>` — no alt text, invisible to Google Images | Phase 10 | Convert to `<img>` elements with descriptive alt text | Medium (touches hero layout CSS) | Low-medium — ambiance photos rarely drive food-search traffic the way dish photos do | **Proposed, not approved** |
| 10 | Form labels aren't programmatically linked to inputs across ~21 forms sitewide | Phase 12 | Add matching `id`/`for` pairs (purely additive, no visual change) | Medium (many files, mechanical) | Medium — accessibility + the catering quote form is a primary conversion point | **Proposed, awaiting go-ahead** |
| 11 | Internal link counts among `biryani-*` city pages range 3–9 (Farmers Branch/The Colony/Wylie low end) | Phase 5 | Small rebalance, same pattern as Phase 0's earlier fix | Low | Low | **Proposed, not started** |
| 12 | GBP's "No private dining room" attribute may mislead given the real 132-guest hall | Phase 3 | Review and correct the attribute in GBP | Low | Low-medium | **Not started, needs Osman's GBP access** |
| 13 | Apple Maps claims "Outdoor Dining" as an attribute — not confirmed true anywhere else | Phase 4 | Confirm with Osman; remove via ABC if not accurate | Low | Low — but an inaccurate attribute is a real-info-accuracy issue regardless of size | **Open question, unanswered** |
| 14 | zabihah.com listing has no phone number, only a sales email | Phases 8, 11 | Add phone number via whatever access manages that listing | Low | Low-medium — this directory's whole audience is Shaahi's target customer | **Not started** |
| 15 | robots.txt currently allows all AI crawlers equally (citation bots and training-only bots alike) | Phase 7 | Decide: keep fully open (recommended) or selectively block training-only bots | Low (once decided) | Medium — affects both AI-citation visibility and training-data consent | **Business decision needed, not a bug** |

---

## P3 — Long-term

| # | Item | Source | Recommended solution | Effort | Business impact | Status |
|---|---|---|---|---|---|---|
| 16 | 23 unreplied Google reviews, including one unaddressed 2-star | Phase 3 | Work through the backlog using the existing review-reply playbook | Medium (ongoing) | Medium — responsiveness is a trust signal and ranking factor | **Not started** |
| 17 | Bing Webmaster Tools not verified | Phase 13 | Verify (often a 5-minute setup) | Low | Low-medium — Bing's AI Mode already cites Shaahi well; this would add real performance visibility | **Not started** |
| 18 | Bing Places listing existence unconfirmed | Phase 11 | Check directly in Bing Places for Business; claim if missing | Low | Low-medium | **Inconclusive, needs direct check** |
| 19 | `venues.html`'s list of 11 named real venues — accuracy not confirmed by Osman | Phases 5, 8 | Confirm with Osman (separate from the already-resolved fabricated-venue fix) | Low | Low — precautionary, same risk category as the fix already made elsewhere | **Open question, unanswered** |
| 20 | DoorDash/Uber Eats/Grubhub per-city delivery coverage claims — accuracy drifts over time | Phase 5 | Periodic spot-check against live platform coverage | Low (recurring) | Low-medium | **Not started** |
| 21 | No recurring GSC/GA4 performance pull exists | Phase 13 | Optionally extend the existing review-rating automation pattern to pull Search Analytics API data on a schedule | Medium (needs OAuth/service-account setup with Osman) | Medium, if recurring reporting becomes a priority | **Proposed as an option, not started** |
| 22 | AI visibility testing (Phase 7's 5-query method) is a point-in-time snapshot | Phase 7 | Re-run periodically to track change, especially after the wedding-catering page ships | Low (recurring) | Medium — the only way to confirm whether P1 #1 actually worked | **Method exists, not yet scheduled** |
| 23 | Competitor monitoring (Phase 14's 4-competitor snapshot) is also a point-in-time check | Phase 14 | Re-run periodically, especially the halal-certification and structured-data gap, in case competitors close it | Low (recurring) | Low-medium | **Method exists, not yet scheduled** |

---

## Flagged, outside SEO scope — status unknown

**Google Ads account not showing ads, payment method failing** (Phase
3): urgent and unrelated to SEO, needs Osman's own billing action.
Status as of this phase is unknown — worth confirming whether this has
been resolved before assuming ad spend is active again.

---

## How to read this backlog

Every item above already has its full evidence and reasoning in its
originating phase document — this file is a pointer and prioritization
layer, not a replacement for those docs. Nothing here has been
re-researched or re-verified; priorities and effort estimates are my
judgment based on what each phase found, not new data.
