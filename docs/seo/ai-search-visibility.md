# Phase 7 — AIO: AI Search Optimization

Date: 2026-10-29
Branch: `seo/phase7-aio` (off `main`)
Scope: audit robots.txt against documented AI-crawler behavior, and
live-test the master prompt's 5 example queries against real AI search
surfaces. No code changes in this phase — one real business decision
(robots.txt crawler policy) is surfaced for Osman rather than acted on
unilaterally, per the master prompt's own rule: "do not change crawler
permissions without documenting privacy, licensing, security, and
business implications."

**Method, AI visibility testing**: live browser sessions against
Perplexity.ai, Bing (AI Mode), and Google (AI Overview) — the three
AI-answer surfaces reachable without logging into an account, which
matters because synthetic login flows have previously triggered OAuth
popup failures in this environment. ChatGPT Search and Gemini require
an account and were not tested this round; noted as a limitation, not
guessed at. Every result below was read directly off the actual page
during the session — none of it is inferred or estimated, per the
master prompt's explicit "do not report fabricated AI visibility
scores" rule.

**Method, crawler audit**: current `robots.txt` read directly, then
each named crawler's documented purpose and robots.txt behavior
confirmed via live lookups against each operator's own current
documentation (OpenAI, Perplexity, Anthropic, Common Crawl, Google) —
not from pretraining knowledge, since this space has changed
meaningfully even in 2026.

---

## Executive summary

1. **Shaahi Biryani already shows up accurately across AI search
   surfaces for most queries that name the dish, the city, or the
   brand** — Perplexity, Bing AI Mode, and Google AI Overview all cite
   the site correctly (right address, phone, hours, halal
   certification, current 4.4-star rating) for 4 of the 5 tested
   queries. **Zero factual errors found anywhere the site appeared.**
2. **One real, triple-confirmed gap**: "Indian wedding catering in
   Plano" returns zero mention of Shaahi Biryani on all three
   platforms, unanimously — the same gap Phase 5 already found via
   plain Google search. Three platforms agreeing independently is
   strong evidence this is a real targeting problem, not noise.
3. **One platform-specific gap**: "Halal biryani catering in North
   Dallas" is strong on Perplexity and Google, but Shaahi is completely
   absent on Bing AI Mode for that exact phrasing.
4. **Brand/menu queries are bulletproof**: "Shaahi Biryani DFW menu and
   ordering" returned fully accurate results on all three platforms —
   once someone searches by name, every surface gets it right.
