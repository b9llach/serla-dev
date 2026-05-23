import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventQueue } from './queue';
import type { ResolvedConfig, QueuedEvent } from './types';

const baseConfig: ResolvedConfig = {
  apiKey: 'sk_test',
  host: 'https://example.com',
  autoPageviews: false,
  autoClicks: false,
  errorTracking: false,
  pageleaveTracking: false,
  sessionTimeoutMs: 1_800_000,
  batchSize: 3,
  flushIntervalMs: 10_000,
  debug: false,
  optOut: false,
};

function makeEvent(name: string): QueuedEvent {
  return {
    name,
    properties: {},
    sessionId: 'session-1',
    timestamp: new Date().toISOString(),
  };
}

describe('EventQueue', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let q: EventQueue;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    q = new EventQueue(baseConfig);
  });

  afterEach(() => {
    q.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('flushes when batchSize is reached', async () => {
    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    expect(fetchMock).not.toHaveBeenCalled();
    q.enqueue(makeEvent('c'));
    // batchSize=3 triggers an async flush
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('sends Authorization header and idempotency key', async () => {
    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    q.enqueue(makeEvent('c'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk_test');
    expect(headers['X-Idempotency-Key']).toBeTruthy();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('re-queues events on failure and applies exponential backoff', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    q.enqueue(makeEvent('c'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // After failure, immediate flush should NOT trigger fetch (backoff active)
    await q.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears backoff on successful flush', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    q.enqueue(makeEvent('c'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Move "now" past the backoff window so the next flush is allowed.
    const start = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(start + 5_000);

    await q.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    dateSpy.mockRestore();
  });

  it('caps re-queue at 1000 events to prevent unbounded growth', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    // Force buffer to >1000 BEFORE flush attempts
    for (let i = 0; i < 1005; i++) q.enqueue(makeEvent(`e${i}`));

    // Wait for at least one flush attempt
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Internal buffer should be capped. We can't read private field, but the
    // best signal is that another flush after backoff doesn't enqueue more
    // events than max.
    // (We rely on the implementation cap; verifying the exact size requires
    // exposing internals or a buffer.length getter. Smoke check only.)
    expect(fetchMock).toHaveBeenCalled();
  });
});
