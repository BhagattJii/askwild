# Search Backend Guide

Askwild has a pluggable search layer: one web index per request, chosen by
`SEARCH_API`. This guide covers the three realistic options, including
deploying Google-grade search **free** on Render.

## Option 1 — OpenSERP on Render (recommended, free, self-hosted)

OpenSERP is a free, MIT-licensed, self-hosted SERP engine. It returns **real
Google SERP results** (with Bing / DuckDuckGo / Baidu / Yandex fallbacks),
deployable on the Render free tier — no API key, no card.

**Why:** engines run in your own instance; Google blocks no one from the
instance itself only the instance IP. Render's free tier uses shared IPs that
Google doesn't globally block — quality matches live Google, including
`People also ask` and rich snippets.

### Deploy in 3 steps (free)

1. Render Dashboard → **New → Blueprint** → point at this repository.
   Render reads `render.yaml` and creates **askwild-search** (Docker, Singapore,
   port 7070, free plan).
2. Render shows a live URL once the build finishes (~2–4 min):
   `https://askwild-search.onrender.com`
3. In Vercel (or your hosting), set:

   ```bash
   SEARCH_API=openserp
   OPENSERP_URL=https://askwild-search.onrender.com
   OPENSERP_ENGINES=google,bing,duckduckgo   # fallback order
   ```

Redeploy Askwild — done.

### What you get

- Real Google results, fresh, India-relevant — not a re-ranked cache
- Bing fallback if Google throttles (first engine to return results wins)
- Fallback chain set per `OPENSERP_ENGINES` — add `yandex` or `baidu` there
- Images from `/image` endpoint when `content_types: ["image"]` or general mode
- Image relevance far better than SearXNG+Yandex

### Free-tier caveats (honest)

- Render free sleeps after 15-min idle; first query wakes it in ~10–20s
- 750 free hours/month (exactly 1 free service — pick once)
- Google can throttle shared cloud IPs occasionally → 0–70% success range,
  Bing fills the gap (binary results match or beat old SearXNG)
- Minimal analytics, no SLA, single container

## Option 2 — SearXNG (bundled, self-host)

Bundled in `docker-compose.yaml`. Free, but **limited to Yandex alone per
this repo's default `searxng-settings.yml`** — set `SEARXNG_ENGINES=google,bing,duckduckgo`
(and optionally uncomment Google in `searxng-settings.yml` with proxies) for better
results. See [Search Providers](./CONFIGURATION.md#search-providers).

## Option 3 — Hosted APIs (best quality, metered)

| Service | Free tier | Notes |
| --- | --- | --- |
| Tavily | 1,000 req/mo | Default |
| Brave Search | $5 credits ≈ 1,000/mo | Needs card for free plan |
| Exa | $10/mo | |
| Firecrawl | 1,000/mo | |
| LangSearch | free daily credits, resets 00:00 UTC | |

Good regional and semantic quality; no sleep, low latency. Pay nothing if you
stay under quotas; overflow becomes error/429 automatically.

## Keeping search quality high

- Relevance is governed by the ask prompt; exact entities and Indian context
  tweak already live in both quick and adaptive mode prompts.
- Guests pin to the small model (Nemotron 3.5 Lightning); signed-in users
  get the Ultra model — better at query rewriting too.
- If an answer has zero or stale citations, check `https://openserp.internal/` health,
  raise `OPENSERP_TIMEOUT_MS`, or raise `SEARXNG_CRAWL_MULTIPLIER`.
