# Phase 2 — Structured Data & Knowledge Graph Audit

Date: 2026-10-28
Branch: `seo/phase2-structured-data` (off `main`)
Scope: every `application/ld+json` block on all 47 HTML pages. Read-only —
findings only, no site changes. Validated two ways: (1) a new script,
`scripts/audit-structured-data.mjs`, that parses every JSON-LD block on disk
and inventories types/fields/`@id` usage; (2) **Google's own Rich Results
Test**, run live against three representative pages
(`/`, `/catering-plano`, `/hall`) — the master prompt specifically calls for
this, not just local JSON validation.

---

## Executive summary — this is in good shape overall

The headline finding of this phase is mostly reassuring, not alarming:

- **Zero JSON-LD parse errors** anywhere across all 47 pages.
- **Every page that references the business uses the exact same stable
  `@id`** (`https://shaahibiryanidfw.com/#restaurant`) — no divergent IDs,
  no accidental duplicate full entities. This is precisely the pattern the
  master prompt asks for.
- City pages (all 37 `biryani-*`/`catering-*`) correctly use a **minimal
  stub + `@id` reference** (name, telephone, address, `@id`) rather than
  re-declaring the full Restaurant entity 37 times — the right way to avoid
  knowledge-graph duplication.
- `hall.html` models the pattern well: it declares a **more specific type**
  (`EventVenue`, not another `Restaurant`) with its own `@id`
  (`.../hall#venue`) and explicitly links back via
  `"containedInPlace": {"@id": ".../#restaurant"}` — exactly the
  "prefer the most specific type, don't duplicate overlapping entities"
  guidance from the master prompt, done correctly.
- Live-tested via Google's Rich Results Test: homepage = **6 valid items, 0
  errors** (Local businesses, Organization, Review snippets);
  `catering-plano` = **3 valid items, 0 errors** (only non-critical/optional
  field notes, detailed below); `hall` = **2 valid items, 0 errors**.

Three real findings below, none urgent, all low-risk to fix.

---

## Finding 1 — the homepage's canonical Restaurant entity is missing 3 of 14 recommended fields

`index.html`'s `#restaurant` entity (the one every other page references)
has 12 of the master prompt's 14 recommended Restaurant fields. Missing:
**`logo`**, **`menu`**, **`hasMap`**.

All three have a real, verified value already available in the repo —
nothing would need to be invented:
- `logo` → `assets/sb-logo-light.webp` (already used as the site logo image,
  confirmed on disk).
- `menu` → `https://shaahibiryanidfw.com/#menu` (the homepage's own menu
  section, confirmed at `index.html:4248`, `<section id="menu">`).
- `hasMap` → the locked Google Maps listing URL already used as `sameAs`
  (`https://g.page/r/CdoUnFi5PmB4EBM`) — `hasMap` and `sameAs` can both point
  to the same verified URL; they serve different semantic purposes in
  schema.org (`sameAs` = "this is also me," `hasMap` = "here's a map of me").

## Finding 2 — `reserve.html` partially duplicates the entity instead of using the minimal-stub pattern

Every city page uses the clean 4-field stub (`name`, `telephone`, `address`,
`@id`). `reserve.html` instead restates 8 fields, including
`openingHoursSpecification` and `servesCuisine` — a second, partial copy of
data that already lives on the homepage's canonical entity. Not broken (the
shared `@id` still ties it together for anything that resolves by `@id`),
but it's a maintenance-drift risk: if hours ever change, `index.html` and
`reserve.html` would both need to be updated by hand, and nothing would
flag it if one were missed. Recommend switching `reserve.html` to the same
minimal-stub pattern the city pages use, unless there's a reason specific to
that page for repeating the extra fields.

## Finding 3 — city-page stubs are "valid" but Google flags 3 fields as missing *on that specific page*

This is the most interesting finding, and it only came from actually running
Google's live tool rather than just validating JSON syntax. On
`catering-plano`, Google's Rich Results Test recognized the referenced
Restaurant entity (`@id` matched) but reported:

> Missing field "servesCuisine" (optional)
> Missing field "priceRange" (optional)
> Missing field "image" (optional)

— still marked **valid**, not an error, because these are optional fields.
But it suggests Google's rich-result eligibility check may evaluate each
page's local JSON-LD somewhat independently rather than fully merging
everything the homepage's fuller entity has, by `@id`, for the purposes of
*that specific URL's* rich-result eligibility. This isn't confirmed as a
hard rule (Google doesn't document the merge behavior precisely, and this
audit only tested one city page), but it's a legitimate reason to consider
adding `servesCuisine`, `priceRange`, and `image` to the shared stub
template used across all 37 city pages — cheap to add (all three are
already-verified, unchanging facts, not something that needs fabrication),
and would make each page individually more rich-result-robust rather than
relying on cross-page entity merging that may or may not happen.

---

## Full `@type` inventory across the site

| Type | Pages using it |
|---|---|
| FAQPage / Question / Answer | 43 |
| BreadcrumbList / ListItem | 42 |
| PostalAddress | 40 |
| Restaurant | 39 |
| Service / City / AdministrativeArea / Audience / Offer | 38 |
| OfferCatalog | 20 |
| GeoCoordinates / OpeningHoursSpecification | 2 (home + hall) |
| EventVenue / LocationFeatureSpecification | 1 (hall) |
| AggregateRating / Review / Rating / Person | 1 (home) |
| Menu / MenuSection / MenuItem | 1 (home) |

No unexpected or orphaned types. Every type present has a clear reason to
be there.

## Offer/price handling — correctly avoids fabrication, at the cost of rich-result eligibility

Catering pages' `Offer` blocks (inside `hasOfferCatalog`) list event types
(Wedding Catering, Walima Catering, etc.) with **no price fields at all** —
correct, since catering is quote-based, not fixed-price, and the master
prompt explicitly forbids inventing price/availability. The separate
top-level `offers` object on these pages sets `availability: InStock` and
`priceCurrency: USD` but also has no `price` — meaning this Offer object
doesn't qualify for Google's price-based offer rich results. That's the
correct tradeoff for a quote-based service, not a bug — flagging only so
it's a conscious choice, not an accidental gap, should anyone later wonder
why catering pages never show a price in search results.

## FAQPage / BreadcrumbList — valid, but not expected to produce visible rich results right now

Per the master prompt's own caution ("do not promise FAQ rich results"):
Google's Rich Results Test did not list FAQPage or BreadcrumbList as
"Detected structured data" on any of the three pages tested, even though
both are syntactically valid and present. Google significantly restricted
FAQ rich-result eligibility in 2023 to a narrow set of sites, so this is
expected, not a defect — the schema is still useful as accurate structured
data for AI/answer-engine consumption (Phases 6–8), just not currently
expected to produce a visible SERP enhancement.

---

## Open items for the owner

1. **OK to add the three missing homepage fields (`logo`, `menu`,
   `hasMap`)?** All three use values already live on the site — no new
   facts needed, just filling in the entity.
2. **OK to add `servesCuisine`/`priceRange`/`image` to the shared city-page
   stub template** (one shared snippet reused across 37 pages, not a
   per-page hand-edit)? Same reasoning as above — nothing new, just more
   complete per-page.
3. **OK to switch `reserve.html` to the minimal-stub pattern** (drop its
   partial second copy of hours/cuisine, reference `@id` only like the city
   pages do)?

None of these require new business facts or any owner decision beyond "go
ahead" — they're all filling in fields with values that are already
verified elsewhere on the site.
