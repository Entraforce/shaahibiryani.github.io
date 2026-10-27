# Phase 0 — Repository SEO Audit (Discovery Only)

Date: 2026-10-27
Branch: `seo/phase0-audit` (off `main`)
Scope: read-only review of the static HTML repo. No fixes proposed here — this
is a findings document to support an owner decision on what to prioritize next.

---

## Executive summary

- **A broken internal link ships 404s to visitors today**: `catering-plano.html:283`
  links to `biryani-plano`, a page that does not exist on disk or in the
  sitemap. Anyone who clicks "Plano biryani delivery page" from the catering
  page lands on a 404.
- **Hardcoded customer reviews and a star rating are baked into `index.html`'s
  JSON-LD** (`"aggregateRating"` 4.3/484, plus named reviews from "Fatima A.",
  "Tariq M.", etc. at lines 188–207+). These are static text in the HTML, not
  pulled live from Google/Yelp. It is not possible to verify from the repo
  alone whether these are real, attributable quotes — if they are not, this is
  a real risk under Google's structured-data guidelines for self-serving review
  markup.
- **The Restaurant schema's `foundingDate` says `"2025"`** (index.html:138),
  which conflicts with CLAUDE.md's locked fact that the brand was founded in
  2017 (Glendale Heights, IL) and only the Plano location opened in 2025.
- **17 of the 19 catering city pages share near-boilerplate meta descriptions**
  that differ only by city name, while the other 2 (Allen, Richardson) and most
  of the 18 biryani pages carry real local specifics (drive time, named
  landmarks). This is a duplicate/thin-content risk concentrated specifically
  in the catering page `<meta name="description">` tags.
- **`robots.txt` has no `Disallow` rules at all** — crawling of `/kadmin` and
  `/table` is only blocked by a page-level `noindex, nofollow` meta tag on each
  (confirmed present and correct on both). That protection works for indexing,
  but does nothing to stop the pages from being crawled/fetched.
- **Call-click Google Ads conversion tracking is live and committed** (not a
  placeholder) across 43 pages — this appears to contradict the session memory
  note that it was "built but not yet live." Separately, the catering-lead
  capture backend (`supabase/functions/create-catering-lead/`,
  `scripts/export-offline-conversions.mjs`) is still **uncommitted/untracked**,
  so that half of the offline-conversion project genuinely is not live.
- **`privacy.html` is the only page whose canonical tag and sitemap entry keep
  the `.html` extension**; every other indexable page (including the 37 city
  pages) uses an extensionless URL convention.

---

## 1. Crawling / indexing basics

**robots.txt** (3 lines):
```
User-agent: *
Allow: /
Sitemap: https://shaahibiryanidfw.com/sitemap.xml
```
No `Disallow` lines exist. `/kadmin` (owner admin login) and `/table` (in-store
QR table-ordering page) are reachable by any crawler that finds a link to them;
they are kept out of the index only via page-level `<meta name="robots"
content="noindex, nofollow">` (confirmed at `kadmin.html:6` and `table.html:6`).
That is sufficient to keep them out of Google's index, but robots.txt provides
no crawl-budget protection, and a crawler must actually fetch the page to see
the noindex tag.

**`404.html`** has neither a `noindex` meta tag nor a canonical tag nor a
`<title>` nor a `<meta name="description">` — it is not a conventional error
page at all. It contains only a Google Analytics tag (`G-3NJRL7V5NB`,
`404.html:5`) and a script that stores the attempted path in
`sessionStorage` and does `window.location.replace('/')` (`404.html:14–16`),
i.e. it's a client-side SPA-style bounce to the homepage rather than a page
meant to be read. GitHub Pages serves this with an HTTP 404 status for
unmatched paths, which is generally enough to keep search engines from
indexing it regardless of its missing meta tags — but it's worth the owner
knowing this file is doing a redirect trick, not showing an actual "page not
found" message to a human visitor.

**Sitemap completeness** — `sitemap.xml` has exactly **44** `<url>` entries
(verified by counting `<url>` tags): home, `/reserve`, `/hall`, `/venues`,
`/careers`, `/dine-in`, `/privacy.html`, 18 `biryani-*` pages, and **19**
`catering-*` pages (18 city pages + `catering-plano`, since there is no
`biryani-plano` counterpart — see the broken-link finding in §4/§8).

