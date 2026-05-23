export interface SerlaConfig {
  /** Project API key, e.g. "sk_live_..." */
  apiKey: string;
  /** Base URL of your Serla deployment. Defaults to https://serla.dev */
  host?: string;
  /** Max events per batch flush. Default: 50 */
  batchSize?: number;
  /** Interval to flush queued events (ms). Default: 5000 */
  flushIntervalMs?: number;
  /** Log SDK activity to console. Default: false */
  debug?: boolean;
  /**
   * Auto-flush on Node's `beforeExit` event so short-lived processes don't lose
   * events. Default: true. No-op on Edge runtimes where `process.on` is absent.
   */
  flushOnExit?: boolean;
}

export type EventProperties = Record<string, unknown>;

export interface TrackPayload {
  /** Event name. Required. */
  name: string;
  /** User identifier. Required server-side - there's no anonymous-id fallback. */
  distinctId: string;
  /** Arbitrary event properties. `$groups: { team: 'team_42' }` is reserved for group analytics. */
  properties?: EventProperties;
  /** Override the event timestamp. Defaults to `new Date()` at enqueue time. */
  timestamp?: Date | string;
}

export interface QueuedEvent {
  name: string;
  distinctId: string;
  properties: EventProperties;
  timestamp: string;
}

export interface ResolvedConfig {
  apiKey: string;
  host: string;
  batchSize: number;
  flushIntervalMs: number;
  debug: boolean;
  flushOnExit: boolean;
}
