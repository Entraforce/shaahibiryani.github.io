# Phase 4 — Apple Maps & Apple Business Connect

Date: 2026-10-28
Branch: `seo/phase4-apple-maps` (off `main`)
Scope: cross-check the live, public Apple Maps listing against the
website's NAP/hours/category claims, and against the Google Business
Profile audited in Phase 3.

**Access note**: this session has no Apple ID / Apple Business Connect
login, and per this project's safety rules, creating or signing into a
third-party account isn't something to do without the owner. Everything
below comes from the **public** Apple Maps listing at maps.apple.com,
which requires no login to view. Per the master prompt's own guidance for
this situation, items that genuinely require dashboard access are listed
as an action checklist at the end rather than claimed as done.

A prior session (2026-08-04, recorded in [[shaahi-seo-state]]) checked this
same listing and found it matching — that check is now 2+ months stale, so
everything here was re-verified live today rather than trusted as still
true.

---

## Executive summary

NAP is solid — phone, address, hours, and website URL all match exactly.
Two things genuinely changed or came to light since the August check,
worth the owner's attention:

1. **Apple Maps shows a 4.1★ (24 reviews) rating sourced from Yelp** — not
   from Apple's own reviews, and nowhere close to the 558-review, 4.4★
   signal Google shows. This can't be fixed from the website; it's a
   byproduct of which third-party review source Apple is pulling from for
   this listing.
2. **The category is just "Indian Cuisine"** — no mention of Halal at all,
   despite that being the single most distinctive fact about this
   business for anyone specifically searching for halal food. Google's
   listing, by contrast, carries "Halal restaurant" as the *primary*
   category plus 8 richer secondary categories (Phase 3).

One fact worth a direct verification with the owner: Apple's listing
claims **"Outdoor Dining"** as an attribute, which isn't mentioned anywhere
on the website or in CLAUDE.md's locked facts.

---

## 1–2. Business name & primary category

- **Name**: "Shaahi Biryani" — exact match to the website and GBP.
- **Category**: **"Indian Cuisine"** only. This is Apple's coarser
  category taxonomy compared to Google's — Apple Maps categories are
  generally broader and fewer than Google Business Profile's. Still, there
  may be a more specific or halal-inclusive category available in Apple
  Business Connect that isn't currently selected — **this needs the
  owner/dashboard to check**, since the public listing doesn't show what
  other category options exist, only what's currently chosen.

## 3–4. Address, map pin, phone

- Address: "3421 E Renner Rd, Unit 110, Plano, TX 75074, United States" —
  matches (Apple's listing says "Unit 110" where the website/GBP say
  "Suite 110" — same meaning, not a real inconsistency).
- Map pin coordinate: `32.998127, -96.667467` — matches the website's
  `32.998142, -96.667692` and GBP's `32.998137, -96.667393` to within the
  same sub-meter tolerance seen in Phase 3. All three sources agree.
- Phone: `+1 (469) 960-3300` — exact match.

## 5. Official website

`shaahibiryanidfw.com` — shown **without** the `www.` prefix, i.e. the
canonical bare domain. This is actually **more correct than GBP's website
field**, which Phase 3 found pointing to the `www` subdomain. Apple's
listing already uses the right URL — nothing to fix here.

## 6. Opening hours

Today's hours ("11:30 – 22:00," status "Open" at check time) match the
regular Tuesday–Thursday/Sunday schedule. The public listing view doesn't
expose the full weekly table the way Google's does, so the other days
weren't independently re-verified here — worth a spot check in Apple
Business Connect directly if the owner has access, but nothing suggests a
problem (today's hours are correct, and Phase 3 already confirmed the same
underlying hours are accurate everywhere else).

## 7. Menu URL

No separate menu link exposed on the public Apple Maps card beyond
"Website," which goes to the homepage where the menu lives — consistent
with how Google's listing handles this too (Phase 3 §7).

## 8. Restaurant attributes ("Good to Know")

Listed: Accepts Apple Pay, Accepts Contactless Payments, Takeaway,
Delivery, Accessible Ramps and Doors, **Outdoor Dining**, Street Parking.

