# Phase 1 — Enterprise Technical SEO Audit

Date: 2026-10-28
Branch: `seo/phase1-technical-audit` (off `main`)
Scope: §1.1 crawling/indexing was already covered in depth by
`00-repository-audit.md` (Phase 0) and is not repeated here except where new
findings emerged. This document covers §1.2 Core Web Vitals (measured against
the live production site) and §1.3 a full, non-sampled metadata pass across
all 47 HTML pages. Read-only — no fixes applied. Findings only, to support an
owner decision on what to prioritize.

**Tooling**: `scripts/audit-metadata.mjs` (new, this audit) parses every
`.html` file for title/description/canonical/OG/robots/H1/alt-text/JSON-LD.
Core Web Vitals were measured with `npx lighthouse` (v13.6.0, headless Chrome)
directly against `https://shaahibiryanidfw.com/` and three representative
subpages — this is real lab data from the live site, not a code-reading
guess.

---

## 1.3 Metadata — full pass across all 47 pages

Re-running the audit without sampling (Phase 0 only sampled a handful of
pages per check):

- **No duplicate `<title>` or `<meta name="description">` values anywhere**
  across all 47 pages — clean.
- **No missing or malformed `<title>`** — all 47 fall inside a healthy 15–65
  character range.
- **No missing canonical tags** on any of the 44 pages expected to carry one;
  no missing viewport meta tag anywhere; no H1 count problems (every
  indexable page has exactly one H1).
- **New finding — all 18 `biryani-*.html` meta descriptions run long**
  (164–201 characters; e.g. `biryani-carrollton.html` is 201 chars). Google
  typically truncates descriptions somewhere around 155–160 characters
  depending on pixel width, so the back half of each of these — often the
  "100% Zabihah Halal." close — risks being cut off in search results. This
  is a soft best-practice issue, not an indexing problem: nothing is broken,
  but the tail of the sentence likely never gets seen by a searcher. All 19
  `catering-*.html` descriptions (already shortened in the Phase 0 fix round)
  are within range.
- **New finding — `privacy.html` is missing Open Graph tags AND has zero
  JSON-LD structured data**, the only indexable page with neither. This is
  the same page Phase 0 already flagged as the lone holdout on the
  extensionless-URL convention — it appears to have been built outside the
  shared page template that gives every other page its OG tags and schema.
  Low business impact (nobody shares a privacy policy on social media, and
  it doesn't need Restaurant schema), but worth a conscious decision rather
  than leaving it as an unexplained gap.
- Earlier manual spot-checks from Phase 0 reported `index.html` had 96 images
  missing `alt` text — **that was wrong**, caused by a regex bug in this
  session's own audit tooling. Corrected and re-verified directly against the
  live HTML: 96 of 97 `<img>` tags on `index.html` have real, non-empty `alt`
  text. The one exception (`id="modalPhoto"`, `alt=""`) is a hidden,
  JS-populated menu-photo-modal template element whose `alt` is filled in at
  runtime when a visitor opens an item — not a real gap.

---

## 1.2 Core Web Vitals (lab data, single run per page/device — 2026-10-28)

**Methodology caveat, per the master prompt's own rules**: this is
**laboratory data** from one Lighthouse run per page on a live production
site over today's network conditions, not **field data** (real visitors'
actual experience, which would come from Chrome UX Report / Search Console —
not accessible from the repo). Single-run lab numbers can vary run to run;
treat the absolute seconds as directional, not a guarantee, but the pattern
across 4 pages × 2 device types is consistent enough to act on.

| Page | Device | Perf score | LCP (≤2.5s) | CLS (≤0.1) | TBT |
|---|---|---|---|---|---|
| Home (`/`) | Mobile | 33 | **5.2s — FAIL** | **0.115 — FAIL** | 3,230ms |
| Home (`/`) | Desktop | 66 | 3.0s — FAIL (borderline) | 0.031 — pass | 140ms |
| `biryani-frisco` | Mobile | 38 | **7.0s — FAIL (worst)** | **0.14 — FAIL** | 550ms |
| `biryani-frisco` | Desktop | 93 | 0.9s — pass | **0.125 — FAIL** | 60ms |
| `catering-plano` | Mobile | 81 | 1.9s — pass | 0.024 — pass | 680ms |
| `catering-plano` | Desktop | 90 | 0.8s — pass | **0.15 — FAIL** | 110ms |
| `hall` | Mobile | 63 | 3.2s — FAIL | **0.106 — FAIL (borderline)** | 830ms |
| `hall` | Desktop | 94 | 0.9s — pass | **0.118 — FAIL** | 60ms |

**Headline pattern**: CLS fails on **6 of 8** page/device combinations —
mobile *and* desktop, across every page template tested. LCP only fails on
mobile for Home, `biryani-frisco`, and `hall` (not `catering-plano`, and not
on any desktop run). Two distinct root causes, not one:

### Root cause 1 — CLS: web fonts loading without reserved layout space

