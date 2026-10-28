# Phase 3 — Google Maps & Google Business Profile Audit

Date: 2026-10-28
Branch: `seo/phase3-gbp-audit` (off `main`)
Scope: cross-check the live Google Business Profile listing (Place ID
`ChIJk1VdZQAZTIYR2hScWLk-YHg`) against the website's NAP, hours, and
structured-data claims. Findings only — no profile fields were changed.

**Method**: public listing fields were pulled via the Places API (New)
using a temporary manual GitHub Actions workflow
(`fetch-gbp-snapshot.yml`, `scripts/fetch-gbp-snapshot.mjs`) so the
restricted API key never had to leave GitHub Actions. Owner-only fields
(categories list, business description, attributes, reviews) were checked
directly in Google Business Profile Manager (`business.google.com`), which
the `support@entraforce.com` account has verified management access to.

---

## Executive summary

**Overall: strong.** NAP, hours, certifications, and the business
description are all consistent across the website, CLAUDE.md's locked
facts, and the live Google listing — this is the kind of result Phase 3
is supposed to confirm, not just hunt for problems. Three real,
actionable items came out of it, none urgent:

1. **Price range mismatch**: Google shows `$` (inexpensive); the website's
   locked `priceRange` is `$$` (moderate).
2. **23 unread customer reviews**, including at least one recent (3 hours
   old at check time) negative review with no owner reply yet.
3. **GBP's "Website" field points to the `www` subdomain**
   (`https://www.shaahibiryanidfw.com/`), not the canonical bare domain
   used everywhere else on the site. It redirects correctly — not broken,
   just an unnecessary extra hop.

Also found along the way, reported separately and urgently since it's
unrelated to SEO and time-sensitive: **the Google Ads account is not
showing ads at all because its payment method is failing.**

---

## 1–2. Business name & categories — accurate, no keyword stuffing

- **Name**: "Shaahi Biryani" — exact match, no appended keywords.
- **Primary category**: **Halal restaurant**.
- **Secondary categories** (8): Indian restaurant, Event venue, Banquet
  hall, Indian takeaway, Caterer, Haleem restaurant, Biryani restaurant,
  Pakistani restaurant.

This is a well-chosen, specific category set — "Haleem restaurant" and
"Biryani restaurant" in particular are niche categories that directly
target high-intent searches, not just the generic "Indian restaurant."
Nothing to fix here.

## 3–4. Address, map pin, phone — exact match

- Address: "3421 E Renner Rd Ste 110, Plano, TX 75074" — matches the
  website's locked NAP exactly.
- Geo coordinates: GBP `32.9981366, -96.6673933` vs the website's
  `32.998142, -96.667692` — differ only in the 5th/6th decimal place
  (sub-meter), not a real discrepancy.
- Phone: `(469) 960-3300` — exact match.
- Note: GBP also has a separate **SMS/chat number**,
  `+1 945-208-3795`, explicitly scoped to text messages, not voice calls —
  this is a different channel, not a NAP inconsistency.

## 5. Website & ordering links

GBP's "Website" field is `https://www.shaahibiryanidfw.com/` — the `www`
subdomain. Every other reference to the domain (canonical tags, sitemap,
CNAME, CLAUDE.md) uses the bare domain. **Verified live**: `www` does
correctly redirect to the canonical non-www URL, so this isn't broken for
visitors — just one avoidable redirect hop between a Google click and the
real homepage. Low priority, but a one-field edit in GBP settings would
close the gap. "Menu or services link" is also set to the `www` homepage
URL, same note applies.

## 6. Business hours & holiday hours

Regular hours match CLAUDE.md and the website exactly:

| Day | GBP hours |
|---|---|
| Sunday | 11:30 AM – 10:00 PM |
| Monday | Closed |
| Tuesday–Thursday | 11:30 AM – 10:00 PM |
| Friday–Saturday | 11:30 AM – 11:00 PM |

**No special/holiday hours are configured** (the "Special hours" section
in GBP is empty). If the restaurant's hours actually change on major
holidays, Google will currently show the regular recurring hours as if
nothing changed — worth asking Osman whether holiday hours ever differ
from the regular schedule, and adding them in GBP if so.

## 7. Menu URL

Covered in §5 — points to the homepage, which does contain the full menu.
No separate menu page exists to link to, so this is appropriate as-is.

## 8. Restaurant attributes

