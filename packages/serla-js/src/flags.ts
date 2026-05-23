/**
 * Feature flag client.
 *
 * Lazily fetches flags from /api/v1/flags on first call and caches them for
 * CACHE_TTL_MS so subsequent isEnabled/getFlag calls don't hit the network.
 * The cache also refreshes after identify() is called (since the new
 * distinct_id may change evaluation).
 */

import type { ResolvedConfig } from './types';

const CACHE_TTL_MS = 30_000;

export class FlagsClient {
  private config: ResolvedConfig;
  private cache: Record<string, boolean | string> = {};
  private fetchedAt = 0;
  private inFlight: Promise<void> | null = null;
  private distinctIdGetter: () => string | null;

  constructor(config: ResolvedConfig, distinctIdGetter: () => string | null) {
    this.config = config;
    this.distinctIdGetter = distinctIdGetter;
  }

  /** Force a refresh on the next read. Call this after identify() / reset(). */
  invalidate(): void {
    this.fetchedAt = 0;
    this.cache = {};
  }

  /**
   * Returns whatever the server resolved for the flag, or the provided fallback.
   * Boolean flag -> true | false. Multivariate -> variant key (string).
   *
   * If the cache is fresh, this resolves synchronously from cache. If not, it
   * fires off a background fetch and returns the fallback for now - subsequent
   * calls will see the updated value.
   */
  async getFlag<T extends boolean | string = boolean | string>(
    key: string,
    fallback: T = false as T,
  ): Promise<T> {
    await this.ensureFresh();
    const value = this.cache[key];
    if (value === undefined) return fallback;
    return value as T;
  }

  /** Convenience: returns true if the flag is on (boolean true OR any non-falsy variant). */
  async isEnabled(key: string): Promise<boolean> {
    const v = await this.getFlag(key, false);
    return v !== false && v !== '' && v !== 'off';
  }

  /** Returns the full cached flag map. */
  async getAllFlags(): Promise<Record<string, boolean | string>> {
    await this.ensureFresh();
    return { ...this.cache };
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.fetchedAt < CACHE_TTL_MS) return;
    if (this.inFlight) {
      await this.inFlight;
      return;
    }
    this.inFlight = this.fetchFlags();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchFlags(): Promise<void> {
    const distinctId = this.distinctIdGetter() || 'anonymous';
    try {
      const url = `${this.config.host}/api/v1/flags?distinct_id=${encodeURIComponent(distinctId)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) {
        if (this.config.debug) console.warn('[serla] flag fetch failed', res.status);
        return;
      }
      const data = (await res.json()) as { flags?: Record<string, boolean | string> };
      this.cache = data.flags || {};
      this.fetchedAt = Date.now();
      if (this.config.debug) console.log('[serla] flags refreshed', this.cache);
    } catch (err) {
      if (this.config.debug) console.warn('[serla] flag fetch error', err);
    }
  }
}
