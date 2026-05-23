import { storageGet, storageSet } from './storage';

const SESSION_ID_KEY = 'session_id';
const SESSION_LAST_ACTIVE_KEY = 'session_last_active';

function randomSessionId(): string {
  // 16 random bytes -> 32 hex chars. Server expects this format.
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (older browsers / non-window): Math.random not cryptographically
  // strong but the server tolerates any 32-hex-char ID.
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/**
 * Get the current session ID, generating a new one if there is no active session
 * or if the inactivity timeout has elapsed since the last tracked event.
 */
export function getSessionId(timeoutMs: number): string {
  const now = Date.now();
  const lastActive = Number(storageGet(SESSION_LAST_ACTIVE_KEY) || '0');
  let id = storageGet(SESSION_ID_KEY);

  if (!id || now - lastActive > timeoutMs) {
    id = randomSessionId();
    storageSet(SESSION_ID_KEY, id);
  }
  storageSet(SESSION_LAST_ACTIVE_KEY, String(now));
  return id;
}
