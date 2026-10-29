# Shaahi Biryani DFW — Enterprise Search Visibility Master Prompt

Pasted by the owner (Osman) on 2026-10-28. Saved here, verbatim, so it
persists across sessions instead of living only in chat history. This is the
governing brief for all `docs/seo/` phase work — new sessions picking up this
project should read this file first.

**Phase status tracker** (updated as phases complete — see individual phase
docs in this directory for details):

| Phase | Deliverable | Status |
|---|---|---|
| 0 — Repository discovery | `00-repository-audit.md` | ✅ Done (2026-10-27), findings mostly fixed on `main` |
| 1 — Technical SEO (CWV + full metadata) | `technical-seo-audit.md` | ✅ Done, merged to `main` (2026-10-28). Font-loading CLS fix still needs a separate approval before implementing. |
| 2 — Structured data / knowledge graph | `structured-data-audit.md` | ✅ Done, merged to `main` (2026-10-28). Overall healthy — 3 low-risk field-completeness fixes implemented, no fabrication issues. |
| 3 — Google Business Profile | `google-business-profile-audit.md` | ✅ Done (2026-10-28), on branch `seo/phase3-gbp-audit`, awaiting review. Overall strong consistency; 3 minor open items + 23 unreplied reviews. |
| 4 — Apple Maps / Business Connect | `apple-maps-optimization.md` | Not started |
| 5 — Advanced local SEO (DFW) | `local-keyword-map.md` | Not started |
| 6 — AEO (answer engine) | `aeo-answer-strategy.md` | ✅ Done (2026-10-29), on branch `seo/phase6-aeo`, awaiting review. Two bugs fixed: stale hardcoded rating text in homepage FAQ (now covered by the refresh automation), and dine-in.html's FAQ schema lacked matching visible content. One content gap proposed, not yet added: no FAQ explains Hyderabadi dum biryani vs. other styles. |
| 7 — AIO (AI search) | `ai-search-visibility.md` | Not started |
| 8 — GEO (generative engine) | `geo-implementation.md` | Not started |
| 9 — Content authority / topical clusters | (content roadmap) | Not started |
| 10 — Image/video SEO | — | Not started |
| 11 — Citations / local authority | — | Not started |
| 12 — Conversion rate optimization | — | Not started |
| 13 — Analytics / search performance | `performance-measurement.md` | Not started |
| 14 — Competitor analysis | `competitor-analysis.md` | Not started |
| 15 — Implementation priorities | `implementation-backlog.md` | Not started |
| 16 — Implementation & testing | — | Ongoing as each phase's fixes get approved |
| 17 — Deliverables index | `EXECUTIVE-SUMMARY.md` | Not started |
| 18 — 30/60/90 day roadmap | `30-60-90-day-roadmap.md` | Not started |

---

## YOUR ROLE

Act as a senior enterprise SEO architect, technical SEO engineer, local SEO
strategist, AI search optimization specialist, Google Business Profile
consultant, Apple Maps specialist, and full-stack website developer.

You are working on the production website:

**Brand:** Shaahi Biryani DFW
**Website:** https://shaahibiryanidfw.com/
**Primary market:** Plano, Texas
**Target market:** Dallas–Fort Worth metroplex

Your mission is to transform Shaahi Biryani DFW into a technically excellent,
locally authoritative, AI-discoverable restaurant website using ethical,
sustainable, Google-compliant practices.

You have access to my local website repository through Claude Code / VS Code.

**This is an implementation project, not merely an SEO recommendation
exercise.**

You must inspect, audit, plan, implement, test, and document the
improvements that are possible within the repository.

Never fabricate rankings, results, reviews, customer testimonials, business
locations, menu items, service areas, or analytics.

---

# PHASE 0 — REPOSITORY DISCOVERY AND SAFETY

Before modifying anything:

1. Inspect the complete repository.
2. Identify the framework, CMS, programming languages, routing system, build
   tools, and deployment configuration.
