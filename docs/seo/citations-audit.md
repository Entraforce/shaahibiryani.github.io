# Phase 11 — Citations and Local Authority

Date: 2026-10-30
Branch: `seo/phase11-citations` (off `main`)
Scope: NAP/hours consistency across third-party directories beyond
Google Business Profile (Phase 3) and Apple Maps (Phase 4), which are
already audited and not repeated here. Also resolves the wrong-hours
mystery Phase 8 surfaced but didn't pin down.

**Method**: live checks (WebFetch direct where possible, search-index
aggregation where a site blocked direct fetching) against the locked
NAP facts — 3421 E Renner Rd, Suite 110, Plano, TX 75074; (469)
960-3300; Sun + Tue–Thu 11:30am–10pm, Fri–Sat 11:30am–11pm, closed
Mondays. No listing is reported as wrong without the actual discrepant
text quoted; where a page couldn't be loaded directly, that's stated
rather than guessed around.

---

## Executive summary

1. **Found the wrong-hours source Phase 8 flagged: Postmates.**
   Search-index data for Shaahi's Postmates listing shows hours
   implying the restaurant is open Mondays with different close times
   than actual — a real, specific discrepancy. **Caveat**: the direct
   listing URL returned HTTP 410 (Gone), so this may be a stale cached
   snapshot of a listing that's since changed or been removed, not
   necessarily what's live today. Needs a direct human check before
   treating as confirmed-current.
2. **Everything else checked passes.** RestaurantGuru and Roadtrippers
   match exactly via direct fetch. Yelp, Facebook, and order.online
   also show correct info, though only confirmable indirectly (all
   three block direct automated fetches — Yelp and order.online with
   bot detection, Facebook with its standard logged-out wall).
3. **One real gap, not an error**: zabihah.com's listing (a
   halal-dining-specific directory, genuinely valuable for this
   audience) has correct address and hours but **no phone number
   listed at all** — just a general sales@ email. Worth adding, since
   this directory's whole audience is exactly Shaahi's target
   customer.
4. **Bing Places status is unknown**, not confirmed-missing. No
   listing surfaced in logged-out search, but that's not conclusive —
   confirming whether one exists (and claiming it if not) requires
   checking directly in Bing Places for Business, which needs a
   merchant login this audit didn't attempt.
5. **No duplicate-listing problem found.** The sibling Illinois
   locations (Glendale Heights, Bolingbrook) have their own, correctly
   separate Yelp listings — not a duplicate of the Plano listing, just
   the other real locations under the same brand (consistent with what
   Phase 3 already noted about `shaahibiryani.com`).

---

## Per-listing results

| Listing | Status | Detail |
|---|---|---|
| Postmates | **FAIL** | Search-index snapshot shows "Sunday - Monday: 11:30 AM - 9:35 PM; Tuesday: 11:00 AM - 9:35 PM; Wednesday - Thursday: 11:30 AM - 9:35 PM; Friday - Saturday: 11:30 AM - 10:35 PM" — wrongly implies open Monday, wrong close times both ends. Direct URL 410'd, so this may already be stale. |
| RestaurantGuru | PASS | Exact match on address, phone, and hours via direct fetch. |
| Roadtrippers | PASS | Exact match via direct fetch. |
| Yelp | PASS (indirect) | Direct fetch blocked (403, bot detection). Search-index aggregation confirms correct hours including "Monday - Closed." |
| Facebook | PASS (indirect) | Direct fetch blocked (expected — Facebook requires login to view full pages). Search-index aggregation shows correct hours/address. |
| order.online | PASS (indirect) | Direct fetch blocked (403). Search-index shows correct hours; separately lists an "online ordering cutoff" of 10:40pm, which is a last-order-time note, not a hours discrepancy. |
| zabihah.com | PASS, with a gap | Address and hours match exactly (including Monday closed). No phone number on the listing at all. |
| Bing Places | Inconclusive | No listing surfaced in logged-out search — existence neither confirmed nor ruled out. |

---

## Citation correction plan

**Priority 1 — verify and fix if still live: Postmates hours.**
Someone with Postmates merchant access (or a logged-out spot-check of
the live listing, not just search-index data) should confirm whether
the wrong hours are still showing today, and correct them through
Postmates' merchant portal if so. This is the one confirmed-wrong
listing in this audit, though the dead URL means it needs a direct
look before assuming it's still broken.

**Priority 2 — add a phone number to the zabihah.com listing.**
Low effort, real value: this directory's visitors are specifically
halal-dining searchers, exactly Shaahi's audience, and right now
they'd have to email instead of call. Likely just requires logging
into whatever account manages that listing (or submitting an update
request if it's not self-managed).

**Priority 3 — confirm Bing Places status.**
Check `bing.com/maps` directly and/or Bing Places for Business to see
if a listing exists. If none exists, claiming one is a reasonable
addition — Bing powers Bing's own AI Mode (tested favorably for Shaahi
in Phase 7) and Microsoft Copilot, so an accurate claimed listing could
reinforce what's already working there. If one exists unclaimed with
wrong info, that would need the same correction treatment as Postmates.

No action needed on Yelp, Facebook, RestaurantGuru, Roadtrippers, or
order.online — all confirmed accurate.

---

## Limitations

Yelp, Facebook, and order.online were confirmed only through
search-index aggregation, not by directly loading and reading the live
page (all three blocked direct automated fetching). This is treated as
reasonably reliable evidence, not a substitute for someone occasionally
eyeballing the live pages directly. Bing Places could not be resolved
without a login-adjacent flow this audit didn't attempt.
