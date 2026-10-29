# Phase 6 — AEO: Answer Engine Optimization

Date: 2026-10-29
Branch: `seo/phase6-aeo` (off `main`)
Scope: audit the site's existing FAQ content (schema + visible) for
accuracy, visible-content parity, and coverage against the kind of
questions real customers (and AI answer engines) actually ask. Two
concrete bugs found and fixed; one genuine content gap identified and
proposed, not yet implemented.

**Starting point**: `FAQPage` JSON-LD already exists on 43 of the
site's HTML files — all 18 `biryani-<city>`, all 19 `catering-<city>`,
plus `index.html`, `reserve.html`, `hall.html`, `venues.html`,
`careers.html`, `dine-in.html`. This phase is about verifying and
sharpening that existing coverage, not adding more of it — the master
prompt itself warns against "repetitive FAQ blocks added solely for
search engines."

---

## Executive summary

1. **Fixed (committed `0975366`)**: the homepage's "What's the best
   biryani in DFW?" FAQ answer hardcoded "4.3★ from 480+ Google
   reviews" as plain prose — a separate string from the `aggregateRating`
   JSON-LD field that `update-review-rating.mjs` already refreshes
   daily. It had drifted stale (real rating: 4.4★/557) since the
   automation never touched it. Corrected the text and extended the
   script to refresh both locations going forward.
2. **Fixed (committed `45eb109`)**: `dine-in.html`'s FAQ schema had 3
   questions, but only 2 showed up as matching visible content, and
   neither was under a labeled "Frequently Asked Questions" heading —
   inconsistent with every other audited page and borderline against
   Google's guidance that FAQ schema needs real supporting visible
   content. Added the heading and the missing third answer, reusing
   the page's own existing info-box style (no new design pattern, no
   new font load).
3. **No factual mismatches found** across the 6 non-city pages audited
   against locked NAP/hours/certification/capacity facts.
4. **One real content gap, proposed below, not yet added**: of the
   master prompt's 6 example questions, "What is the difference
   between Hyderabadi dum biryani and other biryani styles?" is
   answered nowhere on the site. Every existing FAQ is
   transactional/local-intent ("best biryani in X," "is it halal," "do
   you deliver") — none are educational/explanatory, which is exactly
   the gap AI answer engines reward.
5. **Minor, not fixed**: "How can I order biryani in Plano?" is only
   answered as a closing clause inside other answers, not its own
   Q&A. Low priority.
6. **Architecture note**: the master prompt asks to "build a reusable,
   accessible FAQ component only if it fits the site's architecture."
   This is a hand-authored static site with no build step or component
   system (confirmed in CLAUDE.md) — forcing a shared FAQ component in
   here would be the kind of premature abstraction the project doesn't
   need. Recommend continuing the current pattern (schema + matching
   visible HTML, hand-written per page) rather than building one.

---

## Fix detail: stale rating in homepage FAQ

`index.html` line 1841 (FAQPage schema) and line 4774 (visible
paragraph) both hardcoded the exact same sentence, including a
specific rating and review count, as plain text — entirely separate
from the `Restaurant` schema's `aggregateRating` field a few hundred
lines away, which `scripts/update-review-rating.mjs` already refreshes
from the live Google rating every day via a GitHub Actions cron.
Because the regex in that script only ever matched the
`aggregateRating` JSON block, this second hardcoded copy was never
touched — and had already drifted from "4.3★/480+" to the live
"4.4★/557" by the time this audit ran.

This is the same category of bug Phase 0 already fixed once (the
`aggregateRating` itself was stuck at a stale "4.3/484" before that
automation existed) — just in a second, newer location the original
fix didn't know to look for.

**Fix**: corrected both occurrences to "4.4★ from 550+ Google reviews"
(rounded down to the nearest 10, matching the existing convention), and
extended `update-review-rating.mjs` with a second regex
(`FAQ_RATING_RE`) that refreshes this text alongside the schema field
on every run. Verified the regex matches both occurrences in the
current file and the script still passes `node --check`.

## Fix detail: dine-in.html FAQ visibility

`dine-in.html`'s `FAQPage` schema had three questions (halal
certification, reservations, menu sections). Two of the three facts
already appeared on the page as small unlabeled info-box text — just
without a "Frequently Asked Questions" heading tying them to the
schema, and without the third question (menu sections) represented
visibly at all. Every other audited page in this phase had full 1:1
schema-to-visible parity under a clear heading; this one didn't.

**Fix**: added a heading and the third answer, using the exact same
inline-style box pattern the page already used for the first two — no
new visual pattern, no new font dependency (Cinzel was already loaded
on this page).

---

## Content gap: "Hyderabadi dum biryani vs. other styles"

Every FAQ answer on the site today is transactional or local-intent
("where can I find X," "is it halal," "do you deliver to Y"). None are
educational. The master prompt's own example question list includes
"What is the difference between Hyderabadi dum biryani and other
biryani styles?" — and nothing on the site answers it. This is exactly
the kind of content AI answer engines (ChatGPT Search, AI Overviews,
Perplexity) tend to cite: a clear, factual, non-promotional explanation
rather than a sales pitch.

This is general culinary/cuisine knowledge, not a claim about Shaahi's
own business specifics, so it carries much lower fabrication risk than
the venue claims found in Phase 5 — but I'm proposing the copy rather
than just adding it, since it's new substantive content rather than a
bug fix.

**Proposed FAQ entry** (for `index.html`, alongside the existing FAQ
block):

> **Q: What's the difference between Hyderabadi dum biryani and other
> biryani styles?**
> A: Hyderabadi dum biryani is cooked using the "dum" method — raw
> marinated meat and partially cooked basmati rice are layered
> together in a sealed pot and slow-cooked over low heat, so the rice
> finishes cooking in the meat's own steam and spices rather than
> being boiled separately. Many other regional styles (like Lucknowi/
> Awadhi biryani) cook the meat fully before layering it with rice.
> That sealed, slow-cooked method is what gives Hyderabadi biryani its
> distinct aroma and texture — it's how we prepare every biryani at
> Shaahi Biryani in Plano.

Want me to add this to `index.html`'s FAQ (and matching schema) as-is,
or adjust the wording first?

---

## Minor, not acted on

"How can I order biryani in Plano?" is currently only answered as a
trailing clause in other FAQ answers ("Order online for pickup or
delivery, or call..."), not as its own dedicated Q&A. Low priority —
flagging for a future pass rather than adding another FAQ entry now
without a clear need.

---

## Open items carried from Phase 5

Not re-litigated here, still open: whether `venues.html`'s own list of
11 named venues is accurate (its FAQ repeats the same claim as its
lead paragraph), and whether the third-party delivery-platform
coverage claims on `biryani-<city>` pages are still current.
