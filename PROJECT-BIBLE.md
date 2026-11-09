# Askwild — Complete Project Bible
_Last updated: 2026-11-08 (after Clerk→better-auth migration)_
_Note: secrets are redacted in this committed copy. The full copy with secrets lives outside the repo._

---

## 1. Identity

| Item | Value |
|---|---|
| Product | **Askwild** — real-time AI chat app (search + answer, web/news/live data) |
| Live site | https://askwild.vercel.app |
| Repo | https://github.com/BhagattJii/askwild (branch `main`, auto-deploy on push) |
| Vercel project | `askwild` · prj `prj_aYL9GpQK0aZdoUyrOjnjNzRpJXT8` · team `lakshay30x-7413s-projects` |
| Cloudflare account | `Lakshay.30x@gmail.com's Account` · id `155f089c2ab28360f82e3e52cca270c7` |
| Cloudflare Worker | `askwild-bing-scrape` → https://askwild-bing-scrape.meowboxx.workers.dev |
| Render workspace | `Lakshay verma's workspace` · owner `tea-dbkql4k9v7es73f3vb6g` |
| Render service | `askwild-searxng` → https://askwild-searxng.onrender.com (free, Singapore, Docker) |
| Database | **Supabase Postgres** `aws-0-ap-south-1.pooler.supabase.com:6543` (Mumbai) |
| Model | NVIDIA `nvidia/nemotron-3.5-bolt-e4b` (fast) via OpenAI-compatible endpoint `integrate.api.nvidia.com` |

---

## 2. Tech stack (exact versions)

Next 16.2.6 · React 19.3.1 · ai (Vercel AI SDK) 7.0.152 · @ai-sdk/react 4.0.156 ·
**better-auth 1.7.12** (auth, was Clerk — removed) · drizzle-orm 0.45.2 + postgres 3.4.5 ·
@upstash/redis 1.35.5 (limits/cache) · zod 4.6.7 · tailwindcss 4.1.11 ·
@vercel/analytics 1.5.0 · posthog-js 1.382.0 · @langfuse/client 5.10.1 (off) ·
jsdom (advanced-search crawl) · vitest (tests) · bun + npm + npx (tooling)

**Auth = better-auth (own code). Clerk completely removed:** `lib/auth/providers/clerk.ts` deleted,
`@clerk/nextjs` uninstalled, 6 Clerk env vars deleted, `AUTH_PROVIDER=better-auth` set.
Provider factory: `lib/auth/provider.ts` (`supabase | better-auth | none`).

---

## 3. Architecture (request flow)

```
Browser ──► Vercel (Next 16, proxy.ts = middleware)
   │           ├─ better-auth session check (cookie) → guest or user
   │           ├─ /api/chat → AI SDK → tool calls:
   │           │     ├─ search tool → Bing scrape via Cloudflare Worker (key-locked)
   │           │     │                   └─ fallback: SearXNG (our Render service)
   │           │     ├─ newsSearch tool → Google News RSS
   │           │     └─ model: NVIDIA Nemotron (OpenAI-compatible)
   │           ├─ /api/advanced-search → SearXNG + jsdom crawl (INTERNAL_API_TOKEN gated)
   │           ├─ /api/upload → R2 (NOT configured yet)
   │           └─ /relay/* → PostHog proxy (cookies never forwarded)
   ├─► Postgres (users, chats, messages, invitations, sessions, accounts, usage)
   ├─► Upstash Redis (rate limits, guest quota, search cache)
   └─► PostHog / Vercel Analytics (counts only, no query text)
```

---

## 4. Auth system (what "user" means)

**better-auth**, invite-only, self-hosted in our Postgres.

### Tables (better-auth, snake_case in DB)
`user` (id, name, email, email_verified, image, role, banned, …), `account` (credential password hash),
`session`, `verification`, `invitations` (SHA-256 hashed tokens, 7-day TTL).

### Current users (2, both admins)
| id | email | role |
|---|---|---|
| `lil3fgpWYTxTrOn7tA3o09AWau52kF8w` | x.lakshayy@gmail.com | admin |
| `RxTiBoR93CXO7Q3gO0UhSaIPkKOs2RZe` | admin@hawkin.local | admin (test account — delete later) |