3. Identify the production URL and staging environment, if available.
4. Locate all SEO-related components and configurations.
5. Inspect existing robots.txt, XML sitemaps, metadata, canonical tags,
   redirects, and structured data.
6. Check whether Google Analytics, Search Console, Google Tag Manager, or
   other tracking systems are installed.
7. Identify duplicate, conflicting, or obsolete SEO implementations.
8. Inspect the current menu, ordering system, catering pages, location
   information, and business contact details.
9. Check whether there are existing local landing pages and whether they
   contain genuinely unique content.
10. Record baseline technical findings.

Create:

`docs/seo/00-repository-audit.md`

**Safety requirements:**

- Do not modify production without approval.
- Do not expose secrets or credentials.
- Do not delete existing content without justification.
- Do not overwrite functioning integrations.
- Do not invent information to complete structured data.
- Use a separate Git branch for SEO improvements.
- Preserve the website's visual design and ordering functionality.
- Make small, testable changes.
- Request approval before deployment or changes to external business
  profiles.

---

# PHASE 1 — ENTERPRISE TECHNICAL SEO

Perform a comprehensive technical SEO audit.

## 1.1 Crawling and indexing

Inspect and improve:

- robots.txt
- XML sitemap and sitemap index
- Canonical URLs
- HTTP status codes
- Redirect chains and loops
- Broken internal links
- Duplicate content
- Thin or empty pages
- Pagination, if applicable
- Crawl accessibility
- Indexability
- Noindex and nofollow directives
- JavaScript rendering
- Mobile-first accessibility
- HTTPS configuration
- URL consistency
- Trailing slash handling
- Query parameter handling
- Orphan pages

Ensure important public pages are crawlable, indexable, and linked
appropriately.

Do not index internal search results, checkout pages, duplicate filtered
URLs, or other pages that should remain excluded.

## 1.2 Core Web Vitals

Audit and improve:

- Largest Contentful Paint (LCP)
- Interaction to Next Paint (INP)
- Cumulative Layout Shift (CLS)
- Time to First Byte (TTFB)
- Image loading
- Font loading
- JavaScript execution
- CSS delivery
- Server-side rendering where appropriate
- Browser caching
- CDN configuration

Targets:

- LCP ≤ 2.5 seconds
- INP ≤ 200 milliseconds
- CLS ≤ 0.1

Measure mobile and desktop separately.

Use Lighthouse and available performance tools. Distinguish laboratory
measurements from real-user field data.

Do not claim these targets have been achieved without measurement.

## 1.3 Metadata optimization

Audit every indexable page for:

- Unique title tag
- Unique meta description
- Relevant H1
- Logical H2–H6 hierarchy
- Descriptive image alt text
- Open Graph metadata
- Social sharing images
- Canonical tag
- Internal links
- Appropriate keyword targeting

Avoid keyword stuffing and duplicate titles.

Generate metadata dynamically only where appropriate.

---

# PHASE 2 — STRUCTURED DATA AND KNOWLEDGE GRAPH

Implement valid Schema.org JSON-LD using verified business information.

Evaluate and implement applicable types:

- Restaurant
- LocalBusiness, where appropriate
- Organization
- WebSite
- WebPage
- BreadcrumbList
- Menu
- MenuItem
- Offer, only for verified current offers
- FAQPage, only where appropriate and supported by visible content
- ImageObject, where useful
- VideoObject, for eligible original videos

Prefer the most specific appropriate type rather than duplicating overlapping
entities unnecessarily.

For Restaurant structured data, use verified values for:

- name
- url
- logo
- image
- telephone
- address
- geo coordinates
- openingHoursSpecification
- servesCuisine
- menu
- acceptsReservations, if applicable
- priceRange, if confirmed
- sameAs
- hasMap

Use a stable entity identifier such as:

`https://shaahibiryanidfw.com/#restaurant`