Cross-checked against every `.html` file on disk (47 total: `404.html`,
`careers.html`, `dine-in.html`, `hall.html`, `index.html`, `kadmin.html`,
`privacy.html`, `reserve.html`, `table.html`, `venues.html`, 18
`biryani-*.html`, 19 `catering-*.html`):

- Every `biryani-*.html` and `catering-*.html` file on disk has a matching
  sitemap entry, and vice versa — **no mismatches** in the city-page sets.
- **Not in the sitemap** (as expected/appropriate): `404.html`, `kadmin.html`,
  `table.html`. These three are the only files on disk with no sitemap entry,
  and all three are intentionally non-indexable (see noindex findings above).
- One incidental extra file was found during the search that is not on the
  site structure at all: `assets/table-qr/print-sheet.html` (has its own
  `<title>` but is not in the sitemap, not linked from any page body we
  checked, and is presumably an internal print tool for QR table cards, not a
  public page — flagging only so it isn't mistaken for an orphaned real page).

**`lastmod` staleness** — nothing is alarmingly old relative to 2026-10-27.
Oldest dates: `reserve` and `venues` at 2026-08-21, `careers` at 2026-08-19
(roughly 2 months). All 19 catering pages are dated 2026-09-18 except
`catering-plano` (2026-10-06). All 18 biryani pages are dated 2026-10-06 to
2026-10-08. `index.html` is dated 2026-10-26 (one day before this audit,
consistent with the recent menu-publish commit activity in `git log`).

**`llms.txt`** exists at the repo root and is well-formed, but is **not
referenced anywhere** — not from `robots.txt` (which lists only the XML
sitemap), and not linked from any HTML page's `<head>`. Its URL list matches
the sitemap/disk convention exactly (19 catering cities including Plano, 18
biryani cities, no `biryani-plano`, same core pages) — content-wise it's
consistent, it's just undiscoverable except by a crawler that already knows to
look for `/llms.txt` by convention.

---

## 2. Canonical tags

Every indexable page has a self-referencing canonical tag — 44 of 44 pages
that are in the sitemap (index.html:104, plus one `<link rel="canonical">`
line per city page, e.g. `catering-addison.html:55`, `biryani-garland.html:26`,
`careers.html:23`, `venues.html:23`, `hall.html:23`, `dine-in.html:18`,
`reserve.html:26`, `privacy.html:18`). `404.html`, `kadmin.html`, and
`table.html` have none, which is correct given they're noindexed/non-public.

**One inconsistency**: `privacy.html:18` is the only canonical tag on the
entire site that keeps the `.html` extension —
`<link rel="canonical" href="https://shaahibiryanidfw.com/privacy.html">` —
while literally every other page's canonical (and every internal link we
sampled) uses the extensionless form (`/reserve`, `/hall`, `/catering-addison`,
`/biryani-garland`, etc.). The sitemap entry for privacy also keeps `.html`
(`sitemap.xml` line 262), so at least `privacy.html`'s own canonical and its
sitemap entry agree with each other — it's only inconsistent with the rest of
the site's URL convention, not internally contradictory.

No canonical tag on any page points to the wrong domain or to a different
page than itself; all are correctly self-referencing.

---

## 3. Structured data (JSON-LD)

`application/ld+json` blocks exist on 43 of 47 pages. Missing from: `404.html`,
`kadmin.html`, `table.html` (all intentionally non-indexed, consistent with
§1/§2), and **`assets/table-qr/print-sheet.html`** (not a real site page).

**NAP/certification accuracy — matches CLAUDE.md exactly** everywhere checked:
- `index.html:134` `"telephone": "+1-469-960-3300"`; `:166-169` street address
  "3421 E Renner Rd, Suite 110" / Plano / TX / 75074 — exact match.
- `hall.html:55,60-63` — same phone/address, exact match.
- `biryani-frisco.html:63,66` and `catering-plano.html:92,95` (sampled as
  representative city pages) — same phone/address, exact match.
- "100% Zabihah Halal, Hafsah Certified, HMS Certified" phrasing appears
  verbatim and consistently inside FAQ `acceptedAnswer` text across
  `index.html`, `hall.html`, `venues.html`, and the sampled city pages.
- `index.html:177-180` opening hours:
  `Sunday/Tuesday/Wednesday/Thursday 11:30–22:00`,
  `Friday/Saturday 11:30–23:00` — matches CLAUDE.md exactly (and correctly
  encodes "closed Mondays" by omission). No other page carries its own
  `openingHoursSpecification` — city/hall pages reference the restaurant via a
  nested `Service`/`EventVenue` type without restating hours, so there's
  nothing to drift out of sync on those pages.