### Login flow
1. `/auth/login` → `<LoginForm>` (email + password, own component)
2. server action → better-auth `signInEmail` → compare scrypt hash in `account.password` (`salt:key`, 161 chars)
3. success → row in `session`, cookie `better-auth.session_token` in browser
4. every request: `proxy.ts` → `getAuthProvider().handleSession()` → session read → `getCurrentUser()`
5. guests (no session) get no row; tracked by IP in Upstash

### Roles / capabilities
- `admin` → `/auth/admin`: invite users, change roles, reset member passwords, members list
- `member` → full chat, own history
- `guest` → no account; `GUEST_CHAT_DAILY_LIMIT` (25/day per IP)

### Sign-up
- `AUTH_SIGNUP_MODE` = invite (default) → signup page shows invite wall
- New user needs an invitation token (or admin creates one) → `/auth/sign-up?token=…`
- Bootstrap path (`BOOTSTRAP_ADMIN_EMAIL` + empty user table + SMTP) — not needed, admins already exist
- `AUTH_SIGNUP_MODE=open` → public signup (currently NOT)

### Passwords
- Original passwords are never stored; only scrypt hashes.
- Admin password was reset today to a known value (see §10).
- Password reset needs SMTP (NOT configured → `/auth/forgot-password` redirects to login).

---

## 5. Database (Supabase Postgres)

Drizzle schema: `lib/db/schema.ts` · migrations: `drizzle/0000…0021` · apply: `bun run migrate`.
Latest migration: `0021_user_preferences.sql`.

| Table | Purpose | Key indexes |
|---|---|---|
| `chats` | conversations (user_id, title, visibility) | chats_user_id_idx, chats_user_id_created_at_idx, chats_created_at_idx, chats_id_user_id_idx + RLS |
| `messages` | messages per chat (chat_id cascade delete) | messages_chat_id_idx, messages_chat_id_created_at_idx + RLS |
| `parts` | message parts | — |
| `user`,`account`,`session`,`verification` | better-auth | — |
| `invitations` | invite tokens (hash) | — |
| `usage_budget` / snapshots | per-user quotas & spend | — |
| `preferences`, notes, knowledge | user data | — |

**Chat ownership (live count):** anonymous-user 7 · Clerk-era `user_3LjWw4…` 4 · `user_3Le7G8u…` 2 ·
`user_3Le7G4m…` 1 · better-auth `lil3fgpW…` 2 → **7 Clerk chats are stranded** (owner IDs no longer exist).
Fix = one UPDATE `chats set user_id='lil3fgpWYTxTrOn7tA3o09AWau52kF8w' where user_id like 'user_%'` (messages follow via chat_id).

---

## 6. Search stack (free, keyless, real-time) — 5 layers

1. **Cache** (Upstash) — instant repeats
2. **Bing scrape** via Cloudflare Worker (`lib/tools/search/providers/bing.ts`) — real-time, ~0.4-1.1s
   - worker is **key-locked**: `ACCESS_KEY` secret (Cloudflare) ↔ `BING_WORKER_KEY` (Vercel); no key → **403**
   - worker only allows `bing.com` targets (example.com → 400, metadata IP → 400)
   - fixes done: 12 000-char parse window, `&` html-unescape before URL parse
3. **SearXNG** (our Render service) — fallback when Bing yields <2 results; JSON, 20-50 results
4. **Google News RSS** — news lane (fastest)
5. **Model knowledge** — last resort

Prod envs: `SEARCH_API=bing`, `SEARXNG_API_URL=https://askwild-searxng.onrender.com`,
`SEARXNG_ENGINES=google,bing,duckduckgo`, `SEARXNG_MAX_RESULTS=20`, `SEARXNG_DEFAULT_DEPTH=basic`,
`SEARXNG_SAFESEARCH=0`, `SEARXNG_TIME_RANGE=None`, `SEARXNG_CRAWL_MULTIPLIER` (hidden),
`INTERNAL_API_TOKEN` (hidden, gates `/api/advanced-search` — fail-closed).

Keepalive: `.github/workflows/keepalive.yml` pings SearXNG every 10 min + the app.

---

## 7. AI + latency (measured prod, guest path)

Model `nvidia/nemotron-3.5-bolt-e4b` (`DEFAULT_MODEL_ID`, `DEFAULT_MODEL_PROVIDER_ID=openai-compatible`).
Modes: quick (RSS-first) / adaptive / deep. `maxSteps` tuned earlier for speed.