Only use the canonical domain after verification.

Connect verified official social profiles and business listings through
sameAs.

Never invent aggregateRating, reviewCount, price, availability, or other
structured-data values.

Validate JSON-LD using Schema.org Validator and Google Rich Results Test
where applicable.

Remember that valid schema does not guarantee rich results or AI citations.

---

# PHASE 3 — GOOGLE MAPS AND GOOGLE BUSINESS PROFILE

Audit Google Business Profile and its alignment with the website.

Check:

1. Business name accuracy.
2. Primary and secondary categories.
3. Address and map pin.
4. Telephone number.
5. Website and ordering links.
6. Business hours and holiday hours.
7. Menu URL.
8. Restaurant attributes.
9. Verified food photographs.
10. Business description.
11. Products or services where applicable.
12. Reviews and owner responses.
13. Duplicate or outdated listings.
14. Consistency between the website and Google Maps.

Recommend improvements that comply with Google's Business Profile policies.

Do not add keywords to the business name unless they are part of the
real-world business name.

Do not create fake reviews, fake locations, or duplicate profiles.

Where profile access is unavailable, prepare a precise action checklist
instead of claiming changes were made.

Create:

`docs/seo/google-business-profile-audit.md`

---

# PHASE 4 — APPLE MAPS AND APPLE BUSINESS CONNECT

Create an Apple Maps optimization strategy.

Audit or prepare verification steps for:

- Apple Business Connect ownership
- Business name
- Primary category
- Exact address and map pin
- Telephone number
- Official website
- Opening hours
- Photos
- Brand identity
- Available action links
- Menu and ordering links where supported
- Duplicate listings
- Consistency with Google Maps

Check which Apple Business Connect features are currently supported before
recommending implementation.

Never claim that Apple Maps rankings can be controlled through website code.

Create:

`docs/seo/apple-maps-optimization.md`

---

# PHASE 5 — ADVANCED LOCAL SEO FOR DFW

Build a local SEO strategy focused on real customer demand.

Start with Plano, Texas.

Research relevant search opportunities in:

- Plano
- Frisco
- Allen
- McKinney
- Richardson
- Carrollton
- Addison
- Dallas
- Garland
- The Colony
- Wylie
- Other relevant DFW cities

Do not assume Shaahi Biryani has a physical location in every city.

Do not create misleading location pages.

## Keyword research

Investigate search intent for:

- Biryani restaurant Plano TX
- Halal biryani Plano
- Hyderabadi biryani Plano
- Chicken biryani near Plano
- Goat biryani Plano
- Indian restaurant Plano
- Indian food delivery Plano
- Biryani catering Plano
- Indian catering Plano
- Wedding catering Plano
- Halal catering DFW
- Hyderabadi food DFW

Verify whether each product, dietary claim, cuisine description, and service
is genuinely offered before using it.

Research additional long-tail, transactional, informational, and
location-based search opportunities.

## Local landing pages

Evaluate whether useful landing pages should exist for:

- Restaurant location
- Catering services
- Wedding catering
- Corporate catering
- Family and group orders
- Menu categories
- Verified service-area cities

Each page must contain genuinely useful, differentiated content.

Do not generate dozens of near-identical doorway pages.

Use verified delivery or catering coverage when describing service areas.

Create a keyword-to-page mapping to avoid cannibalization.

Create:

`docs/seo/local-keyword-map.md`

---

# PHASE 6 — AEO: ANSWER ENGINE OPTIMIZATION

Optimize the website to answer relevant customer questions clearly.

Target search experiences such as featured snippets, conversational search,
and AI-generated answers.

Build a question research strategy around verified restaurant information.

Example questions:

- Where can I find Hyderabadi biryani in Plano?
- Does Shaahi Biryani offer catering?
- How can I order biryani in Plano?
- What biryani dishes are available?
- Does Shaahi Biryani provide wedding catering?
- What is the difference between Hyderabadi dum biryani and other biryani
  styles?

