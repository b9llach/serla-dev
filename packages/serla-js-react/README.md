# serla-js-react

Official React bindings for [serla-js](https://www.npmjs.com/package/serla-js) — the JavaScript SDK for [Serla](https://serla.dev) analytics.

- Tiny: a provider, four hooks, one declarative component
- ESM + CJS, TypeScript types included
- Wraps the core `serla-js` singleton — no duplicate state in your React tree
- Works in Next.js App Router, Remix, Vite, CRA, anything React 18+

## Install

```bash
npm install serla-js serla-js-react
```

Both packages are required — `serla-js` is a peer dependency so a single copy of the SDK lives in your app.

## Quick start (Next.js App Router)

```tsx
// app/providers.tsx
'use client';

import { SerlaProvider } from 'serla-js-react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SerlaProvider
      config={{
        apiKey: process.env.NEXT_PUBLIC_SERLA_API_KEY!,
        autoPageviews: true,
      }}
    >
      {children}
    </SerlaProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## API

### `<SerlaProvider config={...}>`

Calls `Serla.init(config)` once on mount and `Serla.shutdown()` on unmount. The `config` prop is read only on mount — changing it later is intentionally ignored, since the core SDK does not support reconfiguration.

```tsx
<SerlaProvider config={{ apiKey: 'sk_live_...', autoPageviews: true }}>
  <App />
</SerlaProvider>
```

In React StrictMode (dev) effects run twice, so `init -> shutdown -> init` happens — this is harmless and only affects development.

### `useSerla()`

Returns the `Serla` singleton. Equivalent to `import { Serla } from 'serla-js'`, but warns once in development if no `<SerlaProvider>` is mounted.

```tsx
function MyButton() {
  const serla = useSerla();
  return <button onClick={() => serla.track('cta_clicked', { variant: 'hero' })}>Click</button>;
}
```

### `useTrack(name)`

Returns a stable function bound to an event name. The returned function takes optional per-call properties.

```tsx
function MyButton() {
  const trackClick = useTrack('cta_clicked');
  return <button onClick={() => trackClick({ variant: 'hero' })}>Click</button>;
}
```

The function identity is stable as long as `name` doesn't change — safe to pass into memoized children or effect dependency arrays.

### `useIdentify(distinctId, properties?)`

Effects-driven `identify()`. Pass a distinct ID (or `null` when logged out) and optional properties. Only re-fires when the inputs actually change, so passing fresh object literals from a parent's render is fine.

```tsx
function App({ user }) {
  useIdentify(user?.id ?? null, user ? { email: user.email, plan: user.plan } : undefined);
  return <Routes />;
}
```

- Transitioning `distinctId` from a string to `null` calls `Serla.reset()`.
- On unmount, if you ever identified, the hook calls `Serla.reset()`.

### `useSuperProperties(properties | null)`

Declarative wrapper around `Serla.setProperties()` / `Serla.unsetProperties()`. The hook tracks the keys it set and removes them when you stop passing them (or pass `null`).

```tsx
function App({ user }) {
  useSuperProperties(user ? { plan: user.plan, appVersion: '4.2.1' } : null);
  // ...
}
```

- Pass `null` to clear the keys this hook owned.
- Unrelated super properties set via `Serla.setProperties()` elsewhere are not touched.

### `<Track event="..." properties={...} />`

Declarative one-shot tracker that fires the event exactly once on mount. Useful for view-tracking modals and overlays where the mount itself is the signal:

```tsx
{showUpgradeModal && (
  <Modal>
    <Track event="upgrade_modal_viewed" properties={{ plan: 'pro' }} />
    <h1>Upgrade to Pro</h1>
  </Modal>
)}
```

## Re-exported types

```ts
import type { SerlaConfig, EventProperties } from 'serla-js-react';
import { Serla } from 'serla-js-react'; // same singleton as serla-js
```

## License

MIT