5. **Crawler policy is currently wide open**: `robots.txt` has no
   crawler-specific rules at all — a single `User-agent: *` block
   allows every documented AI crawler, both search/citation bots
   (OAI-SearchBot, PerplexityBot, Claude-SearchBot, Googlebot, Bingbot)
   and training-only bots (GPTBot, ClaudeBot, CCBot) alike, plus the
   Google-Extended token that governs Gemini's use of already-crawled
   content. This is a real decision for Osman — see
   [Recommendation](#recommendation-crawler-policy) below. Not changed
   in this phase.
6. **Useful competitor roster surfaced** (for a future competitor
   analysis phase): Bawarchi Biryanis, Deccan Grill, Aslam Biryani
   House, Karahi Point Dallas, Just Punjabi Foods, Richi Caterers, Dil
   Se Desi, Royal Darbar, India 101, Lyari Cafe — all named by at least
   one AI platform instead of or alongside Shaahi.

---

## AI visibility test results

| Query | Perplexity | Bing AI Mode | Google AI Overview |
|---|---|---|---|
| Best biryani options in Plano Texas | ✅ cited, 3rd-listed, accurate | ✅ 1st-listed, address/phone exact | ✅ 2nd-listed ("Top Biryani Spots"), rating 4.4/558 shown |
| Where to order Hyderabadi biryani in Plano | ✅ "my pick," cited, address/phone exact | ✅ 1st-listed, address/phone/hours exact | ✅ 1st-named, cited with a snippet pulled straight from the site's own FAQ |
| Halal biryani catering in North Dallas | ✅ "closest to North Dallas/Plano" recommendation, cited | ❌ absent (India 101, Lyari Cafe, Royal Darbar, The Halal Guys, Bawarchi named instead) | ✅ 1st-listed "Top Halal Biryani & Event Caterer," 2 site pages cited |
| Indian wedding catering in Plano | ❌ absent (8 competitors named) | ❌ absent (5 competitors named) | ❌ absent (5 competitors named) |
| Shaahi Biryani DFW menu and ordering | ✅ fully accurate, 8/8 sources from the site | ✅ fully accurate incl. full hours + certification | ✅ fully accurate incl. full hours + certification; Postmates surfaced as a 3rd ordering platform not previously documented anywhere in this project |

No factual errors in any citation that did appear — rating consistently
shown as 4.4/557–558, matching the live Google rating (and the
automation fixed in Phase 6).

**Caveats, per the master prompt's own warning about personalization**:
this is a single run, from one location/account context, on one day.
AI answers are known to vary by user history, location signals, and
model updates — these results describe what was observed on
2026-10-29, not a permanent ranking.

---

## Recommendation: "Indian wedding catering in Plano"

This is now the best-corroborated gap in the whole project —
independently confirmed by a plain Google search (Phase 5), Perplexity,
Bing AI Mode, and Google AI Overview, all missing Shaahi for this exact
phrasing despite `hall.html`, `venues.html`, and `catering-plano.html`
already existing and targeting that intent. Four independent signals
agreeing is a strong enough signal to prioritize this in whichever
phase ends up doing the on-page fix (flagged in Phase 5's doc as likely
a title/meta/H1 targeting issue rather than missing content — this
phase doesn't re-open that investigation, just adds corroborating
evidence).

---

## AI crawler audit

Current `robots.txt`:

```
User-agent: *
Allow: /
Disallow: /kadmin
Disallow: /table

Sitemap: https://shaahibiryanidfw.com/sitemap.xml
```

No crawler is named individually, so the wildcard block allows all of
the following (confirmed against each operator's current documentation,
not assumed):

| Crawler | Operator | What it's for | Currently |
|---|---|---|---|
| Googlebot | Google | Search indexing — also what feeds Google AI Overviews/AI Mode | Allowed |
| Google-Extended | Google | Not a crawler — a token that separately governs whether already-crawled content can be used for Gemini training/grounding | Allowed |
| Bingbot | Microsoft | Search indexing — feeds Bing's AI Mode/Copilot | Allowed |
| GPTBot | OpenAI | Training data collection only | Allowed |
| OAI-SearchBot | OpenAI | ChatGPT Search citations | Allowed |
| ChatGPT-User | OpenAI | Live fetch when a user or Custom GPT asks a question | Allowed |
| PerplexityBot | Perplexity | Search/citation — Perplexity states this one is not used for model training | Allowed |
| Perplexity-User | Perplexity | Live fetch agent; Perplexity's own stated position is this one may act regardless of robots.txt rules | Allowed (moot either way) |
| ClaudeBot | Anthropic | Training data collection | Allowed |
| Claude-SearchBot | Anthropic | Search/citation for Claude's answers | Allowed |
| CCBot | Common Crawl | Training — feeds many downstream models beyond just one company | Allowed |

**This is a genuine business decision, not a bug.** The site's current
policy maximizes the odds of being crawled and cited by every AI answer
engine — consistent with what Phase 7's live testing above shows is
already working well. The tradeoff is that the same openness lets
training-only crawlers (GPTBot, ClaudeBot, CCBot) use the site's
original copy to train models, with no way to opt out selectively
without also risking the citation bots that are clearly already driving
real visibility.

**My recommendation**: keep the current fully-open policy. For a local
restaurant whose whole AIO goal is being recommended by name when
someone asks an AI assistant about biryani or halal food in Plano/DFW,
the upside (today's test results) outweighs the training-data concern,
which mostly matters to publishers protecting valuable original
journalism or creative work rather than restaurant marketing copy. But
this is Osman's call, not a technical one — happy to implement a
split policy (block GPTBot/ClaudeBot/CCBot/Google-Extended, allow the
search/citation bots) if he'd rather opt the training usage out.

---

## Limitations

- ChatGPT Search and Gemini were not tested — both require a logged-in
  account, and synthetic login flows have previously caused silent
  failures in this environment (noted in a prior session). Not guessed
  at; genuinely untested.
- Single test run, one day, one location/account context — AI answers
  personalize and change over time, consistent with the master
  prompt's own caution against treating this as a permanent score.
- No AI-visibility monitoring tooling exists yet to repeat this test
  automatically — these 5 queries would need to be re-run manually to
  track change over time.