For each question:

1. Verify the answer.
2. Determine the appropriate page.
3. Provide a concise, direct answer.
4. Add useful supporting details.
5. Link to relevant menu, ordering, or catering pages.
6. Include appropriate structured data when valid.
7. Avoid repetitive FAQ blocks added solely for search engines.

Build a reusable, accessible FAQ component only if it fits the site's
architecture.

Do not promise Google FAQ rich results.

Create:

`docs/seo/aeo-answer-strategy.md`

---

# PHASE 7 — AIO: AI SEARCH OPTIMIZATION

Optimize Shaahi Biryani for discoverability in AI-assisted search
environments, including:

- ChatGPT Search
- Google AI Overviews
- Google AI Mode
- Gemini
- Perplexity
- Microsoft Copilot

Understand that these systems have different retrieval, indexing, citation,
and ranking mechanisms.

There is no universal AI ranking switch.

Focus on:

- Clear business identity
- Accurate business facts
- Strong topical relevance
- Accessible HTML content
- Crawlability
- Structured data
- Authoritative references
- Consistent entity information
- Useful original content
- Relevant internal linking
- Trusted external citations

## AI crawler audit

Inspect robots.txt and server restrictions.

Evaluate the relevant crawler documentation for:

- Googlebot
- Bingbot
- OAI-SearchBot
- GPTBot
- PerplexityBot
- Other relevant documented crawlers

Distinguish search indexing crawlers from training-related crawlers.

Do not change crawler permissions without documenting privacy, licensing,
security, and business implications.

Do not assume every AI product uses a dedicated crawler.

## AI visibility testing

Develop repeatable tests for queries such as:

- Best biryani options in Plano Texas
- Where to order Hyderabadi biryani in Plano
- Halal biryani catering in North Dallas
- Indian wedding catering in Plano
- Shaahi Biryani DFW menu and ordering

Record:

- Search platform
- Exact query
- Test date
- Whether Shaahi Biryani appeared
- Whether the website was cited
- Accuracy of business information
- Competing businesses mentioned
- Supporting evidence or screenshots
- Limitations of personalization and changing AI results

Do not report fabricated AI visibility scores.

Create:

`docs/seo/ai-search-visibility.md`

---

# PHASE 8 — GEO: GENERATIVE ENGINE OPTIMIZATION

Build a generative search strategy that improves the website's usefulness as
a factual source.

Focus on:

1. Entity consistency.
2. Clear descriptions of products and services.
3. Direct answers to customer questions.
4. Original photographs.
5. Authentic restaurant information.
6. Accurate location and service-area details.
7. Crawlable content.
8. Strong internal links.
9. Relevant external mentions.
10. Consistent business citations.

Consider whether a machine-readable business facts page would be useful.

Evaluate optional emerging conventions such as llms.txt critically.

Do not present llms.txt as a required or proven ranking factor.

Do not fabricate awards, press mentions, customer reviews, or expert
endorsements.

Create:

`docs/seo/geo-implementation.md`

---

# PHASE 9 — CONTENT AUTHORITY AND TOPICAL CLUSTERS

Design a content architecture around actual business offerings.

Potential clusters:

### Cluster A — Biryani
- Hyderabadi biryani
- Dum biryani
- Chicken biryani
- Goat biryani
- Relevant verified menu categories

### Cluster B — Catering
- Indian catering
- Biryani catering
- Wedding catering
- Corporate catering
- Group catering

### Cluster C — Local discovery
- Indian food in Plano
- Biryani in North Dallas
- Relevant verified catering service areas

### Cluster D — Ordering
- Online ordering
- Pickup
- Delivery, where available
- Family meals, where offered
- Current verified promotions

For each proposed page, provide:

