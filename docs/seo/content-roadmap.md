# Phase 9 — Content Authority & Topical Clusters

Date: 2026-10-30
Branch: `seo/phase9-content-clusters` (off `main`)
Scope: a content architecture audit across the master prompt's four
clusters (Biryani, Catering, Local Discovery, Ordering), proposing new
pages only where a genuine, verified gap exists. **This is a planning
document — no pages are built in this phase.** Per the master prompt's
own instruction to prioritize high-value commercial pages and avoid
"generic mass-generated SEO content," most clusters below are marked
*saturated* rather than padded with speculative proposals.

---

## Executive summary

1. **Three of four clusters are already well-served.** Biryani,
   Catering, and Local Discovery are covered by the existing 18
   `biryani-<city>` + 19 `catering-<city>` pages (Phase 5 confirmed
   zero cannibalization and complete city coverage). **Recommendation:
   do not add more city or dish pages** — doing so would be exactly the
   doorway-page proliferation the master prompt warns against.
2. **Two genuine, verified gaps found, both proposed below as new
   pages — not yet built:**
   - **P1 (High): a dedicated Wedding & Event Catering hub page.**
     This is the single best-evidenced gap in the whole project —
     independently confirmed missing by plain Google search (Phase 5),
     and by Perplexity, Bing AI Mode, *and* Google AI Overview (Phase
     7), despite `hall.html`, `venues.html`, and `catering-plano.html`
     already existing. A consolidated, heavily-targeted page is the
     content-architecture fix; Phase 5 already flagged the lighter
     alternative (retarget existing pages' metadata) as worth trying
     first if a smaller change is preferred.
   - **P2 (Medium): a Family Meal Packs page.** Real, verified,
     already-priced menu items (Family Pack and Jumbo Pack Biryani —
     Chicken, Goat, and Veggie, serving 3–4 and 5–6 people
     respectively, $24–$75) currently exist only as line items buried
     in the homepage's menu `JSON-LD` with no dedicated page, heading,
     or search-friendly framing. This is commercial intent
     ("family meal deals," "biryani for 4") with zero fabrication risk
     since every fact needed already exists verified on the site.
3. **Everything else in the master prompt's four clusters is already
   satisfied by existing content** — cross-referenced below rather than
   re-proposed.

---

## Cluster A — Biryani: saturated, no new pages

Hyderabadi biryani, dum biryani, chicken/goat biryani, and menu
categories are covered by `index.html`'s menu and all 18
`biryani-<city>` pages. The one open content item here is
**informational, not a new page**: Phase 6 already proposed a
"Hyderabadi dum biryani vs. other styles" FAQ entry for `index.html`,
awaiting Osman's sign-off on the wording. Not re-proposed here.

## Cluster B — Catering

Indian/biryani/corporate catering intent is covered across 19
`catering-<city>` pages, `hall.html`, and `venues.html`. Phase 5
already made the call that a dedicated "Corporate Catering" page isn't
warranted — it's adequately covered as a mention within existing
catering pages, consistent with the master prompt's own warning against
a dedicated page for every sub-intent. **Not re-litigated here.**

**Wedding catering is the one real gap**, detailed below as the
flagship proposal.

## Cluster C — Local discovery: saturated, no new pages

"Indian food in Plano," "biryani in North Dallas," and verified
service-area content are fully covered by the existing city-page
network — Phase 5 confirmed all cities the master prompt names (and 8
more) already have both page types. **Recommendation: do not build
more location pages.** The city-page network has reached the point
where additional pages would be near-duplicates, not genuinely
differentiated content.

## Cluster D — Ordering

Online ordering and pickup are covered on `index.html`. Delivery is
explicitly excluded from any new content — CLAUDE.md is clear the
site's own checkout doesn't support it yet (no server-side fee calc),
so promoting it further would be misleading. Current verified
promotions are already handled by the dated promo-flyer system (Phase
8 confirmed it self-expires correctly, no new page needed).

**Family meals is the one real gap**, detailed below as the second
proposal.

---

## Proposal 1 (P1 — High priority): Wedding & Event Catering hub page

| Field | Value |
|---|---|
| Search intent | Transactional — comparison-shopping before booking wedding/event catering |
| Primary keyword | "Indian wedding catering Plano" / "wedding catering DFW" |
| Secondary keywords | Hyderabadi wedding catering, halal wedding catering DFW, walima catering Plano, Zabihah halal event catering |
| Suggested URL | `/wedding-catering` |
| SEO title | "Indian & Hyderabadi Wedding Catering in Plano & DFW \| Shaahi Biryani" |
| Meta description | Built only from already-verified facts: 100% Zabihah Halal, Hafsah + HMS Certified, 50 to 3,000+ guests, on-site hall up to 132 or at your venue across DFW |
| H1 | "Wedding & Walima Catering Across DFW" |
| Content outline | Hero → on-site vs. off-site choice (links to `hall.html` for on-site, `venues.html` for off-site) → menu packages (Half Pan / Full Pan, already-verified terms) → halal certification trust block → guest-count range (50–3,000+) → wedding-specific FAQ (new, not duplicating existing generic catering FAQ) → real food photos → quote-request CTA |
| Internal links | `hall.html`, `venues.html`, `catering-plano.html`, relevant city catering pages, homepage menu |
| Conversion CTA | Catering quote-request form (reuse the existing formsubmit.co flow already used on city catering pages) |
| Required evidence | None new — every fact used is already verified and locked in CLAUDE.md |
| Implementation priority | **P1.** Four independent signals (plain search, Perplexity, Bing AI Mode, Google AI Overview) all miss Shaahi for this intent despite relevant content already existing — the highest-confidence gap found in this entire project. |

## Proposal 2 (P2 — Medium priority): Family Meal Packs page

| Field | Value |
|---|---|
| Search intent | Transactional — ordering a larger meal for a household or small group |
| Primary keyword | "family meal deals Plano" / "biryani for the family Plano" |
| Secondary keywords | family pack biryani, jumbo pack biryani, group biryani order Plano, feed 4 biryani Plano |
| Suggested URL | `/family-meals` |
| SEO title | "Family & Group Biryani Meal Packs \| Shaahi Biryani Plano" |
| Meta description | Built from verified menu data: Family Pack (serves 3–4, from $24) and Jumbo Pack (serves 5–6, from $52) Chicken, Goat, and Veggie Dum Biryani |
| H1 | "Family Meal Packs — Biryani for the Whole Table" |
| Content outline | Intro → pricing/serving-size table pulled directly from the verified menu data (Family Pack Chicken $34, Goat $46, Veggie $24; Jumbo Pack Chicken $52, Goat $75) → halal certification block → pairing suggestions using real menu items (Haleem, Kababs) → FAQ (how many does a Family Pack feed, can flavors be mixed, pickup vs. third-party delivery) → Order Online CTA |
| Internal links | Homepage menu/ordering section, `dine-in.html` |
| Conversion CTA | Direct "Order Online" link into the existing ordering flow |
| Required evidence | None new — all prices and serving sizes already exist, verified, in `index.html`'s menu `JSON-LD` |
| Implementation priority | **P2.** Real, zero-fabrication-risk commercial opportunity, but no confirmed search-visibility failure the way the wedding-catering gap has — this is an opportunity to capture, not a measured loss to fix. |

---

## What I'm explicitly not proposing

- Any additional `biryani-<city>` or `catering-<city>` pages — city
  coverage is complete (Phase 5).
- A dedicated Corporate Catering page — already decided against in
  Phase 5 as unnecessary doorway-page risk.
- Any delivery-focused content — the site's own checkout doesn't
  support delivery yet; promoting it further would be misleading ahead
  of that feature actually shipping.
- Mass-generated dish or neighborhood pages beyond what already exists
  — the master prompt explicitly warns against this, and the existing
  city-page network already covers the real geographic long tail.

---

## Next step

Both proposals need Osman's go-ahead before any implementation (Phase
16's job, not this one) — these are specs, not commitments. The
Wedding & Event Catering page is the higher-confidence investment
given how consistently it's been missing across every test run in this
project so far.
