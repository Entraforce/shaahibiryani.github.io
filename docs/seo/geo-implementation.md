# Phase 8 — GEO: Generative Engine Optimization

Date: 2026-10-29
Branch: `seo/phase8-geo` (off `main`)
Scope: Phase 8's own brief overlaps heavily with work already done in
earlier phases (entity consistency → Phases 2/3/4/7; structured data →
Phase 2; service-area accuracy → Phase 5; crawlability → Phase 7). This
phase cross-references that work rather than repeating it, and focuses
new audit effort on the three genuinely new items in Phase 8's brief:
an `llms.txt` evaluation, an original-photography check, and a light
pass on external mentions/citations.

---

## Executive summary

1. **`llms.txt` already exists** at the repo root, and it's accurate —
   every fact in it (name, address, phone, hours, founding year,
   Plano opening date) matches CLAUDE.md's locked facts exactly, and
   it links to all 37 city pages plus every core page. No one appears
   to have audited it before; it predates this SEO initiative. No
   changes needed.
2. **Critical take on `llms.txt`, per the master prompt's own
   instruction not to oversell it**: as of mid-2026, adoption sits
   around 8–10% of top sites, but there's no demonstrated citation or
   ranking benefit — Google has stated publicly it doesn't use it, no
   major AI provider has confirmed reading it in production, and one
   large-scale study found 97% of published `llms.txt` files receive
   zero AI-crawler requests. **Recommendation: keep it, since it costs
   nothing and is already accurate, but don't invest further effort
   expanding it** — it's unproven infrastructure, not a lever.
3. **Original photography confirmed, no stock-image risk found.** Image
   filenames throughout `assets/dishes/`, `assets/menu-photos/` (81
   files), and `assets/promo/` are dish- and deal-specific (e.g.
   `achari-chicken.jpg`, `beef-boti-roll.jpg`, dated promo flyers like
   `achari-bogo-oct28-*`), consistent with real restaurant photography
   and an active, hand-maintained promotional calendar — not generic
   stock imagery.
4. **The dated-promo-flyer system is well-built, not a staleness risk.**
   `index.html`'s flyer logic (`FLYERS` array, ~line 7775) gates each
   promo image behind its own date-based `active` check and shows "at
   most one... and only on its days" — expired BOGO deals self-remove
   rather than lingering as stale claims. No action needed.
5. **Real external mentions found** (useful for this phase's "relevant
   external mentions" goal, and as a starting list for Phase 11's
   deeper citations audit): Apple Maps, a genuine local press article
   from Community Impact ("Shaahi Biryani to serve Indian, Pakistani
   dishes in Plano," Feb 2025 — a real authoritative third-party
   mention, not something to build, just confirm exists), Postmates,
   order.online, RestaurantGuru, Roadtrippers, and zabihah.com
   (already surfaced in Phase 5).
6. **One likely citation inconsistency surfaced, not yet pinpointed** —
   an AI-generated summary of third-party search results described
   hours as "Sunday, Monday, Wednesday, Thursday 11:30am–9:00pm;
   Friday, Saturday 11:30am–10:00pm," which is wrong on multiple counts
   against the locked hours (implies open Monday, which it isn't; wrong
   close times both ends). This is blended from one or more aggregator
   listings, not identified to a specific source yet. **Flagged forward
   to Phase 11** (Citations and Local Authority), which is the right
   phase to pin down exactly which directory has it wrong and fix it
   at the source.
7. **No machine-readable business facts page beyond `llms.txt` is
   needed.** Between the Restaurant JSON-LD (Phase 2, already
   comprehensive) and `llms.txt`, the site already exposes its facts in
   two machine-readable forms. A third dedicated page would be
   redundant.
8. **No fabricated awards, press mentions, or endorsements found** —
   consistent with every prior phase.

---

## Cross-referenced from earlier phases (not re-audited here)

- **Entity consistency** across the website, Google Business Profile,
  and Apple Maps: audited in Phases 2, 3, and 4. Strong consistency
  found; see those docs for the handful of minor open items (price
  range mismatch, GBP website `www` prefix, Apple's generic category).
- **Structured data quality**: audited in Phase 2. Healthy, zero parse
  errors, validated against Google's Rich Results Test.
- **Accurate location/service-area details**: audited in Phase 5. City
  coverage is complete and accurate; the one integrity issue found
  there (fabricated venue claims) is already fixed.
- **Crawlable content / strong internal links**: audited in Phases 1
  and 5. Sitemap and canonicals are clean; internal linking has one
  minor, low-priority rebalance opportunity already noted in Phase 5.
- **Direct answers to customer questions**: audited in Phase 6. One
  genuine content gap (Hyderabadi dum biryani explainer) proposed
  there, not yet added.

---

## Limitations

External-mentions research here was a light pass to satisfy this
phase's own brief, not an exhaustive citation audit — that's Phase
11's job. The specific source of the wrong-hours listing found above
was not tracked down to a single directory in this pass.