Thoroughly filled in — accessibility (wheelchair parking/entrance/
restroom/seating), amenities (restroom, free Wi-Fi), kid-friendliness
(high chairs, kids' menu), payments (debit/credit/NFC, not cash-only),
parking (free lot/garage/street), and dining options (seating, catering,
lunch/dinner/dessert, table service) are all set and look accurate.

**One attribute worth double-checking**: under "Offerings," Google lists
**"No private dining room."** The business advertises (on the website,
in its own GBP description, and in CLAUDE.md) a private event hall seating
up to 132 guests. "Private dining room" in Google's taxonomy may be
intended for something smaller/different from a bookable event hall, but
a customer searching specifically for private-dining options could be
misled by seeing "No private dining room" show up for a business that
explicitly has one. Worth a conscious decision — either this attribute's
scope genuinely doesn't apply, or it should be corrected.

Also noted: several attributes carry a "Your attributes were updated by
Google" banner (e.g., "Has table service" was recently auto-added by
Google itself, not by the owner). This is routine — Google periodically
infers attributes from reviews/photos — just flagging that it happens, not
a problem to fix.

## 9. Verified food photographs

Not independently content-reviewed (would require viewing every photo),
but the dashboard's own prompt ("Customers added new photos") confirms
real, recent customer-submitted photos exist, consistent with an active,
genuine listing.

## 10. Business description

The owner-written GBP description matches CLAUDE.md's locked facts almost
word for word: founding year/city (2017, Glendale Heights, IL), Plano
opening date (explicitly "April 2025," and the separate "Opening date"
field is set to **April 6, 2025** — exact match to CLAUDE.md), the exact
certification phrase ("100% Zabihah Halal, Hafsah Certified, HMS Certified
– Suppliers"), catering capacity (50 to 3,000+ guests), and hall capacity
(132 guests). No action needed — this is a model example of NAP/fact
consistency across systems.

## 11. Products or services

Covered by the categories (§1–2) and the catering `Service`/`Offer`
structured data already audited in Phase 2 — no GBP-specific products/
services catalog beyond what's already consistent with the website.

## 12. Reviews and owner responses

- **Rating: 4.4 / 558 reviews** — matches the website's automated
  review-rating refresh exactly (which showed 557 as of its last run;
  the 1-review difference is expected lag, confirms the automation is
  healthy, not a bug).
- **The dashboard flags "23 new customer reviews"** as a pending item.
- Directly observed one very recent (3 hours old at check time, 2-star)
  negative review — about a goat biryani order with "scraps and bones
  instead of meat" — **with no owner reply visible under it**, while
  older reviews checked (16+ weeks old) do show owner replies signed
  "Osman." This suggests reply habits are generally good, but there's a
  current backlog worth clearing, including at least one real, specific,
  actionable complaint.

**Recommendation**: read through and reply to the 23 pending reviews,
prioritizing the recent negative one about the goat biryani portion —
real written complaints like this are exactly the kind of signal Phase 12
(conversion/trust) cares about, and a prompt, specific reply is cheap
reputation insurance.

## 13. Duplicate or outdated listings

No "this listing may be a duplicate" warning appeared anywhere in the
dashboard for the Shaahi Biryani Plano listing — Profile Strength shows
"Looks good." Found, but **not a duplicate-listing problem**: a related
sibling website, `shaahibiryani.com`, serves the original Illinois
locations (Glendale Heights, Naperville, Lombard) under the same brand —
a legitimately separate business entity/location, not a duplicate of the
Plano listing. Worth knowing this sibling site exists (e.g., if cross-
linking or sameAs decisions come up in a later phase), but nothing to fix.

## 14. Consistency between website and Google Maps

Summarized from the sections above — the only real inconsistency found is
the **price range mismatch**:

| Field | Website (locked fact) | Google Business Profile |
|---|---|---|
| Price range | `$$` (moderate) | `PRICE_LEVEL_INEXPENSIVE` (`$`) |

Everything else — name, address, phone, hours, cuisine/categories,
certifications, catering capacity, hall capacity, founding/opening dates —
matches exactly or near-exactly. This single mismatch is worth a decision:
Google's price-level signal is partly derived from user behavior/price
data submitted by visitors, not something the owner directly sets in the
same way as hours or address, so "fixing" it may mean nudging Google's own
signal (e.g., via Business Profile support) rather than a simple field
edit — flagging as an open question rather than assuming either number is
"the bug."

---

## Open items for the owner

1. **Price range**: is `$$` (the website's number) or `$` (Google's
   current signal) the one you'd want customers to see? Decide, then we
   can look into whether/how to correct Google's side.
2. **Holiday hours**: do actual hours ever differ from the regular weekly
   schedule on holidays? If so, worth adding to GBP's Special Hours.
3. **"No private dining room" attribute**: worth correcting if it's
   misleading customers about the private event hall.
4. **GBP's website field**: OK to update from the `www` URL to the
   canonical bare-domain URL? Low priority, purely a one-field cleanup.
5. **23 unread reviews**: worth setting aside time to read and reply,
   especially the recent 2-star one.

(Separately, already flagged directly: the Google Ads payment-method
failure needs the owner's own action on the billing side — not an SEO
item, but found during this same dashboard session.)
