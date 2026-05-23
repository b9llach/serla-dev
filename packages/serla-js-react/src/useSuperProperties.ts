import { useEffect, useRef } from 'react';
import { Serla, type EventProperties } from 'serla-js';

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
 * Declarative wrapper around Serla.setProperties / unsetProperties.
 *
 *   useSuperProperties(user ? { plan: user.plan, appVersion: '4.2.1' } : null);
 *
 * Passing null clears the keys this hook previously set (it remembers them so
 * unrelated super properties set elsewhere aren't touched). Only re-fires when
 * the serialized properties actually change.
 */
export function useSuperProperties(properties: EventProperties | null): void {
  const prevSignatureRef = useRef<string | null>(null);
  const ownedKeysRef = useRef<string[]>([]);

  useEffect(() => {
    const signature = properties === null ? 'null' : stableStringify(properties);
    if (signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;

    if (properties === null) {
      if (ownedKeysRef.current.length > 0) {
        Serla.unsetProperties(ownedKeysRef.current);
        ownedKeysRef.current = [];
      }
      return;
    }

    // Drop keys we previously owned but no longer pass.
    const newKeys = Object.keys(properties);
    const stale = ownedKeysRef.current.filter(k => !newKeys.includes(k));
    if (stale.length > 0) Serla.unsetProperties(stale);

    Serla.setProperties(properties);
    ownedKeysRef.current = newKeys;
  }, [properties]);

  // Clean up our own keys on unmount.
  useEffect(() => {
    return () => {
      if (ownedKeysRef.current.length > 0) {
        Serla.unsetProperties(ownedKeysRef.current);
        ownedKeysRef.current = [];
      }
    };
  }, []);
}
