# Phase 10 — Restaurant Image & Video SEO

Date: 2026-10-30
Branch: `seo/phase10-image-video` (off `main`)
Scope: audit image delivery (format, compression, responsiveness, lazy
loading, alt text, dimensions, structured data) and video content
sitewide. No code changes in this phase — findings only, with one item
proposed for approval before touching markup.

**Method**: read the actual image-rendering code paths directly (not a
regex-based audit script, learning from Phase 1's experience where a
flawed script produced false positives) — traced how dish photos are
served on the homepage menu, the city pages, and the hero carousel.

---

## Executive summary

1. **The image pipeline is already well-engineered — this is the
   headline finding.** Three tiers exist, each already doing the right
   thing:
   - **Homepage menu photos**: `scripts/build-menu-thumbs.mjs`
     generates 240w/640w WebP derivatives from the raw
     `assets/menu-photos/` originals (81 files, up to 340KB each —
     never served directly). The live `<img>` elements use `srcset`,
     `loading="lazy"`, `decoding="async"`, explicit width/height (CLS
     prevention), and gracefully fall back to the original if a
     thumbnail is missing.
   - **City-page dish photos**: a separate curated set,
     `assets/dishes/canon/` (26 WebP images), embedded with real
     dimensions, `loading="lazy"`, and alt text that's genuinely
     descriptive — e.g. *"Butter Paneer at Shaahi Biryani, a 100%
     Zabihah Halal Hyderabadi restaurant in Plano, TX"* — not generic
     filler. This is good alt-text practice: specific, factual, and
     keyword-relevant without being stuffed.
   - **Dynamically-rendered thumbnails** (menu quick-view circles,
     bestseller cards): initially looked like a bug — every one passes
     an empty `alt=""`. Checked the surrounding code before flagging it
     and confirmed it's **correct**, not an oversight: the parent
     button element already carries a full descriptive `aria-label`
     (e.g. "Butter Chicken, Signature dish, $14"), so the nested image
     being decorative/redundant with `alt=""` is the right accessible
     pattern, not a gap. Good catch to verify before reporting — this
     is exactly the kind of thing a naive audit script would
     false-positive on.
2. **One real gap, proposed not fixed**: the homepage hero carousel
   (`hero-01.webp` through `hero-05.webp`) is rendered as CSS
   `background-image` on `<div class="slide">` elements, not `<img>`
   tags. This means these 5 images have no alt text and are invisible
   to Google Images / any tool that only looks at `<img>` elements.
   The LCP-critical first slide is already `preload`ed with
   `fetchpriority="high"`, which is correctly optimized for *paint
   speed* — this finding is specifically about *image-search
   discoverability*, a different concern. **Not fixed in this phase**
   — converting background-image heroes to `<img>` would touch the
   hero's layering/overlay CSS, which is a bigger change than this
   phase's "small, testable changes" scope allows without approval.
   Also realistically low-value: ambiance/hero photography rarely
   drives food-search traffic the way dish photos do, which are
   already well-covered.
3. **Minor operational note, not a bug**: `build-menu-thumbs.mjs`
   isn't wired into the `/kadmin` → Publish pipeline (confirmed — it's
   referenced nowhere outside itself and `index.html`'s own comments).
   A photo added via `/kadmin` won't have an optimized thumbnail until
   someone manually re-runs the script — until then it gracefully
   falls back to serving the full-size original (already handled, not
   broken), just heavier than it needs to be in the interim. Worth
   knowing, not urgent.
4. **No `ImageObject` structured data anywhere on the site.** Not
   flagged as a problem — Phase 2 already evaluated this and chose not
   to implement it (the Restaurant schema's `image` field and
   consistent Open Graph tags already cover the practical need; full
   `ImageObject` nodes mainly matter for photo-licensing/rich-result
   edge cases not relevant here). Consistent with that earlier
   decision, not re-opened.
5. **No video content exists anywhere on the site** (confirmed —
   zero `<video>` tags, no YouTube/Vimeo embeds, no `VideoObject`
   schema). Every item in the master prompt's video checklist
   (captions, thumbnails, `VideoObject` eligibility, video sitemap) is
   not applicable. Nothing to audit or fix here; noted for
   completeness rather than skipped silently.
6. **Logo preserved, no AI-generated replacement risk** — confirmed via
   `assets/sb-logo.webp`, `sb-logo-hero.webp`, `sb-logo-light.webp`,
   all consistent, original branding assets.

---

## What's not being proposed

Per the master prompt's own instruction not to pad with generic
work: image compression, format (WebP), responsive sizing, and lazy
loading are already correctly implemented where it matters most (the
homepage menu and city-page dish photos — the content actually driving
food-search traffic). This phase doesn't propose re-doing work that's
already done well.

---

## Open item for Osman

Would you like the hero carousel converted from CSS `background-image`
to `<img>` elements (with alt text) for Google Images eligibility? This
is a real but lower-value gap — it touches hero layout/overlay CSS, so
I'd want your go-ahead before changing it, consistent with how Phase
1's font-loading change is also sitting at "proposed, not approved."
