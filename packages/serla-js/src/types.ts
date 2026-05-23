export interface SerlaConfig {
  /** Project API key, e.g. "sk_live_..." */
  apiKey: string;
  /** Base URL of your Serla deployment. Defaults to https://serla.dev */
  host?: string;
  /** Auto-track navigations as $pageview events. Default: true */
  autoPageviews?: boolean;
  /** Auto-track user clicks. Default: false */
  autoClicks?: boolean;
  /** Auto-track JS errors and unhandled promise rejections as $error events. Default: false */
  errorTracking?: boolean;
  /** Record user sessions with rrweb for replay in the dashboard. Default: false */
  recordSessions?: boolean;
  /** Optional rrweb recording options - input masking, blocked element classes. */
  recordingOptions?: {
    maskAllInputs?: boolean;
    blockClass?: string;
    ignoreClass?: string;
  };
  /** Track $pageleave events on page unload with time-on-page. Default: true when autoPageviews is on */
  pageleaveTracking?: boolean;
  /** Inactivity period before a new session is started (ms). Default: 30 min */
  sessionTimeoutMs?: number;
  /** Max events per batch flush. Default: 20 */
  batchSize?: number;
  /** Interval to flush queued events (ms). Default: 10s */
  flushIntervalMs?: number;
  /** Log SDK activity to console. Default: false */
  debug?: boolean;
  /** Disable all tracking - for opted-out users / dev environments. Default: false */
  optOut?: boolean;
}

export type EventProperties = Record<string, unknown>;

export interface QueuedEvent {
  name: string;
  properties: EventProperties;
  distinctId?: string;
  sessionId: string;
  timestamp: string;
  pageUrl?: string;
  pagePath?: string;
  pageTitle?: string;
  referrer?: string;
  clickX?: number;
  clickY?: number;
  elementSelector?: string;
}

export interface ResolvedConfig extends Required<Omit<SerlaConfig, 'host' | 'recordingOptions'>> {
  host: string;
  recordingOptions: NonNullable<SerlaConfig['recordingOptions']>;
}
