# SEO audit fixes — 2026-10-29

Follow-up to a fresh audit of the live site (Lighthouse, a crawl of every
sitemap URL, Search Console, the Google Business Profile review list).

## Search Console baseline (URL-prefix property, last 3 months to 2026-10-27)

- 622 clicks, 69.3K impressions, 0.9% CTR, average position 7.1.
- The homepage takes 566 of the 622 clicks. Every city page has impressions
  (55–621 each) and most have 0–4 clicks, so none were removed.
- Page indexing: 48 indexed. Not indexed: 9 redirects (the `.html` and `www`
  variants, expected), 1 alternate-with-canonical, 1 404, 1 discovered, 1
  crawled-not-indexed.
- Core Web Vitals: "Not enough usage data" on mobile and desktop. Speed is
  therefore not yet a ranking input for this site; Lighthouse numbers are lab only.
- The domain property (`sc-domain:`) is not accessible from osmanm08@gmail.com;
  the URL-prefix property is.

## City pages (`biryani-*`, `catering-*`)

Main-content overlap between two city pages measured 50–81% (5-word shingles,
city names masked, nav/footer excluded). Most of the shared text is the
"Why X orders", bestseller and FAQ blocks.

Done:
- **Drive distances and times corrected** against real routes (OSRM driving
  route from each city's center to 32.998142,-96.667692, no traffic;
  `routes.json` values below). Examples of what was wrong: Wylie 12 mi → 9 mi,
  Rockwall 22 → 26 mi, catering-frisco "15-minute drive … just minutes south
  of Frisco" (it is ~26 minutes, southeast), catering-richardson "north on
  Central" (Richardson is west), catering-lewisville "north" (northwest).
- **One authentic Canon photo per page** (owner's shoot, 2026-10-29; plain
  crops, `assets/dishes/canon/`, 800×640 WebP, lazy-loaded, sized), with a
  caption carrying that city's real drive distance. Dish names match the menu's
  spelling.
- **Meta descriptions** on the 18 `biryani-*` pages shortened from 164–201 to
  ≤160 characters, keeping the per-city delivery-platform facts.

Not done, needs the owner: real per-city detail (events actually catered
there, delivery zones checked in each app) is what would make these pages
genuinely different. Phase 5 already removed invented venue claims; don't
replace them with new invented ones.

| City | mi | min (no traffic) |
|---|---|---|
| Plano | 3 | 7 |
| Richardson | 7 | 11 |
| Garland | 8 | 13 |
| Wylie | 9 | 17 |
| Allen | 10 | 15 |
| Addison | 14 | 19 |
| Carrollton | 18 | 24 |
| Farmers Branch | 18 | 25 |
| McKinney | 18 | 24 |
| The Colony | 18 | 28 |
| Mesquite | 19 | 30 |
| Frisco | 20 | 26 |
| Dallas | 20 | 26 |
| Lewisville | 23 | 28 |
| Irving | 24 | 30 |
| Coppell | 26 | 33 |
| Rockwall | 26 | 37 |
| Flower Mound | 27 | 37 |
| Denton | 38 | 45 |

## Homepage reviews

All 558 Google reviews were loaded in the GBP manager and searched. None of
the three homepage testimonials (Fatima A., Tariq M., Sana R.) appears there:
there is no "Tariq", and the one "Fatima" and one "Sana Aadil" review say
different things. The owner confirmed on 2026-10-28 that the quotes are from
genuine customers (see `00-repository-audit.md`), so they were left unchanged;
they are simply not Google reviews. The `aggregateRating` stays — it is
accurate and `update-review-rating.mjs` depends on it.

## Accessibility (Lighthouse, mobile)

- Homepage 84 → 97: named the About-book page dots, labelled the catering
  form's date and event-type fields and the item size picker, sized the chat
  logo, darkened the vegetarian green (`--f-veg` #0F8A3C → #0B7A34, 5.6:1),
  and stopped fading whole sold-out menu rows (the text fell to 2.2–3.8:1);
  only the photo fades now, the strike-through price and "Sold out" badge remain.
- City, hall, venues, careers and reserve pages: `--text-muted` #907050 →
  #A07F5F (4.3 → 5.3:1), footer text opacity .5 → .66 (3.7 → 5.8:1), catering
  form fields labelled. catering-frisco now scores 100.

## Speed — investigated, deliberately not changed

Mobile LCP 5.9 s in Lighthouse's simulated slow phone; 62% is render delay
from main-thread work (1.6 s style/layout across 2,678 elements and ~125 KB of
CSS, two theme layers), not the hero download (preload + fetchpriority are
already right). `content-visibility:auto` on below-the-fold sections saved
only ~0.1–0.3 s in an A/B run and would make the menu rail's and nav's
computed scroll targets land off, so it was not shipped. The real fix is
removing the dead Midnight-theme CSS, a separate project. No field data
exists yet, so this is not affecting ranking.