Measured (2026-11-08, prod): TTFB ~1.0-2.2s · **first answer token 1.6-3.3s** · total 8-18s · 1.7-3.5k chars.
Bing direct scrape ~420ms; via worker ~500ms-1.1s; SearXNG cold 3.4s / warm <1s.

---

## 8. Limits & budgets (all server-side, Upstash Redis)

`GUEST_CHAT_DAILY_LIMIT` (25/IP/day) · `ADAPTIVE_CHAT_DAILY_LIMIT` · `OVERALL_CHAT_DAILY_LIMIT` ·
`AI_CHAT_DAILY_SECONDS` (AI time per user) · `INTERNAL_API_TOKEN` · `ENABLE_GUEST_CHAT=true` ·
`ASKWILD_CLOUD_DEPLOYMENT=true` (enables analytics + limits + blocks AUTH_PROVIDER=none).

---

## 9. Feature status

| Feature | Status |
|---|---|
| Chat + streaming | ✅ live, fast |
| Web search (Bing) | ✅ live via CF worker |
| News search | ✅ live (RSS) |
| Image/video search | ❌ needs Brave API key |
| File upload | ❌ **R2 not configured** (returns "storage not configured"); code ready (jpg/png/pdf, magic-byte check, 5MB cap) |
| Password reset email | ❌ needs SMTP |
| Share chat publicly | ❌ `ENABLE_SHARE` unset → off (good default) |
| Admin panel | ✅ /auth/admin (invite, roles, password reset) |
| Public signup | ❌ invite-only (change `AUTH_SIGNUP_MODE=open` to allow) |
| Sitemap / robots | ✅ /sitemap.xml 200, /robots.txt 200 |
| PostHog | ⚠️ `NEXT_PUBLIC_POSTHOG_KEY` not set → client analytics dormant |
| Langfuse | ⚠️ `ENABLE_LANGFUSE_TRACING` not set → off |

---

## 10. Credentials & where secrets live

| What | Where |
|---|---|
| **Site admin login** | https://askwild.vercel.app/auth/login · `x.lakshayy@gmail.com` · `<REDACTED — admin password, see local file>` |
| Better-auth secret (prod) | Vercel env `BETTER_AUTH_SECRET` · local copy `~/.ba_secret.tmp` |
| Database URL | `~/.askwild/.env.local` (`DATABASE_URL`) + Vercel prod env |
| Vercel token | `~/.local/share/opencode1/com.vercel.cli/auth.json` (CLI auto-uses) |
| Cloudflare login | `~/.wrangler/` (OAuth token) |
| **Render API key** | user-provided `<REDACTED — rotate this key in Render>` — **rotate/delete after setup** |
| Worker key | Vercel env `BING_WORKER_KEY` + CF secret `ACCESS_KEY` (value not saved locally) |
| Old Clerk creds file | `~/askwild-admin-clerk.txt` (obsolete — Clerk removed) |
| Local bench scripts | `/data/data/com.termux/files/usr/tmp/awbench2.mjs` (SSE latency bench) |

---

## 11. What I (the agent) can access & do

**Full control:**
- **Vercel**: deploy, env vars (add/rm/list), logs, build events, production domains
- **Cloudflare (wrangler)**: deploy/rollback workers, set secrets, logs
- **Render (REST API)**: create/update/delete services, deploys, env vars
- **Postgres**: read/write any table via postgres.js using `.env.local` URL
- **GitHub**: commit/push to `BhagattJii/askwild` (main → auto-deploy), run Actions
- **Repo**: full read/write, run bun/npm/npx/vitest/tsc/eslint/drizzle-kit
- **Termux shell** on user's Android phone (node 24, bun, npm, git, curl, wrangler 3.114)
- **MCP**: Clerk workspace (3 dev apps: "Askwild" (now unused — deletable), "My Application", "BJ Studio"), Mobbin (design reference)

**Cannot:** send email (no SMTP), manage domain registrar/DNS records outside Cloudflare, do payments, touch user's phone UI, read Clerk prod (not available).

---

## 12. Pending / next steps (priority order)