- Search intent
- Primary keyword
- Secondary keywords
- Suggested URL
- SEO title
- Meta description
- H1
- Content outline
- Internal links
- Conversion CTA
- Required evidence
- Implementation priority

Do not publish generic mass-generated SEO content.

Prioritize high-value commercial pages before informational content.

---

# PHASE 10 — RESTAURANT IMAGE AND VIDEO SEO

Audit all restaurant media.

Optimize:

- Descriptive filenames
- Alt text
- Image compression
- Responsive sizes
- WebP or AVIF where supported
- Lazy loading
- Hero image priority
- Image dimensions
- Relevant structured data
- Social sharing previews

Use original restaurant images from the repository.

Never replace real food photographs with misleading AI-generated images.

For existing videos, evaluate:

- Descriptive titles
- Captions and transcripts
- Video metadata
- Thumbnail quality
- VideoObject schema eligibility
- Video sitemap requirements
- Relevant landing-page placement

Preserve the original Shaahi Biryani logo.

---

# PHASE 11 — CITATIONS AND LOCAL AUTHORITY

Audit consistent business information across relevant directories.

Evaluate:

- Google Maps
- Apple Maps
- Bing Places
- Yelp
- Facebook
- Relevant restaurant directories
- Relevant halal dining directories
- Local business associations
- Legitimate community and event websites

Identify missing, duplicate, and inconsistent listings.

Recommend legitimate local partnership and citation opportunities.

Do not purchase spam backlinks or create fake directory listings.

Provide a citation correction plan with priorities.

---

# PHASE 12 — CONVERSION RATE OPTIMIZATION

SEO must support actual restaurant orders and catering inquiries.

Audit the customer journey from search to conversion.

Evaluate:

- Mobile navigation
- Menu accessibility
- Order Now buttons
- Catering inquiry CTAs
- Click-to-call functionality
- Directions links
- Ordering friction
- Form accessibility
- Contact page clarity
- Page loading speed
- Trust signals
- Verified customer review presentation

Do not redesign the entire website unnecessarily.

Preserve the existing branding.

Track meaningful events where appropriate:

- Order button clicks
- Phone clicks
- Directions clicks
- Catering form submissions
- Menu views
- Completed purchases, if supported by reliable integration

Avoid collecting unnecessary personal information.

Do not record revenue or completed orders without reliable event
confirmation.

---

# PHASE 13 — ANALYTICS AND SEARCH PERFORMANCE

Audit or prepare integrations for:

- Google Search Console
- Google Analytics 4
- Google Tag Manager
- Bing Webmaster Tools
- Google Business Profile performance
- Apple Business Connect insights, where available
- PageSpeed Insights
- Lighthouse

Verify existing integrations before adding new scripts.

Prevent duplicate analytics events and duplicate tracking tags.

Develop an SEO performance dashboard tracking:

- Organic impressions
- Organic clicks
- CTR
- Average search position
- Non-branded search visibility
- Local search performance
- Google Maps interactions
- Organic conversions
- Catering leads
- Index coverage
- Core Web Vitals
- AI citation observations
- Technical errors

Separate observed data from estimates.

Do not invent access to analytics accounts.

Create:

`docs/seo/performance-measurement.md`

---

# PHASE 14 — COMPETITOR ANALYSIS

Research actual local competitors through available live sources.

Identify competitors for:

- Biryani Plano
- Halal biryani Plano
- Hyderabadi biryani DFW
- Indian catering Plano
- Wedding catering DFW

Compare:

- Search intent coverage
- Page architecture
- Business profile completeness
- Relevant content
- Internal linking
- Structured data
- Mobile usability
- Local citations
- Customer-facing differentiation

Do not fabricate competitor keyword rankings, traffic estimates, or
backlinks.

If commercial SEO tools are unavailable, document the limitation.

Create:

`docs/seo/competitor-analysis.md`

---

# PHASE 15 — IMPLEMENTATION PRIORITIES

Create a prioritized backlog.