- `sameAs` URLs at `index.html:182-187` match CLAUDE.md's four locked social
  URLs exactly, including the correct Facebook **Business Page** URL (not the
  `profile.php?id=` personal-URL mistake CLAUDE.md warns about).

**Two things that diverge or can't be verified from the repo:**
- `index.html:138` — `"foundingDate": "2025"`. CLAUDE.md's locked fact is
  "Founded 2017 (Glendale Heights, IL)" with "Plano location opened
  2025-04-06" as a separate fact. The schema's `foundingDate` currently reads
  as if the *business* was founded in 2025, which is one year/location fact
  collapsed into the wrong field — worth an explicit owner decision on which
  date (or whether a different property, like `openingDate`, is model-correct
  for schema.org `Restaurant`/`LocalBusiness`) before fixing it.
- `index.html:188-207+` — `"aggregateRating"` (`ratingValue: "4.3"`,
  `reviewCount: "484"`) and a `"review"` array of named quotes (Fatima A.,
  Tariq M., and others — 7 total `review`/`reviewBody` matches in the file).
  These are static strings checked into the HTML, not fetched live from
  Google/Yelp. Can't verify from the repo whether these are real, attributable
  reviews or placeholder/illustrative text — flagged as an open question below
  because of the compliance risk either way.

`venues.html` and the city pages' `BreadcrumbList`/`FAQPage` schema were
spot-checked for internal consistency (breadcrumb `item` URLs match the page's
own canonical/sitemap URL) and found correct in every sample pulled.

---

## 4. Duplicate / thin content risk — the 18 biryani + 19 catering pages

Sampled: `biryani-frisco.html` vs `biryani-allen.html` (175 differing lines out
of ~290), and `catering-plano.html` vs `catering-dallas.html` (178 differing
lines out of ~437). In both cases roughly 55–60% of lines differ — the pages
are built from a shared template but are not near-duplicates line-for-line.

