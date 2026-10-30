# Phase 18 — 30/60/90-Day Roadmap

Date: 2026-10-30
This sequences every open item from Phase 15's backlog and Phase 17's
executive summary into a realistic timeline. **No ranking, Google Maps
placement, or AI-recommendation outcome is promised anywhere in this
document** — per the master prompt's own explicit rule. Success metrics
below are about what to *measure*, not guaranteed results.

Owners: "Claude" = implementable in a future Claude Code session once
approved; "Osman" = requires his direct action (account access,
business decision, or approval); "Both" = Osman approves/decides,
Claude implements.

---

## First 30 days — technical health, accurate info, indexing, core pages, measurement

| Task | Owner | Dependency | Priority |
|---|---|---|---|
| Review and merge Phases 9–17 branches to `main` | Osman (review), Claude (merge) | None — all ready now | Gate for everything below |
| Decide on the font-loading CLS fix | Both | Osman approval | P1 |
| Scope and decide on removing the dead "Midnight theme" CSS (newly found — real driver of mobile LCP delay) | Both | Osman approval; needs its own scoping pass first since it's bigger than a single-file fix | P1 |
| Build the Wedding & Event Catering hub page | Both | Osman approval of the Phase 9 spec | P1 — highest-confidence gap in the project |
| Correct GBP price range, website field, "No private dining room" attribute | Osman | GBP login | P1 |
| Confirm and, if still wrong, correct the Postmates hours listing | Osman | Postmates merchant access; URL was dead when checked, needs a live look first | P1 |
| Verify Bing Webmaster Tools | Osman | Bing account access | P3→pulled forward, low effort |
| Decide the robots.txt AI-crawler policy | Osman | None — just a decision | P1 |

**Success metrics for this window**: a real GSC baseline already exists
(622 clicks, 69.3K impressions, 0.9% CTR, avg. position 7.1, trailing 3
months to 2026-10-27 — from the concurrent audit pass). Track these same
four numbers again at day 30 as a baseline comparison point, not a
target. Confirm GBP/Postmates listings show corrected info on a live
check. Confirm Core Web Vitals field data has started accumulating in
GSC (it showed "not enough usage data" as of the last check).

---

## Days 31–60 — high-intent content, local relevance, listings, internal linking

| Task | Owner | Dependency | Priority |
|---|---|---|---|
| Build the Family Meal Packs page | Both | Osman approval of the Phase 9 spec | P2 |
| Add the Hyderabadi dum biryani FAQ | Both | Wording approval (copy already drafted) | P2 |
| Rebalance internal links for the 3 low-inbound-link cities | Claude | None | P2 |
| Confirm `venues.html`'s venue-list accuracy | Osman | None — just his confirmation | P2 |
| Spot-check DoorDash/Uber Eats/Grubhub per-city coverage claims | Osman or Claude (if no login needed) | Live platform checks | P2 |
| Add a phone number to the zabihah.com listing | Osman | Access to that listing | P2 |
| Go ahead (or not) on the form-label accessibility fix across ~21 forms | Both | Osman approval | P2 — confirmed still open as of Phase 17 despite a concurrent session's claim otherwise |
| Confirm Bing Places existence; claim if missing | Osman | Bing account access | P3→pulled forward |
| Apple Maps category/attribute corrections, if Apple Business Connect access is obtained by this point | Osman | ABC login (blocked until then) | P1, but gated |

**Success metrics for this window**: re-run Phase 7's 5-query AI
visibility test (Perplexity, Bing AI Mode, Google AI Overview) and
compare against the Phase 7 baseline — specifically whether "Indian
wedding catering in Plano" now surfaces Shaahi anywhere, which is the
real test of whether the new catering page worked. Track GSC
impressions/clicks for the two new pages specifically once indexed.

---

## Days 61–90 — content authority, citations, conversion, ongoing monitoring

| Task | Owner | Dependency | Priority |
|---|---|---|---|
| Work through the 23 unreplied Google reviews | Osman (or Claude, using the existing review-reply playbook) | GBP access | P3 |
| Convert the hero carousel to `<img>` elements, if approved | Both | Osman approval | P2 |
| Re-run Phase 14's 4-competitor comparison | Claude | None | P3 — check whether any competitor has closed the halal-certification/structured-data gap |
| Re-run Phase 7's AI visibility test a second time | Claude | None | P3 — track trend, not a one-time check |
| Decide whether recurring GSC/GA4 API automation is worth building | Both | Google Cloud OAuth/service-account setup with Osman | P3 |
| Review the full GSC performance trend (30/60/90-day baseline comparisons) | Osman | GSC access | Ongoing |

**Success metrics for this window**: by day 90, there should be enough
real GSC field data to know whether Phase 1's lab-only CLS/LCP findings
are actually affecting real users (not just Lighthouse simulations).
Compare the day-90 GSC baseline (clicks/impressions/CTR/position)
against day-30's. This is trend tracking, not a promised outcome.

---

## Realistic dependencies worth calling out explicitly

- **Everything in "Blocked tasks" (Phase 17's Executive Summary) stays
  blocked until Osman gets Apple Business Connect access** — this has
  been true since Phase 4 and nothing in this roadmap changes that on
  its own.
- **The Wedding & Event Catering page's actual effectiveness can't be
  confirmed until it's both built AND indexed AND re-tested** — building
  it in the first 30 days doesn't mean the AI-visibility gap closes
  immediately; the day-60 re-test is where that gets checked.
- **The dead Midnight-theme CSS removal is a bigger lift than a typical
  item in this backlog** — it touches shared CSS across every template,
  so it deserves its own scoping/testing pass, not a same-day fix
  alongside smaller items.

---

## What this roadmap does not claim

No specific ranking position, Google Maps 3-pack placement, or
guaranteed AI-assistant recommendation is promised at any point in this
roadmap, for any task, at any timeline — consistent with the master
prompt's explicit instruction and with how every phase in this project
has reported findings so far.