Classify tasks:

**P0 — Critical**
- Indexing problems
- Broken canonical tags
- Incorrect business information
- Broken ordering links
- Major crawl failures
- Invalid or misleading structured data

**P1 — High**
- Core landing-page SEO
- Local business entity consistency
- Performance bottlenecks
- Sitemap improvements
- Missing metadata
- High-intent catering content

**P2 — Medium**
- AEO content
- Internal linking
- Image optimization
- Verified service-area content
- Additional structured data

**P3 — Long-term**
- Content authority
- Local citations
- Competitor monitoring
- AI visibility testing
- Ongoing reporting

For every task provide:

- Problem
- Evidence
- Affected URL or file
- Recommended solution
- Priority
- Estimated effort
- Expected business impact
- Implementation status
- Validation method

---

# PHASE 16 — IMPLEMENTATION AND TESTING

After the initial audit:

1. Present the findings.
2. Create an implementation plan.
3. Identify safe repository changes.
4. Implement approved changes on a separate branch.
5. Follow the existing coding conventions.
6. Add or update tests where appropriate.
7. Run linting and type checks.
8. Run the production build.
9. Validate structured data.
10. Check generated metadata.
11. Verify internal links and routing.
12. Check responsive layouts.
13. Verify that ordering and catering functionality remain intact.
14. Document all changed files.
15. Request approval before production deployment.

Do not stop after generating documentation if safe, approved implementation
work remains.

Do not claim external tools were tested if they were unavailable.

---

# PHASE 17 — DELIVERABLES

Create the following directory:

`docs/seo/`

Include:

1. `00-repository-audit.md`
2. `technical-seo-audit.md`
3. `local-keyword-map.md`
4. `google-business-profile-audit.md`
5. `apple-maps-optimization.md`
6. `structured-data-audit.md`
7. `aeo-answer-strategy.md`
8. `ai-search-visibility.md`
9. `geo-implementation.md`
10. `content-roadmap.md`
11. `competitor-analysis.md`
12. `performance-measurement.md`
13. `implementation-backlog.md`
14. `change-log.md`
15. `validation-results.md`
16. `30-60-90-day-roadmap.md`

Also create an executive summary:

`docs/seo/EXECUTIVE-SUMMARY.md`

It must clearly distinguish:

- Completed changes
- Verified findings
- Recommended changes
- Blocked tasks
- Tasks requiring account access
- Tasks requiring business-owner approval
- Items that could not be verified

---

# PHASE 18 — 30 / 60 / 90 DAY ROADMAP

## First 30 days

Prioritize technical health, accurate business information, indexing,
structured data, core landing pages, and measurement.

## Days 31–60

Prioritize high-intent content, local relevance, verified service-area
opportunities, internal linking, and business listing improvements.

## Days 61–90

Prioritize content authority, legitimate citations, conversion optimization,
AI visibility monitoring, and continuous technical improvements.

Include realistic dependencies, owners, and success metrics.

Do not guarantee first-page rankings, top-three Google Maps placement, or AI
recommendations.

---

# FINAL EXECUTION INSTRUCTIONS

Start immediately by inspecting the current repository.

Do not assume the website is WordPress, React, Next.js, or another framework
until verified.

Use live website research where internet access is available.

Prefer official Google, Apple, Bing, and AI platform documentation when
evaluating requirements.

Do not fabricate search volumes, keyword difficulty, ranking positions, or
analytics.

Work systematically:

**DISCOVER → AUDIT → PRIORITIZE → IMPLEMENT → VALIDATE → DOCUMENT → REPORT**

Begin with Phase 0 and Phase 1.

Provide the initial audit and implementation plan before making substantial
changes.

After approval, execute the plan phase by phase.

Your ultimate goal is to make Shaahi Biryani DFW technically strong,
accurately represented, locally discoverable, AI-search-friendly, and
capable of converting relevant organic visitors into real customers.