**Biryani pages** carry real per-city specifics: exact drive distance and
time via a named route (e.g. `biryani-frisco.html:259` — "about 20 miles
(roughly 21 minutes)... via the Dallas North Tollway"; `biryani-denton.html:95`
— "about 38 miles"), named local landmarks (Stonebriar/Frisco Square;
Downtown Denton Square/UNT campus), and city-specific delivery-platform
caveats (some pages note "Grubhub's coverage doesn't reach this far" for
Carrollton/Addison/McKinney, others don't). This is genuine localization, not
just a city-name swap.

**Catering pages are less consistently localized.** Comparing all 19 meta
descriptions (see §5 for exact text): only **2 of 19** — Allen
(`catering-allen.html:44`, "near Watters Creek and the Event Center") and
Richardson (`catering-richardson.html:44`, "weddings, UTD and Telecom Corridor
events") — name a specific local landmark. The other **17** (Addison,
Carrollton, Coppell, Dallas, Denton, Farmers Branch, Flower Mound, Frisco,
Garland, Lewisville, McKinney, Mesquite, Plano, The Colony, Rockwall, Wylie,
Irving) all read as a near-identical template:
`"100% Zabihah Halal Hyderabadi catering in {City}, TX — biryani, kababs and
wedding menus. Serving {City} weddings and corporate events."` (Wylie's varies
slightly by adding "Indian and Pakistani" and "haleem"). The page bodies do
still vary by ~55-60% line-for-line (per the diff above) with genuine FAQ-level
local color, but the meta description — the text users and Google actually
see in search results — is close to boilerplate for 17 of 19 cities.

This matters because near-duplicate meta descriptions across many pages in the
same cluster can make it harder for Google to treat each page as a distinct
result worth showing separately (classic local-pages-at-scale duplicate
content risk), even when on-page body content differs.

---

## 5. Meta descriptions & title tags

Every indexable page has both a `<title>` and a `<meta name="description">`
**except `404.html`, which has neither** (consistent with it being a
redirect-bounce page rather than a real page — see §1).

All 18 biryani titles follow `"Best Halal Biryani Near {City}, TX | Shaahi
Biryani"` and are unique per city (not literal duplicates — city name differs
each time). All 19 catering titles follow `"Zabihah Halal Catering {City}, TX
| Shaahi Biryani"`, also unique per city. No two pages share an identical
`<title>`.

Descriptions: biryani-page descriptions are individually differentiated (they
encode whether DoorDash/Grubhub/Uber Eats coverage is claimed for that city —
e.g. `biryani-carrollton.html:15` explicitly notes "Grubhub's coverage doesn't
reach this far" while `biryani-allen.html:15` claims "reliable DoorDash and
Grubhub delivery"). Catering-page descriptions are the thin/boilerplate set
described in §4.

Core pages (home, hall, venues, careers, dine-in, reserve, privacy) all have
distinct, non-generic titles and descriptions.

---

## 6. Tracking / analytics

**Google Analytics 4** (`gtag.js`, measurement ID `G-3NJRL7V5NB`) and
**Google Ads** (`AW-17075652554`) are both installed, loaded identically at
the top of `<head>` on every page we sampled (e.g. `index.html:5,10`,
`biryani-frisco.html:9-11`, and `404.html:5`). There is no Google Tag Manager
container (`GTM-...`) anywhere, and no Meta/Facebook Pixel (`fbq(`) anywhere
in the repo — GA4 + Google Ads via gtag.js is the entire tracking stack.

**Consent handling**: `index.html:36-41` sets `gtag('consent','default', {ad_storage:'denied', ...})`
before the tag loads, with a `grantConsent()` function (`index.html:7384`)
tied to a cookie-consent flow, and an analytics event helper
(`index.html:7629-7631`) that only fires custom events after
`shaahi_cookie_consent === 'granted'`. This looks like a genuine consent-mode
implementation, not a decorative banner.

**Call-click conversion tracking is live, not a placeholder.** Both
`scripts/add-call-tracking.mjs` and `scripts/set-call-conversion-label.mjs`
exist (committed in `b6cd4d8`, "Track phone-number clicks and wire catering
leads for attribution") and insert a `<!-- CALLTRACK:START -->...<!-- CALLTRACK:END -->`
snippet before `</body>` on 43 target pages (the 6 fixed pages
`add-call-tracking.mjs` names — index, hall, venues, careers, reserve, privacy
— plus all 18 biryani and 19 catering pages). Confirmed present with the
**real** label, not the script's own placeholder
(`AW-17075652554/REPLACE_WITH_CALL_CLICK_LABEL`), in every file checked —
e.g. `index.html:7463-7470` and `catering-plano.html:392-399` both fire
`gtag('event','conversion',{'send_to':'AW-17075652554/_CCiCPey2pQdEMqPp84_'})`
on any click of a `tel:` link. A repo-wide search for the placeholder string
found it only inside `add-call-tracking.mjs` itself (the script's own source),
confirming the real label has already been swapped in everywhere via
`set-call-conversion-label.mjs`.

This appears to **contradict the session memory note** ("Pending: ads tracking
deploy... built not yet live") — the call-click half of that project is live
and committed on `main`. What genuinely is not yet live/committed: the three
untracked files in `git status` —
`supabase/functions/create-catering-lead/`,
`supabase/migrations/20261006000000_catering_leads.sql`, and
`scripts/export-offline-conversions.mjs`. That's the catering-lead-capture /
offline-conversion-import half of the project, and it is correctly still
outstanding.

---

## 7. HTTPS / URL consistency

`CNAME` contains a single line: `shaahibiryanidfw.com` — correct, no `www.`
or protocol prefix issues possible at that level.

No `href="http://..."` (non-HTTPS) links were found anywhere in the `.html`
files in the repo.

Internal links are consistently extensionless (`catering-frisco`,
`biryani-allen`, `reserve`, `hall`, etc.) with **one exception**: `privacy.html`
is always referenced with its `.html` extension (its own canonical and the
sitemap entry both use `/privacy.html`; we did not find any internal link
using a bare `/privacy` instead). No `.html`-extension internal links were
found pointing to any of the pages that are supposed to be extensionless
(`reserve.html`, `hall.html`, etc. as link targets) in the sample pages
checked (`reserve.html`, `hall.html`, `venues.html`, `careers.html`,
`dine-in.html`, `catering-plano.html`, `biryani-frisco.html`) — so the
convention is applied consistently everywhere except for `privacy.html`
itself. There is no `_redirects`, `_config.yml`, or `.nojekyll` file in the
repo, so whatever makes the extensionless URLs resolve is default GitHub
Pages behavior, not a custom redirect rule — worth confirming on the live
site that `/privacy` (without `.html`) doesn't also resolve to a second,
non-canonical copy of the same page.

---

## 8. Orphan page check

**Catering pages**: all 19 are reachable from crawlable pages. `index.html`
links directly to 18 of the 19 (`index.html:4644-4661`) — every catering city
except `catering-plano` itself (which makes sense; the homepage *is* the Plano
location). `catering-plano.html` is in turn linked from the footer of all 18
other catering pages (e.g. `catering-carrollton.html:366`,
`catering-allen.html:366`), so it is not orphaned, just not linked from the
homepage directly.

**Biryani pages**: `index.html` links directly to only **5 of 18**
(`biryani-frisco`, `biryani-allen`, `biryani-mckinney`, `biryani-richardson`,
`biryani-dallas` — `index.html:4667-4671`). The other 13 (Addison, Carrollton,
Coppell, Denton, Farmers Branch, Flower Mound, Garland, Irving, Lewisville,
Mesquite, Rockwall, The Colony, Wylie) are **not linked from the homepage** at
all. They are not orphaned overall, though — each biryani page has a "We Also
Deliver Biryani To" block linking to 4-5 sibling cities (e.g.
`biryani-frisco.html:264-273`), and mapping all 18 pages' outbound links shows
every city receives at least 2 inbound internal links from this sibling mesh.
But the distribution is uneven: Dallas receives ~10 inbound sibling links and
Richardson ~9, while Addison, Coppell, Denton, Irving, Mesquite, and Rockwall
each receive only 2. None are a hard orphan (sitemap-only with zero inbound
links), but internal link equity (and a human visitor's chance of discovering
them without search) is concentrated on a handful of "hub" cities.

**Broken link found during this check**: `catering-plano.html:283` contains
`<a href="biryani-plano">Plano biryani delivery page</a>` — but no
`biryani-plano.html` file exists on disk, and no `biryani-plano` URL exists in
the sitemap or `llms.txt`. This link 404s today for any visitor or crawler
that follows it. (This is the one instance where index.html's catering list
and the biryani list don't mirror each other — there are 19 catering pages
including Plano, but intentionally only 18 biryani pages, since Plano biryani
is covered by the homepage itself — this specific link just forgot that.)

---

## 9. Mobile / viewport basics

`<meta name="viewport" content="width=device-width, initial-scale=1.0">` (or
the equivalent with `viewport-fit=cover`) is present on 46 of 47 HTML files.
Confirmed present on `index.html:91`, and present across every sampled
`biryani-*` and `catering-*` page. **The one file missing it is `404.html`**
— consistent with that file being a minimal redirect-bounce script rather
than a page meant to be viewed (see §1).

---

## Open questions for the owner

These need a business decision or information we can't get from the code —
plain-language version of each:

1. **Are the reviews shown in the website's "rich snippet" code real?**
   Buried in the homepage's code (not visible to a normal visitor, but
   visible to Google) are a star rating (4.3 out of 5, from 484 reviews) and a
   handful of named customer quotes ("Fatima A.", "Tariq M.", etc.). If these
   numbers and quotes are pulled from real Google/Yelp reviews, that's fine.
   If they were written as placeholder/example content and never swapped for
   the real thing, Google treats that as a fake-reviews violation and can
   penalize the whole site's search visibility — this is worth confirming
   before we touch anything else.
2. **When should the website officially say Shaahi Biryani was "founded"?**
   The code currently tells Google the business was founded in 2025. Your
   own house rules say the brand started in 2017 in Illinois, and the Plano
   location opened in 2025. We should pick the correct date for the "founded"
   field — likely 2017 — but want your confirmation before changing it.
3. **Should `/table` and `/kadmin` be harder to stumble onto, not just
   hidden from search results?** Right now, Google is told "don't index
   these two pages," which works. But nothing stops a random visitor or bot
   from finding and loading them if they guess or discover the address. Is
   that an acceptable level of protection for the owner's menu-editing tool
   and the in-restaurant table page, or would you want something stronger?
4. **Was there supposed to be a "biryani near Plano" page?** One of the
   catering pages links to a "Plano biryani delivery page" that doesn't
   exist, so clicking it currently shows an error. We can either remove that
   link or build the missing page — which would you prefer?
5. **Is the 404 (page-not-found) page working the way you want?** Right now,
   if someone mistypes a web address or clicks an old/broken link, they don't
   see a "sorry, page not found" message — they get silently bounced straight
   to the homepage. That may be intentional, but it means a visitor (or you,
   testing a link) can't easily tell that a link was actually broken.
