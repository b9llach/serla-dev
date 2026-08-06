'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CodeBlock, SimpleCodeBlock } from '@/components/docs/code-block';
import {
  Download, Zap, Send, Users, FileJson, Webhook, Copy, Check,
  Key, Gauge, Settings, Clock, Eye, Shield, BarChart3, Target,
  GitBranch, Bell, Database, Globe, Code, AlertTriangle,
  Video, ToggleLeft, Sparkles, Bug,
} from 'lucide-react';
import { JavaScriptIcon, TypeScriptIcon, PythonIcon } from '@/components/icons/language-icons';

const sections = [
  { id: 'getting-started', label: 'Getting Started', icon: Zap },
  { id: 'authentication', label: 'Authentication', icon: Key },
  { id: 'installation', label: 'Installation', icon: Download },
  { id: 'sdk-configuration', label: 'SDK Configuration', icon: Settings },
  { id: 'tracking-events', label: 'Tracking Events', icon: Send },
  { id: 'identifying-users', label: 'Identifying Users', icon: Users },
  { id: 'sessions', label: 'Sessions & Page Views', icon: Eye },
  { id: 'properties', label: 'Properties & Schema', icon: Code },
  { id: 'batch-events', label: 'Batch Events', icon: FileJson },
  { id: 'api-reference', label: 'API Reference', icon: Globe },
  { id: 'rate-limits', label: 'Rate Limits', icon: Gauge },
  { id: 'webhooks', label: 'Webhooks', icon: Bell },
  { id: 'session-replay', label: 'Session Replay', icon: Video },
  { id: 'feature-flags', label: 'Feature Flags', icon: ToggleLeft },
  { id: 'llm', label: 'LLM Observability', icon: Sparkles },
  { id: 'error-tracking', label: 'Error Tracking', icon: Bug },
  { id: 'dashboard', label: 'Dashboard Features', icon: BarChart3 },
  { id: 'privacy', label: 'Privacy & Compliance', icon: Shield },
  { id: 'errors', label: 'Error Handling', icon: AlertTriangle },
];

