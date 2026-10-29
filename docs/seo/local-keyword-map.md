# Phase 5 — Advanced Local SEO for DFW

Date: 2026-10-29
Branch: `seo/phase5-local-seo` (off `main`)
Scope: keyword-intent research for the DFW biryani/catering market, a
content-differentiation and cannibalization audit of all 36 existing
`biryani-<city>.html` / `catering-<city>.html` pages, a keyword-to-page
map, and one critical content-integrity fix discovered and corrected
during the audit.

**Method**: live Google searches (not a paid keyword-volume tool —
Ahrefs/SEMrush/Google Keyword Planner access wasn't available this
session) for the master prompt's listed query list, cross-referenced
against a full read of all 36 city pages plus `hall.html` and
`venues.html`. Per the master prompt's own rule ("do not fabricate
search volumes, keyword difficulty, ranking positions"), everything
below is qualitative — SERP presence/absence and intent category, not
invented numbers.

---

## Executive summary

1. **Critical finding, already fixed and committed**: all 19
   `catering-<city>.html` pages claimed Shaahi Biryani had catered
   events at specific, real, named venues (Hilton Anatole, Rosewood
   Mansion on Turtle Creek, Allen Event Center, UT Dallas graduations,
   a dozen more). Osman confirmed none of these are real past events.
   Rewritten to generic, accurate venue-type language — see
   [Content-integrity fix](#content-integrity-fix-critical--already-fixed)
   below.
2. **No new city pages needed.** Every city the master prompt names
   (Plano, Frisco, Allen, McKinney, Richardson, Carrollton, Addison,
   Dallas, Garland, The Colony, Wylie) already has both a `biryani-`
   and `catering-` page, plus 8 more cities beyond the prompt's list
   (Coppell, Denton, Farmers Branch, Flower Mound, Irving, Lewisville,
   Mesquite, Rockwall). Phase 5's job here is refining what exists, not
   building more.
3. **No keyword cannibalization** between the two page types:
   `biryani-<city>` targets individual-order intent ("Halal Biryani
   Near X," pickup + third-party delivery); `catering-<city>` targets
   event/wedding intent. Clean split, one cross-link each way.
4. **Indexing is clean** — all 36 city pages + homepage are in
   `sitemap.xml` with correct canonicals, zero orphans.
5. **The existing catering pages are already working**: a live search
   for "halal biryani catering DFW" surfaces Shaahi's own
   `catering-<city>` pages as top results, with Google's AI summary
   pulling facts directly from them. This validates the 18-city
   catering-page strategy as real SEO value, not doorway-page spam.
6. **Real gap**: "Indian wedding catering Plano" returns zero Shaahi
   pages in a live search, despite `hall.html` and `venues.html`
   already covering exactly that intent. This is a keyword-mapping
   problem, not a missing-content problem — see
   [Keyword-to-page map](#keyword-to-page-map).
7. **Minor, not urgent**: internal link counts among `biryani-*`
   siblings range from 3 (Farmers Branch, The Colony, Wylie) to 9
   (Dallas, Richardson) — worth a small rebalance, same pattern as
   Phase 0's fix.
8. **Two open items for Osman**, not blocking: the DoorDash/Uber
   Eats/Grubhub per-city coverage claims on `biryani-*` pages, and a
   separate, different venue list on `venues.html` — see
   [Open questions](#open-questions-for-osman).

---

## Content-integrity fix (critical — already fixed)

While auditing city-page content for genuine differentiation (required
by Phase 5: "each page must contain genuinely useful, differentiated
content," "do not create misleading location pages"), every
`catering-<city>.html` page's opening paragraph turned out to name
2–4 specific, real, checkable venues as places Shaahi "routinely" or
"regularly" caters — e.g. Dallas named the Hilton Anatole, Westin
Galleria Dallas, and Rosewood Mansion on Turtle Creek; Richardson's
page claimed "UTD graduations"; Allen named the Allen Event Center by
name in two places. This is the exact pattern CLAUDE.md and the master
prompt both prohibit: inventing a specific, falsifiable business claim
to make city copy sound more locally authentic.

I confirmed the pattern was real (read all 19 lead paragraphs directly,
not just the audit summary), then asked Osman directly rather than
guessing. **He confirmed: all invented, remove sitewide.**

Fixed in commit `4c61725` on this branch: 19 `catering-<city>.html`
pages, 23 lines changed. Every specific venue name was replaced with
generic, accurate venue-type phrasing ("hotels, banquet halls and
private venues") while keeping the real geographic/neighborhood
references (Josey Ranch, Legacy West, Stonebriar, etc. — these are
area names, not claimed business relationships, so they're fine to
keep). Caught and fixed three variants of the same issue beyond the
obvious lead paragraph: a hero subhead naming "the Allen Event Center,"
a meta description referencing "the Event Center," and a feat-grid
line claiming "UTD graduations" specifically.

**Not touched**: `venues.html` has its own, different list of 11 named
venues ("has catered at 11+ venues across DFW, including Shalimar
Banquet Hall, Verona Villa Banquet Hall... serving 3,000+ guests across
50+ events"). This list doesn't overlap with the invented city-page
list (only one name, Flourish Events Dallas, appears in both) and
wasn't part of what Osman confirmed as fabricated — it reads as a
separate, likely genuine, dedicated "venues we've catered" page. Flagged
as its own open question below rather than assumed fake.

---

## City-page inventory & coverage

| City | `biryani-` page | `catering-` page | In master prompt's list? |
|---|---|---|---|
| Plano | (homepage) | ✅ | ✅ |
| Frisco | ✅ | ✅ | ✅ |
| Allen | ✅ | ✅ | ✅ |
| McKinney | ✅ | ✅ | ✅ |
| Richardson | ✅ | ✅ | ✅ |
| Carrollton | ✅ | ✅ | ✅ |
| Addison | ✅ | ✅ | ✅ |
| Dallas | ✅ | ✅ | ✅ |
| Garland | ✅ | ✅ | ✅ |
| The Colony | ✅ | ✅ | ✅ |
| Wylie | ✅ | ✅ | ✅ |
| Coppell | ✅ | ✅ | extra |
| Denton | ✅ | ✅ | extra |
| Farmers Branch | ✅ | ✅ | extra |
| Flower Mound | ✅ | ✅ | extra |
| Irving | ✅ | ✅ | extra |
| Lewisville | ✅ | ✅ | extra |
| Mesquite | ✅ | ✅ | extra |
| Rockwall | ✅ | ✅ | extra |

No gaps. No doorway-page risk from sheer volume, since the fork's
content audit (see below) found each page's body copy — aside from the
now-fixed venue paragraph — genuinely varies per city (distinct
neighborhoods, distinct driving directions, distinct "why X hosts
choose us" framing).

---

## Keyword-to-page map

Qualitative intent only — no fabricated volumes.

| Query cluster | Intent | Target page(s) | Notes |
|---|---|---|---|
| "biryani restaurant Plano," "Hyderabadi biryani Plano," "biryani near me" | Transactional, dine-in/pickup | `index.html` (Plano) / `biryani-<city>.html` | Already well-served; index.html is the strongest page for brand + category terms. |
| "chicken biryani near Plano," "goat biryani Plano" | Transactional, dish-specific | `index.html` menu section | Goat Dum Biryani is a real, verified menu item (confirmed in `index.html`'s menu data) — no fabrication risk here. |
| "Indian food delivery Plano" | Transactional, delivery | `biryani-<city>.html` (third-party DoorDash/Uber Eats/Grubhub links only) | **Must not imply the site's own checkout delivers** — CLAUDE.md is explicit that delivery is disabled site-side (no server-side fee calc yet). The existing pages already route this correctly through third-party apps; keep it that way until that project ships. |
| "biryani catering Plano," "Indian catering Plano," "halal catering DFW" | Transactional, event catering | `catering-<city>.html` | Already ranking — confirmed via live search, Shaahi's own pages surfaced as top results for "halal biryani catering DFW." |
| "Hyderabadi food DFW" | Informational/brand | `index.html`, `catering-plano.html` | Covered by existing "Hyderabadi" emphasis sitewide. |
| **"Indian wedding catering Plano/DFW," "wedding catering DFW"** | Transactional, high-value | `hall.html` (on-site, ≤132 guests) + `venues.html` (off-site) + `catering-plano.html` | **Gap**: live search shows zero Shaahi results for this exact cluster even though both hall.html and venues.html exist and target it. Likely a title/meta/H1 targeting issue rather than a missing-content issue — worth a closer on-page audit of hall.html/venues.html's exact title tags against this specific phrase in a future technical pass. |
| "corporate catering Plano/DFW" | Transactional | `catering-<city>.html` | Already mentioned on every catering page ("corporate events"); not a dedicated page, which is appropriate per the master prompt's warning against doorway pages for every sub-intent. |

---

## Content differentiation & cannibalization audit

Full page-by-page detail was produced by a read-only sweep of all 36
city pages (titles, meta descriptions, H1s, canonical tags, sitemap
presence, internal link counts). Top-line results:

- **Zero cannibalization** between `biryani-X` and `catering-X` pairs —
  each targets a distinct intent and cross-links to the other once.
- **Sitemap/canonical hygiene**: clean across all 36 pages.
- **Internal linking**: inbound sibling-link counts range 3–9 among
  `biryani-*` pages. Farmers Branch, The Colony, and Wylie sit at the
  low end (3). Not broken, but the same category of imbalance Phase 0
  already fixed once — a small rebalance (bump the low end toward 5–6)
  would be consistent with that prior work. Low priority.
- **FAQ block duplication**: every catering page's FAQ answer is
  near-verbatim except the city name. Low risk on its own (FAQ schema
  commonly repeats structure), but worth knowing it's not differentiated
  the way the lead paragraphs now are.
- **Third-party delivery coverage claims** (`biryani-*` pages only):
  per-city DoorDash/Uber Eats/Grubhub availability statements show real
  variation city to city (not copy-pasted), suggesting someone actually
  checked platform coverage at some point. Platform delivery zones
  drift over time, so this is worth a periodic spot-check — flagged
  below, not fixed now since I have no way to verify current third-party
  coverage without placing test orders.

---

## Verified search behavior (live, not fabricated)

- "biryani restaurant Plano TX" — surfaces [Shaahi Biryani](https://shaahibiryanidfw.com/) alongside 6+ real local competitors (Aslam Biryani House, Bawarchi Biryanis, Biryani & Co, Jabbar Bhai Biryani, Biryani Pot, Biryaniify) — useful competitor list for Phase 14.
- "halal biryani catering DFW" — Shaahi's `catering-<city>` pages are the dominant result; Google's AI Overview pulled catering capacity, certification, and guest-count facts directly from the site.
- "Hyderabadi biryani Plano" — Shaahi appears alongside Hyderabad Wala, Hyderabad House, Deccan Grill.
- "Indian wedding catering Plano Texas" / "corporate catering Plano Texas Indian" — **Shaahi does not appear**; results are dominated by dedicated wedding/corporate caterers (Just Punjabi Foods, Bawarchi Caters, Dil Se Desi, Richi Caterers). This is the gap noted in the keyword map above.
- "goat biryani Plano near me" — Shaahi appears with a (search-engine-generated, not site-authored) description of the Goat Dum Biryani — confirms the dish itself has real search demand.

---

## Open questions for Osman

1. **`venues.html`'s own venue list** ("has catered at 11+ venues...
   Shalimar Banquet Hall, Verona Villa Banquet Hall, Serene Banquet,
   Crystal Banquet, Richardson Women's Club, Holiday Inn Fort Worth,
   Flourish Events Dallas, a Hilton Hotel, Golden Eagle Ranch, The
   Spring Events, Convention Plaza in Irving") — is this list accurate?
   It wasn't part of the venue-claim question you already answered, and
   it's a different list, so I didn't touch it.
2. **Third-party delivery coverage claims** on `biryani-<city>.html`
   pages (which cities DoorDash/Uber Eats/Grubhub actually reach) —
   these look genuinely checked rather than boilerplate, but platform
   coverage areas change; worth a spot-check next time you're confirming
   delivery-app settings.
3. **Internal link rebalance** (Farmers Branch/The Colony/Wylie at 3
   inbound links vs. Dallas/Richardson at 9) — low priority, want me to
   do this alongside a future phase, or skip it?

---

## Limitations

No Google Keyword Planner, Ahrefs, or SEMrush access this session —
all intent/competition assessment above comes from live Google search
results, not keyword-volume or difficulty data. Per the master prompt's
own rule, no search volumes or rankings are reported as numbers because
none were actually measured.
