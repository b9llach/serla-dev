import { useEffect, useRef } from 'react';
import { Serla, type EventProperties } from 'serla-js';

/**
 * Stable JSON stringify with sorted keys. We use this to detect whether a
 * properties object has *meaningfully* changed - parent renders typically
 * pass a fresh object literal each time, which would otherwise re-fire the
 * identify call on every render.
 *
 * Not cycle-safe, but EventProperties is meant to be plain analytics data
 * (strings/numbers/booleans/null/nested plain objects). JSON.stringify with
 * a sorted-key replacer is the right tool here.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

/**
 * Effects-driven identify. Pass a distinctId (or null when logged out) and
 * optional properties. The hook only re-fires when the serialized inputs
 * actually change, so callers can pass fresh object literals freely.
 *
 *   useIdentify(user?.id ?? null, user ? { email: user.email } : undefined);
 *
 * When distinctId transitions to null (logout), Serla.reset() is called.
 * Also calls reset() on unmount as a defensive measure.
 */
export function useIdentify(
  distinctId: string | null,
  properties?: EventProperties
): void {
  // We compare against the previous serialized signature so a parent passing
  // { email: 'x' } on every render doesn't spam the network.
  const prevSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const signature =
      distinctId === null ? null : distinctId + '|' + stableStringify(properties ?? {});

    if (signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;

    if (distinctId === null) {
      Serla.reset();
    } else {
      Serla.identify(distinctId, properties);
    }
  }, [distinctId, properties]);

  // Defensive cleanup on unmount. Only reset if we ever identified.
  useEffect(() => {
    return () => {
      if (prevSignatureRef.current !== null) {
        Serla.reset();
      }
    };
  }, []);
}
