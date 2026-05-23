# serla-node

Official Node.js server SDK for [Serla](https://serla.dev) — privacy-focused product analytics for developers.

- ESM + CJS builds, TypeScript types included
- Zero runtime dependencies, uses built-in `fetch` (Node 18+)
- Edge-runtime compatible (Vercel Edge, Cloudflare Workers)
- Batched event delivery with exponential-backoff retries
- Graceful shutdown via `await serla.flush()` and `await serla.shutdown()`
- Auto-flush on `beforeExit` for long-lived Node processes
- Class-based — instantiate as many clients as you need

## Install

```bash
npm install serla-node
```

Requires Node 18+ for built-in `fetch`. For older Node, use a `fetch` polyfill.

## Quick start

```ts
import { Serla } from 'serla-node';

const serla = new Serla({
  apiKey: process.env.SERLA_API_KEY!,
  // Optional - defaults shown
  host: 'https://serla.dev',
  flushIntervalMs: 5000,
  batchSize: 50,
  debug: false,
});

serla.track({
  name: 'signup_completed',
  distinctId: 'user_123',
  properties: { plan: 'pro', source: 'organic' },
});

// Identify a user (await - hits /api/v1/identify directly)
await serla.identify('user_123', { email: 'a@example.com', plan: 'pro' });

// Group analytics - use the reserved $groups property on any event
serla.track({
  name: 'feature_used',
  distinctId: 'user_123',
  properties: { feature: 'export', $groups: { team: 'team_42' } },
});

// Before the process exits, flush whatever's queued
await serla.flush();
await serla.shutdown();
```

## Configuration

| Option            | Type      | Default               | Description                                                                  |
| ----------------- | --------- | --------------------- | ---------------------------------------------------------------------------- |
| `apiKey`          | `string`  | (required)            | Your project API key (`sk_live_...`).                                        |
| `host`            | `string`  | `https://serla.dev`   | Base URL of your Serla deployment.                                           |
| `batchSize`       | `number`  | `50`                  | Max events per flushed batch. Larger batches reduce network overhead.        |
| `flushIntervalMs` | `number`  | `5000` (5s)           | Periodic flush interval.                                                     |
| `debug`           | `boolean` | `false`               | Log SDK activity to console.                                                 |
| `flushOnExit`     | `boolean` | `true`                | Auto-flush on Node's `beforeExit`. No-op on Edge runtimes (no `process.on`). |

## API

### `new Serla(config)`

Construct a client. Throws if `apiKey` is missing. Reuse the instance for the lifetime of the process.

### `serla.track(payload)`

Enqueue an event. Non-blocking - returns immediately. The event is delivered on the next flush tick or when the batch fills up.

```ts
serla.track({
  name: 'order_placed',
  distinctId: 'user_123',
  properties: { totalCents: 4900, currency: 'USD' },
  timestamp: new Date(),  // optional - defaults to now
});
```

`distinctId` is **required** — there's no anonymous-ID fallback on the server. If you don't know the user yet, pass a stable system identifier (org ID, IP-derived ID, etc).

### `serla.identify(distinctId, properties?)`

Set user properties for a distinct ID. POSTs synchronously to `/api/v1/identify` and resolves when the response returns.

```ts
await serla.identify('user_123', {
  email: 'a@example.com',
  plan: 'pro',
  signedUpAt: new Date().toISOString(),
});
```

### `serla.flush()`

Force-flush the event queue. Returns a Promise that resolves when all currently-queued events have been sent (or definitively failed and re-queued for retry).

```ts
await serla.flush();
```

Call this before a serverless function returns so events aren't lost when the runtime freezes the process.

### `serla.shutdown()`

Graceful shutdown. Flushes the queue, stops the periodic timer, and detaches the `beforeExit` hook. Safe to call multiple times.

```ts
await serla.shutdown();
```

### `serla.pendingCount()`

Returns the number of events currently buffered. Useful for tests or for "are we caught up?" health checks.

## Examples

### Next.js API route

```ts
// app/api/track/route.ts
import { Serla } from 'serla-node';

// Reuse across requests - module-level keeps the queue warm between invocations
const serla = new Serla({ apiKey: process.env.SERLA_API_KEY! });

export async function POST(req: Request) {
  const body = await req.json();
  serla.track({
    name: 'signup_completed',
    distinctId: body.userId,
    properties: { plan: body.plan },
  });
  // Serverless runtimes can freeze the process when the handler returns.
  // Awaiting flush() ensures the event hits the wire before the freeze.
  await serla.flush();
  return Response.json({ ok: true });
}
```

### Express with graceful shutdown

```ts
import express from 'express';
import { Serla } from 'serla-node';

const serla = new Serla({ apiKey: process.env.SERLA_API_KEY! });
const app = express();

app.post('/checkout', async (req, res) => {
  serla.track({
    name: 'checkout_completed',
    distinctId: req.body.userId,
    properties: { totalCents: req.body.totalCents },
  });
  res.json({ ok: true });
  // No await needed - long-lived Node process will flush periodically.
});

const server = app.listen(3000);

// Drain the queue before the process exits.
async function shutdown() {
  server.close();
  await serla.shutdown();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### AWS Lambda

```ts
import { Serla } from 'serla-node';

// Module-level: reused across warm invocations.
const serla = new Serla({ apiKey: process.env.SERLA_API_KEY! });

export const handler = async (event: { userId: string }) => {
  serla.track({
    name: 'lambda_invoked',
    distinctId: event.userId,
    properties: { region: process.env.AWS_REGION },
  });
  // CRITICAL: AWS Lambda freezes the execution context when the handler
  // returns. If we don't await flush(), events queued during this invocation
  // sit in the buffer until the next invocation (or are lost if the container
  // is recycled).
  await serla.flush();
  return { statusCode: 200, body: 'ok' };
};
```

### Vercel Edge Functions

`flushOnExit` is automatically a no-op on Edge runtimes (no `process.on`). Always `await flush()` before responding:

```ts
// app/api/edge/route.ts
import { Serla } from 'serla-node';

export const runtime = 'edge';

const serla = new Serla({ apiKey: process.env.SERLA_API_KEY! });

export async function POST(req: Request) {
  const { userId } = await req.json();
  serla.track({ name: 'edge_request', distinctId: userId });
  await serla.flush();
  return Response.json({ ok: true });
}
```

## Reliability

- Events are queued in memory and flushed every `flushIntervalMs`.
- Forced flush when the queue reaches `batchSize`.
- On flush failure, events are re-queued at the front (capped at 1000 to prevent unbounded growth).
- Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s) so a broken endpoint isn't hammered.
- Every batch carries an `X-Idempotency-Key` so server-side dedup can collapse retried-and-eventually-succeeded batches.

## Differences from `serla-js`

| Concern          | serla-js (browser)             | serla-node (server)            |
| ---------------- | ------------------------------ | ------------------------------ |
| Distinct ID      | Auto-generated, localStorage   | **Required** on every track    |
| Session ID       | Auto-tracked, 30min inactivity | None (servers don't have sessions) |
| Page context     | window.location, document      | None                           |
| Unload flush     | `navigator.sendBeacon`         | `await flush()` / `beforeExit` |
| Singleton        | Yes (`Serla.init()`)           | No (`new Serla({...})`)        |
| Auto-pageviews   | Yes                            | N/A                            |
| Opt-out          | Persisted to localStorage      | Not applicable                 |

## License

MIT
