# Serla

Open-source product analytics for developers. Events, funnels, retention, session replay, feature flags, LLM observability, and error tracking in one self-hostable platform — a lightweight alternative to PostHog with first-class SDKs in five languages.

Built with Next.js 16, React 19, TypeScript, Drizzle ORM, and PostgreSQL.

---

## Features

**Analytics**
- Real-time event ingestion with a live dashboard and event globe
- Funnels with sequential-progression conversion analysis
- Retention cohorts
- User journeys (page-path graphs)
- Heatmaps (click tracking)
- Goals and custom metrics
- Saved segments with property filters
- Attribution (UTM + referrer)
- Raw activity log for debugging integrations

**Product**
- Session replay (rrweb, input-masked, gzip-compressed storage)
- Feature flags with deterministic rollouts, conditions, and multivariate variants
- LLM observability — track prompts, completions, tokens, cost, and latency across any provider
- Error tracking with stack-trace fingerprinting and grouped occurrences

**Operate**
- Threshold alerts with email and webhook delivery
- Weekly digest emails
- Outbound webhooks (raw, Discord, Slack, Teams) with HMAC signatures and a delivery log
- Data export (JSON / CSV)

**Platform**
- Teams and collaboration with owner / editor / viewer roles
- Multiple API keys per project, each named and independently revocable
- Cookieless, no fingerprinting — privacy-friendly by default
- Polar.sh billing integration (optional for self-host)

---

## SDKs

All five SDKs speak the same HTTP API, so you can track from the browser and your backend into the same project.

| Language | Package | Install |
|----------|---------|---------|
| Browser / JS | [`serla-js`](https://www.npmjs.com/package/serla-js) | `npm install serla-js` |
| React | [`serla-js-react`](https://www.npmjs.com/package/serla-js-react) | `npm install serla-js serla-js-react` |
| Node.js | [`serla-node`](https://www.npmjs.com/package/serla-node) | `npm install serla-node` |
| Python | [`serla-py`](https://pypi.org/project/serla-py/) | `pip install serla-py` |
| Go | [`serla-go`](https://github.com/b9llach/serla-go) | `go get github.com/b9llach/serla-go` |

The SDK source lives in [`packages/`](./packages). The Go SDK is published from a [dedicated repo](https://github.com/b9llach/serla-go) because Go modules require a public git path.

### Quick example

```javascript
import { Serla } from 'serla-js';

Serla.init({
  apiKey: 'sk_live_your_api_key',
  autoPageviews: true,
  errorTracking: true,
});

Serla.track('signup_completed', { plan: 'pro' });
Serla.identify('user_123', { email: 'a@example.com' });

// Feature flags
if (await Serla.isFeatureEnabled('new-checkout')) showNewCheckout();
```

Full documentation: [serla.dev/docs](https://serla.dev/docs)

---

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4, dark-mode-first
- **Database**: PostgreSQL via [Neon](https://neon.tech) serverless driver
- **ORM**: Drizzle
- **Realtime + rate limiting**: Redis (optional; falls back to in-memory)
- **Auth**: JWT sessions via `jose`, bcrypt password hashing
- **Email**: Resend (optional)
- **Payments**: Polar.sh (optional)
- **Session replay**: rrweb + rrweb-player

---

## Self-hosting

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon works out of the box; any Postgres 14+ works)
- Redis (optional — enables cross-instance rate limiting and realtime; without it, rate limiting is per-instance and realtime is disabled)

### 1. Clone and install

```bash
git clone https://github.com/b9llach/serla-dev.git
cd serla-dev
npm install
```

### 2. Configure environment

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

Minimum required to boot:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled Postgres connection string (used by the app) |
| `DATABASE_URL_UNPOOLED` | Direct connection (used for migrations) |
| `JWT_SECRET` | Session signing key — generate with `openssl rand -hex 32` |
| `WEBHOOK_ENCRYPTION_KEY` | AES-256-GCM key for webhook secrets at rest — `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Public base URL (e.g. `http://localhost:3000`) |

Optional integrations (email, payments, realtime) are documented in [`.env.example`](./.env.example). The app runs without them.

### 3. Set up the database

The schema lives in [`lib/db/schema.ts`](./lib/db/schema.ts). Create every table with:

```bash
npm run db:setup
```

This applies the base schema from [`drizzle/`](./drizzle) and then every incremental migration, and finally verifies all 27 expected tables exist. It is idempotent, so it is safe to re-run against an existing database.

### 4. Run

```bash
npm run dev      # development server on http://localhost:3000
npm run build    # production build
npm run start    # production server
```

Open `http://localhost:3000`, create an account, then create a project and an API key under Settings → API Keys.

---

## Development

```bash
npm run dev      # start the dev server (Turbopack)
npm run build    # production build (also typechecks)
npm run lint     # ESLint with Next.js rules
```

### Repository layout

```
app/                      Next.js App Router
  (marketing)/            Public site: landing, pricing, docs, changelog
  dashboard/              Authenticated dashboard
  api/v1/                 Public ingestion + query API (events, flags, llm, errors, recordings)
  api/cron/               Scheduled jobs (daily aggregation, cleanup, webhooks)
lib/
  db/                     Drizzle schema + client
  api/                    API-key auth, rate limiting, enrichment
  actions/                Server actions (CRUD for flags, alerts, webhooks, etc.)
  flags/                  Feature-flag evaluation
  errors/                 Error fingerprinting
  llm/                    LLM cost pricing table
  utils/                  Project membership/roles, audit log, encryption
components/dashboard/     Dashboard UI
packages/                 SDK source (serla-js, serla-js-react, serla-node, serla-python, serla-go)
scripts/                  Migration runner
```

### Building the SDKs

```bash
cd packages/serla-js && npm install && npm run build && npm test
```

Each TypeScript SDK builds with tsup (ESM + CJS + IIFE) and is tested with Vitest. The Python SDK uses hatchling + pytest; the Go SDK uses the standard Go toolchain.

---

## Architecture notes

- **Ingestion** (`/api/v1/events`, `/events/batch`) authenticates per request against the `api_keys` table, enriches events with geo/device/UTM data, and writes to the `events` table.
- **API keys** are SHA-256 hashed at rest; the plaintext is shown once at creation. Many keys per project, each independently revocable.
- **Roles** are enforced through the `project_members` table via `requireRole()`; every mutating server action gates on it.
- **Realtime** uses Redis pub/sub when `REDIS_URL` is set; the dashboard subscribes over Server-Sent Events.
- **Session replay** stores gzip-compressed rrweb chunks as `bytea` in Postgres and stitches them on playback.
- **Cron** jobs handle daily metric aggregation, retention cleanup, webhook retries, alert evaluation, and the weekly digest.

---

## Contributing

Contributions are welcome. Please open an issue to discuss substantial changes before submitting a PR. Make sure `npm run build` and `npm run lint` pass, and that any SDK changes include tests.

---

## License

MIT — see [LICENSE](./LICENSE).
