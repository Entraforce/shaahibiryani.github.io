# Change Log — Enterprise SEO Master Prompt (Phases 0–15)

Date range: 2026-10-27 through 2026-10-30.
All changes below were made directly on `main` or on a phase branch
during this audit sequence, each verified before committing (see
`validation-results.md`). This log covers changes made *as part of
this master-prompt project*; a separate, independent audit pass Osman
ran the same week is noted at the bottom for completeness, not
itemized in full here (see `docs/seo/audit-fixes-2026-10-29.md`).

---

## Phase 0 (2026-10-27–28, prior to this session's continuation)
- Fixed broken `catering-plano.html` → `biryani-plano` link.
- Fixed `privacy.html`'s URL to match the extensionless convention.
- Localized 17 thin catering-page meta descriptions with real landmarks.
- Rebalanced internal links across the 18 biryani city pages.
- Added `robots.txt` Disallow rules for `/kadmin` and `/table`.
- Replaced the silent 404-bounce-to-homepage with a real branded page.
- Built `scripts/update-review-rating.mjs` + a daily GitHub Actions
  workflow to keep `aggregateRating` current from the live Google rating.
- Created and deployed a dedicated, Places-API-only restricted key for
  that automation.

## Phase 1 (2026-10-28)
- Technical SEO audit only — CLS/LCP/forced-reflow findings documented,
  no code changed (the font-loading fix remains proposed, not approved).

## Phase 2 (2026-10-28)
- Added `logo`/`hasMap` to the homepage's Restaurant entity.
- Added `servesCuisine`/`priceRange`/`image` to the shared city-page
  stub template, scripted across all 37 city pages.
- Switched `reserve.html` to the minimal-stub schema pattern, fixing
  real drift (missing "South Asian," `acceptsReservations` stored as
  string "True" instead of boolean).

## Phase 3–4 (2026-10-28)
- Audit only, no code changes — findings are in their respective docs.

## Phase 5 (2026-10-29)
- **Removed fabricated venue-relationship claims from all 19
  `catering-<city>.html` pages** (commit `4c61725`) — every page had
  named specific real venues (Hilton Anatole, Rosewood Mansion on
  Turtle Creek, Allen Event Center, etc.) as places Shaahi had
  supposedly catered; Osman confirmed these were invented. Replaced
  with generic, accurate venue-type phrasing. Caught and fixed 3
  variants beyond the main lead paragraph (a hero subhead, a meta
  description, and a feat-grid line).

## Phase 6 (2026-10-29)
- **Fixed a stale hardcoded rating** in the homepage's "best biryani in
  DFW" FAQ answer (was "4.3★/480+ reviews," live rating was 4.4★/557)
  and **extended `update-review-rating.mjs`** to refresh this text
  alongside the schema field going forward, so it can't silently drift
  stale again (commit `0975366`).
- **Added a visible FAQ heading and third answer to `dine-in.html`**
  — its FAQ schema had 3 questions but only 2 showed up as matching
  visible content (commit `45eb109`).

## Phase 7–11 (2026-10-29–30)
- Audit only, no code changes.

## Phase 12 (2026-10-30)
- **Added GA4 event tracking for Order button clicks, Directions
  clicks, and menu-section views** on `index.html` — none of these
  were tracked before. New self-contained `CTATRACK` script block,
  mirroring the existing `CALLTRACK` pattern and its cookie-consent
  gate. No Google Ads account changes needed (commit `fba5e2e`).

## Phases 13–15 (2026-10-30)
- Audit/synthesis only, no code changes.

---

## Separate, concurrent audit pass (not part of this master prompt)

Osman ran an independent audit the same week (documented in
`docs/seo/audit-fixes-2026-10-29.md`), which included real Search
Console data pulls, Lighthouse accessibility fixes (homepage 84→97),
corrected drive-time/mileage claims on all 37 city pages (verified
against real driving routes), one new authentic photo per city page,
and shortened `biryani-*` meta descriptions to ≤160 characters. That
work is real and verified by that session, referenced in the Executive
Summary, but not independently re-verified line-by-line in this audit.
One discrepancy was found: that session's commit message claims
catering-form fields were "labelled," but a direct check of
`catering-frisco.html` and `index.html` shows the core fields (Name,
Phone, Email, Number of Guests, Additional Details) still lack
`for`/`id` association — the same gap Phase 12 of this project found.
**This item is still open**, not resolved.
