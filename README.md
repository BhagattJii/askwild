<div align="center">

# hawkin

**AI-powered search engine — privacy-first, free, self-hosted.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-c38b4c?style=flat-square)](https://orm.drizzle.team)

</div>

---

## Overview

hawkin is a privacy-first AI search engine inspired by Morphic. Ask a question, get an AI-generated answer with cited sources — no logs, no tracking, no cookies, completely free.

- **Search backend:** Self-hosted [SearXNG](https://searxng.org) on Render (zero-cost tier)
- **AI answers:** Generated via [OpenRouter](https://openrouter.ai) free models with cited sources
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS, deployed on Vercel
- **Privacy:** Zero logs, zero tracking, zero cookies, zero third-party scripts
- **Cost:** Runs entirely on free tiers (Render + Vercel + OpenRouter free models)

---

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────────────┐
│  hawkin UI (Next.js on Vercel)      │
│  - Accepts query                    │
│  - Calls SearXNG for web results    │
│  - Sends results + query to OpenRouter│
│  - Streams AI answer with citations │
└─────────────────────────────────────┘
    │
    ├──► SearXNG (self-hosted on Render) ──► Web results
    │
    └──► OpenRouter (free models) ──► AI answer + citations
```

---

## Features

- **AI answers with citations** — Every claim links back to a source
- **Self-hosted search** — SearXNG instance you control, no Google/Bing API keys
- **Free models** — Runs on OpenRouter's free tier (no API costs)
- **Zero tracking** — No analytics, no cookies, no fingerprinting
- **Self-hostable** — Deploy your own in minutes (Render + Vercel free tiers)
- **Responsive UI** — Works on mobile, desktop, dark/light mode

---

## Quick Deploy

### 1. Deploy SearXNG on Render (Free)
1. Fork this repo
2. Connect to [Render](https://render.com) → New → Blueprint → select `searxng/` directory
3. Deploy → get your `SEARX_URL` (e.g., `https://your-searxng.onrender.com`)

### 2. Deploy hawkin UI on Vercel
1. Import the same repo on [Vercel](https://vercel.com)
2. Add environment variables:
   ```
   SEARX_URL=https://your-searxng.onrender.com
   TAVILY_API_KEY=optional
   OPENROUTER_API_KEY=optional
   ```
3. Deploy

### 3. Local Development
```bash
# Install deps
bun install

# Copy env
cp .env.local.example .env.local
# Fill in SEARX_URL, OPENROUTER_API_KEY, etc.

# Run dev
bun dev
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SEARX_URL` | Yes | Your self-hosted SearXNG instance URL |
| `OPENROUTER_API_KEY` | No | OpenRouter API key for AI answers |
| `TAVILY_API_KEY` | No | Tavily API key for enhanced search |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router) · TypeScript · Tailwind CSS |
| **Search Backend** | SearXNG (self-hosted) |
| **AI** | OpenRouter (free models) · AI SDK |
| **Database** | Drizzle ORM |
| **Deployment** | Vercel (UI) · Render (SearXNG) |
| **Package Manager** | bun |

---

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built by <a href="https://github.com/BhagattJii">bhagat jii</a></sub>
</div>