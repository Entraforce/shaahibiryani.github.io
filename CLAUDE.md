# CLAUDE.md — Shaahi Biryani website

Guidance for Claude Code when working in this repo. This is the single source of
truth for the restaurant's business facts. **Never invent business details — if
something isn't here or on the live site, ask the owner.**

## About the site

A static HTML site for Shaahi Biryani, a Hyderabadi halal restaurant in Plano, TX.
No build step, no framework, no package manager.

- **Hosting:** GitHub Pages, custom domain `shaahibiryanidfw.com` (set via `CNAME`).
  Repo lives under the `Entraforce` GitHub organization.
- **Deploy:** `git push origin main` from inside the repo. GitHub Pages serves the
  default branch root. No CI — the site is live within ~1 minute of a push.
- **Pages:** `index.html` (home, ~3 MB — large because images are embedded as
  base64 data URIs), `hall.html`, `venues.html`, `careers.html`, `dine-in.html`,
  `reserve.html`, `privacy.html`, three `catering-*.html` city pages. Plus
  `404.html`, `robots.txt`, `sitemap.xml`, and `assets/` (favicons + `og-image.jpg`).
- **No local dev server.** To preview, open the HTML files directly in a browser,
  or run `python3 -m http.server` from the repo root and visit `http://localhost:8000`.

## Authoritative business facts

| Fact | Value |
|------|-------|
| Name | Shaahi Biryani |
| Address | 3421 E Renner Rd, Suite 110, Plano, TX 75074 |
| Phone | (469) 960-3300 |
| Hours | Sun + Tue–Thu 11:30am–10:00pm · Fri–Sat 11:30am–11:00pm · **Closed Mondays** |
| Halal | 100% Zabihah Halal, Hafsah Certified, HMS Certified – Suppliers |
| Founded | 2017 (Glendale Heights, IL) |
| Plano location opened | 2025-04-06 |
| Cuisine | Hyderabadi, Indian, Pakistani, South Asian, Halal |
| Catering capacity | 50 to 3,000+ guests |
| Private hall capacity | up to 132 guests |
| Price range | $$ |

**Social / `sameAs` URLs:**
- Instagram: `https://www.instagram.com/shaahibiryani_planotx/`
- Facebook: `https://www.facebook.com/ShaahiBiryaniDFW/` — the **Business Page**,
  not the personal `profile.php?id=...` URL. Easy to confuse.
- Google: `https://g.page/r/CdoUnFi5PmB4EBM`
- Yelp: `https://www.yelp.com/biz/shaahi-biryani-plano`

## Menu management system (added July 2026)

The menu is **no longer hand-edited in index.html**. Source of truth is the
`web_menu_items` / `web_menu_cards` / `web_menu_categories` tables in the
Supabase project `wtdthjhqgsbnyjucdqxl` (same project as online ordering).

- **Owner edits** happen at `/kadmin` (email-link login, restricted to the
  owner's email via RLS + `OWNER_EMAIL` secret). Prices are *staged*: checkout
  charges `published_price` until the owner presses **Publish**.
- **Publish** calls the `publish-menu` edge function, which regenerates the
  marked regions of `index.html` (`<!-- GEN:MENU -->`, `<!-- GEN:SPLASH -->`,
  `var PID_MAP=…`, the schema `hasMenuSection`, bestseller-card price attrs)
  via `supabase/functions/_shared/render-menu.js`, commits to GitHub with the
  `GITHUB_TOKEN` secret, bumps the sitemap lastmod, then copies `price` →
  `published_price` (RPC `web_menu_sync_published`).
- **`create-web-order`** prices orders from the table
  (`published_price ?? price`), rejects `available=false` items, and falls back
  to the static `_shared/prices.ts` map only for keys missing from the table.
- **NEVER hand-edit inside the GEN marker regions** — the next publish will
  overwrite those edits. Change the database (via /kadmin or SQL) instead.
- The mobile app's `create-payment-intent` still uses its own bundled
  `prices.ts` — app prices do NOT follow admin edits (menu shown in the app is
  bundled with the app). Keep them in sync manually when prices change.
- Edge-function sources for the website live in this repo under
  `supabase/functions/` and deploy with
  `supabase functions deploy <name> --project-ref wtdthjhqgsbnyjucdqxl`
  (create-web-order needs `--no-verify-jwt`).

## Editing rules

1. **NAP (name/address/phone), hours, and certifications must stay in sync across
   every place** that mentions them in each page: the
   `<script type="application/ld+json">` Restaurant schema, any visible contact
   section, the FAQ section, and any chatbot response strings. Search every page
   before changing one of these.
2. **SEO matters more than prose** to the owner. Keep keyword density high
   (Hyderabadi / Indian / Pakistani / halal / biryani / Plano) in copy and meta
   descriptions. Don't soften it into pure storytelling.
3. **`sitemap.xml` `lastmod` dates** should be updated when a page's content
   meaningfully changes.
4. The owner is non-technical. Frame technical concepts (git, DNS, SEO, hosting)
   with the business "why" first, then the how. Avoid jargon unless you define it.