// Full documentation as markdown for LLM context
const docsMarkdown = `# Serla API Documentation

Complete documentation for integrating Serla analytics into your application.

---

## Getting Started

Serla is a privacy-focused analytics platform designed for developers. No cookies, no fingerprinting, no consent banners required.

### Quick Start

1. **Create an account** at serla.dev/signup
2. **Create a project** and copy your API key from the dashboard
3. **Install the SDK** or use the REST API directly
4. **Start tracking** events with a single line of code

### Your First Event

\`\`\`javascript
const serla = new Serla('sk_live_your_api_key');
serla.track('page_view', { page: '/home' });
\`\`\`

---

## Authentication

All API requests authenticate with a per-project API key. A single project can have many keys (e.g. one per environment or per app) so you can rotate without coordinating across services.

### Key Types

Serla has two kinds of key. Pick based on **where the code runs**, not what it does.

| Type | Prefix | Can do | Use it in |
|------|--------|--------|-----------|
| **Public** | \`pk_live_\` | Send events, identify users, record sessions, read feature flags | Browsers, mobile apps, anywhere the code is visible |
| **Secret** | \`sk_live_\` | Everything above **plus data export** | Servers only |

The distinction matters because a browser key is readable by anyone who views source. A **public** key can only write data in and resolve flags — it cannot read your event history back out. A **secret** key can call \`/api/v1/export\`, so shipping one to a browser would let any visitor download your project's raw events.

If you are adding Serla to a website or mobile app, use a **public** key.

The full key is shown **once** when you create it. After that the dashboard only displays the prefix (e.g. \`pk_live_dvRtNibY...\`).

### Creating an API Key

1. Dashboard > Settings > API Keys (scoped to whichever project is selected in the sidebar).
2. Click **Create API key**, give it a name (e.g. \`Web app\`, \`Production server\`, \`Local dev\`).
3. Choose **Public** for client-side code or **Secret** for server-side code.
4. Copy the full key from the dialog. **It will not be shown again.**
5. Paste it into your SDK config or environment variable.

You can create multiple keys per project. Each has an independent revocation status and last-used timestamp, so you can see at a glance which keys are still alive and revoke unused ones safely.

### Using Your API Key

**HTTP Header (recommended):**
\`\`\`
Authorization: Bearer sk_live_your_api_key
\`\`\`

**SDK initialization:**
\`\`\`javascript
Serla.init({ apiKey: 'sk_live_your_api_key' });
\`\`\`

### Revoking a Key

Click **Revoke** next to any key in Dashboard > Settings > API Keys. Revocation is immediate — requests using that key start returning \`401 Invalid API key\` the moment they hit the auth path. The row stays in the table (marked Revoked) for the audit trail, so you have a record of when and why.

### Security Best Practices

- Use a \`pk_live_\` public key in anything a user can view source on. It cannot export data, so a leak costs you nothing but junk events.
- Keep \`sk_live_\` secret keys server-side. Anyone holding one can export your project's raw event history.
- Issue separate keys per environment (staging vs prod). Revoking a leaked staging key shouldn't take down production.
- Never commit keys to source control. Use environment variables and a secret manager.
- Rotate at a regular cadence: create a new key, deploy it, wait until \`last_used_at\` on the old key is stale, revoke.
- A revoked key never re-activates. To restore service you must create a new one.

---

## Installation

Serla ships five official SDKs: browser, React, Node, Python, and Go. All speak the same HTTP API documented below, so you can mix and match (track from the browser AND your server) and the events show up in the same project.

### Browser (\`serla-js\`)

\`\`\`bash
npm install serla-js
\`\`\`

\`\`\`javascript
import { Serla } from 'serla-js';

Serla.init({
  apiKey: 'sk_live_your_api_key',
  autoPageviews: true,
  errorTracking: true,
});

Serla.track('signup_completed', { plan: 'pro' });
Serla.identify('user_123', { email: 'a@example.com' });

// Cross-cutting context attached to every event
Serla.setProperties({ plan: 'pro', appVersion: '4.2.1' });

// Team / org analytics
Serla.group('team', 'team_42', { plan: 'pro' });
\`\`\`

**Script tag** (no bundler):

\`\`\`html
<script src="https://unpkg.com/serla-js/dist/serla.min.global.js"></script>
<script>
  Serla.init({ apiKey: 'sk_live_your_api_key' });
</script>
\`\`\`

~11 KB minified, ESM + CJS + IIFE builds, TypeScript types included.

### React (\`serla-js-react\`)

Companion package on top of \`serla-js\` with hooks and components.

\`\`\`bash
npm install serla-js serla-js-react
\`\`\`

\`\`\`tsx
import { SerlaProvider, useTrack, useIdentify } from 'serla-js-react';

export default function App({ user }) {
  useIdentify(user?.id ?? null, user && { email: user.email });
  const trackUpgrade = useTrack('plan_upgraded');
  return <button onClick={() => trackUpgrade({ plan: 'pro' })}>Upgrade</button>;
}

// Mount at the root
<SerlaProvider config={{ apiKey: '...' }}>
  <App />
</SerlaProvider>
\`\`\`

### Server-side: Node (\`serla-node\`)

Class-based instance, built-in fetch, auto-flush on \`process.beforeExit\`, Edge-runtime compatible.

\`\`\`bash
npm install serla-node
\`\`\`

\`\`\`javascript
import { Serla } from 'serla-node';

const serla = new Serla({ apiKey: process.env.SERLA_API_KEY });

// Next.js API route
export async function POST(req) {
  const body = await req.json();
  serla.track({ name: 'signup_completed', distinctId: body.userId });
  await serla.flush();
  return Response.json({ ok: true });
}
\`\`\`

### Server-side: Python (\`serla\`)

Zero runtime deps (stdlib only). Background daemon thread, atexit hook for graceful shutdown.

\`\`\`bash
pip install serla-py
\`\`\`

\`\`\`python
from serla import Serla

serla = Serla(api_key="sk_live_your_api_key")

serla.track(
    event="signup_completed",
    distinct_id="user_123",
    properties={"plan": "pro"},
)

serla.identify("user_123", {"email": "a@example.com"})

# Context manager auto-flushes on exit (one-shot scripts):
with Serla(api_key="...") as serla:
    serla.track(event="batch_job_done", distinct_id="cron")
\`\`\`

### Server-side: Go (\`serla-go\`)

Zero runtime deps, channel-based queue, context-aware.

\`\`\`bash
go get github.com/b9llach/serla-go
\`\`\`

\`\`\`go
import serla "github.com/b9llach/serla-go"

client, _ := serla.New(serla.Config{APIKey: "sk_live_..."})
defer client.Shutdown(context.Background())

client.Track(serla.Event{
    Name:       "signup_completed",
    DistinctID: "user_123",
    Properties: map[string]any{"plan": "pro"},
})

// Before serverless return:
client.Flush(ctx)
\`\`\`

---

## SDK Configuration

\`\`\`javascript
Serla.init({
  apiKey: 'sk_live_your_api_key',

  // Base URL of your Serla deployment (default: https://serla.dev)
  host: 'https://serla.dev',

  // Auto-track SPA navigations as $pageview events (default: true)
  autoPageviews: true,

  // Auto-track clicks with element selectors (default: false)
  autoClicks: false,

  // Auto-capture window.onerror + unhandledrejection as $error events (default: false)
  // For grouped + triagable errors, use captureException() instead.
  errorTracking: false,

  // Record sessions for replay (Hobby+). Loads rrweb dynamically. (default: false)
  recordSessions: false,
  recordingOptions: {
    maskAllInputs: true,                // mask <input> values before they leave the browser
    blockClass: 'serla-no-record',      // CSS class fully omitted from recording
    ignoreClass: 'serla-no-record-events', // CSS class keeps layout, drops interactions
  },

  // Emit $pageleave events on unload with time-on-page (default: true)
  pageleaveTracking: true,

  // Inactivity before a new session starts (default: 30 min)
  sessionTimeoutMs: 30 * 60 * 1000,

  // Max events per flushed batch (default: 20)
  batchSize: 20,

  // Periodic flush interval in ms (default: 10s)
  flushIntervalMs: 10000,

  // Log SDK activity to console (default: false)
  debug: false,

  // Disable all tracking - for opted-out users (default: false)
  optOut: false,
});
\`\`\`

### SDK Methods

| Method | Description |
|--------|-------------|
| \`track(name, properties?)\` | Queue an event for batched sending |
| \`identify(distinctId, properties?)\` | Associate the user with an ID + properties |
| \`group(type, id, properties?)\` | Associate the user with a team/org/workspace |
| \`setProperties(props)\` | Merge super properties attached to every subsequent event |
| \`unsetProperties(keys)\` | Remove super properties by key |
| \`getSuperProperties()\` | Read the current super properties |
| \`reset()\` | Clear distinctId + super properties + groups (use on logout) |
| \`flush()\` | Force-send queued events |
| \`shutdown()\` | Teardown - flush + stop timers + remove listeners |
| \`setOptOut(value)\` | Toggle tracking at runtime (persists to localStorage) |
| \`isOptedOut()\` | Read the current opt-out state |
| \`getDistinctId()\` | Read the current distinct ID |
| \`getFeatureFlag(key, fallback?)\` | Resolve a flag value for the current user (Hobby+) |
| \`isFeatureEnabled(key)\` | Boolean form of \`getFeatureFlag\` (Hobby+) |
| \`getAllFeatureFlags()\` | Full evaluated flag map (Hobby+) |
| \`trackLLM(generation)\` | Track an LLM prompt/completion with cost + tokens (Hobby+) |
| \`captureException(err, context?)\` | Capture an exception for grouped error tracking (Hobby+) |

---

## Tracking Events

### Basic Event

\`\`\`javascript
serla.track('button_click');
\`\`\`

### Event with Properties

\`\`\`javascript
Serla.track('purchase', {
  product_id: 'prod_123',
  product_name: 'Pro Plan',
  price: 49.99,
  currency: 'USD',
  quantity: 1,
});
\`\`\`

### Identify a User

Call \`identify\` once you know who the visitor is - usually right after sign-in. The distinct ID is persisted in localStorage, so subsequent visits keep the same identity.

\`\`\`javascript
Serla.identify('user_456', {
  email: 'a@example.com',
  plan: 'pro',
});

// Later events automatically include distinctId
Serla.track('signup_completed', { source: 'google_ads' });
\`\`\`

### Reset (Logout)

Clears the persisted distinct ID. Subsequent events are anonymous again.

\`\`\`javascript
Serla.reset();
\`\`\`

### Revenue Tracking

Serla automatically recognizes and aggregates revenue properties:

\`\`\`javascript
// These properties are auto-detected as revenue
serla.track('purchase', {
  properties: {
    revenue: 99.99,      // Primary revenue field
    // OR
    amount: 99.99,       // Alternative
    // OR
    value: 99.99,        // Alternative
    // OR
    price: 99.99,        // Alternative

    currency: 'USD'      // Optional, defaults to USD
  }
});
\`\`\`

### Tracking Best Practices

1. **Use snake_case** for event names: \`button_click\`, not \`buttonClick\`
2. **Be consistent** with naming across your app
3. **Keep properties flat** - avoid deeply nested objects
4. **Use standard names** for common events: \`signup\`, \`login\`, \`purchase\`, \`page_view\`
5. **Include context** - add relevant properties that help with analysis

---

## Identifying Users

### Basic Identification

\`\`\`javascript
serla.identify('user_123', {
  email: 'john@example.com',
  name: 'John Doe'
});
\`\`\`

### Full User Profile

\`\`\`javascript
serla.identify('user_123', {
  // Contact info
  email: 'john@example.com',
  name: 'John Doe',
  phone: '+1234567890',

  // Account info
  plan: 'pro',
  created_at: '2024-01-15T10:30:00Z',

  // Company info (for B2B)
  company: 'Acme Inc',
  company_size: '50-100',
  industry: 'Technology',

  // Custom properties
  referral_code: 'FRIEND20',
  lifetime_value: 499.99
});
\`\`\`

### Updating User Properties

Call \`identify\` again to update properties. New properties are merged with existing ones.

\`\`\`javascript
// Initial identification
serla.identify('user_123', { plan: 'free' });

// Later, after upgrade
serla.identify('user_123', { plan: 'pro' });
// User now has: { plan: 'pro' }
\`\`\`

### Anonymous to Identified

When a user signs up, call \`identify\` to link their anonymous events:

\`\`\`javascript
// Before signup - events tracked with anonymous session ID

// After signup
serla.identify('user_123', {
  email: 'john@example.com'
});

// All future events are linked to user_123
// Previous anonymous events remain separate
\`\`\`

### Reset Identity

Clear user identity on logout:

\`\`\`javascript
serla.reset();
// Generates new anonymous session ID
\`\`\`

---

## Sessions & Page Views

### How Sessions Work

- Sessions are created automatically on first event
- Session ID persists in memory (or localStorage in browser)
- Sessions expire after 30 minutes of inactivity (configurable)
- New session created on:
  - First visit
  - After session timeout
  - After calling \`reset()\`
  - New browser tab (optional)

### Session ID Format

\`\`\`
sess_abc123def456...
\`\`\`

### Tracking Page Views

**Manual tracking:**
\`\`\`javascript
serla.trackPageView();

// With custom properties
serla.trackPageView({
  title: 'Pricing Page',
  section: 'marketing'
});
\`\`\`

**Auto-tracking (SPAs):**
\`\`\`javascript
const serla = new Serla('sk_live_...', {
  autoTrackPageViews: true
});

// Automatically tracks on:
// - Initial page load
// - History pushState/replaceState
// - Popstate events
\`\`\`

**Auto-tracked page view properties:**
- \`page_url\` - Full URL
- \`page_path\` - Path only
- \`page_title\` - Document title
- \`referrer\` - Document referrer

### SPA Support

For single-page applications, either enable auto-tracking or manually track on route changes:

\`\`\`javascript
// React Router example
useEffect(() => {
  serla.trackPageView();
}, [location.pathname]);

// Next.js App Router
useEffect(() => {
  serla.trackPageView();
}, [pathname]);
\`\`\`

---

## Properties & Schema

### Reserved Properties

These properties have special meaning in Serla:

| Property | Type | Description |
|----------|------|-------------|
| \`$browser\` | string | Browser name (auto-detected) |
| \`$browser_version\` | string | Browser version (auto-detected) |
| \`$os\` | string | Operating system (auto-detected) |
| \`$device\` | string | Device type: desktop, mobile, tablet (auto-detected) |
| \`$country\` | string | Country code (auto-detected from IP) |
| \`$city\` | string | City name (auto-detected from IP) |
| \`$region\` | string | Region/state (auto-detected from IP) |
| \`$referrer\` | string | Referrer URL |
| \`$referring_domain\` | string | Referrer domain |
| \`$utm_source\` | string | UTM source parameter |
| \`$utm_medium\` | string | UTM medium parameter |
| \`$utm_campaign\` | string | UTM campaign parameter |
| \`$utm_term\` | string | UTM term parameter |
| \`$utm_content\` | string | UTM content parameter |

### Auto-Enrichment

Every event is automatically enriched with:

1. **Geolocation** (from IP address)
   - Country, city, region
   - IP is never stored

2. **Device Info** (from User-Agent)
   - Browser name and version
   - OS name and version
   - Device type

3. **UTM Parameters** (from URL)
   - Extracted from query string
   - Persisted for session duration

4. **Timestamps**
   - Server-side timestamp (authoritative)
   - Client-side timestamp (if provided)

### Property Types

| Type | Example | Notes |
|------|---------|-------|
| String | \`"pro"\` | Max 1000 characters |
| Number | \`49.99\` | Integer or float |
| Boolean | \`true\` | true or false |
| Date | \`"2024-01-15T10:30:00Z"\` | ISO 8601 format |
| Array | \`["tag1", "tag2"]\` | Max 100 items |
| Object | \`{ nested: "value" }\` | Max 3 levels deep |

### Property Limits

- Max 100 properties per event
- Property names: max 100 characters
- String values: max 1000 characters
- Array values: max 100 items
- Nested objects: max 3 levels

---

## Batch Events

### Automatic Batching

The SDK automatically batches events for efficiency:

- Events are queued locally
- Queue is flushed when:
  - Batch size reached (default: 10 events)
  - Flush interval elapsed (default: 5 seconds)
  - \`flush()\` called manually
  - Page is about to unload (browser)

### Manual Flush

\`\`\`javascript
// Send all queued events immediately
await serla.flush();
\`\`\`

### Page Unload Handling

The SDK automatically attempts to flush on page unload using \`sendBeacon\`:

\`\`\`javascript
// This is handled automatically, but you can also:
window.addEventListener('beforeunload', () => {
  serla.flush();
});
\`\`\`

### API Batch Endpoint

Send up to 100 events in a single request:

\`\`\`bash
curl -X POST https://serla.dev/api/v1/events/batch \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "events": [
      { "name": "event1", "properties": {} },
      { "name": "event2", "properties": {} }
    ]
  }'
\`\`\`

---

## API Reference

Base URL: \`https://serla.dev/api/v1\`

All requests require the \`Authorization: Bearer <api_key>\` header.

### POST /events

Track a single event.

**Request:**
\`\`\`json
{
  "name": "purchase",
  "distinctId": "user_123",
  "sessionId": "sess_abc",
  "timestamp": "2024-01-15T10:30:00Z",
  "properties": {
    "product_id": "prod_123",
    "price": 49.99
  },
  "context": {
    "page_url": "https://example.com/checkout",
    "page_path": "/checkout",
    "user_agent": "Mozilla/5.0...",
    "ip": "203.0.113.1"
  }
}
\`\`\`

**Response (201):**
\`\`\`json
{
  "success": true,
  "eventId": "evt_abc123",
  "sessionId": "sess_abc"
}
\`\`\`

### POST /events/batch

Track multiple events (max 100).

**Request:**
\`\`\`json
{
  "events": [
    {
      "name": "page_view",
      "distinctId": "user_123",
      "properties": { "page": "/home" }
    },
    {
      "name": "button_click",
      "distinctId": "user_123",
      "properties": { "button": "cta" }
    }
  ]
}
\`\`\`

**Response (201):**
\`\`\`json
{
  "success": true,
  "count": 2,
  "eventIds": ["evt_abc", "evt_def"]
}
\`\`\`

### POST /identify

Identify a user and set properties.

**Request:**
\`\`\`json
{
  "distinctId": "user_123",
  "properties": {
    "email": "john@example.com",
    "name": "John Doe",
    "plan": "pro"
  }
}
\`\`\`

**Response (200):**
\`\`\`json
{
  "success": true
}
\`\`\`

### GET /export

Export events as JSON or CSV.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | json | \`json\` or \`csv\` |
| startDate | string | 7 days ago | ISO 8601 date |
| endDate | string | now | ISO 8601 date |
| eventName | string | all | Filter by event name |
| distinctId | string | all | Filter by user ID |
| limit | number | 1000 | Max 10000 |
| offset | number | 0 | Pagination offset |

**Example:**
\`\`\`bash
curl "https://serla.dev/api/v1/export?format=csv&startDate=2024-01-01&eventName=purchase" \\
  -H "Authorization: Bearer sk_live_..."
\`\`\`

**Response (JSON):**
\`\`\`json
{
  "events": [
    {
      "id": "evt_abc",
      "name": "purchase",
      "distinctId": "user_123",
      "timestamp": "2024-01-15T10:30:00Z",
      "properties": { "price": 49.99 }
    }
  ],
  "meta": {
    "total": 1,
    "limit": 1000,
    "offset": 0
  }
}
\`\`\`

### POST /recordings

Ingest a chunk of rrweb events for session replay. The SDK posts to this endpoint; you typically don't call it directly. Hobby+.

**Request body:** see the [Session Replay](#session-replay) section.

**Response (200):**
\`\`\`json
{ "success": true, "recordingId": "uuid" }
\`\`\`

### GET /flags

Resolve all feature flags for a user. Hobby+.

\`\`\`bash
curl "https://serla.dev/api/v1/flags?distinct_id=user_123" \\
  -H "Authorization: Bearer sk_live_..."
\`\`\`

**Response (200):**
\`\`\`json
{ "flags": { "new-checkout-flow": true, "button-color": "variant_a" } }
\`\`\`

Edge-cached for 30 seconds. Pass \`properties=BASE64(JSON)\` to evaluate property-match conditions.

### POST /llm

Ingest a single LLM generation (prompt + completion + metadata). Hobby+.

**Request body:** see the [LLM Observability](#llm) section.

**Response (200):**
\`\`\`json
{ "success": true }
\`\`\`

### POST /errors

Ingest a captured exception. Hobby+.

**Request body:** see the [Error Tracking](#error-tracking) section.

**Response (200):**
\`\`\`json
{ "success": true, "fingerprint": "abcdef..." }
\`\`\`

The returned \`fingerprint\` is the deterministic group identifier — same fingerprint always lands in the same error group.

---

## Rate Limits

### Limits by Plan

| Plan | Events/second | Events/month | Batch size |
|------|---------------|--------------|------------|
| Free | 10 | 25,000 | 100 |
| Hobby | 50 | 500,000 | 100 |
| Pro | 200 | 2,500,000 | 100 |
| Max | 1000 | Unlimited | 100 |

### Rate Limit Headers

Every response includes:

\`\`\`
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 49
X-RateLimit-Reset: 1705312800
\`\`\`

### Handling Rate Limits

When rate limited, you'll receive:

\`\`\`json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "retryAfter": 1
}
\`\`\`

**Status code:** 429

**Recommended retry strategy:**
\`\`\`javascript
async function trackWithRetry(event, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await serla.track(event);
    } catch (error) {
      if (error.status === 429) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
}
\`\`\`

---

## Webhooks

### Setting Up Webhooks

1. Go to Dashboard > Settings > Webhooks
2. Click "Add Webhook"
3. Enter your endpoint URL
4. Select events to receive
5. Save and copy the signing secret

### Webhook Payload

\`\`\`json
{
  "id": "wh_abc123",
  "type": "event.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "event": {
      "id": "evt_xyz",
      "name": "purchase",
      "distinctId": "user_123",
      "properties": { "price": 49.99 },
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }
}
\`\`\`

### Webhook Events

| Event | Description |
|-------|-------------|
| \`event.created\` | New event tracked |
| \`user.identified\` | User identified |
| \`goal.completed\` | Goal conversion |
| \`threshold.exceeded\` | Custom alert triggered |

### Verifying Webhooks

Webhooks include a signature header for verification:

\`\`\`
X-Serla-Signature: sha256=abc123...
\`\`\`

**Verification (Node.js):**
\`\`\`javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
\`\`\`

### Retry Policy

Failed webhooks are retried with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: 1 minute
- Attempt 3: 5 minutes
- Attempt 4: 30 minutes
- Attempt 5: 2 hours
- Attempt 6: 24 hours

After 6 failures, the webhook is marked as failed. View delivery logs in the dashboard.

---

## Session Replay

Capture every interaction on your app (clicks, scrolls, typing, navigation) and replay them as a video in the dashboard. Built on rrweb — masks input values by default so PII never leaves the browser.

Available on the **Hobby plan and above**.

### Enable Recording

\`\`\`javascript
import { Serla } from 'serla-js';

Serla.init({
  apiKey: 'sk_live_your_api_key',
  recordSessions: true,
  recordingOptions: {
    maskAllInputs: true,           // default: true
    blockClass: 'serla-no-record', // CSS class for fully-blocked elements
  },
});
\`\`\`

rrweb is dynamically imported, so users who don't set \`recordSessions: true\` don't pay the bundle cost (rrweb is ~80 KB on its own).

### View Recordings

Open Dashboard > Replays (under PRODUCT in the sidebar) to see every session, sorted by start time. Each row shows the start URL, duration, distinct_id, browser/OS, and an \`errors\` badge if the session contained any console errors or unhandled rejections.

Click a row to launch the player with timeline scrubbing, playback speed control, and console/network panels.

### What's Captured

- DOM mutations
- Mouse moves and clicks
- Scroll position
- Typing (input values are masked by default)
- Console errors and unhandled rejections (these flip the \`has_errors\` flag on the recording)

### Privacy

- Inputs are masked by default (set \`maskAllInputs: false\` to opt out)
- Anything inside a \`serla-no-record\` class is fully omitted from the recording
- Anything inside \`serla-no-record-events\` keeps the layout but drops interaction details
- Recordings are stored compressed (gzip) in Postgres on Serla's servers
- Recording retention follows the project's standard data retention setting

### API: POST /api/v1/recordings

The SDK posts rrweb event chunks to this endpoint. Most users never call it directly.

\`\`\`json
{
  "sessionId": "32-char hex",
  "distinctId": "user_123",
  "chunkIndex": 0,
  "events": [{ "type": 2, "data": {...}, "timestamp": 1715692800000 }],
  "startUrl": "https://example.com/checkout",
  "browser": "Chrome",
  "os": "macOS",
  "deviceType": "desktop",
  "hasError": false
}
\`\`\`

The server gzips the events array, stores it as a chunk on \`session_recording_chunks\`, and upserts the parent \`session_recording\` row. Returns \`{ success: true, recordingId }\`.

---

## Feature Flags

Toggle features on or off, run gradual rollouts, or A/B test variants. Evaluation is deterministic — the same user always gets the same value as long as the rollout doesn't shrink past their bucket.

Available on the **Hobby plan and above**.

### Create a Flag

Dashboard > Flags > **New flag**.

| Field | Purpose |
|---|---|
| Key | Stable identifier used in code (e.g. \`new-checkout-flow\`). Cannot be changed after creation. |
| Name | Human-readable name shown in the dashboard. |
| Enabled | If off, the flag returns false for everyone regardless of rollout. |
| Rollout % | 0–100. Each user is bucketed deterministically by their distinct_id. |
| Conditions | Property/distinct_id matches that grant a user access regardless of rollout %. |
| Variants | For multivariate flags. Each variant has a name and a weight; weights must sum to 100. |

### Read a Flag from the SDK

\`\`\`javascript
import { Serla } from 'serla-js';

// Boolean flag
const enabled = await Serla.isFeatureEnabled('new-checkout-flow');
if (enabled) showNewCheckout();

// Multivariate flag - returns the variant key as a string
const variant = await Serla.getFeatureFlag('button-color', 'control');
if (variant === 'variant_a') renderRedButton();

// All flags at once - useful for hydrating state on app load
const flags = await Serla.getAllFeatureFlags();
\`\`\`

The SDK caches flag values for 30 seconds, then refreshes from the server. Calling \`identify()\` or \`reset()\` invalidates the cache so a logged-in user immediately sees flags evaluated against their new distinct_id.

### Evaluation Order

1. If the flag is **disabled**, returns \`false\`.
2. If any **condition** matches the user, returns \`true\` (or the variant).
3. If the user's deterministic bucket is **inside the rollout %**, returns \`true\` (or the variant).
4. Otherwise, returns \`false\`.

### API: GET /api/v1/flags

\`\`\`
GET /api/v1/flags?distinct_id=user_123&properties=BASE64(JSON)
Authorization: Bearer sk_live_...
\`\`\`

Returns:

\`\`\`json
{
  "flags": {
    "new-checkout-flow": true,
    "button-color": "variant_a",
    "experiment-foo": false
  }
}
\`\`\`

\`properties\` is an optional base64-encoded JSON object for property-match conditions. Edge-cached for 30 seconds.

---

## LLM Observability

Track every prompt, completion, token count, cost, and latency from your LLM calls. Designed for developers using OpenAI / Anthropic / Gemini / Mistral / etc. directly — works with any provider since the data shape is generic.

Available on the **Hobby plan and above**.

### Track a Generation

**Node.js:**

\`\`\`javascript
import { Serla } from 'serla-node';
const serla = new Serla({ apiKey: process.env.SERLA_API_KEY });

const startedAt = Date.now();
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

await serla.trackLLM({
  model: 'gpt-4o',
  provider: 'openai',
  distinctId: 'user_123',
  input: messages,
  output: response.choices[0].message,
  inputTokens: response.usage.prompt_tokens,
  outputTokens: response.usage.completion_tokens,
  latencyMs: Date.now() - startedAt,
});
\`\`\`

**Browser:**

\`\`\`javascript
import { Serla } from 'serla-js';
Serla.trackLLM({ model: 'gpt-4o', provider: 'openai', inputTokens: 12, outputTokens: 8, ... });
\`\`\`

### Cost Backfill

If you don't supply \`costUsd\`, the server computes it from \`inputTokens\` + \`outputTokens\` against a built-in pricing table for known models (Claude, GPT, Gemini, Mistral). For unknown or finetuned models, set \`costUsd\` explicitly.

### Tracing Chains

For multi-step calls (agent loops, RAG retrieval + answer), set \`traceId\` and \`parentId\` on each generation so the dashboard can link them:

\`\`\`javascript
const traceId = crypto.randomUUID();
await serla.trackLLM({ traceId, parentId: null, model: 'gpt-4o', /* retrieval call */ });
await serla.trackLLM({ traceId, parentId: 'retrieval', model: 'gpt-4o', /* answer call */ });
\`\`\`

### View in Dashboard

Dashboard > LLM shows totals (calls, cost, tokens, avg latency), a breakdown by model, and a recent-generations list with status and per-call cost.

### API: POST /api/v1/llm

\`\`\`json
{
  "model": "gpt-4o",
  "provider": "openai",
  "distinctId": "user_123",
  "traceId": "uuid",
  "parentId": "previous_call_id",
  "input": [{ "role": "user", "content": "..." }],
  "output": { "role": "assistant", "content": "..." },
  "inputTokens": 12,
  "outputTokens": 8,
  "totalTokens": 20,
  "costUsd": 0.00015,
  "latencyMs": 420,
  "status": "success",
  "errorMessage": null,
  "metadata": { "anything": "you want" }
}
\`\`\`

---

## Error Tracking

Capture server-side and client-side exceptions, group them by deterministic stack-trace fingerprint, and triage in the dashboard.

Available on the **Hobby plan and above**.

### Capture in the Browser

\`\`\`javascript
import { Serla } from 'serla-js';

try {
  await checkout();
} catch (err) {
  Serla.captureException(err, { context: 'checkout', orderId });
}
\`\`\`

The browser SDK also auto-captures unhandled errors and promise rejections when you initialize with \`errorTracking: true\` — those flow through the standard \`$error\` event, not the grouped error tracker.

### Capture in Node

\`\`\`javascript
import { Serla } from 'serla-node';
const serla = new Serla({ apiKey: process.env.SERLA_API_KEY });

try {
  await chargeCard(amount);
} catch (err) {
  await serla.captureException(err, {
    distinctId: userId,
    context: { route: '/checkout' },
    release: process.env.GIT_SHA,
    environment: process.env.NODE_ENV,
  });
  throw err;
}
\`\`\`

### Fingerprinting & Grouping

Errors are grouped by SHA-256 of (error type, top-of-stack file, top-of-stack function). Cosmetic refactors (renaming line numbers, reformatting) don't fragment groups. Minified chunk hashes (\`page-abc123.js\`) are stripped before hashing so source-map-aware reads land in the same group.

If a resolved error fingerprint reoccurs, the dashboard auto-reopens it.

### View in Dashboard

Dashboard > Errors lists groups with tabs for **Unresolved / Resolved / Ignored / All**. Each group row shows the message, occurrence count, affected users, last seen, and release. Click a group to see the most recent stack, browsers/URLs breakdown, and recent occurrences.

Resolve, ignore, or reopen from the detail page. Resolve marks the group as fixed (it'll auto-reopen if the same fingerprint fires again). Ignore drops it permanently — useful for noisy third-party errors you can't fix.

### API: POST /api/v1/errors

\`\`\`json
{
  "message": "Cannot read properties of undefined (reading 'foo')",
  "type": "TypeError",
  "stack": "TypeError: ...\\n    at MyComponent (https://app.example.com/page.js:42:10)\\n    at ...",
  "url": "https://app.example.com/checkout",
  "userAgent": "Mozilla/5.0 ...",
  "distinctId": "user_123",
  "sessionId": "32-char hex",
  "release": "v4.2.1",
  "environment": "production",
  "level": "error",
  "metadata": { "context": "checkout" }
}
\`\`\`

Returns \`{ success: true, fingerprint }\`. The fingerprint is the canonical group identifier — same fingerprint = same error group.

---

## Dashboard Features

### Funnels

Create conversion funnels to see where users drop off:

1. Go to Dashboard > Funnels
2. Click "Create Funnel"
3. Add steps (events in order)
4. Set conversion window
5. View drop-off rates between steps

**Example funnel:**
- Step 1: \`page_view\` (page=/pricing)
- Step 2: \`signup_started\`
- Step 3: \`signup_completed\`
- Step 4: \`purchase\`

### Goals

Track conversion events:

1. Go to Dashboard > Goals
2. Click "Create Goal"
3. Select event name
4. Optionally add property filters
5. Set optional monetary value

**Goal types:**
- Event-based: Track any event as a conversion
- Pageview-based: Track specific page visits
- Revenue-based: Track events with revenue properties

### Retention

Analyze user retention over time:

- **Cohort view:** Group users by signup date
- **Time buckets:** Day, week, or month
- **Retention event:** Which event counts as "retained"

### Segments

Create saved segments for filtering:

\`\`\`
Country = United States
AND Browser = Chrome
AND Plan = pro
\`\`\`

**Operators:**
- equals, not equals
- contains, not contains
- greater than, less than
- is set, is not set

### Attribution

Understand how users find you:

- **First-touch:** Credit first interaction
- **Last-touch:** Credit last interaction before conversion
- **Linear:** Equal credit to all touchpoints
- **Time-decay:** More credit to recent touchpoints

### Journeys

Analyze the most common paths users take through your site:

- **User paths:** See top navigation patterns
- **Drop-off points:** Identify where users leave
- **Session analysis:** Understand user flow

Journeys are built automatically from page view events within sessions. Enable auto page tracking or call \`trackPageView()\` on navigation:

\`\`\`javascript
const serla = new Serla('sk_live_...', {
  autoTrackPageViews: true
});
\`\`\`

---

## Privacy & Compliance

### No Cookies

Serla does not use cookies. Session tracking uses:
- In-memory storage (cleared on page close)
- Optional localStorage (configurable)

### No Fingerprinting

We never fingerprint users. User identification is:
- Explicit via \`identify()\` call
- Session-based for anonymous users

### IP Addresses

- Used for geolocation only
- Never stored in database
- Geolocation resolved at ingestion time

### GDPR Compliance

**Data subject rights:**

1. **Right to access:** Export user data via API or dashboard
2. **Right to deletion:** Delete user data via API:

\`\`\`bash
curl -X DELETE "https://serla.dev/api/v1/users/user_123" \\
  -H "Authorization: Bearer sk_live_..."
\`\`\`

3. **Right to portability:** Export in JSON or CSV format

### Do Not Track

Respect browser DNT setting:

\`\`\`javascript
const serla = new Serla('sk_live_...', {
  respectDoNotTrack: true  // Default: true
});
\`\`\`

### Data Retention

Data is retained based on your plan:

| Plan | Retention |
|------|-----------|
| Free | 7 days |
| Hobby | 60 days |
| Pro | 180 days |
| Max | 3 years |

After retention period, data is permanently deleted.

### Opt-Out

Allow users to opt out:

\`\`\`javascript
// Check if user has opted out
if (localStorage.getItem('serla_optout')) {
  // Don't initialize Serla
} else {
  const serla = new Serla('sk_live_...');
}

// Opt-out function for your privacy settings
function optOut() {
  localStorage.setItem('serla_optout', 'true');
  serla.reset();
  location.reload();
}
\`\`\`

---

## Error Handling

### Error Response Format

\`\`\`json
{
  "error": "error_code",
  "message": "Human readable message",
  "details": {}
}
\`\`\`

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| \`invalid_request\` | 400 | Malformed request body |
| \`missing_field\` | 400 | Required field missing |
| \`invalid_field\` | 400 | Field has invalid value |
| \`unauthorized\` | 401 | Invalid or missing API key |
| \`forbidden\` | 403 | API key doesn't have permission |
| \`not_found\` | 404 | Resource not found |
| \`rate_limit_exceeded\` | 429 | Too many requests |
| \`internal_error\` | 500 | Server error |

### SDK Error Handling

\`\`\`javascript
try {
  await serla.track('event');
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    // Wait and retry
  } else if (error.code === 'unauthorized') {
    // Check API key
  } else {
    // Log error
    console.error('Serla error:', error.message);
  }
}
\`\`\`

### Debug Mode

Enable debug mode to log all SDK activity:

\`\`\`javascript
const serla = new Serla('sk_live_...', {
  debug: true
});

// Or toggle at runtime
serla.setDebug(true);
\`\`\`

Debug output includes:
- Events being tracked
- API requests and responses
- Batching activity
- Errors and warnings

---

## Changelog

### v1.0.0 (2024-01-15)
- Initial release
- Event tracking API
- User identification
- Batch events
- JavaScript, TypeScript, Python SDKs
- Dashboard with funnels, goals, retention

---

## Support

- Documentation: https://serla.dev/docs
- GitHub Issues: https://github.com/serla-dev/serla/issues
- Email: support@serla.dev
`;

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const isScrollingRef = useRef(false);

  // Track visible sections with IntersectionObserver
  useEffect(() => {
    const sectionIds = sections.map(s => s.id);
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && !isScrollingRef.current) {
              setActiveSection(id);
            }
          });
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
      );

      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach(observer => observer.disconnect());
    };
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    isScrollingRef.current = true;
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Reset scrolling flag after animation completes
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 1000);
    }
  };

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(docsMarkdown);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([docsMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'serla-docs.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className="max-w-7xl mx-auto">
        <div className="flex">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0 border-r border-zinc-800/50 h-[calc(100vh-56px)] sticky top-14 overflow-y-auto">
            <nav className="p-4 space-y-0.5">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-zinc-800/80 text-white'
                      : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <section.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              ))}

              {/* Divider */}
              <div className="h-px bg-zinc-800/50 my-4" />

              {/* LLM Tools */}
              <p className="px-3 py-2 text-xs text-zinc-600 uppercase tracking-wider">LLM Tools</p>

              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
              >
                {copiedMarkdown ? (
                  <>
                    <Check className="w-4 h-4 shrink-0 text-green-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Copy All Docs</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadMarkdown}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Download .md</span>
              </button>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 px-6 lg:px-12 py-12">
            <div className="max-w-3xl">
              {/* Header */}
              <div className="mb-12 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-medium text-white mb-4">Documentation</h1>
                  <p className="text-zinc-400">
                    Complete guide to integrating Serla analytics into your application.
                  </p>
                </div>
                <button
                  onClick={handleCopyMarkdown}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm rounded-lg transition-colors shrink-0"
                  title="Copy entire docs as Markdown for LLMs"
                >
                  {copiedMarkdown ? (
                    <>
                      <Check className="w-4 h-4 text-green-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy for LLM</span>
                    </>
                  )}
                </button>
              </div>

              {/* Getting Started */}
              <section id="getting-started" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Getting Started</h2>
                <p className="text-zinc-400 mb-6">
                  Serla is a privacy-focused analytics platform designed for developers. No cookies, no fingerprinting, no consent banners required.
                </p>

                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 mb-6">
                  <h3 className="text-white font-medium mb-3">Quick Start</h3>
                  <ol className="space-y-3 text-zinc-400 text-sm list-decimal list-inside">
                    <li><strong className="text-zinc-300">Create an account</strong> at <Link href="/auth/signup" className="text-blue-400 hover:text-blue-300">serla.dev/signup</Link></li>
                    <li><strong className="text-zinc-300">Create a project</strong> and copy your API key from the dashboard</li>
                    <li><strong className="text-zinc-300">Install the SDK</strong> or use the REST API directly</li>
                    <li><strong className="text-zinc-300">Start tracking</strong> events with a single line of code</li>
                  </ol>
                </div>

                <h3 className="text-white font-medium mb-3">Your First Event</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `const serla = new Serla('sk_live_your_api_key');
serla.track('page_view', { page: '/home' });`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `serla = Serla('sk_live_your_api_key')
serla.track('page_view', properties={'page': '/home'})`,
                    },
                  ]}
                />
              </section>

              {/* Authentication */}
              <section id="authentication" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Authentication</h2>
                <p className="text-zinc-400 mb-6">
                  All API requests authenticate with a per-project API key. A single project can have many keys (e.g. one per environment or per app) so you can rotate without coordinating across services.
                </p>

                <h3 className="text-white font-medium mb-3">Key Types</h3>
                <p className="text-zinc-400 text-sm mb-4">
                  Pick based on <strong className="text-zinc-200">where the code runs</strong>, not what it does.
                </p>
                <div className="space-y-3 mb-6">
                  <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-green-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">pk_live_</code>
                      <span className="text-white font-medium text-sm">Public</span>
                    </div>
                    <p className="text-zinc-400 text-sm">
                      Send events, identify users, record sessions, read feature flags. <strong className="text-zinc-200">Cannot export data.</strong> Safe in browsers and mobile apps where anyone can view the source.
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">sk_live_</code>
                      <span className="text-white font-medium text-sm">Secret</span>
                    </div>
                    <p className="text-zinc-400 text-sm">
                      Everything a public key can do, <strong className="text-zinc-200">plus data export</strong>. Server-side only — anyone holding one can download your project&apos;s raw event history.
                    </p>
                  </div>
                </div>
                <p className="text-zinc-400 text-sm mb-6">
                  The full key is shown <strong className="text-white">once</strong> at creation. After that, the dashboard only displays the prefix.
                </p>

                <h3 className="text-white font-medium mb-3">Creating a Key</h3>
                <ol className="space-y-2 text-zinc-400 text-sm list-decimal list-inside mb-6">
                  <li>Dashboard → Settings → API Keys (scoped to whichever project is selected in the sidebar).</li>
                  <li>Click <strong className="text-zinc-300">Create API key</strong> and give it a name (e.g. <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">Web app</code>, <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">Production server</code>).</li>
                  <li>Choose <strong className="text-zinc-300">Public</strong> for client-side code or <strong className="text-zinc-300">Secret</strong> for server-side code.</li>
                  <li>Copy the full key from the dialog. <strong className="text-white">It will not be shown again.</strong></li>
                  <li>Paste it into your SDK config or environment variable.</li>
                </ol>

                <h3 className="text-white font-medium mb-3">Using Your API Key</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'bash',
                      label: 'HTTP Header',
                      code: `curl -X POST https://serla.dev/api/v1/events \\
  -H "Authorization: Bearer sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "signup_completed", "distinctId": "user_123"}'`,
                    },
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `Serla.init({ apiKey: 'sk_live_your_api_key' });`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `serla = Serla(api_key="sk_live_your_api_key")`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">Revoking a Key</h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Click <strong className="text-zinc-300">Revoke</strong> next to any key on the API Keys page. Revocation is immediate — requests using that key start returning <code className="text-red-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">401 Invalid API key</code> the moment they reach the auth path. The row stays in the table (marked Revoked) for the audit trail.
                </p>

                <h3 className="text-white font-medium mb-3 mt-8">Security Best Practices</h3>
                <ul className="space-y-2 text-zinc-400 text-sm list-disc list-inside">
                  <li>Use a <code className="text-green-400 bg-zinc-800 px-1 rounded text-xs">pk_live_</code> public key in anything a user can view source on. It cannot export data, so a leak costs you nothing but junk events.</li>
                  <li>Keep <code className="text-amber-400 bg-zinc-800 px-1 rounded text-xs">sk_live_</code> secret keys server-side. Anyone holding one can export your raw event history.</li>
                  <li>Issue separate keys per environment. Revoking a leaked staging key shouldn&apos;t take down production.</li>
                  <li>Never commit keys to source control. Use environment variables and a secret manager.</li>
                  <li>Rotate at a regular cadence: create a new key, deploy it, wait until <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">last_used_at</code> on the old key is stale, revoke.</li>
                  <li>A revoked key never re-activates. To restore service you must create a new one.</li>
                </ul>
              </section>

              {/* Installation */}
              <section id="installation" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Installation</h2>
                <p className="text-zinc-400 mb-6">
                  Serla ships five official SDKs distributed via the standard package registries. All speak the same HTTP API — mix and match (track from the browser <em>and</em> your server) and events show up in the same project.
                </p>

                <h3 className="text-white font-medium mb-3">Browser (<code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">serla-js</code>)</h3>
                <SimpleCodeBlock
                  language="bash"
                  title="npm"
                  code="npm install serla-js"
                />
                <div className="mt-3">
                  <CodeBlock
                    examples={[
                      {
                        language: 'javascript',
                        label: 'JavaScript',
                        code: `import { Serla } from 'serla-js';

Serla.init({
  apiKey: 'sk_live_your_api_key',
  autoPageviews: true,
  errorTracking: true,
});

Serla.track('signup_completed', { plan: 'pro' });
Serla.identify('user_123', { email: 'a@example.com' });`,
                      },
                      {
                        language: 'bash',
                        label: 'Script tag (no bundler)',
                        code: `<script src="https://unpkg.com/serla-js/dist/serla.min.global.js"></script>
<script>
  Serla.init({ apiKey: 'sk_live_your_api_key' });
  Serla.track('cta_clicked');
</script>`,
                      },
                    ]}
                  />
                </div>

                <h3 className="text-white font-medium mb-3 mt-8">React (<code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">serla-js-react</code>)</h3>
                <p className="text-zinc-400 text-sm mb-3">Hooks and components on top of <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">serla-js</code>.</p>
                <SimpleCodeBlock
                  language="bash"
                  title="npm"
                  code="npm install serla-js serla-js-react"
                />
                <div className="mt-3">
                  <SimpleCodeBlock
                    language="tsx"
                    title="App.tsx"
                    code={`import { SerlaProvider, useTrack, useIdentify } from 'serla-js-react';

export default function App({ user }) {
  useIdentify(user?.id ?? null, user && { email: user.email });
  const trackUpgrade = useTrack('plan_upgraded');
  return <button onClick={() => trackUpgrade({ plan: 'pro' })}>Upgrade</button>;
}

// Mount at the root
<SerlaProvider config={{ apiKey: 'sk_live_your_api_key' }}>
  <App />
</SerlaProvider>`}
                  />
                </div>

                <h3 className="text-white font-medium mb-3 mt-8">Node.js (<code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">serla-node</code>)</h3>
                <p className="text-zinc-400 text-sm mb-3">Server-side. Class-based instance, auto-flush on <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">process.beforeExit</code>, Edge-runtime compatible.</p>
                <SimpleCodeBlock
                  language="bash"
                  title="npm"
                  code="npm install serla-node"
                />
                <div className="mt-3">
                  <SimpleCodeBlock
                    language="javascript"
                    title="server.js"
                    code={`import { Serla } from 'serla-node';

const serla = new Serla({ apiKey: process.env.SERLA_API_KEY });

// Next.js API route
export async function POST(req) {
  const body = await req.json();
  serla.track({ name: 'signup_completed', distinctId: body.userId });
  await serla.flush(); // before serverless return
  return Response.json({ ok: true });
}`}
                  />
                </div>

                <h3 className="text-white font-medium mb-3 mt-8">Python (<code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">serla-py</code>)</h3>
                <p className="text-zinc-400 text-sm mb-3">Zero runtime deps (stdlib only). Background daemon thread, atexit hook for graceful shutdown.</p>
                <SimpleCodeBlock
                  language="bash"
                  title="pip"
                  code="pip install serla-py"
                />
                <div className="mt-3">
                  <SimpleCodeBlock
                    language="python"
                    title="app.py"
                    code={`from serla import Serla

serla = Serla(api_key="sk_live_your_api_key")

serla.track(
    event="signup_completed",
    distinct_id="user_123",
    properties={"plan": "pro"},
)

# Context manager auto-flushes on exit (one-shot scripts):
with Serla(api_key="...") as s:
    s.track(event="batch_job_done", distinct_id="cron")`}
                  />
                </div>

                <h3 className="text-white font-medium mb-3 mt-8">Go (<code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">serla-go</code>)</h3>
                <p className="text-zinc-400 text-sm mb-3">Zero runtime deps, channel-based queue, context-aware. Requires Go 1.21+.</p>
                <SimpleCodeBlock
                  language="bash"
                  title="go get"
                  code="go get github.com/b9llach/serla-go"
                />
                <div className="mt-3">
                  <SimpleCodeBlock
                    language="go"
                    title="main.go"
                    code={`import serla "github.com/b9llach/serla-go"

client, _ := serla.New(serla.Config{
    APIKey: "sk_live_your_api_key",
})
defer client.Shutdown(context.Background())

client.Track(serla.Event{
    Name:       "signup_completed",
    DistinctID: "user_123",
    Properties: map[string]any{"plan": "pro"},
})`}
                  />
                </div>
              </section>

              {/* SDK Configuration */}
              <section id="sdk-configuration" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">SDK Configuration</h2>
                <p className="text-zinc-400 mb-6">
                  Customize SDK behavior with configuration options.
                </p>

                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `const serla = new Serla('sk_live_your_api_key', {
  // API endpoint (default: https://serla.dev/api/v1)
  endpoint: 'https://serla.dev/api/v1',

  // Enable debug logging (default: false)
  debug: true,

  // Batch size before auto-flush (default: 10)
  batchSize: 10,

  // Flush interval in ms (default: 5000)
  flushInterval: 5000,

  // Auto-track page views (default: false)
  autoTrackPageViews: true,

  // Respect Do Not Track header (default: true)
  respectDoNotTrack: true,

  // Session timeout in minutes (default: 30)
  sessionTimeout: 30
});`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `serla = Serla('sk_live_your_api_key',
    endpoint='https://serla.dev/api/v1',
    debug=True,
    batch_size=10,
    flush_interval=5.0  # seconds
)`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">SDK Methods</h3>
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Method</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">track(name, options?)</td><td className="px-4 py-3 text-zinc-500">Queue event for batched sending</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">send(name, options?)</td><td className="px-4 py-3 text-zinc-500">Send event immediately (no batching)</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">identify(userId, props?)</td><td className="px-4 py-3 text-zinc-500">Identify a user</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">trackPageView(props?)</td><td className="px-4 py-3 text-zinc-500">Track a page view</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">flush()</td><td className="px-4 py-3 text-zinc-500">Send all queued events</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">reset()</td><td className="px-4 py-3 text-zinc-500">Clear user identity and session</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">getSessionId()</td><td className="px-4 py-3 text-zinc-500">Get current session ID</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">getUserId()</td><td className="px-4 py-3 text-zinc-500">Get current user ID</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">setDebug(enabled)</td><td className="px-4 py-3 text-zinc-500">Enable/disable debug mode</td></tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-white font-medium mb-3 mt-8">track() vs send()</h3>
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 space-y-4">
                  <div>
                    <code className="text-green-400 bg-zinc-800 px-2 py-0.5 rounded">track()</code>
                    <p className="text-zinc-400 text-sm mt-2">Queues events locally and sends them in batches. More efficient for high-volume tracking. Events are sent when the batch size is reached (default: 10) or flush interval elapses (default: 5 seconds).</p>
                  </div>
                  <div>
                    <code className="text-blue-400 bg-zinc-800 px-2 py-0.5 rounded">send()</code>
                    <p className="text-zinc-400 text-sm mt-2">Sends a single event immediately without batching. Use for critical events that must be recorded instantly, like purchases or signups.</p>
                  </div>
                </div>

                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `// Batched - efficient for high volume
serla.track('page_view', { page: '/home' });
serla.track('button_click', { button: 'cta' });

// Immediate - for critical events
await serla.send('purchase', {
  distinctId: 'user_123',
  properties: { revenue: 99.99 }
});`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `# Batched - efficient for high volume
serla.track('page_view', properties={'page': '/home'})
serla.track('button_click', properties={'button': 'cta'})

# Immediate - for critical events
serla.send('purchase',
    distinct_id='user_123',
    properties={'revenue': 99.99}
)`,
                    },
                  ]}
                />
              </section>

              {/* Tracking Events */}
              <section id="tracking-events" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Tracking Events</h2>
                <p className="text-zinc-400 mb-6">
                  Track any user action with custom properties. Events are the core of Serla analytics.
                </p>

                <h3 className="text-white font-medium mb-3">Basic Event</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `// Simple event
serla.track('button_click');

// Event with properties
serla.track('purchase', {
  properties: {
    product_id: 'prod_123',
    product_name: 'Pro Plan',
    price: 49.99,
    currency: 'USD'
  }
});

// Event with user ID
serla.track('signup', {
  distinctId: 'user_456',
  properties: {
    plan: 'pro',
    source: 'google_ads'
  }
});`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `# Simple event
serla.track('button_click')

# Event with properties
serla.track('purchase', properties={
    'product_id': 'prod_123',
    'product_name': 'Pro Plan',
    'price': 49.99,
    'currency': 'USD'
})

# Event with user ID
serla.track('signup',
    distinct_id='user_456',
    properties={
        'plan': 'pro',
        'source': 'google_ads'
    }
)`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">Revenue Tracking</h3>
                <p className="text-zinc-400 text-sm mb-4">
                  Serla automatically recognizes and aggregates these revenue properties: <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">revenue</code>, <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">amount</code>, <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">value</code>, <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">price</code>
                </p>

                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `serla.track('purchase_completed', {
  distinctId: 'user_123',
  properties: {
    revenue: 149.99,
    quantity: 2,
    product: 'Pro Plan',
    currency: 'USD'
  }
});`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `serla.track('purchase_completed',
    distinct_id='user_123',
    properties={
        'revenue': 149.99,
        'quantity': 2,
        'product': 'Pro Plan',
        'currency': 'USD'
    }
)`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">Tracking Best Practices</h3>
                <ul className="space-y-2 text-zinc-400 text-sm list-disc list-inside">
                  <li><strong className="text-zinc-300">Use snake_case</strong> for event names: <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs">button_click</code>, not <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs">buttonClick</code></li>
                  <li><strong className="text-zinc-300">Be consistent</strong> with naming across your app</li>
                  <li><strong className="text-zinc-300">Keep properties flat</strong> - avoid deeply nested objects</li>
                  <li><strong className="text-zinc-300">Use standard names</strong> for common events: <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs">signup</code>, <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs">login</code>, <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs">purchase</code></li>
                </ul>
              </section>

              {/* Identifying Users */}
              <section id="identifying-users" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Identifying Users</h2>
                <p className="text-zinc-400 mb-6">
                  Associate events with a user to track them across sessions and devices.
                </p>

                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `// Basic identification
serla.identify('user_123', {
  email: 'john@example.com',
  name: 'John Doe'
});

// Full user profile
serla.identify('user_123', {
  // Contact info
  email: 'john@example.com',
  name: 'John Doe',
  phone: '+1234567890',

  // Account info
  plan: 'pro',
  created_at: '2024-01-15T10:30:00Z',

  // Company info (B2B)
  company: 'Acme Inc',
  company_size: '50-100',
  industry: 'Technology',

  // Custom properties
  lifetime_value: 499.99
});`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `# Basic identification
serla.identify('user_123', {
    'email': 'john@example.com',
    'name': 'John Doe'
})

# Full user profile
serla.identify('user_123', {
    'email': 'john@example.com',
    'name': 'John Doe',
    'plan': 'pro',
    'company': 'Acme Inc',
    'lifetime_value': 499.99
})`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">Reset Identity</h3>
                <p className="text-zinc-400 text-sm mb-4">Clear user identity on logout:</p>
                <SimpleCodeBlock
                  language="javascript"
                  code={`serla.reset();
// Generates new anonymous session ID`}
                />
              </section>

              {/* Sessions */}
              <section id="sessions" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Sessions & Page Views</h2>
                <p className="text-zinc-400 mb-6">
                  Sessions are created automatically and track user activity over time.
                </p>

                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 mb-6">
                  <h3 className="text-white font-medium mb-3">How Sessions Work</h3>
                  <ul className="space-y-2 text-zinc-400 text-sm list-disc list-inside">
                    <li>Sessions are created automatically on first event</li>
                    <li>Sessions expire after 30 minutes of inactivity (configurable)</li>
                    <li>Session ID format: <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">sess_abc123...</code></li>
                    <li>New session created after timeout, <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">reset()</code>, or new browser tab</li>
                  </ul>
                </div>

                <h3 className="text-white font-medium mb-3">Tracking Page Views</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'Manual',
                      code: `// Basic page view
serla.trackPageView();

// With custom properties
serla.trackPageView({
  title: 'Pricing Page',
  section: 'marketing'
});`,
                    },
                    {
                      language: 'javascript',
                      label: 'Auto-tracking',
                      code: `// Enable auto-tracking for SPAs
const serla = new Serla('sk_live_...', {
  autoTrackPageViews: true
});

// Automatically tracks on:
// - Initial page load
// - History pushState/replaceState
// - Popstate events`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-6">SPA Integration</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'React Router',
                      code: `import { useLocation } from 'react-router-dom';

function App() {
  const location = useLocation();

  useEffect(() => {
    serla.trackPageView();
  }, [location.pathname]);
}`,
                    },
                    {
                      language: 'javascript',
                      label: 'Next.js',
                      code: `'use client';
import { usePathname } from 'next/navigation';

function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    serla.trackPageView();
  }, [pathname]);

  return null;
}`,
                    },
                  ]}
                />
              </section>

              {/* Properties */}
              <section id="properties" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Properties & Schema</h2>
                <p className="text-zinc-400 mb-6">
                  Understanding the data schema and auto-enriched properties.
                </p>

                <h3 className="text-white font-medium mb-3">Reserved Properties</h3>
                <p className="text-zinc-400 text-sm mb-4">These properties are auto-detected from the request:</p>
                <div className="border border-zinc-800 rounded-xl overflow-hidden mb-8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Property</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$browser</td><td className="px-4 py-3 text-zinc-500">Browser name</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$os</td><td className="px-4 py-3 text-zinc-500">Operating system</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$device</td><td className="px-4 py-3 text-zinc-500">Device type (desktop, mobile, tablet)</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$country</td><td className="px-4 py-3 text-zinc-500">Country code</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$city</td><td className="px-4 py-3 text-zinc-500">City name</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$referrer</td><td className="px-4 py-3 text-zinc-500">Referrer URL</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$utm_source</td><td className="px-4 py-3 text-zinc-500">UTM source</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$utm_medium</td><td className="px-4 py-3 text-zinc-500">UTM medium</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">$utm_campaign</td><td className="px-4 py-3 text-zinc-500">UTM campaign</td></tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-white font-medium mb-3">Property Limits</h3>
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                  <ul className="space-y-1 text-zinc-400 text-sm list-disc list-inside">
                    <li>Max 100 properties per event</li>
                    <li>Property names: max 100 characters</li>
                    <li>String values: max 1000 characters</li>
                    <li>Arrays: max 100 items</li>
                    <li>Nested objects: max 3 levels deep</li>
                  </ul>
                </div>
              </section>

              {/* Batch Events */}
              <section id="batch-events" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Batch Events</h2>
                <p className="text-zinc-400 mb-6">
                  Events are automatically batched for efficiency. The queue flushes when batch size is reached, interval elapsed, or manually.
                </p>

                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center mt-0.5">
                      <span className="text-blue-400 text-xs">i</span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      <strong className="text-white">Automatic batching:</strong> Events queue locally and flush every 5 seconds or when 10 events are queued, whichever comes first.
                    </div>
                  </div>
                </div>

                <h3 className="text-white font-medium mb-3">Manual Flush</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'JavaScript',
                      code: `// Send all queued events immediately
await serla.flush();

// Flush before page unload (handled automatically)
window.addEventListener('beforeunload', () => {
  serla.flush();
});`,
                    },
                    {
                      language: 'python',
                      label: 'Python',
                      code: `# Send all queued events immediately
serla.flush()

# Flush on program exit
import atexit
atexit.register(serla.flush)`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-6">API Batch Endpoint</h3>
                <SimpleCodeBlock
                  language="bash"
                  code={`curl -X POST https://serla.dev/api/v1/events/batch \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "events": [
      { "name": "page_view", "properties": { "page": "/home" } },
      { "name": "button_click", "properties": { "button": "cta" } }
    ]
  }'`}
                />
              </section>

              {/* API Reference */}
              <section id="api-reference" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">API Reference</h2>
                <p className="text-zinc-400 mb-6">
                  Base URL: <code className="text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">https://serla.dev/api/v1</code>
                </p>

                <div className="space-y-6">
                  {/* POST /events */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded">POST</span>
                      <code className="text-sm text-white">/events</code>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-zinc-400 text-sm">Track a single event.</p>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Request</h4>
                        <SimpleCodeBlock language="json" code={`{
  "name": "purchase",
  "distinctId": "user_123",
  "sessionId": "sess_abc",
  "timestamp": "2024-01-15T10:30:00Z",
  "properties": {
    "product_id": "prod_123",
    "price": 49.99
  }
}`} />
                      </div>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Response</h4>
                        <SimpleCodeBlock language="json" code={`{
  "success": true,
  "eventId": "evt_abc123",
  "sessionId": "sess_abc"
}`} />
                      </div>
                    </div>
                  </div>

                  {/* POST /events/batch */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded">POST</span>
                      <code className="text-sm text-white">/events/batch</code>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-zinc-400 text-sm">Track multiple events (max 100 per request).</p>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Request</h4>
                        <SimpleCodeBlock language="json" code={`{
  "events": [
    { "name": "page_view", "properties": { "page": "/home" } },
    { "name": "button_click", "properties": { "button": "cta" } }
  ]
}`} />
                      </div>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Response</h4>
                        <SimpleCodeBlock language="json" code={`{
  "success": true,
  "count": 2,
  "eventIds": ["evt_abc", "evt_def"]
}`} />
                      </div>
                    </div>
                  </div>

                  {/* POST /identify */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded">POST</span>
                      <code className="text-sm text-white">/identify</code>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-zinc-400 text-sm">Identify a user and set properties.</p>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Request</h4>
                        <SimpleCodeBlock language="json" code={`{
  "distinctId": "user_123",
  "properties": {
    "email": "john@example.com",
    "name": "John Doe",
    "plan": "pro"
  }
}`} />
                      </div>
                    </div>
                  </div>

                  {/* GET /export */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">GET</span>
                      <code className="text-sm text-white">/export</code>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-zinc-400 text-sm">Export events as JSON or CSV.</p>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Query Parameters</h4>
                        <div className="bg-zinc-900/50 rounded-lg p-4 space-y-2 text-sm">
                          <div className="flex gap-4"><code className="text-zinc-300 w-24">format</code><span className="text-zinc-500">json or csv (default: json)</span></div>
                          <div className="flex gap-4"><code className="text-zinc-300 w-24">startDate</code><span className="text-zinc-500">ISO 8601 date</span></div>
                          <div className="flex gap-4"><code className="text-zinc-300 w-24">endDate</code><span className="text-zinc-500">ISO 8601 date</span></div>
                          <div className="flex gap-4"><code className="text-zinc-300 w-24">eventName</code><span className="text-zinc-500">Filter by event name</span></div>
                          <div className="flex gap-4"><code className="text-zinc-300 w-24">limit</code><span className="text-zinc-500">Max results (default: 1000, max: 10000)</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DELETE /users/:id */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded">DELETE</span>
                      <code className="text-sm text-white">/users/:distinctId</code>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-zinc-400 text-sm">Delete all data for a user (GDPR right to deletion).</p>
                      <div>
                        <h4 className="text-white text-sm font-medium mb-2">Example</h4>
                        <SimpleCodeBlock language="bash" code={`curl -X DELETE https://serla.dev/api/v1/users/user_123 \\
  -H "Authorization: Bearer sk_live_..."`} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Rate Limits */}
              <section id="rate-limits" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Rate Limits</h2>

                <h3 className="text-white font-medium mb-3">Limits by Plan</h3>
                <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Plan</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Events/sec</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Events/month</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 text-zinc-300">Free</td><td className="px-4 py-3 text-zinc-500">10</td><td className="px-4 py-3 text-zinc-500">25,000</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300">Hobby</td><td className="px-4 py-3 text-zinc-500">50</td><td className="px-4 py-3 text-zinc-500">500,000</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300">Pro</td><td className="px-4 py-3 text-zinc-500">200</td><td className="px-4 py-3 text-zinc-500">2,500,000</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300">Max</td><td className="px-4 py-3 text-zinc-500">1000</td><td className="px-4 py-3 text-zinc-500">Unlimited</td></tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-white font-medium mb-3">Rate Limit Headers</h3>
                <SimpleCodeBlock language="bash" code={`X-RateLimit-Limit: 50
X-RateLimit-Remaining: 49
X-RateLimit-Reset: 1705312800`} />

                <h3 className="text-white font-medium mb-3 mt-6">Handling 429 Errors</h3>
                <SimpleCodeBlock language="javascript" code={`async function trackWithRetry(event, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await serla.track(event);
    } catch (error) {
      if (error.status === 429) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
}`} />
              </section>

              {/* Webhooks */}
              <section id="webhooks" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Webhooks</h2>
                <p className="text-zinc-400 mb-6">
                  Receive real-time notifications when events occur.
                </p>

                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 mb-6">
                  <h3 className="text-white font-medium mb-3">Setup</h3>
                  <ol className="space-y-2 text-zinc-400 text-sm list-decimal list-inside">
                    <li>Go to Dashboard &gt; Settings &gt; Webhooks</li>
                    <li>Click &quot;Add Webhook&quot;</li>
                    <li>Enter your endpoint URL</li>
                    <li>Select events to receive</li>
                    <li>Copy the signing secret</li>
                  </ol>
                </div>

                <h3 className="text-white font-medium mb-3">Webhook Payload</h3>
                <SimpleCodeBlock language="json" code={`{
  "id": "wh_abc123",
  "type": "event.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "event": {
      "id": "evt_xyz",
      "name": "purchase",
      "distinctId": "user_123",
      "properties": { "price": 49.99 }
    }
  }
}`} />

                <h3 className="text-white font-medium mb-3 mt-6">Webhook Events</h3>
                <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Event</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">event.created</td><td className="px-4 py-3 text-zinc-500">New event tracked</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">user.identified</td><td className="px-4 py-3 text-zinc-500">User identified</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">goal.completed</td><td className="px-4 py-3 text-zinc-500">Goal conversion</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">threshold.exceeded</td><td className="px-4 py-3 text-zinc-500">Custom alert triggered</td></tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-white font-medium mb-3">Signature Verification</h3>
                <SimpleCodeBlock language="javascript" code={`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`} />
              </section>

              {/* Session Replay */}
              <section id="session-replay" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Session Replay</h2>
                <p className="text-zinc-400 mb-6">
                  Capture every interaction on your app (clicks, scrolls, typing, navigation) and replay it as a video in the dashboard. Built on rrweb — masks input values by default so PII never leaves the browser. <strong className="text-white">Hobby plan and above.</strong>
                </p>

                <h3 className="text-white font-medium mb-3">Enable Recording</h3>
                <SimpleCodeBlock
                  language="javascript"
                  title="Serla.init"
                  code={`import { Serla } from 'serla-js';

Serla.init({
  apiKey: 'sk_live_your_api_key',
  recordSessions: true,
  recordingOptions: {
    maskAllInputs: true,                   // default: true
    blockClass: 'serla-no-record',         // fully blocked from recording
    ignoreClass: 'serla-no-record-events', // layout kept, interactions dropped
  },
});`}
                />
                <p className="text-zinc-400 text-sm mt-3">
                  rrweb is dynamic-imported, so users who don&apos;t opt in don&apos;t pay the ~80 KB bundle cost.
                </p>

                <h3 className="text-white font-medium mb-3 mt-8">What&apos;s Captured</h3>
                <ul className="space-y-2 text-zinc-400 text-sm list-disc list-inside">
                  <li>DOM mutations, mouse moves, clicks, scroll position</li>
                  <li>Typing (input values are masked by default)</li>
                  <li>Console errors and unhandled rejections — these flip the <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">has_errors</code> flag on the recording so you can find error sessions fast</li>
                </ul>

                <h3 className="text-white font-medium mb-3 mt-8">View Recordings</h3>
                <p className="text-zinc-400 text-sm">
                  Dashboard → Replays (under PRODUCT in the sidebar) lists every session with the start URL, duration, distinct_id, browser/OS, and an <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">errors</code> badge if applicable. Click a row to open the player with timeline scrubbing and playback speed control.
                </p>
              </section>

              {/* Feature Flags */}
              <section id="feature-flags" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Feature Flags</h2>
                <p className="text-zinc-400 mb-6">
                  Toggle features on or off, run gradual rollouts, or A/B test variants. Evaluation is deterministic — the same user always gets the same value as long as the rollout doesn&apos;t shrink past their bucket. <strong className="text-white">Hobby plan and above.</strong>
                </p>

                <h3 className="text-white font-medium mb-3">Read a Flag from the SDK</h3>
                <SimpleCodeBlock
                  language="javascript"
                  title="flags.js"
                  code={`import { Serla } from 'serla-js';

// Boolean flag
const enabled = await Serla.isFeatureEnabled('new-checkout-flow');
if (enabled) showNewCheckout();

// Multivariate flag - returns the variant key as a string
const variant = await Serla.getFeatureFlag('button-color', 'control');
if (variant === 'variant_a') renderRedButton();

// All flags at once
const flags = await Serla.getAllFeatureFlags();`}
                />
                <p className="text-zinc-400 text-sm mt-3">
                  The SDK caches flag values for 30 seconds. Calling <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">identify()</code> or <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">reset()</code> invalidates the cache so a logged-in user immediately sees flags evaluated against their new distinct_id.
                </p>

                <h3 className="text-white font-medium mb-3 mt-8">Evaluation Order</h3>
                <ol className="space-y-2 text-zinc-400 text-sm list-decimal list-inside">
                  <li>If the flag is <strong className="text-zinc-300">disabled</strong>, returns <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">false</code>.</li>
                  <li>If any <strong className="text-zinc-300">condition</strong> matches the user, returns <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">true</code> (or the variant).</li>
                  <li>If the user&apos;s deterministic bucket is <strong className="text-zinc-300">inside the rollout %</strong>, returns <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">true</code> (or the variant).</li>
                  <li>Otherwise, returns <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">false</code>.</li>
                </ol>

                <h3 className="text-white font-medium mb-3 mt-8">Create a Flag</h3>
                <p className="text-zinc-400 text-sm">
                  Dashboard → Flags → <strong className="text-zinc-300">New flag</strong>. Set a key (stable identifier used in code), name, rollout %, and optional variants. Variants&apos; weights must sum to 100.
                </p>
              </section>

              {/* LLM Observability */}
              <section id="llm" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">LLM Observability</h2>
                <p className="text-zinc-400 mb-6">
                  Track every prompt, completion, token count, cost, and latency from your LLM calls. Works with any provider (OpenAI, Anthropic, Gemini, Mistral, your own model) — the data shape is generic. <strong className="text-white">Hobby plan and above.</strong>
                </p>

                <h3 className="text-white font-medium mb-3">Track a Generation</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'Node.js',
                      code: `import { Serla } from 'serla-node';
const serla = new Serla({ apiKey: process.env.SERLA_API_KEY });

const startedAt = Date.now();
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

await serla.trackLLM({
  model: 'gpt-4o',
  provider: 'openai',
  distinctId: 'user_123',
  input: messages,
  output: response.choices[0].message,
  inputTokens: response.usage.prompt_tokens,
  outputTokens: response.usage.completion_tokens,
  latencyMs: Date.now() - startedAt,
});`,
                    },
                    {
                      language: 'javascript',
                      label: 'Browser',
                      code: `import { Serla } from 'serla-js';

Serla.trackLLM({
  model: 'gpt-4o-mini',
  provider: 'openai',
  inputTokens: 12,
  outputTokens: 8,
  latencyMs: 320,
});`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">Cost Backfill</h3>
                <p className="text-zinc-400 text-sm">
                  If you don&apos;t supply <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">costUsd</code>, the server computes it from <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">inputTokens</code> + <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">outputTokens</code> against a built-in pricing table for known models (Claude, GPT, Gemini, Mistral). For unknown or finetuned models, set <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">costUsd</code> explicitly.
                </p>

                <h3 className="text-white font-medium mb-3 mt-8">Tracing Chains</h3>
                <p className="text-zinc-400 text-sm">
                  For multi-step calls (agent loops, RAG retrieval + answer), set <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">traceId</code> and <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">parentId</code> on each generation so the dashboard links them together.
                </p>
              </section>

              {/* Error Tracking */}
              <section id="error-tracking" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Error Tracking</h2>
                <p className="text-zinc-400 mb-6">
                  Capture server-side and client-side exceptions, group them by deterministic stack-trace fingerprint, and triage in the dashboard. <strong className="text-white">Hobby plan and above.</strong>
                </p>

                <h3 className="text-white font-medium mb-3">Capture an Exception</h3>
                <CodeBlock
                  examples={[
                    {
                      language: 'javascript',
                      label: 'Browser',
                      code: `import { Serla } from 'serla-js';

try {
  await checkout();
} catch (err) {
  Serla.captureException(err, { context: 'checkout', orderId });
}`,
                    },
                    {
                      language: 'javascript',
                      label: 'Node.js',
                      code: `import { Serla } from 'serla-node';
const serla = new Serla({ apiKey: process.env.SERLA_API_KEY });

try {
  await chargeCard(amount);
} catch (err) {
  await serla.captureException(err, {
    distinctId: userId,
    context: { route: '/checkout' },
    release: process.env.GIT_SHA,
    environment: process.env.NODE_ENV,
  });
  throw err;
}`,
                    },
                  ]}
                />

                <h3 className="text-white font-medium mb-3 mt-8">Fingerprinting & Grouping</h3>
                <p className="text-zinc-400 text-sm">
                  Errors are grouped by SHA-256 of <code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">(error type, top-of-stack file, top-of-stack function)</code>. Cosmetic refactors don&apos;t fragment groups. Minified chunk hashes (<code className="text-zinc-300 bg-zinc-800 px-1 rounded text-xs">page-abc123.js</code>) are stripped before hashing. If a resolved error fingerprint reoccurs, the dashboard auto-reopens it.
                </p>

                <h3 className="text-white font-medium mb-3 mt-8">Triage in Dashboard</h3>
                <p className="text-zinc-400 text-sm">
                  Dashboard → Errors lists groups with tabs for <strong className="text-zinc-300">Unresolved / Resolved / Ignored / All</strong>. Click a group to see the stack trace, browser/URL breakdown, and recent occurrences. Resolve, ignore, or reopen from the detail page.
                </p>
              </section>

              {/* Dashboard Features */}
              <section id="dashboard" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Dashboard Features</h2>

                <div className="space-y-8">
                  <div>
                    <h3 className="text-white font-medium mb-3">Funnels</h3>
                    <p className="text-zinc-400 text-sm mb-3">Create conversion funnels to see where users drop off.</p>
                    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400">
                      <p className="mb-2"><strong className="text-zinc-300">Example funnel:</strong></p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>page_view (page=/pricing)</li>
                        <li>signup_started</li>
                        <li>signup_completed</li>
                        <li>purchase</li>
                      </ol>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-3">Goals</h3>
                    <p className="text-zinc-400 text-sm mb-3">Track conversion events and assign monetary values.</p>
                    <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
                      <li><strong className="text-zinc-300">Event-based:</strong> Track any event as a conversion</li>
                      <li><strong className="text-zinc-300">Pageview-based:</strong> Track specific page visits</li>
                      <li><strong className="text-zinc-300">Revenue-based:</strong> Track events with revenue properties</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-3">Retention</h3>
                    <p className="text-zinc-400 text-sm mb-3">Analyze user retention with cohort analysis.</p>
                    <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
                      <li>Group users by signup date</li>
                      <li>View retention by day, week, or month</li>
                      <li>Define custom retention events</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-3">Segments</h3>
                    <p className="text-zinc-400 text-sm mb-3">Create saved segments for filtering data.</p>
                    <SimpleCodeBlock language="bash" title="Example Segment" code={`Country = United States
AND Browser = Chrome
AND Plan = pro`} />
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-3">Attribution</h3>
                    <p className="text-zinc-400 text-sm mb-3">Understand how users find you with attribution models.</p>
                    <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
                      <li><strong className="text-zinc-300">First-touch:</strong> Credit first interaction</li>
                      <li><strong className="text-zinc-300">Last-touch:</strong> Credit last interaction before conversion</li>
                      <li><strong className="text-zinc-300">Linear:</strong> Equal credit to all touchpoints</li>
                      <li><strong className="text-zinc-300">Time-decay:</strong> More credit to recent touchpoints</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-3">Journeys</h3>
                    <p className="text-zinc-400 text-sm mb-3">Analyze user navigation patterns through your site.</p>
                    <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
                      <li><strong className="text-zinc-300">User paths:</strong> See top navigation patterns</li>
                      <li><strong className="text-zinc-300">Drop-off points:</strong> Identify where users leave</li>
                      <li><strong className="text-zinc-300">Session analysis:</strong> Understand user flow</li>
                    </ul>
                    <p className="text-zinc-500 text-sm mt-3">Built automatically from page views. Enable <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">autoTrackPageViews: true</code> or call <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">trackPageView()</code>.</p>
                  </div>
                </div>
              </section>

              {/* Privacy */}
              <section id="privacy" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Privacy & Compliance</h2>

                <div className="space-y-6">
                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-3">No Cookies</h3>
                    <p className="text-zinc-400 text-sm">Serla does not use cookies. Session tracking uses in-memory storage or optional localStorage.</p>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-3">No Fingerprinting</h3>
                    <p className="text-zinc-400 text-sm">We never fingerprint users. Identification is explicit via identify() or session-based for anonymous users.</p>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-3">IP Addresses</h3>
                    <p className="text-zinc-400 text-sm">IPs are used for geolocation only and are never stored. Geolocation is resolved at ingestion time.</p>
                  </div>
                </div>

                <h3 className="text-white font-medium mb-3 mt-8">Data Retention</h3>
                <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Plan</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Retention</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 text-zinc-300">Free</td><td className="px-4 py-3 text-zinc-500">7 days</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300">Hobby</td><td className="px-4 py-3 text-zinc-500">60 days</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300">Pro</td><td className="px-4 py-3 text-zinc-500">180 days</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300">Max</td><td className="px-4 py-3 text-zinc-500">3 years</td></tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-white font-medium mb-3">User Opt-Out</h3>
                <SimpleCodeBlock language="javascript" code={`// Check opt-out before initializing
if (!localStorage.getItem('serla_optout')) {
  const serla = new Serla('sk_live_...');
}

// Opt-out function for privacy settings
function optOut() {
  localStorage.setItem('serla_optout', 'true');
  serla.reset();
}`} />
              </section>

              {/* Errors */}
              <section id="errors" className="mb-16 scroll-mt-20">
                <h2 className="text-xl font-medium text-white mb-4">Error Handling</h2>

                <h3 className="text-white font-medium mb-3">Error Codes</h3>
                <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Code</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Status</th>
                        <th className="text-left text-zinc-400 font-medium px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">invalid_request</td><td className="px-4 py-3 text-zinc-500">400</td><td className="px-4 py-3 text-zinc-500">Malformed request body</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">unauthorized</td><td className="px-4 py-3 text-zinc-500">401</td><td className="px-4 py-3 text-zinc-500">Invalid or missing API key</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">forbidden</td><td className="px-4 py-3 text-zinc-500">403</td><td className="px-4 py-3 text-zinc-500">Key does not have permission</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">not_found</td><td className="px-4 py-3 text-zinc-500">404</td><td className="px-4 py-3 text-zinc-500">Resource not found</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">rate_limit_exceeded</td><td className="px-4 py-3 text-zinc-500">429</td><td className="px-4 py-3 text-zinc-500">Too many requests</td></tr>
                      <tr><td className="px-4 py-3 text-zinc-300 font-mono text-xs">internal_error</td><td className="px-4 py-3 text-zinc-500">500</td><td className="px-4 py-3 text-zinc-500">Server error</td></tr>
                    </tbody>
                  </table>
                </div>

                <h3 className="text-white font-medium mb-3">SDK Error Handling</h3>
                <SimpleCodeBlock language="javascript" code={`try {
  await serla.track('event');
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    // Wait and retry
  } else if (error.code === 'unauthorized') {
    // Check API key
  } else {
    console.error('Serla error:', error.message);
  }
}`} />

                <h3 className="text-white font-medium mb-3 mt-6">Debug Mode</h3>
                <SimpleCodeBlock language="javascript" code={`const serla = new Serla('sk_live_...', { debug: true });

// Or toggle at runtime
serla.setDebug(true);`} />
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
