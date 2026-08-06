import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Serla } from './index';

const API_KEY = 'sk_live_test';
const HOST = 'https://example.test';

/** Capture fetch calls so assertions can inspect URL / headers / body. */
function mockFetch(impl?: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return impl
      ? impl(String(url), init as RequestInit)
      : (new Response('{}', { status: 200 }) as Response);
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body));
}

describe('Serla (node)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('construction', () => {
    it('throws without an apiKey', () => {
      // @ts-expect-error - deliberately invalid to assert the runtime guard
      expect(() => new Serla({})).toThrow(/apiKey is required/i);
      // @ts-expect-error - deliberately invalid
      expect(() => new Serla()).toThrow(/apiKey is required/i);
    });

    it('trims a trailing slash off host so URLs do not double up', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({
        apiKey: API_KEY,
        host: 'https://example.test/',
        flushOnExit: false,
      });
      serla.track({ name: 'x', distinctId: 'u1' });
      await serla.flush();
      expect(calls[0].url).toBe('https://example.test/api/v1/events/batch');
      await serla.shutdown();
    });
  });

  describe('track', () => {
    it('requires a name and a distinctId', async () => {
      const { fn } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });

      // Missing name
      serla.track({ name: '', distinctId: 'u1' });
      // Missing distinctId - server has no anonymous fallback
      serla.track({ name: 'evt', distinctId: '' });

      expect(serla.pendingCount()).toBe(0);
      await serla.flush();
      expect(fn).not.toHaveBeenCalled();
      await serla.shutdown();
    });

    it('queues events instead of sending immediately', () => {
      const { fn } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'signup', distinctId: 'u1' });
      expect(serla.pendingCount()).toBe(1);
      expect(fn).not.toHaveBeenCalled();
    });

    it('auto-flushes once the batch size is reached', async () => {
      const { fn } = mockFetch();
      const serla = new Serla({
        apiKey: API_KEY,
        host: HOST,
        batchSize: 3,
        flushOnExit: false,
      });
      serla.track({ name: 'a', distinctId: 'u1' });
      serla.track({ name: 'b', distinctId: 'u1' });
      expect(fn).not.toHaveBeenCalled();
      serla.track({ name: 'c', distinctId: 'u1' });
      await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
      await serla.shutdown();
    });

    it('sends auth header, idempotency key, and the event payload', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({
        name: 'signup_completed',
        distinctId: 'user_123',
        properties: { plan: 'pro' },
      });
      await serla.flush();

      const { url, init } = calls[0];
      const headers = init.headers as Record<string, string>;
      expect(url).toBe(`${HOST}/api/v1/events/batch`);
      expect(init.method).toBe('POST');
      expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
      expect(headers['X-Idempotency-Key']).toBeTruthy();

      const body = bodyOf(init) as { events: Array<Record<string, unknown>> };
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toMatchObject({
        name: 'signup_completed',
        distinctId: 'user_123',
        properties: { plan: 'pro' },
      });
      expect(typeof body.events[0].timestamp).toBe('string');
      await serla.shutdown();
    });

    it('accepts a Date or string timestamp and normalizes to ISO', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      const when = new Date('2026-01-02T03:04:05.000Z');
      serla.track({ name: 'a', distinctId: 'u1', timestamp: when });
      serla.track({ name: 'b', distinctId: 'u1', timestamp: '2026-02-03T04:05:06.000Z' });
      await serla.flush();

      const body = bodyOf(calls[0].init) as { events: Array<{ timestamp: string }> };
      expect(body.events[0].timestamp).toBe('2026-01-02T03:04:05.000Z');
      expect(body.events[1].timestamp).toBe('2026-02-03T04:05:06.000Z');
      await serla.shutdown();
    });

    it('is a no-op after shutdown', async () => {
      const { fn } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.shutdown();
      serla.track({ name: 'after', distinctId: 'u1' });
      expect(serla.pendingCount()).toBe(0);
      fn.mockClear();
      await serla.flush();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('re-queues events when the server returns non-2xx', async () => {
      mockFetch(() => new Response('nope', { status: 500 }));
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'a', distinctId: 'u1' });
      await serla.flush();
      // Event must not be silently dropped - it goes back in the buffer.
      expect(serla.pendingCount()).toBe(1);
      await serla.shutdown();
    });

    it('re-queues events when fetch throws (network down)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }));
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'a', distinctId: 'u1' });
      await serla.flush();
      expect(serla.pendingCount()).toBe(1);
      await serla.shutdown();
    });

    it('bounds retries during an explicit flush so a dead endpoint cannot hang shutdown', async () => {
      // An explicit flush() drains, which deliberately bypasses the backoff
      // window - the caller has asked us to send now (e.g. before a
      // serverless function returns). It must still be bounded so a
      // permanently-broken endpoint can't spin forever.
      const { fn } = mockFetch(() => new Response('err', { status: 500 }));
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'a', distinctId: 'u1' });

      await serla.flush();
      expect(fn.mock.calls.length).toBeGreaterThan(0);
      expect(fn.mock.calls.length).toBeLessThanOrEqual(5);
      // Events survive a failed drain rather than being dropped.
      expect(serla.pendingCount()).toBe(1);
      await serla.shutdown();
    });

    it('delivers queued events once the endpoint recovers', async () => {
      let fail = true;
      const { fn } = mockFetch(() =>
        fail ? new Response('err', { status: 500 }) : new Response('{}', { status: 200 })
      );

      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'a', distinctId: 'u1' });

      await serla.flush();
      expect(serla.pendingCount()).toBe(1); // still buffered after failure

      fail = false;
      fn.mockClear();
      await serla.flush();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(serla.pendingCount()).toBe(0);
      await serla.shutdown();
    });
  });

  describe('identify', () => {
    it('posts to /api/v1/identify with the distinctId and properties', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.identify('user_123', { email: 'a@example.com' });

      expect(calls[0].url).toBe(`${HOST}/api/v1/identify`);
      expect(bodyOf(calls[0].init)).toEqual({
        distinctId: 'user_123',
        properties: { email: 'a@example.com' },
      });
      await serla.shutdown();
    });

    it('skips empty distinctId and never throws on network failure', async () => {
      const { fn } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.identify('');
      expect(fn).not.toHaveBeenCalled();

      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('network down');
      }));
      // Analytics must never take down the caller's request path.
      await expect(serla.identify('user_1')).resolves.toBeUndefined();
      await serla.shutdown();
    });
  });

  describe('trackLLM', () => {
    it('posts the generation to /api/v1/llm', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.trackLLM({
        model: 'gpt-4o',
        provider: 'openai',
        distinctId: 'user_1',
        inputTokens: 12,
        outputTokens: 8,
        latencyMs: 420,
      });

      expect(calls[0].url).toBe(`${HOST}/api/v1/llm`);
      expect(bodyOf(calls[0].init)).toMatchObject({
        model: 'gpt-4o',
        provider: 'openai',
        inputTokens: 12,
        outputTokens: 8,
      });
      await serla.shutdown();
    });

    it('swallows network errors', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('boom');
      }));
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await expect(serla.trackLLM({ model: 'gpt-4o' })).resolves.toBeUndefined();
      await serla.shutdown();
    });
  });

  describe('captureException', () => {
    it('posts message, type, and stack to /api/v1/errors', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      const err = new TypeError('cannot read x of undefined');
      await serla.captureException(err, {
        distinctId: 'user_1',
        release: 'v1.2.3',
        environment: 'production',
      });

      expect(calls[0].url).toBe(`${HOST}/api/v1/errors`);
      const body = bodyOf(calls[0].init) as Record<string, string>;
      expect(body.message).toBe('cannot read x of undefined');
      expect(body.type).toBe('TypeError');
      expect(body.stack).toContain('TypeError');
      expect(body.distinctId).toBe('user_1');
      expect(body.release).toBe('v1.2.3');
      await serla.shutdown();
    });

    it('coerces non-Error throwables into an Error shape', async () => {
      const { calls } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.captureException('just a string');
      const body = bodyOf(calls[0].init) as Record<string, string>;
      expect(body.message).toBe('just a string');
      expect(body.type).toBe('Error');
      await serla.shutdown();
    });
  });

  describe('flush / shutdown', () => {
    it('drains queued events on flush', async () => {
      mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'a', distinctId: 'u1' });
      serla.track({ name: 'b', distinctId: 'u1' });
      expect(serla.pendingCount()).toBe(2);
      await serla.flush();
      expect(serla.pendingCount()).toBe(0);
      await serla.shutdown();
    });

    it('flushes pending events during shutdown', async () => {
      const { fn } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      serla.track({ name: 'last', distinctId: 'u1' });
      await serla.shutdown();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(serla.pendingCount()).toBe(0);
    });

    it('is safe to call shutdown more than once', async () => {
      mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.shutdown();
      await expect(serla.shutdown()).resolves.toBeUndefined();
    });

    it('does not send an empty batch when nothing is queued', async () => {
      const { fn } = mockFetch();
      const serla = new Serla({ apiKey: API_KEY, host: HOST, flushOnExit: false });
      await serla.flush();
      expect(fn).not.toHaveBeenCalled();
      await serla.shutdown();
    });
  });
});
