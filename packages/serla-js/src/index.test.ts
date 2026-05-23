import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Serla } from './index';

describe('Serla public API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    Serla.shutdown();
    vi.unstubAllGlobals();
  });

  describe('init', () => {
    it('throws on missing apiKey', () => {
      expect(() => Serla.init({} as any)).toThrow(/apiKey/);
    });

    it('ignores second init call', () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      Serla.init({ apiKey: 'sk_test2', autoPageviews: false, debug: true });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('super properties', () => {
    it('merges super properties into every track call', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.setProperties({ plan: 'pro', version: '1.0' });
      Serla.track('feature_used', { feature: 'export' });

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.events[0].properties).toMatchObject({
        plan: 'pro',
        version: '1.0',
        feature: 'export',
      });
    });

    it('event-specific properties override super properties', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.setProperties({ plan: 'pro' });
      Serla.track('downgrade', { plan: 'free' });

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.events[0].properties.plan).toBe('free');
    });

    it('unsetProperties removes specific keys', () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      Serla.setProperties({ a: 1, b: 2, c: 3 });
      Serla.unsetProperties(['b']);
      expect(Serla.getSuperProperties()).toEqual({ a: 1, c: 3 });
    });

    it('persists super properties across reset+init cycles', () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      Serla.setProperties({ persisted: true });
      Serla.shutdown();

      // Re-init should pick up persisted super properties from localStorage.
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      expect(Serla.getSuperProperties()).toEqual({ persisted: true });
    });

    it('reset() clears super properties', () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      Serla.setProperties({ a: 1 });
      Serla.reset();
      expect(Serla.getSuperProperties()).toEqual({});
    });
  });

  describe('identify + reset', () => {
    it('identify sets distinctId and persists it', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      Serla.identify('user_123');
      expect(Serla.getDistinctId()).toBe('user_123');

      // Should call /api/v1/identify
      await vi.waitFor(() => {
        const identifyCall = fetchMock.mock.calls.find(c =>
          c[0]?.toString().endsWith('/api/v1/identify')
        );
        expect(identifyCall).toBeTruthy();
      });
    });

    it('reset clears distinctId', () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false });
      Serla.identify('user_123');
      Serla.reset();
      expect(Serla.getDistinctId()).toBeNull();
    });
  });

  describe('group', () => {
    it('attaches $groups to every event', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.group('team', 'team_42');
      Serla.track('viewed_dashboard');

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const flushCall = fetchMock.mock.calls.find(c =>
        c[0]?.toString().endsWith('/api/v1/events/batch')
      );
      const body = JSON.parse(flushCall![1].body);
      const eventNamed = body.events.find((e: any) => e.name === 'viewed_dashboard');
      expect(eventNamed.properties.$groups).toEqual({ team: 'team_42' });
    });

    it('fires $group_identify when properties are supplied', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.group('team', 'team_42', { plan: 'pro' });

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const batchCall = fetchMock.mock.calls.find(c =>
        c[0]?.toString().endsWith('/api/v1/events/batch')
      );
      const body = JSON.parse(batchCall![1].body);
      const groupIdentify = body.events.find((e: any) => e.name === '$group_identify');
      expect(groupIdentify).toBeTruthy();
      expect(groupIdentify.properties.$groupProperties).toEqual({ plan: 'pro' });
    });

    it('unsetGroup removes the group association', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.group('team', 'team_42');
      Serla.unsetGroup('team');
      Serla.track('after_unset');

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const flushCall = fetchMock.mock.calls.find(c =>
        c[0]?.toString().endsWith('/api/v1/events/batch')
      );
      const body = JSON.parse(flushCall![1].body);
      const ev = body.events.find((e: any) => e.name === 'after_unset');
      expect(ev.properties.$groups).toBeUndefined();
    });
  });

  describe('opt-out', () => {
    it('blocks track when init optOut=true', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, optOut: true });
      Serla.track('event_1');
      // Give async queue a tick.
      await new Promise(r => setTimeout(r, 50));
      // Only the identify endpoint should ever hit fetch (but we didn't call identify),
      // so fetch should not have been called for events/batch.
      const batchCalls = fetchMock.mock.calls.filter(c =>
        c[0]?.toString().endsWith('/api/v1/events/batch')
      );
      expect(batchCalls).toHaveLength(0);
    });

    it('setOptOut(true) at runtime stops the queue', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.track('before_opt_out');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

      fetchMock.mockClear();
      Serla.setOptOut(true);
      Serla.track('after_opt_out');
      await new Promise(r => setTimeout(r, 50));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(Serla.isOptedOut()).toBe(true);
    });

    it('setOptOut(false) resumes tracking', async () => {
      Serla.init({ apiKey: 'sk_test', autoPageviews: false, batchSize: 1, flushIntervalMs: 100_000 });
      Serla.setOptOut(true);
      Serla.setOptOut(false);
      Serla.track('resumed');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(Serla.isOptedOut()).toBe(false);
    });
  });
});
