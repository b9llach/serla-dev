import type { EventProperties, ResolvedConfig, SerlaConfig, QueuedEvent } from './types';
import { storageGet, storageRemove, storageSet } from './storage';
import { getSessionId } from './session';
import { EventQueue } from './queue';
import { watchClicks, watchNavigation } from './autocapture';
import { watchErrors, type CapturedError } from './error-tracking';
import { SessionRecorder } from './recording';
import { FlagsClient } from './flags';

const DISTINCT_ID_KEY = 'distinct_id';
const SUPER_PROPERTIES_KEY = 'super_properties';
const GROUPS_KEY = 'groups';
const OPT_OUT_KEY = 'opt_out';

const DEFAULTS = {
  host: 'https://serla.dev',
  autoPageviews: true,
  autoClicks: false,
  errorTracking: false,
  recordSessions: false,
  recordingOptions: {} as NonNullable<SerlaConfig['recordingOptions']>,
  pageleaveTracking: true,
  sessionTimeoutMs: 30 * 60 * 1000,
  batchSize: 20,
  flushIntervalMs: 10_000,
  debug: false,
  optOut: false,
};

class SerlaClient {
  private config: ResolvedConfig | null = null;
  private queue: EventQueue | null = null;
  private distinctId: string | null = null;
  private superProperties: EventProperties = {};
  /** groupType -> groupId. Auto-attached to every event as $groups.<type> = id. */
  private groups: Record<string, string> = {};
  private teardowns: Array<() => void> = [];
  /** Wall-clock ms of the last $pageview - used to compute $pageleave duration. */
  private lastPageviewAt: number | null = null;
  /** Path of the last $pageview - we re-emit pageleave when path changes. */
  private lastPageviewPath: string | null = null;
  /** Runtime opt-out flag. Reads from localStorage at init, mutable via setOptOut(). */
  private optedOut = false;
  /** rrweb session recorder, null when recordSessions is off. */
  private recorder: SessionRecorder | null = null;
  /** Feature flag client - lazy-fetched on first call to getFeatureFlag. */
  private flags: FlagsClient | null = null;

  init(config: SerlaConfig): void {
    if (this.config) {
      if (config.debug) console.warn('[serla] init() called more than once - ignoring');
      return;
    }
    if (!config.apiKey) {
      throw new Error('Serla.init: apiKey is required');
    }
    this.config = {
      apiKey: config.apiKey,
      host: (config.host ?? DEFAULTS.host).replace(/\/$/, ''),
      autoPageviews: config.autoPageviews ?? DEFAULTS.autoPageviews,
      autoClicks: config.autoClicks ?? DEFAULTS.autoClicks,
      errorTracking: config.errorTracking ?? DEFAULTS.errorTracking,
      recordSessions: config.recordSessions ?? DEFAULTS.recordSessions,
      recordingOptions: config.recordingOptions ?? DEFAULTS.recordingOptions,
      pageleaveTracking: config.pageleaveTracking ?? DEFAULTS.pageleaveTracking,
      sessionTimeoutMs: config.sessionTimeoutMs ?? DEFAULTS.sessionTimeoutMs,
      batchSize: config.batchSize ?? DEFAULTS.batchSize,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      debug: config.debug ?? DEFAULTS.debug,
      optOut: config.optOut ?? DEFAULTS.optOut,
    };

    // Resolve opt-out: localStorage wins (user revoked) > config flag.
    const persistedOptOut = storageGet(OPT_OUT_KEY);
    this.optedOut = persistedOptOut === 'true' || this.config.optOut;

    if (this.optedOut) {
      if (this.config.debug) console.log('[serla] opted out - tracking disabled');
      return;
    }

    this.distinctId = storageGet(DISTINCT_ID_KEY);
    this.superProperties = this.loadSuperProperties();
    this.groups = this.loadGroups();
    this.queue = new EventQueue(this.config);
    this.queue.start();

    if (this.config.autoPageviews) {
      this.teardowns.push(
        watchNavigation(() => {
          this.maybeEmitPageleave();
          this.track('$pageview');
          this.markPageview();
        })
      );
    }
    if (this.config.autoClicks) {
      this.teardowns.push(
        watchClicks(({ x, y, selector }) => {
          const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : undefined;
          const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : undefined;
          this.track(
            '$autoclick',
            { viewportWidth, viewportHeight },
            { clickX: x, clickY: y, elementSelector: selector }
          );
        })
      );
    }
    if (this.config.errorTracking) {
      this.teardowns.push(
        watchErrors((err: CapturedError) =>
          this.track('$error', {
            message: err.message,
            source: err.source,
            line: err.line,
            col: err.col,
            stack: err.stack,
            errorType: err.errorType,
          })
        )
      );
    }
    if (this.config.pageleaveTracking && typeof window !== 'undefined') {
      const onHide = () => this.maybeEmitPageleave();
      window.addEventListener('pagehide', onHide);
      this.teardowns.push(() => window.removeEventListener('pagehide', onHide));
    }
    if (this.config.recordSessions && typeof window !== 'undefined') {
      this.recorder = new SessionRecorder(
        this.config,
        this.config.recordingOptions,
        () => this.distinctId,
      );
      void this.recorder.start();
      this.teardowns.push(() => this.recorder?.stop());
    }

    this.flags = new FlagsClient(this.config, () => this.distinctId);

    if (this.config.debug) console.log('[serla] initialized', { host: this.config.host });
  }