1. **Merge 7 stranded Clerk chats** into `lil3fgpW…` (1 UPDATE, backup first)
2. **SMTP** (Gmail app password) → password reset + invitation emails work
3. **R2 keys** (Cloudflare R2 free 10GB) → file upload works
4. Delete `admin@hawkin.local` test admin; delete unused Clerk app "Askwild" in dashboard
5. Delete/rotate **Render API key**
6. Optional: Brave API key → image/video search; `AUTH_SIGNUP_MODE=open` → public signup
7. Optional: keep `compact-historical-messages.ts` WIP decision (still uncommitted in user's tree — actually now committed? verify)
8. `POSTHOG` key if analytics wanted

---

## 13. Recent git history

```
6ce6b20 Keep sitemap, robots and favicon reachable without a session
c4ae5bd Allow Better Auth as the cloud auth provider
914b0a7 Restore better-auth in the provider name list
4f2d1b7 Remove Clerk, add worker access key, sitemap, and redirect legacy auth callbacks
3a8d797 Route Bing scrape through the optional Cloudflare worker proxy
ead29cc Point keepalive at the SearXNG service and drop the OpenSERP ping
11b080d Add SearXNG docker config for the Render fallback service
efc3e20 Swap the OpenSERP web lane for keyless Bing with a SearXNG fallback
```

---

## 14. Key files map

```
app/layout.tsx                    root layout (ClerkProvider removed)
app/auth/login/[[...rest]]/page.tsx   login page → <LoginForm> (better-auth)
app/auth/sign-up/page.tsx         invite-wall signup
app/auth/admin/page.tsx           admin console (role=admin only)
app/relay/[...path]/route.ts      PostHog relay (allowlisted, no cookie forwarding)
proxy.ts                           Next 16 middleware → provider.handleSession()
lib/auth/provider.ts               provider registry + cloud guard
lib/auth/providers/better-auth.ts  better-auth provider (session, signUp, bootstrap)
lib/auth/better-auth/config.ts     better-auth instance, bootstrap window, signup mode
lib/auth/better-auth/invitations.ts invite tokens (hashed)
lib/auth/get-current-user.ts       user resolution (provider-agnostic)
lib/tools/search.ts                search tool (provider dispatch, fallbacks)
lib/tools/search/providers/bing.ts   Bing scrape + SearXNG secondary
lib/tools/search/providers/searxng.ts SearXNG provider
lib/tools/search/news-rss-lane.ts    Google News RSS lane
lib/tools/search/providers/openserp-cache.ts 2-layer cache
lib/db/schema.ts                   drizzle schema (+RLS, indexes)
lib/analytics/relay-target.ts      relay allowlist
lib/rate-limit/*                   guest/adaptive/AI-time limits
workers/bing-scrape/               Cloudflare Worker (src/index.js, wrangler.toml)
docker/searxng/                    Dockerfile + settings.yml for Render
.github/workflows/keepalive.yml    pings SearXNG + app every 10 min
```

---

## 15. Ops cheat-sheet

```bash
cd ~/askwild
vercel ls --environment production          # deploys
vercel env ls production                    # env names
vercel deploy --prod -y                     # force rebuild with current envs
bun run migrate                             # apply drizzle migrations (needs .env.local)
npx vitest run lib/auth                     # tests (vitest, NOT bun:test)
NODE_OPTIONS=--max-old-space-size=1800 npx tsc --noEmit && npx eslint . && npx prettier --check .
wrangler deploy                              # from workers/bing-scrape/
wrangler secret put ACCESS_KEY --name askwild-bing-scrape
curl -s https://api.render.com/v1/services -H "Authorization: Bearer $RENDER_KEY"
node /data/data/com.termux/files/usr/tmp/awbench2.mjs 'test question'   # latency bench
```

---

## 16. Incident log (today)

| Incident | Root cause | Fix |
|---|---|---|
| Everyone treated as guest on prod | `ClerkProvider` missing at root → no clerk-js → dev-instance handshake cookie never set | mount provider at root, then switched to better-auth |
| OpenSERP dead (Render timeouts) | free instance + wrong service | deleted all 3 services, created 1 clean SearXNG |
| Bing scrape returned 0 results | 4 000-char parse window cut anchors; `&` entities hid `u=a1…` param | 12 000-char window + html-unescape |
| Vercel builds ERROR (×3) | stale `AUTH_PROVIDER=clerk` env; my edit removed `'better-auth'` from names list; cloud guard blocked better-auth | env rotate, list restored, guard allows better-auth (+test updated) |
| Sitemap 404 / redirected to login | no sitemap file; auth redirect swallowed it | `app/sitemap.ts` + public paths |
