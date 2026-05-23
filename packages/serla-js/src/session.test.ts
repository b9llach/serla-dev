import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSessionId } from './session';

describe('session', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('generates a 32-char hex session id', () => {
    const id = getSessionId(60_000);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });

  it('returns the same id within the timeout', () => {
    const a = getSessionId(60_000);
    const b = getSessionId(60_000);
    expect(a).toBe(b);
  });

  it('issues a new id after inactivity timeout elapses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const first = getSessionId(60_000);

    vi.setSystemTime(new Date('2025-01-01T00:02:00Z')); // 2 minutes later
    const second = getSessionId(60_000);

    expect(first).not.toBe(second);
  });

  it('refreshes lastActive on every call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const first = getSessionId(60_000);

    // 30s later, still within timeout - should be same id
    vi.setSystemTime(new Date('2025-01-01T00:00:30Z'));
    const second = getSessionId(60_000);
    expect(second).toBe(first);

    // Another 30s later, lastActive should have been bumped by previous call,
    // so still within timeout
    vi.setSystemTime(new Date('2025-01-01T00:01:00Z'));
    const third = getSessionId(60_000);
    expect(third).toBe(first);
  });
});
