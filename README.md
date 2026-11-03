<div align="center">

# hawkin

**AI-powered search engine — private, free, no tracking.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-green.svg)](LICENSE)

</div>

---

## What it does

Ask a question, get an AI-generated answer with cited sources. No logs, no tracking, no cookies, completely free.

- **Answers with sources** — Every claim links back to where it came from
- **Private by default** — No account, no analytics, no cookies, no fingerprinting
- **Free forever** — No paywalls, no usage limits
- **Self-hostable** — Run your own instance if you want full control

---

## Quick start

### Use it online
Just visit the live instance and start asking questions. No signup required.

### Run your own
```bash
# Clone and install
git clone https://github.com/BhagattJii/hawkin
cd hawkin
bun install

# Configure
cp .env.local.example .env.local
# Add your search backend URL and optional AI provider key

# Run locally
bun dev
```

Environment variables (all optional):
- `SEARX_URL` — Your self-hosted search backend URL
- `OPENROUTER_API_KEY` — For AI-generated answers
- `TAVILY_API_KEY` — For enhanced search results

---

## Why hawkin?

Most search engines track you, show ads, or limit free usage. hawkin was built to be different: **you ask, it answers, nobody watches.**

---

## License

Apache-2.0 — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Built by <a href="https://github.com/BhagattJii">bhagat jii</a></sub>
</div>