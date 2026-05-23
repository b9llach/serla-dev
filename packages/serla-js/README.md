# serla-js

Official JavaScript SDK for [Serla](https://serla.dev) — privacy-focused product analytics for developers.

- ESM + CJS + IIFE builds, TypeScript types included
- ~8 KB minified browser build
- Auto-pageview tracking for SPAs (History API + hashchange)
- Optional autocapture of clicks
- Optional automatic JS error capture
- Pageleave events with time-on-page
- Super properties (context auto-attached to every event)
- Runtime opt-out for consent flows
- Batched event delivery with `navigator.sendBeacon` flush on page unload
- localStorage-persisted distinct ID, session ID, and super properties

## Install

```bash
npm install serla-js
```

Or use directly via `<script>` tag:

```html
<script src="https://unpkg.com/serla-js/dist/serla.min.global.js"></script>
<script>
  Serla.init({ apiKey: 'sk_live_...' });
</script>
```

## Quick start

```ts
import { Serla } from 'serla-js';

Serla.init({
  apiKey: process.env.NEXT_PUBLIC_SERLA_API_KEY!,
  // Optional — defaults shown
  host: 'https://serla.dev',
  autoPageviews: true,
  autoClicks: false,
});

// Track custom events
Serla.track('signup_completed', { plan: 'pro' });

// Identify a user
Serla.identify('user_123', {
  email: 'a@example.com',
  plan: 'pro',
});

// Logout
Serla.reset();
```

## React (Next.js App Router)

Create a client component that initializes the SDK once:

```tsx
// app/_components/SerlaProvider.tsx
'use client';

import { useEffect } from 'react';
import { Serla } from 'serla-js';

export function SerlaProvider() {
  useEffect(() => {
    Serla.init({
      apiKey: process.env.NEXT_PUBLIC_SERLA_API_KEY!,
      host: process.env.NEXT_PUBLIC_SERLA_HOST,
    });
  }, []);
  return null;
}
```

Mount it in your root layout:

```tsx
// app/layout.tsx
import { SerlaProvider } from './_components/SerlaProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SerlaProvider />
        {children}
      </body>
    </html>
  );
}
```

## Configuration

| Option                | Type      | Default                | Description                                                                       |
| --------------------- | --------- | ---------------------- | --------------------------------------------------------------------------------- |
| `apiKey`              | `string`  | (required)             | Your project API key (`sk_live_...`).                                             |
| `host`                | `string`  | `https://serla.dev`    | Base URL of your Serla deployment.                                                |
| `autoPageviews`       | `boolean` | `true`                 | Auto-track navigations as `$pageview` events (History API + hashchange).          |
| `autoClicks`          | `boolean` | `false`                | Auto-track clicks as `$autoclick` events with element selectors.                  |
| `errorTracking`       | `boolean` | `false`                | Auto-capture JS errors + unhandled promise rejections as `$error` events.         |
| `pageleaveTracking`   | `boolean` | `true`                 | Track `$pageleave` events on unload with `timeOnPageMs`. Requires `autoPageviews`.|
| `sessionTimeoutMs`    | `number`  | `1800000` (30 min)     | Inactivity period before a new session starts.                                    |
| `batchSize`           | `number`  | `20`                   | Max events per flushed batch.                                                     |
| `flushIntervalMs`     | `number`  | `10000` (10 s)         | Periodic flush interval.                                                          |
| `debug`               | `boolean` | `false`                | Log SDK activity to console.                                                      |
| `optOut`              | `boolean` | `false`                | Disable all tracking at init. See `Serla.setOptOut()` for runtime control.        |

## API

### `Serla.init(config)`

Initialize the SDK. Must be called once before any other method. Calling again is a no-op.

### `Serla.track(name, properties?)`

Track an event. `name` is required; `properties` is an arbitrary object.

```ts
Serla.track('button_clicked', { id: 'cta-hero' });
```

### `Serla.identify(distinctId, properties?)`

Associate the current session with a user. The distinct ID is persisted in localStorage so subsequent visits use the same identity.

```ts
Serla.identify('user_123', { email: 'a@example.com' });
```

### `Serla.setProperties(properties)` / `Serla.unsetProperties(keys)`

**Super properties.** Attach context to every subsequent `track()` call so you don't have to pass it manually. Persisted to localStorage so they survive reloads.

```ts
// Right after login
Serla.setProperties({
  plan: 'pro',
  experimentBucket: 'variant_b',
  appVersion: '4.2.1',
});

// All later events include those properties automatically
Serla.track('feature_used', { feature: 'export' });
// -> { plan: 'pro', experimentBucket: 'variant_b', appVersion: '4.2.1', feature: 'export' }

// Remove specific keys
Serla.unsetProperties(['experimentBucket']);

// Read current values
Serla.getSuperProperties(); // { plan: 'pro', appVersion: '4.2.1' }
```

Event-specific properties always win over super properties of the same name.

### `Serla.reset()`

Clear the persisted distinct ID AND super properties. Call on logout.

### `Serla.setOptOut(value)` / `Serla.isOptedOut()`

Runtime opt-out for consent-banner integration. Persists to localStorage so the choice survives reloads.

```ts
// On consent revoked
Serla.setOptOut(true);

// On consent granted
Serla.setOptOut(false);

// Check current state
if (Serla.isOptedOut()) showOptInBanner();
```

When opted out, `track()` and `identify()` no-op silently. Calling `setOptOut(false)` later resumes tracking.

### `Serla.flush()`

Force-flush the event queue. Most apps don't need this — the SDK flushes every `flushIntervalMs` and reliably on `pagehide`.

### Automatic events

When enabled via config, the SDK emits these events automatically:

| Event | When | Properties |
|---|---|---|
| `$pageview` | SPA navigation, hashchange, initial load (if `autoPageviews`) | (page context) |
| `$pageleave` | Page unload, after at least 200ms on page (if `pageleaveTracking`) | `timeOnPageMs`, `leftPath` |
| `$autoclick` | Any document click (if `autoClicks`) | `viewportWidth`, `viewportHeight`, `clickX`, `clickY`, `elementSelector` |
| `$error` | Uncaught error or unhandled rejection (if `errorTracking`) | `message`, `source`, `line`, `col`, `stack`, `errorType` |

### `Serla.flush()`

Force-flush the event queue. Returns a Promise that resolves when the in-flight request completes. Most apps don't need to call this — the SDK flushes periodically and reliably on `pagehide`.

### `Serla.shutdown()`

Stop all tracking and tear down event listeners. Useful for tests.

### `Serla.getDistinctId()`

Returns the current distinct ID or `null` if not identified.

## Opt-out and privacy

For users who opted out, pass `optOut: true`:

```ts
Serla.init({
  apiKey: '...',
  optOut: localStorage.getItem('analytics-disabled') === 'true',
});
```

To ignore specific elements from autocapture, add `data-serla-ignore`:

```html
<input type="password" data-serla-ignore />
```

## Reliability

- Events are queued in memory and flushed every `flushIntervalMs`.
- Forced flush when the queue reaches `batchSize`.
- On `pagehide` and `visibilitychange = hidden`, the queue is flushed via `navigator.sendBeacon` — survives page unload.
- If a flush fails, events are re-queued (capped at 1000 to prevent unbounded growth).

## License

MIT