On both pages checked in detail (`index.html` and `biryani-frisco.html`),
Lighthouse's CLS-culprit analysis attributes essentially all of the layout
shift to **custom web fonts swapping in late** and reflowing already-painted
text:

- Homepage: `body > section#hero > div.hero-content > p.h-tagline` shifts
  when the **Manrope** font (`fonts.gstatic.com/.../manrope/...`) finishes
  loading — this single element accounts for ~99.6% of the homepage's total
  CLS score.
- `biryani-frisco`: a `<p class="lead">` and a `<section>` shift when
  **Cormorant Garamond** and **Cinzel** finish loading.

This is a single, well-understood fix pattern (reserve space for the text
block so the font swap doesn't move anything, e.g. `font-display: optional`
tuning, a matched-metrics fallback font, or `size-adjust`), and because the
same mechanism shows up on both page templates checked, it's very likely a
sitewide fix rather than a one-page patch — worth confirming across the
`hall`/`catering` templates too before implementing, since this audit only
inspected two of them in that depth.

### Root cause 2 — Mobile LCP: not the same culprit on every template

- **Home** (mobile): LCP element is the hero's CSS `background-image`
  (`assets/hero-01.webp`). Breakdown: TTFB 1.07s + resource load 0.69s +
  render delay 0.49s ≈ 2.25s of the 5.2s measured — the remainder is main
  -thread congestion delaying paint (see below).
- **`biryani-frisco`** (mobile): LCP element is **text**, not an image —
  `<p class="lead">`. TTFB alone is 1.71s, and **element render delay is
  5.35 seconds** — the page fetches fine but something blocks that paragraph
  from actually painting for over five seconds. Combined with the CLS finding
  above (the same page's custom fonts shift text on arrival), font-loading
  behavior (e.g. `font-display: block`/`auto` blocking text paint, not just
  the shift-on-swap) is a strong suspect, but this audit did not isolate it
  from main-thread congestion — flagging as needing one more
  round of investigation before treating it as confirmed, per the master
  prompt's rule against claiming unmeasured conclusions.
- **`catering-plano`** (mobile) does **not** fail LCP (1.9s) — so whatever is
  slow on Home and `biryani-frisco` isn't present, or is much lighter, on the
  catering template. This difference between templates is itself a useful
  signal for where to focus first.

### Contributing factor — homepage main-thread cost

Homepage mobile's main-thread work breakdown: 7.3s Style & Layout + 8.6s
"Other" + 3.6s Rendering, against a 21.1s total main-thread work "score: 0"
(worst possible) Lighthouse rating. Two concrete, file-and-line-level
contributors found:

- **DOM size: 2,708 elements** on the homepage — large enough that style
  recalculation and layout cost scale up noticeably; this tracks with the
  homepage embedding the entire live menu (categories, items, photos) inline
  rather than loading it progressively.
- **Forced synchronous reflow (layout thrashing)** detected in page script at
  `index.html:6070` (220ms) and three smaller instances at `:7017`, `:7426`,
  `:7708` — JS that reads a layout-dependent property right after writing to
  the DOM, forcing the browser to recalculate layout synchronously instead of
  batching it. `:6070` sits inside the hero-scroll-effect `IntersectionObserver`
  setup (`arm()` function, around `index.html:6065-6079`) — reads
  `window.innerHeight` immediately after a `classList` mutation on page load.

---

## Correction to CLAUDE.md's documented architecture

CLAUDE.md states `index.html` is "~3 MB because images are embedded as base64
data URIs." **That is no longer true.** Verified directly: `index.html` is
627KB on disk, contains **zero** `data:image` URIs, and every image uses a
normal `src="assets/..."` file path (30 separate image network requests on
the live homepage, confirmed via Lighthouse's resource summary, totaling
1.4MB transferred). This is presumably stale from before the July 2026
menu-management migration to database-driven rendering
(`render-menu.js`/`web_menu_items`) described elsewhere in CLAUDE.md. Worth a
one-line correction to CLAUDE.md so future sessions don't reason about image
performance from an architecture that no longer exists — flagging here
rather than editing CLAUDE.md unilaterally, since it's project documentation
the owner may want to review the full context of before changing.

---

## Open questions for the owner

1. Same open question carried over from Phase 0, still unresolved: are the
   named customer review quotes in `index.html`'s schema real? (See
   `00-repository-audit.md` §3 / open question 1 — not re-litigated here.)
2. **Is reserving layout space for the custom web fonts (Manrope, Cormorant
   Garamond, Cinzel) an acceptable fix to pursue?** This is the single
   highest-leverage fix in this audit — it's implicated in CLS failures on 6
   of 8 pages tested — but implementing it means touching font-loading CSS
   sitewide, which the master prompt's safety rules say needs approval before
   changes of that reach.
3. **Should CLAUDE.md's "`index.html` ~3MB, base64 images" line be corrected
   now that it's been found factually stale?** Small edit, but it's
   documentation the owner relies on, so flagging rather than assuming.
