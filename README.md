# Askwild

Askwild is an open-source AI answer engine (fork of [Morphic](https://github.com/miurla/morphic)).
Ask a question in any language — Hinglish, Hindi, English — and get a cited,
source-dated answer with follow-up suggestions.

## Features

- **Answer engine UI** — streaming answers with numbered citations
  ([1](#S3) style), hover popovers, favicon source cards, publisher dates
- **Keyless search pool** (`SEARCH_API=bing`) — races Bing HTML + Bing RSS +
  Wikipedia + Google News RSS in parallel, gates every result set against the
  query terms, and serves the first lane that passes; lanes that keep
  misbehaving take a 10-minute cooldown, and only verified sets are cached
  (fresh answers 25 min, evergreen 6 h)
- **Search modes** — Quick (≤1 search, tool-enforced budget) and Adaptive
  (multi-step research with fetch)
- **Model agnostic** — OpenAI, Anthropic, Gemini, Vercel AI Gateway, Ollama,
  or any OpenAI-compatible endpoint; per-tier catalog with guest defaults
- **Knowledge tools** — Wikipedia, weather, currency, stocks, news, arXiv,
  crypto, commodities, USGS/NASA events (all free, no keys)
- **Related questions** as interactive spec blocks; image spec blocks
- **Auth** — anonymous (single-user), Better Auth (self-host), Clerk,
  Supabase
- **File uploads** (R2/S3), library notes, share, drafts (adaptive mode)
- **Observability** — Langfuse tracing, PostHog analytics, perf logging,
  all opt-in

## Stack

Next.js (App Router) · Vercel AI SDK · Drizzle ORM (Postgres) · Tailwind CSS
· shadcn/ui · SearXNG/OpenSERP/Tavily/Exa/Firecrawl/Brave/Bing (pluggable)

## Quick start (Docker)

```bash
cp .env.local.example .env.local   # add an AI provider key
docker compose up -d
open http://localhost:3000
```

Database and SearXNG search are wired automatically by Docker Compose; the
only required key is one AI provider (see `.env.local.example` for all
options including OpenAI-compatible endpoints).

## Quick start (local dev)

```bash
bun install
cp .env.local.example .env.local   # fill in: AI key, DATABASE_URL, search
bun run migrate
bun run dev
```

```bash
bun run lint        # eslint
bun run typecheck   # tsc --noEmit
bun run test        # vitest
bun run eval:draft-edits, eval:related-questions, eval:source-cards
```

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | full env reference, auth, models, Postgres, uploads |
| [docs/SEARCH.md](docs/SEARCH.md) | search providers — free self-hosted to hosted APIs, incl. the keyless bing pool |
| [docs/DOCKER.md](docs/DOCKER.md) | container deployment |
| [docs/PRIVACY.md](docs/PRIVACY.md) | what a self-hosted instance sends outbound |

## Deployment

Any Next.js host works; Vercel is the reference target.

1. Push this repo, import into Vercel
2. Set env vars from `.env.local.example` (AI key, `DATABASE_URL`,
   `SEARCH_API`, and — for cloud mode —
   `ASKWILD_CLOUD_DEPLOYMENT=true` + Upstash REST credentials for
   rate limiting)
3. Run migrations (`bun run migrate` against your production database)

Search provider choice: Tavily for zero-setup hosted quality, SearXNG/OpenSERP
self-hosted for free unlimited, `SEARCH_API=bing` for keyless no-pool
required — see [docs/SEARCH.md](docs/SEARCH.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).