  track(name: string, properties: EventProperties = {}, extras: Partial<QueuedEvent> = {}): void {
    if (!this.config || !this.queue) {
      if (typeof console !== 'undefined') console.warn('[serla] track() called before init()');
      return;
    }
    if (this.optedOut) return;
    if (!name) {
      if (this.config.debug) console.warn('[serla] track() called with empty name');
      return;
    }

    const sessionId = getSessionId(this.config.sessionTimeoutMs);
    // Merge order: super properties < group context < event-specific properties.
    // $groups is a reserved key shaped like { teamId: 'team_123', orgId: 'org_42' }.
    const groupContext = Object.keys(this.groups).length > 0 ? { $groups: { ...this.groups } } : {};
    const mergedProperties = { ...this.superProperties, ...groupContext, ...properties };

    const ev: QueuedEvent = {
      name,
      properties: mergedProperties,
      distinctId: this.distinctId ?? undefined,
      sessionId,
      timestamp: new Date().toISOString(),
      ...this.collectPageContext(),
      ...extras,
    };
    this.queue.enqueue(ev);
    if (this.config.debug) console.log('[serla] track', name, ev);
  }

  identify(distinctId: string, properties: EventProperties = {}): void {
    if (!this.config) {
      if (typeof console !== 'undefined') console.warn('[serla] identify() called before init()');
      return;
    }
    if (this.optedOut) return;
    if (!distinctId) {
      if (this.config.debug) console.warn('[serla] identify() called with empty distinctId');
      return;
    }

    this.distinctId = distinctId;
    storageSet(DISTINCT_ID_KEY, distinctId);
    // Identity changed - new flag evaluations apply.
    this.flags?.invalidate();

    void fetch(`${this.config.host}/api/v1/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ distinctId, properties }),
      keepalive: true,
    }).catch(err => {
      if (this.config?.debug) console.warn('[serla] identify failed', err);
    });

    if (this.config.debug) console.log('[serla] identify', distinctId, properties);
  }

  /**
   * Merge super properties - auto-attached to every subsequent track() event.
   * Persisted to localStorage so they survive page reloads.
   *
   *   Serla.setProperties({ plan: 'pro', experiment: 'variant_b' });
   *   Serla.track('feature_used'); // includes plan + experiment
   *
   * Use this for cross-cutting context (user tier, feature flag assignment,
   * app version) so you don't have to pass it to every track() call.
   */
  setProperties(properties: EventProperties): void {
    this.superProperties = { ...this.superProperties, ...properties };
    storageSet(SUPER_PROPERTIES_KEY, JSON.stringify(this.superProperties));
    if (this.config?.debug) console.log('[serla] setProperties', this.superProperties);
  }

  /** Remove specific super properties. Pass an array of keys. */
  unsetProperties(keys: string[]): void {
    for (const k of keys) delete this.superProperties[k];
    storageSet(SUPER_PROPERTIES_KEY, JSON.stringify(this.superProperties));
    if (this.config?.debug) console.log('[serla] unsetProperties', keys);
  }

  getSuperProperties(): EventProperties {
    return { ...this.superProperties };
  }

  /**
   * Associate the user with a group (team, org, workspace, etc).
   * Subsequent events include $groups: { [groupType]: groupId } so you can
   * slice analytics by team without a separate "team_id" property on every
   * track() call.
   *
   *   Serla.group('team', 'team_123', { plan: 'pro', seatCount: 12 });
   *
   * Pass properties to also push group-level attributes (sent as an
   * identify-like call to the server keyed on group type+id).
   */
  group(groupType: string, groupId: string, properties: EventProperties = {}): void {
    if (!this.config) {
      if (typeof console !== 'undefined') console.warn('[serla] group() called before init()');
      return;
    }
    if (this.optedOut) return;
    if (!groupType || !groupId) {
      if (this.config.debug) console.warn('[serla] group() requires groupType and groupId');
      return;
    }

    this.groups[groupType] = groupId;
    storageSet(GROUPS_KEY, JSON.stringify(this.groups));

    // Fire a $group_identify event so the server can record group properties.
    // No dedicated /api/v1/group endpoint - we ride on the events pipeline
    // with a reserved event name. Keeps the server surface area smaller.
    if (Object.keys(properties).length > 0) {
      this.track('$group_identify', {
        $groupType: groupType,
        $groupId: groupId,
        $groupProperties: properties,
      });
    }

    if (this.config.debug) console.log('[serla] group', groupType, groupId, properties);
  }

  /** Remove a group association. */
  unsetGroup(groupType: string): void {
    delete this.groups[groupType];
    storageSet(GROUPS_KEY, JSON.stringify(this.groups));
  }

  /** Clear the persisted distinctId AND super properties AND groups. Use on logout. */
  reset(): void {
    this.distinctId = null;
    this.superProperties = {};
    this.groups = {};
    storageRemove(DISTINCT_ID_KEY);
    storageRemove(SUPER_PROPERTIES_KEY);
    storageRemove(GROUPS_KEY);
    this.flags?.invalidate();
    if (this.config?.debug) console.log('[serla] reset');
  }

  /**
   * Get a feature flag's value for the current user. Boolean flags return
   * true/false; multivariate flags return the variant key string.
   * Returns the fallback if the flag doesn't exist or hasn't been fetched yet.
   *
   *   const variant = await Serla.getFeatureFlag('new-checkout', 'control');
   *   if (variant === 'variant_a') showNewFlow();
   */
  async getFeatureFlag<T extends boolean | string = boolean | string>(
    key: string,
    fallback: T = false as T,
  ): Promise<T> {
    if (!this.flags) return fallback;
    return this.flags.getFlag(key, fallback);
  }

  /** Convenience: returns true if the flag is on for the current user. */
  async isFeatureEnabled(key: string): Promise<boolean> {
    if (!this.flags) return false;
    return this.flags.isEnabled(key);
  }

  /** Returns the full flag map for the current user. */
  async getAllFeatureFlags(): Promise<Record<string, boolean | string>> {
    if (!this.flags) return {};
    return this.flags.getAllFlags();
  }

  /**
   * Track an LLM generation. Fire-and-forget POST to /api/v1/llm.
   *
   *   Serla.trackLLM({
   *     model: 'gpt-4o',
   *     provider: 'openai',
   *     input: messages,
   *     output: response.choices[0].message,
   *     inputTokens: response.usage.prompt_tokens,
   *     outputTokens: response.usage.completion_tokens,
   *     latencyMs: Date.now() - startedAt,
   *   });
   */
  trackLLM(generation: {
    model: string;
    provider?: string;
    traceId?: string;
    parentId?: string;
    input?: unknown;
    output?: unknown;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    status?: 'success' | 'error';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.config) {
      if (typeof console !== 'undefined') console.warn('[serla] trackLLM() called before init()');
      return;
    }
    if (this.optedOut) return;

    const body = JSON.stringify({
      ...generation,
      distinctId: this.distinctId ?? undefined,
      timestamp: new Date().toISOString(),
    });

    void fetch(`${this.config.host}/api/v1/llm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body,
      keepalive: true,
    }).catch(err => {
      if (this.config?.debug) console.warn('[serla] trackLLM failed', err);
    });
  }

  /**
   * Capture a JavaScript exception. Sends an error report to the dashboard
   * grouped by stack-trace fingerprint. Use inside a catch block.
   *
   *   try { ... } catch (err) { Serla.captureException(err, { context: 'checkout' }) }
   */
  captureException(error: unknown, context?: Record<string, unknown>): void {
    if (!this.config) {
      if (typeof console !== 'undefined') console.warn('[serla] captureException() called before init()');
      return;
    }
    if (this.optedOut) return;

    const err = error instanceof Error ? error : new Error(String(error));
    const body = JSON.stringify({
      message: err.message,
      type: err.name,
      stack: err.stack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      distinctId: this.distinctId ?? undefined,
      metadata: context,
      timestamp: new Date().toISOString(),
    });

    void fetch(`${this.config.host}/api/v1/errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body,
      keepalive: true,
    }).catch(err => {
      if (this.config?.debug) console.warn('[serla] captureException failed', err);
    });
  }

  /**
   * Runtime opt-out toggle. Persists to localStorage so the choice survives
   * reloads. Use to hook into consent-banner workflows:
   *
   *   onConsentGiven(() => Serla.setOptOut(false));
   *   onConsentRevoked(() => Serla.setOptOut(true));
   */
  setOptOut(value: boolean): void {
    this.optedOut = value;
    if (value) {
      storageSet(OPT_OUT_KEY, 'true');
      // Flush whatever's in the queue under "pre-opt-out events should still
      // deliver", then stop the queue.
      void this.queue?.flush();
      this.queue?.stop();
      this.queue = null;
    } else {
      storageRemove(OPT_OUT_KEY);
      if (this.config && !this.queue) {
        this.queue = new EventQueue(this.config);
        this.queue.start();
      }
    }
    if (this.config?.debug) console.log('[serla] setOptOut', value);
  }

  isOptedOut(): boolean {
    return this.optedOut;
  }

  async flush(): Promise<void> {
    if (this.queue) await this.queue.flush();
  }

  shutdown(): void {
    this.maybeEmitPageleave();
    for (const teardown of this.teardowns) teardown();
    this.teardowns = [];
    this.queue?.stop();
    this.queue = null;
    this.config = null;
    this.distinctId = null;
    this.superProperties = {};
    this.lastPageviewAt = null;
    this.lastPageviewPath = null;
  }

  getDistinctId(): string | null {
    return this.distinctId;
  }

  private collectPageContext(): Partial<QueuedEvent> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return {};
    return {
      pageUrl: window.location.href,
      pagePath: window.location.pathname,
      pageTitle: document.title,
      referrer: document.referrer || undefined,
    };
  }

  private loadSuperProperties(): EventProperties {
    const raw = storageGet(SUPER_PROPERTIES_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private loadGroups(): Record<string, string> {
    const raw = storageGet(GROUPS_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      // Whitelist to string -> string entries.
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  private markPageview(): void {
    this.lastPageviewAt = Date.now();
    this.lastPageviewPath = typeof window !== 'undefined' ? window.location.pathname : null;
  }

  /** Emit $pageleave if we recorded an entry to this page. No-op otherwise. */
  private maybeEmitPageleave(): void {
    if (!this.lastPageviewAt) return;
    const timeOnPageMs = Date.now() - this.lastPageviewAt;
    // Ignore pageleave events shorter than 200ms - they're usually bounces from
    // the entry firing immediately after init.
    if (timeOnPageMs < 200) return;
    this.track(
      '$pageleave',
      { timeOnPageMs, leftPath: this.lastPageviewPath ?? undefined }
    );
    this.lastPageviewAt = null;
  }
}

const client = new SerlaClient();

export const Serla = {
  init: (config: SerlaConfig) => client.init(config),
  track: (name: string, properties?: EventProperties) => client.track(name, properties),
  identify: (distinctId: string, properties?: EventProperties) =>
    client.identify(distinctId, properties),
  group: (groupType: string, groupId: string, properties?: EventProperties) =>
    client.group(groupType, groupId, properties),
  unsetGroup: (groupType: string) => client.unsetGroup(groupType),
  setProperties: (properties: EventProperties) => client.setProperties(properties),
  unsetProperties: (keys: string[]) => client.unsetProperties(keys),
  getSuperProperties: () => client.getSuperProperties(),
  reset: () => client.reset(),
  setOptOut: (value: boolean) => client.setOptOut(value),
  isOptedOut: () => client.isOptedOut(),
  flush: () => client.flush(),
  shutdown: () => client.shutdown(),
  getDistinctId: () => client.getDistinctId(),
  getFeatureFlag: <T extends boolean | string = boolean | string>(key: string, fallback?: T) =>
    client.getFeatureFlag(key, fallback),
  isFeatureEnabled: (key: string) => client.isFeatureEnabled(key),
  getAllFeatureFlags: () => client.getAllFeatureFlags(),
  trackLLM: (generation: Parameters<SerlaClient['trackLLM']>[0]) =>
    client.trackLLM(generation),
  captureException: (error: unknown, context?: Record<string, unknown>) =>
    client.captureException(error, context),
};

export default Serla;
export type { SerlaConfig, EventProperties } from './types';
