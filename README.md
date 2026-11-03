# 🦅 Hawkin

**AI-Powered Search That Sees Everything**

Hawkin ek free, privacy-first AI search engine hai — sawal poocho, jawab pao, sources ke saath.

## Kya Hai Ye?

- 🔍 **Search** — SearXNG (self-hosted, zero-cost) se web-wide fetch
- 🦅 **AI Answers** — OpenRouter free models se generated answers
- 📜 **Sources** — har claim ke peeche cited links
- 🔒 **Privacy** — no logs, no tracking, no cookies
- 💸 **Free Forever** — Render free tier + zero bills

## Deploy

### SearXNG (Render)
1. [render.com](https://render.com) par account banao (no credit card)
2. New → Blueprint → repo select karo → `searxng/` directory
3. URL mil jayega → Vercel env `SEARX_URL` me daal do

### Hawkin UI (Vercel)
1. [vercel.com](https://vercel.com) → Import GitHub repo
2. Env vars: `SEARX_URL`, `TAVILY_API_KEY`, `OPENROUTER_API_KEY`
3. Deploy

## License

MIT
