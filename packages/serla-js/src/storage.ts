/**
 * localStorage wrapper that fails silently in non-browser / private-mode contexts.
 */

const PREFIX = 'serla:';

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const probe = '__serla_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storageGet(key: string): string | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    return s.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PREFIX + key, value);
  } catch {
    // quota full, private mode, etc - swallow
  }
}

export function storageRemove(key: string): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
