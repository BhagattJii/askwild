# Configuration Guide

This guide covers the optional features and their configuration in Askwild.

## Table of Contents

- [Database](#database)
- [AI Providers](#ai-providers)
- [Search Providers](#search-providers)
- [Authentication](#authentication)
  - [Auth Provider](#auth-provider-auth_provider)
  - [Anonymous Mode](#anonymous-mode-default)
  - [Better Auth](#better-auth)
  - [Clerk](#clerk)
  - [Supabase](#supabase)
- [Guest Mode](#guest-mode)
- [Live Data Tools](#live-data-tools)
- [Model Tiers](#model-tiers)
- [Other Features](#other-features)
- [Privacy and Telemetry](./PRIVACY.md)

## Database

Askwild uses PostgreSQL for persistent application data. A database is **optional** for stateless guest chat. To run without a database, set `ENABLE_GUEST_CHAT=true` and do not configure Supabase. Setting `ENABLE_AUTH=false` creates an anonymous user ID that uses the persistent chat path and will fail without a database.

Without a database, chat history, permalinks (`/search/[id]`), file upload, and feedback are unavailable.

### Setting Up PostgreSQL

Set the connection string in `.env.local`:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/askwild
```

Any PostgreSQL provider works: [Neon](https://neon.tech/), [Supabase](https://supabase.com/), or a local PostgreSQL instance.

**Docker**: Database is automatically configured — no need to set this.

### Running Migrations

After configuring your database, run migrations to create the necessary tables:

```bash
bun run migrate
```

This command applies all migrations from the `drizzle/` directory. Docker runs migrations automatically on startup when a database connection string is configured. Otherwise, it skips migrations and starts in stateless mode.

## AI Providers

### Model Selection

Askwild dynamically detects available AI providers based on your API keys and displays a model selector in the UI. Set at least one provider API key to get started.

In **Local/Docker** mode, the selected model is persisted in a cookie and used for all chat interactions including related question generation.

In **Cloud** mode (`ASKWILD_CLOUD_DEPLOYMENT=true`), models are fixed by `config/models/cloud.json` and the model selector is not shown.

### Supported Providers

#### OpenAI

```bash
OPENAI_API_KEY=[YOUR_API_KEY]
```

#### Anthropic

```bash
ANTHROPIC_API_KEY=[YOUR_API_KEY]
```

#### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=[YOUR_API_KEY]
```

#### Vercel AI Gateway

[Vercel AI Gateway](https://vercel.com/docs/ai-gateway) provides access to 200+ models through a single API.

```bash
AI_GATEWAY_API_KEY=[YOUR_AI_GATEWAY_API_KEY]
```

#### Ollama

[Ollama](https://ollama.com/) enables you to run large language models locally on your own hardware.

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

When configured, Ollama models are discovered dynamically and appear in the model selector.

#### OpenAI-Compatible Providers

Use OpenAI-compatible endpoints for providers such as DeepSeek, Moonshot, Zhipu, Together, or a self-hosted gateway that exposes the OpenAI chat completions API.

```bash
OPENAI_COMPATIBLE_API_KEY=[YOUR_API_KEY]
OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com
```

Askwild sends chat requests to `/v1/chat/completions`. You can provide either a base URL with or without `/v1`; both of these resolve to the same endpoint:

```bash
OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com
OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com/v1
```

The model selector tries to load models from `/v1/models`. If your provider does not expose that endpoint, or you want to restrict the choices shown in the UI, set a comma-separated model list:

```bash
OPENAI_COMPATIBLE_MODELS=deepseek-chat,deepseek-reasoner
```

You can also customize the provider label shown in the model selector:

```bash
OPENAI_COMPATIBLE_PROVIDER_NAME=DeepSeek
```

This value is only a UI display name. The internal provider id remains `openai-compatible`.

**Example: OrcaRouter**

[OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible endpoint that fronts 160+ models from OpenAI, Anthropic, Google, DeepSeek, xAI and others behind one API key. To use it with Askwild:

```bash
OPENAI_COMPATIBLE_API_KEY=sk-orca-...
OPENAI_COMPATIBLE_API_BASE_URL=https://api.orcarouter.ai/v1
OPENAI_COMPATIBLE_PROVIDER_NAME=OrcaRouter
# Pin a few tool-capable models so Askwild's research agents work out of the box.
# Browse the full catalog at https://www.orcarouter.ai/models
OPENAI_COMPATIBLE_MODELS=orcarouter/openai/gpt-5.5,orcarouter/anthropic/claude-opus-4.7,orcarouter/google/gemini-3-flash-preview
```

Askwild's research agents rely on tool calling, so make sure any model you select supports it. Restricting `OPENAI_COMPATIBLE_MODELS` to known tool-capable models (as above) is the simplest way to keep the selector clean and avoid hitting non-tool-capable upstreams.

## Search Providers

### SearXNG Configuration

SearXNG can be used as an alternative search backend with advanced search capabilities. Docker Compose includes SearXNG automatically.

#### Basic Setup

```bash
SEARCH_API=searxng
SEARXNG_API_URL=http://localhost:8080
SEARXNG_SECRET=""  # generate with: openssl rand -base64 32
```

#### Advanced Configuration

```bash
# Search Behavior
SEARXNG_DEFAULT_DEPTH=basic  # Set to 'basic' or 'advanced'
SEARXNG_MAX_RESULTS=50
SEARXNG_ENGINES=google,bing,duckduckgo
SEARXNG_TIME_RANGE=None  # day, week, month, year, or None
SEARXNG_SAFESEARCH=0  # 0: off, 1: moderate, 2: strict

# Server
SEARXNG_PORT=8080
SEARXNG_BIND_ADDRESS=0.0.0.0
SEARXNG_IMAGE_PROXY=true
SEARXNG_LIMITER=false
```

#### Advanced Search Features

- `SEARXNG_DEFAULT_DEPTH`: Controls search depth
  - `basic`: Standard search
  - `advanced`: Includes content crawling and relevance scoring
- `SEARXNG_CRAWL_MULTIPLIER`: In advanced mode, determines how many results to crawl
  - Example: If `MAX_RESULTS=10` and `CRAWL_MULTIPLIER=4`, up to 40 results will be crawled

#### SearXNG engine defaults (v-latest, see searxng-settings.yml)

`use_default_settings: true` with these defaults:

```yaml
search:
  default_engines: [google, bing, duckduckgo, wikipedia]
engines:
  - name: yandex      # disabled: loosely-matched results, poor for English/India
    disabled: true
```

Yandex is explicitly disabled in this repo's settings. If your deployed
SearXNG instance needs good Google coverage, prefer an instance with proxies
(Google blocks most datacenter IPs); Bing and DuckDuckGo work reliably
without proxies. If you are rate-limited by Google, remove `google` and keep
`bing,duckduckgo`.

#### Customizing SearXNG

Modify `searxng-settings.yml` to enable/disable specific search engines, change UI settings, or adjust server options. See the [SearXNG documentation](https://docs.searxng.org/admin/settings/settings.html#settings-yml) for details.

### Brave Search (Optional)

Brave Search provides enhanced support for video and image searches:

```bash
BRAVE_SEARCH_API_KEY=[YOUR_BRAVE_SEARCH_API_KEY]
```

If not configured, `type="general"` searches fall back to your configured search provider.

## Authentication

Askwild has four auth providers. Pick the one that matches how the instance is used:

| Use case                           | Provider                                  |
| ---------------------------------- | ----------------------------------------- |
| Personal, single user              | [Anonymous mode](#anonymous-mode-default) |
| Self-hosted, multiple users        | [Better Auth](#better-auth)               |
| Hosted sign-in with social login   | [Clerk](#clerk)                           |
| You already run a Supabase project | [Supabase](#supabase)                     |

### Auth Provider (`AUTH_PROVIDER`)

Set `AUTH_PROVIDER` explicitly to one of:

| Value         | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `none`        | Anonymous mode: all users share one user ID                     |
| `better-auth` | Built-in accounts stored in Askwild's own Postgres (multi-user) |
| `clerk`       | Hosted Clerk authentication (sign-in, social login, email)      |
| `supabase`    | Supabase cloud authentication (multi-user)                      |

When `AUTH_PROVIDER` is **unset**, the provider is derived from the existing
environment so current deployments keep working unchanged:

- `ENABLE_AUTH=false` → `none` (anonymous mode, shared `ANONYMOUS_USER_ID`).
  This is what `.env.local.example` and Docker Compose set.
- otherwise → `supabase` (when Supabase is not configured, no user is resolved
  and the app behaves as before: guest/anonymous access without a shared ID)

Better Auth is never selected implicitly. An explicit `AUTH_PROVIDER` takes
precedence over `ENABLE_AUTH`.

`ASKWILD_CLOUD_DEPLOYMENT=true` requires Supabase-backed auth: requests fail
with a clear error when the resolved provider is `none` or any non-Supabase
provider.

### Anonymous Mode (Default)

For personal, single-user environments.

```bash
ENABLE_AUTH=false
ANONYMOUS_USER_ID=anonymous-user
```

All users share a single anonymous user ID. No additional configuration needed.

Anyone who can reach the instance can send prompts, and a prompt is what decides which addresses the server requests on the sender's behalf.

### Better Auth

For multi-user self-hosting, this is the recommended provider. Accounts live in Askwild's own Postgres database, so no external auth service is needed.

> **Note**: This provider is new. Its built-in rate limiting for sign-in, sign-up, and password reset is basic and in-process. If the instance is reachable from the internet, put it behind a reverse proxy that enforces its own rate limits and terminates HTTPS.

#### Setup

1. Configure `.env.local`:

```bash
AUTH_PROVIDER=better-auth
BETTER_AUTH_SECRET=run-openssl-rand-hex-32-for-a-stable-value
# Recommended whenever the instance is reachable by anyone but you:
BOOTSTRAP_ADMIN_EMAIL=you@example.com
```

`BETTER_AUTH_SECRET` is required in production builds. Keep it stable across restarts.

2. Start Askwild. The auth tables are created by the database migration. With Docker (`docker compose up -d`), migrations run automatically at container start. For local development (`bun dev` with a local Postgres), run `bun migrate` once before starting the dev server.

3. Open http://localhost:3000/auth/sign-up and create your account. The first account becomes the instance admin, and the bootstrap window then closes.

#### First boot and `BOOTSTRAP_ADMIN_EMAIL`

When `BOOTSTRAP_ADMIN_EMAIL` is set, only that address can sign up while the user table is empty.

- With SMTP configured, the bootstrap sign-up emails a one-time link to that address, so only someone who controls the mailbox can complete it. This requires `BETTER_AUTH_URL` (the link origin).
- Without SMTP, the first person to submit the gated address wins the window, so finish first boot before exposing the instance to others.

The window is tied to the user table being empty. If the last account is ever deleted, the window reopens and the gated address (or, without SMTP, whoever signs up first) can claim admin again. Keep at least one account, or unset `BOOTSTRAP_ADMIN_EMAIL` before deleting the last one.

#### Invite-only sign-up

`AUTH_SIGNUP_MODE` is `open` (default) or `invite`. Set `AUTH_SIGNUP_MODE=invite` to require an invitation for new accounts:

- On a fresh instance there are no invitations yet: set `BOOTSTRAP_ADMIN_EMAIL` and the first account for that address can sign up without an invitation (with SMTP configured, the bootstrap link is emailed to that address first), then create invitations from the admin page.
- As admin, open the admin page (user menu → **Admin**) and create an invitation link for an email address. Each link is bound to that address, valid for one sign-up for 7 days, and can be revoked until used.
- The invitee opens the link and completes sign-up. The token is consumed automatically.

#### Password reset and SMTP

Password reset requires SMTP and `BETTER_AUTH_URL`. Without them the forgot-password flow is hidden and the admin can set member passwords from the admin page instead.

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp-user
SMTP_PASSWORD=smtp-password
EMAIL_FROM="Askwild <askwild@example.com>"
BETTER_AUTH_URL=https://askwild.example.com
```

With SMTP configured, password-reset emails are sent and invitation links are additionally emailed to invitees.

`BETTER_AUTH_URL` is the canonical origin embedded in emailed links (password resets, invitations, bootstrap). It is never derived from request headers, so a spoofed `Host` cannot redirect a live credential to an attacker domain.

#### HTTPS and secure cookies

In production builds (Docker), session cookies carry the `__Secure-` prefix, so browsers only store and send them over HTTPS or on `localhost`. An instance reached via `http://<LAN-IP>:3000` will not stay logged in. Serve it over HTTPS (reverse proxy, Tailscale Serve, etc.). Development mode (`bun dev`) is not affected.

#### Chat sharing

With Better Auth, sharing chats is off until you set `ENABLE_SHARE=true`. See [Chat Sharing](#chat-sharing).

#### OIDC / OAuth Integration

Better Auth supports generic OIDC authentication for corporate identity providers like Keycloak, Authentik, Okta, Azure AD, and others.

**Required environment variables:**

```bash
OIDC_ISSUER=https://keycloak.example.com/realms/your-realm
OIDC_CLIENT_ID=askwild-client
OIDC_CLIENT_SECRET=your-client-secret
BETTER_AUTH_URL=https://your-askwild-url.com
```

`BETTER_AUTH_URL` is required: it is the canonical origin the provider redirect URI (`<BETTER_AUTH_URL>/api/auth/callback/<OIDC_PROVIDER_ID>`) and the post-SignIn redirect are derived from. Without it, OAuth sign-in is refused at click time even when OIDC is otherwise fully configured.

**Optional customization:**

```bash
# OAuth scopes (defaults to 'openid profile email')
OIDC_SCOPE=openid profile email groups

# Provider display name in login UI (defaults to 'OIDC')
OIDC_PROVIDER_NAME=Keycloak

# Provider id (defaults to 'oidc'). Becomes the plugin-registered identity
# and the last segment of the callback URL below.
OIDC_PROVIDER_ID=oidc
```

**How it works:**

- When OIDC environment variables are set, the login form replaces the Google OAuth button with your configured provider
- The provider id defaults to `oidc` (`OIDC_PROVIDER_ID`); the callback URL is `/api/auth/callback/<OIDC_PROVIDER_ID>` and the provider id must match the client's registered redirect URI exactly
- The OIDC `sub` claim is only unique per issuer: accounts are keyed by `(providerId, sub)`, so changing `OIDC_ISSUER` must come with a new `OIDC_PROVIDER_ID`; otherwise identities from the two issuers collide in the account table
- Uses OpenID Connect Discovery to automatically fetch endpoints from `OIDC_ISSUER/.well-known/openid-configuration`
- Implements PKCE (Proof Key for Code Exchange) for secure authorization flows
- User accounts are stored in the same `users` and `accounts` tables as email/password users
- The OIDC `sub` claim is stored as `accounts.accountId` with `accounts.providerId=<OIDC_PROVIDER_ID>`
- A transient discovery outage does not permanently disable the provider: a failed discovery is retried on the next sign-in attempt

**Sign-up policy:**

- `AUTH_SIGNUP_MODE=open`: any identity accepted by your IdP can create a local account on first sign-in
- `AUTH_SIGNUP_MODE=invite` (or an invalid mode): implicit sign-up through OIDC is rejected. OIDC sign-in works only for an IdP identity that is already linked to a local account. An account created through an invitation (credential flow) is not linked automatically: its email is unverified, so an OIDC sign-in with the same address is rejected with `account_not_linked`. Invited members therefore sign in with email and password, and new members cannot be onboarded through OIDC in this mode. Members of your IdP tenant are never handed an account implicitly.
- The bootstrap window applies to OIDC account creation: while the user table is still empty, OIDC cannot create the first account. The first account of a deployment must be created through the credential/bootstrap path — with SMTP configured that is the emailed bootstrap link (proof of mailbox ownership of `BOOTSTRAP_ADMIN_EMAIL`); without SMTP the address gate is the accepted proof, as for credential sign-up. Once the first account exists, OIDC sign-up follows the sign-up mode policy alone — the gate reads the live user table at creation time (Better Auth's `user.validateUserInfo` callback), so no restart is needed for it to lift, and it re-closes automatically if every account is deleted.
- The gate runs on every account creation and fails closed: if the user-table state cannot be read, OIDC registration is rejected rather than silently allowed.

**HTTP surface:**

Better Auth's API is driven through server actions. Only the provider callback is mounted as an HTTP route (`GET /api/auth/callback/<providerId>`); other endpoints (credential sign-up, sign-in, password reset) are reachable only inside the server actions, which enforce the sign-up policy — a direct `POST /api/auth/sign-up/email` on a mounted catch-all would otherwise bypass invitations.

**Identity provider setup:**

1. Create a new OAuth/OIDC client in your identity provider
2. Set the redirect/callback URL to: `https://your-askwild-url.com/api/auth/callback/<OIDC_PROVIDER_ID>` (default: `…/callback/oidc`)
3. Enable authorization code flow with PKCE
4. Request scopes: `openid`, `profile`, `email` (and any additional scopes like `groups`)
5. Copy the client ID, client secret, and issuer URL to your environment variables

**Keycloak example:**

```bash
OIDC_ISSUER=https://keycloak.example.com/realms/company
OIDC_CLIENT_ID=askwild
OIDC_CLIENT_SECRET=abc123...
OIDC_PROVIDER_NAME=Company Login
```

**Authentik example:**

```bash
OIDC_ISSUER=https://authentik.example.com/application/o/askwild/
OIDC_CLIENT_ID=askwild-client
OIDC_CLIENT_SECRET=xyz789...
OIDC_PROVIDER_NAME=Authentik
```

When OIDC is configured, users can sign in with their corporate accounts. Email/password registration and login remain available for admin bootstrap and local accounts.

### Clerk

For a hosted sign-in experience with social login, password reset and email verification handled by Clerk.

#### Setup

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com) and copy the API keys.

2. Set the following environment variables:

```bash
AUTH_PROVIDER=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
# Comma-separated allowlist of admin emails (Clerk has no roles).
ASKWILD_ADMIN_EMAILS=you@example.com
```

3. In the Clerk dashboard, enable the sign-in methods you want (email/password, Google, …) and add your production domain under "Domains".

#### Production domain requirement

Clerk refuses to create a **production instance** on a provider subdomain: `*.vercel.app`, `*.lcl.dev` and `*.accounts.dev` are rejected with `provider_domain_operation_not_allowed` / `reserved_domain`. A production instance therefore needs a domain you own (for example `askwild.dev`).

While no domain is owned, Askwild runs on the Clerk **development instance** (`pk_test_…` / `sk_test_…`):

- Everything works (email/password, Google, GitHub, password reset, email verification).
- The instance is capped at **100 monthly active users** and is labelled a development instance in the Clerk dashboard.

#### Upgrading to a production instance

1. Point the new domain at the Vercel project and add it to Clerk → Domains.
2. Create the production instance for that domain in the Clerk dashboard and copy the `pk_live_…` / `sk_live_…` keys.
3. Update the Vercel production environment variables (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, plus `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/login` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/login`) and redeploy. No code change is required.

#### Behavior

- `/auth/login` renders Clerk's hosted sign-in component; sign-up runs from the same screen.
- Password reset and email verification emails are sent by Clerk, so no SMTP variables are needed.
- Admin access is granted through the `ASKWILD_ADMIN_EMAILS` allowlist. The Better Auth admin console (invitations, member roles) stays hidden; manage those users in the Clerk dashboard.
- Account deletion removes the Clerk user and the Askwild-side data (chats, notes, library files, feedback).

### Supabase

For deployments that already use Supabase, or that prefer a hosted auth service.

1. Create a Supabase project at [supabase.com](https://supabase.com)

2. Set the following environment variables:

```bash
ENABLE_AUTH=true
NEXT_PUBLIC_SUPABASE_URL=[YOUR_SUPABASE_PROJECT_URL]
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[YOUR_SUPABASE_PUBLISHABLE_KEY]
# Required for account deletion. Keep server-side only.
SUPABASE_SECRET_KEY=[YOUR_SUPABASE_SECRET_KEY]
```

3. Obtain your credentials from the Supabase dashboard:
   - **Project URL**: Settings > API > Project URL
   - **Publishable Key**: Settings > API Keys > publishable key (`sb_publishable_...`)
   - **Secret Key**: Settings > API Keys > secret key (`sb_secret_...`)

4. For password recovery emails to work, add your site's recovery destination
   under **Auth → URL Verification → Redirect URLs**:

   ```
   [YOUR_SITE_URL]/auth/update-password
   ```

   Recovery links point at this URL (the same destination Askwild has always
   used, so existing allowlist entries keep working). If the destination is
   not allowlisted, Supabase silently falls back to the project Site URL and
   the recovery code can never be exchanged for a session.

5. Optional: keep Supabase's per-IP rate limits per visitor. Sign-up,
   password sign-in, and password reset run as server actions, so Supabase
   sees the server's address unless Askwild forwards the visitor's. To
   forward it, use an `sb_secret_...` key for `SUPABASE_SECRET_KEY` and turn
   on **Authentication → Rate Limits → IP Address Forwarding**. On Vercel
   production and preview deployments this is automatic. Elsewhere,
   including `vercel dev`, set `SUPABASE_FORWARD_CLIENT_IP=true` only when a
   reverse proxy in front of Askwild overwrites `X-Forwarded-For`; otherwise
   visitors can spoof it to dodge the limits.

### Signed-in User Limits (cloud deployments)

With `ASKWILD_CLOUD_DEPLOYMENT=true` and Upstash Redis configured, signed-in
users are capped per UTC day after a per-IP guest cap:

```bash
OVERALL_CHAT_DAILY_LIMIT=100   # all chat searches per user (default 100)
ADAPTIVE_CHAT_DAILY_LIMIT=30   # deep/adaptive searches per user (default 30)
```

The monthly usage budget (`MONTHLY_USAGE_ALLOWANCE`, default 100 credits,
quick search costs 1, adaptive costs 2) runs in shadow mode unless
`USAGE_BUDGET_ENFORCEMENT=on`. `USAGE_BUDGET_UI=on` shows the usage ring in
the sidebar.

**Admin exemption**: users with the `admin` role or any address listed in
`ASKWILD_ADMIN_EMAILS` bypass every cap listed above, including the guest
per-IP cap. The check runs server-side on the session, so client-side edits
cannot claim the exemption. The Clerk provider is allowed under
`ASKWILD_CLOUD_DEPLOYMENT`; the budget resolves users through the session
the same way for both Supabase and Clerk.

## Guest Mode

Guest mode allows users to try Askwild without creating an account. Guest sessions are ephemeral — no chat history is stored.

### Enabling Guest Mode

```bash
ENABLE_GUEST_CHAT=true
```

### Guest Mode Behavior

- No authentication required
- No chat history saved
- Full context per request (client sends all messages)
- Disabled features: file upload, chat sharing, sidebar history

### Rate Limiting for Guests

For cloud deployments:

```bash
GUEST_CHAT_DAILY_LIMIT=25  # Maximum requests per IP per day
UPSTASH_REDIS_REST_URL=[YOUR_UPSTASH_URL]
UPSTASH_REDIS_REST_TOKEN=[YOUR_UPSTASH_TOKEN]
```

Rate limiting only applies when `ASKWILD_CLOUD_DEPLOYMENT=true`.

In cloud deployments guests are pinned to the free model tier (see
[Model Tiers](#model-tiers)); larger models appear with a lock and open the
sign-in prompt.

### Recommended Setup

| Environment             | Configuration                                   |
| ----------------------- | ----------------------------------------------- |
| Personal/Local          | `ENABLE_AUTH=false` (anonymous mode)            |
| Self-hosted, multi-user | `AUTH_PROVIDER=better-auth` (built-in accounts) |
| Hosted sign-in          | `AUTH_PROVIDER=clerk` (Clerk dashboard keys)    |
| Public Demo             | `ENABLE_GUEST_CHAT=true` with rate limiting     |
| Production              | `ENABLE_AUTH=true` (Supabase authentication)    |

## Live Data Tools

Askwild ships with free, keyless knowledge tools that the model calls for
time-sensitive or factual questions. Failures degrade gracefully (the agent
falls back to web search) — no keys or crashes.

| Tool | Returns |
| ---- | ------- |
| `dynamic__wikiSummary` | Wikipedia summary + source URL for "what/who/explain" questions |
| `dynamic__weather` | Current conditions + 3-day forecast for any city (Open-Meteo) |
| `dynamic__currencyRate` | Live mid-market FX conversion (Frankfurter) |
| `dynamic__stockQuote` | Live price + daily change — Indian (`RELIANCE.NS`, `^NSEI`, `^BSESN`), US (`AAPL`, `^GSPC`) (Yahoo Finance) |
| `dynamic__newsSearch` | Latest headlines with source and publication time (Google News) |
| `dynamic__academicSearch` | arXiv papers with abstracts and links |
| `dynamic__cryptoPrice` | Live coin prices in INR/USD with 24h change (CoinGecko) |
| `dynamic__commodity` | Gold/silver/crude oil futures, USD converted to INR (Yahoo Finance + Frankfurter) |

The tools are registered in `lib/tools/knowledge.ts` and enabled for both
`quick` and `adaptive` search modes. Add or remove them in
`lib/agents/researcher.ts` (`activeToolsList`) and the tool descriptions in
`lib/agents/prompts/search-mode-prompts.ts`.

## Model Tiers

Production (`ASKWILD_CLOUD_DEPLOYMENT=true`) serves three NVIDIA-powered
tiers from the OpenAI-compatible provider (`config/models/catalog.json`):

| Tier | Model | Access |
| ---- | ----- | ------ |
| Small | `nvidia/nemotron-3.5-lightning-30b-a3b` (Nemotron 3.5 Lightning) | Everyone, including guests |
| Medium | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (Nemotron 3 Nano Omni Reasoning) | Signed-in only (locked for guests) |
| Large | `nvidia/nemotron-3-ultra-550b-a55b` (Nemotron 3 Ultra 550B) | Signed-in only (locked for guests) |

Rules:

- Model selection happens with priority: explicit cookie from the selector →
  `config/models/catalog.json` for cloud deployments → `selectModel()` for
  self-hosted mode. In cloud, guests are always pinned to the small tier —
  a saved cookie from a previous signed-in session does not unlock it.
- The selector appears in the composer next to the search mode switch. Guests
  see every tier; locked tiers show a lock and open the sign-in modal.
- Guest usage output (tokens) counts against `GUEST_CHAT_DAILY_LIMIT` per IP.
- Signed-in usage counts against `AI_CHAT_DAILY_SECONDS` (active AI time,
  default 3600/day), `OVERALL_CHAT_DAILY_LIMIT`, and, if configured, the
  monthly usage budget. Admins and `ASKWILD_ADMIN_EMAILS` are exempt.

The guest tier was promoted from `nemotron-3.5-bolt-e4b` (Nemotron 3.5 Bolt,
4B) because Bolt cannot call tools reliably — it hallucinated instead of
invoking the weather tool. Lightning answers with live data as expected.

## Other Features

### LLM Observability

Enable tracing and monitoring with Langfuse:

```bash
ENABLE_LANGFUSE_TRACING=true
LANGFUSE_SECRET_KEY=[YOUR_SECRET_KEY]
LANGFUSE_PUBLIC_KEY=[YOUR_PUBLIC_KEY]
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Off by default. Traces include full prompts and completions, so point `LANGFUSE_BASE_URL` at a self-hosted instance if that content should not leave your infrastructure. See [Privacy and Telemetry](./PRIVACY.md) for everything else a self-hosted instance can send outbound.

### Chat Sharing

With Supabase, signed-in users can share chats without extra configuration. With Better Auth, sharing is opt-in:

```bash
ENABLE_SHARE=true  # runtime flag; works with prebuilt Docker images
```

`NEXT_PUBLIC_ENABLE_SHARE=true` also works when building from source, but Next.js inlines `NEXT_PUBLIC_*` values at build time, so setting it at runtime has no effect in a published image.

Sharing is not available in anonymous mode.

### Outbound Fetch

The `fetch` tool and the advanced-search crawler refuse private address space: loopback, RFC1918, link-local (which carries the cloud metadata endpoint), and the other non-global ranges. To let them read a service on the host's own network:

```bash
FETCH_ALLOW_PRIVATE_NETWORK=true
```

Leave this off on any instance others can reach. With it on, whoever can send a prompt can read whatever the host can reach.

To keep the server from requesting pages itself, send the `regular` fetch type through the extraction service (Jina Reader if `JINA_API_KEY` is set, otherwise Tavily Extract):

```bash
FETCH_REGULAR_VIA_API=true
```

### Maintenance Mode

To take the instance offline while running a long database migration:

```bash
MAINTENANCE_MODE=true
```

Every page then returns a static maintenance page and every API route returns `503` JSON. Paths the proxy matcher skips (static assets, image-extension paths and `/api/favicon`) are still served. The value is read at request time, but most hosts (including Vercel) apply an environment change only on the next deployment.

### Source Favicons

Favicons for cited sources are fetched by the server and served from your own origin at `/api/favicon`, so a visitor's browser never tells the icon provider which sources a result cites. Responses are cached in memory and at the edge.

The provider defaults to Google's favicon service. To point it somewhere else, use `{domain}` and `{size}` as placeholders:

```bash
FAVICON_PROVIDER_URL=https://icons.example.com/{domain}?size={size}
```

To fetch no favicons at all, which falls back to the letter or hostname already shown when an icon fails to load:

```bash
FAVICON_PROVIDER_URL=off
```

### File Upload

Enable file upload with Cloudflare R2 or S3-compatible storage:

```bash
R2_ACCESS_KEY_ID=[YOUR_ACCESS_KEY]
R2_SECRET_ACCESS_KEY=[YOUR_SECRET_KEY]
R2_ACCOUNT_ID=[YOUR_ACCOUNT_ID]  # For Cloudflare R2
# S3_ENDPOINT=[YOUR_S3_ENDPOINT]  # Optional: generic S3-compatible endpoint
R2_BUCKET_NAME=[YOUR_BUCKET_NAME]
# Optional: signed GET URL lifetime in seconds (default: 3600)
R2_SIGNED_URL_EXPIRES_SECONDS=3600
# Optional: reuse one signature per window so a file signs to the same URL
# across requests, which keeps replayed attachments in the prompt cache.
# Capped at half the lifetime above; set to 0 to sign every request (default: 900)
R2_SIGNED_URL_STABILITY_WINDOW_SECONDS=900
```

If storage variables are not configured, `/api/upload` returns `400` and uploads are disabled.

Attachments are re-sent to the model on every turn, and an image costs thousands of
input tokens, so long conversations spend most of their context re-reading pictures
they already answered about. Older attachments are replaced with a placeholder naming
the file once a conversation collects more than the limit below. Uploads themselves are
not restricted: files stay stored and stay visible in the conversation, and the model is
told to ask for a re-attach if it needs one again.

```bash
# Optional: attachments replayed from earlier turns, excluding the newest message.
# Dropped in whole blocks so the prompt prefix stays cacheable, so the effective
# number replayed is between the limit and twice it. Set to 0 to replay every
# attachment (default: 10)
HISTORY_ATTACHMENT_REPLAY_LIMIT=10
```

Pasted content is replayed the same way, and a thread that pastes a whole file on every
turn carries every earlier copy. Older pasted blocks are replaced with a placeholder
giving their size once the earlier turns hold more than the budget below. The paste stays
visible in the conversation, and the model is told to ask for it again if it needs it.

```bash
# Optional: characters of pasted content replayed from earlier turns, excluding the
# newest message. Dropped in whole blocks so the prompt prefix stays cacheable, so the
# amount replayed can reach about twice the budget. A single earlier paste larger than
# the budget is always replaced. Set to 0 to replay every pasted block (default: 200000)
HISTORY_PASTED_CONTENT_CHAR_BUDGET=200000
```

### Content Extraction

Use Jina for enhanced content extraction:

```bash
JINA_API_KEY=[YOUR_API_KEY]
```

Alternatively, a self-hosted [crawl4ai](https://github.com/unclecode/crawl4ai) instance can serve as the fetch backend. When `CRAWL4AI_BASE_URL` is set it handles every fetch the tool performs — both regular and API extraction, PDFs included — and takes precedence over Jina and Tavily. The URL is sent to the crawler's `/crawl` pipeline in two passes: first as a page with the same fit filter the server's `/md` endpoint applies, then, if that yields nothing (Chromium cannot render PDFs), with the server's dedicated PDF scraping strategy. No request to the target is made from the Askwild server itself; detection runs through the crawler:

```bash
CRAWL4AI_BASE_URL=http://localhost:11235
# Optional: only needed when the instance requires an API key
# CRAWL4AI_API_KEY=[YOUR_CRAWL4AI_API_KEY]
```

### Version and Update Check

The sidebar footer shows the running version (linking to the upstream releases page) and the install method. The server checks the upstream GitHub releases feed once per cache window; when a newer stable release exists, admins see an `Update: vX.Y.Z` link in place of the install label. The check is not user-specific: it runs once per cache window whenever any viewer triggers a render, and the cached result is shared. The check is silent on any failure and never blocks rendering.

```bash
# Optional: install-method label shown in the footer. Used verbatim, so any
# value works (the Docker image sets `docker`). Defaults to `vercel` on
# Vercel, `source` elsewhere.
ASKWILD_INSTALL_METHOD=docker

# Optional: upstream owner/repo whose latest release is checked
# (default: miurla/askwild)
ASKWILD_UPDATE_CHECK_REPO=miurla/askwild

# Optional: cache window for the release check, in seconds
# (default: 86400; values below 300 are clamped to 300; unset, empty, or
# non-numeric values fall back to the default)
ASKWILD_UPDATE_CHECK_TTL_SECONDS=86400

# Optional: set to true to perform no upstream requests at all (default: false)
ASKWILD_UPDATE_CHECK_DISABLED=false

# Optional: comma-separated email addresses treated as admins for the update
# link (case-insensitive). Useful when the auth provider has no role concept,
# e.g. Supabase, where no user carries an `admin` role. No effect in anonymous
# mode, where every viewer counts as an admin.
ASKWILD_ADMIN_EMAILS=ops@example.com,me@example.com
```

The update link is shown to administrators only: users with the `admin` role, users whose email is listed in `ASKWILD_ADMIN_EMAILS`, or any user when `ENABLE_AUTH=false` (single-operator anonymous mode). The email allowlist only controls visibility of the update link; it grants no privileges elsewhere in the app. The version identifier and install label stay visible to everyone.
