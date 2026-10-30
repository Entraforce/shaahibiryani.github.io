# Phase 12 — Conversion Rate Optimization

Date: 2026-10-30
Branch: `seo/phase12-cro` (off `main`)
Scope: audit the customer journey from search to conversion — CTAs,
forms, click-to-call, directions, trust signals, and event tracking.
Page loading speed is cross-referenced from Phase 1 rather than
re-audited. Three small, additive tracking gaps are fixed directly in
this phase; one larger accessibility gap is proposed for approval
given its footprint across ~21 forms sitewide.

**Method**: read the actual conversion-tracking code directly (not a
heuristic audit) to see exactly what's measured today versus what the
master prompt asks for.

---

## Executive summary

1. **Click-to-call tracking is comprehensive and already well-built**:
   a sitewide delegated listener fires a Google Ads conversion on *any*
   `tel:` link click, plus the on-site chatbot's call/order actions
   fire the same conversion explicitly. Nothing to fix here.
2. **Catering form submissions are reliably tracked**, confirmed via a
   `status=thanks` redirect check (not a guess at form "intent") —
   fires a real Google Ads conversion on `index.html`'s own form and
   on all 19 `catering-<city>` pages. Same for **completed purchases**,
   tied to a real order ID/amount from the checkout flow, not just a
   button click. Both match the master prompt's "reliable event
   confirmation" requirement correctly.
3. **Fixed directly (small, additive, same pattern as the existing
   call-tracking block)**: three real tracking gaps found —
   - "Order Online" button clicks (both the nav and hero CTAs on
     `index.html`) weren't tracked at all as their own event, so
     there was no way to measure top-of-funnel click-through before a
     purchase.
   - The "Open in Google Maps" directions link in the homepage contact
     card wasn't tracked.
   - There was no signal at all for whether a visitor ever reached the
     menu section.

   All three now fire a GA4 event (`order_click`, `directions_click`,
   `menu_view`) through a new self-contained script block
   (`CTATRACK:START`/`END`, mirroring the existing `CALLTRACK` block's
   structure and cookie-consent gating). These are GA4 analytics
   events, not new Google Ads conversions — no ad account changes
   needed, and no visual or behavioral change to the page.
4. **One real gap found, proposed not fixed**: form labels across
   ~21 forms sitewide (`index.html`'s catering + contact forms, and
   all 19 `catering-<city>` quote forms) are visually present but not
   programmatically associated with their inputs — no `for`/`id`
   pairing. A few fields have a compensating `aria-label` (Event Date,
   Number of Guests, Type of Event), but Name, Phone, Email, and the
   Additional Details textarea do not. A screen-reader user filling
   these out would hear generic "edit text" rather than the actual
   field name. Not fixed in this phase given the scope (many files,
   many fields) — see [Proposed fix](#proposed-fix-form-label-association)
   below.
5. **Trust signals and review presentation are already strong** —
   cross-referencing earlier phases: real, verified customer review
   quotes (confirmed non-fabricated in the original Phase 0 audit),
   consistent halal-certification badges sitewide, and accurate
   aggregate rating (Phase 6 fixed the one place it had drifted stale).
6. **Mobile navigation is well-built**: the hamburger menu has proper
   `aria-label` and `aria-expanded` state management — no gap found.
7. **No dedicated contact page exists, and that's appropriate** — this
   is a single-location restaurant; contact info (address, phone,
   hours, directions) already lives in a clear, prominent contact-info
   card on the homepage. Building a separate `/contact` page would add
   a thin, low-value page for a single-location business.
8. **Page loading speed**: not re-audited here — Phase 1's Core Web
   Vitals audit already covers this in depth, including the still-open
   font-loading CLS fix.

---

## What changed in this phase

`index.html`:
- Added `data-track="order_click"` to the nav and hero "Order Online"
  links.
- Added `data-track="directions_click"` to the "Open in Google Maps"
  contact-card link.
- Added a new `CTATRACK` script block: a click listener for
  `[data-track]` elements, and a one-time `IntersectionObserver` on the
  `#menu` section firing `menu_view` the first time it's 25% visible.
  Gated behind the same cookie-consent check the existing promo
  tracker uses; fires as a plain GA4 event via `gtag('event', ...)`,
  not a paid Ads conversion.

No visual changes, no changes to any `GEN:MENU`/`GEN:SPLASH` region
(verified via `render-index.mjs --check`, still passing).

---

## Proposed fix: form label association

Every form field across `index.html`'s two forms and all 19
`catering-<city>` quote forms uses `<label class="flbl">Field
Name</label>` immediately before its `<input>`/`<textarea>`, but
without a `for`/`id` pair linking them. This is a real accessibility
gap (WCAG 1.3.1/4.1.2 — form inputs need a programmatically determined
label), and it affects a commercially important form: the catering
quote request is the primary catering conversion point sitewide.

**Why not fixed directly in this phase**: the pattern repeats across
~21 forms with 4–7 fields each — a mechanical but sizeable diff
footprint. Given the pattern is identical everywhere, it's a safe,
low-risk fix (purely additive `id`/`for` attributes, zero visual
change), but I'd rather get a quick go-ahead before touching ~21 files
in one pass.

**Proposed approach**: add a unique `id` to each input (e.g.
`id="caterName-dallas"` to keep IDs unique per page) and a matching
`for` attribute on its label. Want me to go ahead with this?

---

## Cross-referenced from earlier phases (not re-audited here)

- **Page loading speed / Core Web Vitals**: Phase 1.
- **Trust signals, certifications, review authenticity**: Phase 0 (real
  review quotes confirmed), Phase 6 (rating-display accuracy fixed).
- **Menu accessibility (structure, categories)**: Phase 10 confirmed
  the dish-photo and menu-thumbnail pipeline is well-built.