- **"Outdoor Dining" doesn't appear anywhere else** — not on the website,
  not in CLAUDE.md's locked facts, not among the attributes Phase 3 found
  on the Google listing. This may be accurate (the restaurant could have
  outdoor seating that just isn't documented anywhere else) or it may be
  an attribute Apple auto-inferred from Yelp data (the listing's review
  source) rather than something the owner actually set. **Needs a direct
  answer from the owner**: does Shaahi Biryani Plano have outdoor dining?
  If not, this should be corrected in Apple Business Connect.
- **"Street Parking" only** — Google's listing lists free parking lot,
  garage, *and* street parking (Phase 3). If there's a real parking lot at
  this location (likely, given it's a suite in a retail building), Apple's
  listing undersells it. Worth adding if Apple Business Connect supports a
  parking-lot attribute distinct from street parking.
- Takeaway/Delivery/Accessible Ramps and Doors/payment attributes all look
  accurate and consistent with the rest of the business's public info.

## 9. Verified food photographs

Two photo categories visible publicly ("From the Business" — an interior
shot; "Food & Drink" — a food photo credited to Yelp). Real, business-
relevant imagery is present; not independently exhaustive-reviewed beyond
confirming it's genuine Shaahi Biryani content, not placeholder or
mismatched photos.

## 10. Business description

The "About" text matches the same description used in the Google Business
Profile almost word-for-word (same founding/certification/capacity facts
verified in Phase 3) — **with one cosmetic issue**: several punctuation
marks appear to have been stripped in Apple's rendering — "Plano's
destination" is missing its em dash, "Dine-in" renders as "**Dinein**"
(no hyphen), "full-service" renders as "**full service**" (no hyphen).
This could be how Apple's web view strips certain Unicode punctuation on
display, or it could reflect how the text was actually entered into Apple
Business Connect. Either way, "Dinein" reads as a typo to anyone looking
at the public listing — **worth checking directly in Apple Business
Connect** and re-entering with plain hyphens (`-`) instead of em dashes if
that's what's causing it, since a hyphen is far less likely to get
stripped than an em dash (—) across different rendering engines.

## 11. Products or services

Not a distinct section on Apple Maps beyond the category and description
already covered above.

## 12. Reviews and owner responses

**Apple Maps does not host its own native reviews for this listing** — it
displays Yelp's review feed directly (4.1★, 24 reviews, with a "More on
Yelp" link). There is no owner-response mechanism on the Apple side at
all; any reply would have to happen on Yelp itself, which is outside this
phase's scope (Yelp is covered properly under Phase 11, citations). Not a
problem to fix here — just worth knowing Apple Maps visibility rides on
Yelp's review count and rating, not Google's or Apple's own.

## 13. Duplicate or outdated listings

Searching "Shaahi Biryani" broadly (not scoped to Plano) returned the
correct Plano listing directly with no disambiguation prompt — no
obvious duplicate or conflicting Apple Maps entry surfaced for this
location. (The separate `shaahibiryani.com` Illinois-locations site noted
in Phase 3 is a different business entity, not a duplicate of this
listing, same as on Google.)

## 14. Consistency between website and Apple Maps

| Field | Website | Apple Maps | Google (Phase 3) |
|---|---|---|---|
| Name | Shaahi Biryani | Shaahi Biryani | Shaahi Biryani |
| Phone | (469) 960-3300 | (469) 960-3300 | (469) 960-3300 |
| Website URL | bare domain | bare domain ✅ | `www` subdomain |
| Category | Halal/Hyderabadi/Indian/Pakistani | "Indian Cuisine" only | Halal restaurant (primary) + 8 more |
| Rating source | — | Yelp (4.1★/24) | Google (4.4★/558) |
| Outdoor dining | not mentioned | claimed | not mentioned |

Apple is the most NAP-accurate of the two map platforms on the one field
where Google slipped (website URL), but the weakest on category richness
and review signal — opposite strengths, worth knowing both exist rather
than assuming "Google is right, Apple should match Google" in every case.

---

## Action checklist (requires Apple Business Connect dashboard access)

Since this session has no Apple ID, these need the owner (or whoever holds
Apple Business Connect access) to check directly — nothing below has been
changed, only identified:

1. **Check available category options** — is there a more specific or
   halal-inclusive category than "Indian Cuisine"? Apple Business Connect
   typically allows a primary category plus some secondary tags.
2. **Verify or correct "Outdoor Dining"** — confirm with the owner whether
   this is accurate; remove if not.
3. **Add a parking-lot attribute** if Apple Business Connect supports
   distinguishing a dedicated lot from street parking.
4. **Re-enter the business description** using plain hyphens instead of
   em dashes, to avoid the "Dinein"/"full service" rendering issue.
5. **Confirm the full weekly hours table** matches (only today's hours
   were visible from the public view).
6. **Investigate whether Apple Business Connect can connect a richer
   review source** than the current 24-review Yelp feed, if that's within
   Apple's current feature set — don't assume this is possible without
   checking, per the master prompt's own caution about Apple Business
   Connect's supported features varying.

Never claim Apple Maps rankings can be controlled through website code —
none of the above is a code change; all of it requires the Apple Business
Connect dashboard itself.
