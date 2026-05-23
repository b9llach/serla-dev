/**
 * Serla Analytics SDK for TypeScript/JavaScript
 * Simple, privacy-focused analytics
 *
 * Methods:
 *   - track(name, ...)  - Queue an event for batched sending (efficient for high volume)
 *   - send(name, ...)   - Send a single event immediately (for critical events)
 *   - identify(id, props) - Identify a user
 *   - flush()           - Force send all queued events
 *   - reset()           - Clear user identity and session
 *   - getSessionId()    - Get current session ID
 *   - getUserId()       - Get current user ID
 *   - setDebug(enabled) - Enable/disable debug mode
 *
 * Usage:
 *   const serla = new Serla('sk_live_...');
 *   serla.track('page_view', { distinctId: 'user_123' });  // Batched
 *   await serla.send('purchase', { properties: { amount: 99.99 } });  // Immediate
 */

interface TrackOptions {
  distinctId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
  pageUrl?: string;
  pagePath?: string;
  pageTitle?: string;
  referrer?: string;
  // Click tracking fields
  clickX?: number;
  clickY?: number;
  elementSelector?: string;
}

interface IdentifyOptions {
  [key: string]: unknown;
}

interface SerlaConfig {
  endpoint?: string;
  flushInterval?: number;
  maxBatchSize?: number;
  batchSize?: number; // Alias for maxBatchSize
  debug?: boolean;
  autoTrackPageViews?: boolean;
  autoTrackClicks?: boolean;
  respectDoNotTrack?: boolean;
  sessionTimeout?: number; // In minutes
}

interface SendResponse {
  success: boolean;
  eventId: string;
  sessionId: string;
}

interface SessionData {
  sessionId: string;
  userId: string | null;
  lastActivity: number;
}

interface SerlaError extends Error {
  status?: number;
}

export class Serla {
  private apiKey: string;
  private endpoint: string;
  private queue: Array<{ name: string; options: TrackOptions }> = [];
  private flushInterval: number;
  private maxBatchSize: number;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private debug: boolean;
  private autoTrackPageViews: boolean;
  private autoTrackClicks: boolean;
  private respectDoNotTrack: boolean;
  private sessionTimeout: number;
  private disabled: boolean = false;
  private userId: string | null = null;
  private sessionId: string | null = null;
  private lastActivityTime: number = Date.now();

  constructor(apiKey: string, config: SerlaConfig = {}) {
    this.apiKey = apiKey;
    this.endpoint = config.endpoint || 'https://serla.dev/api/v1';
    this.flushInterval = config.flushInterval || 5000;
    this.maxBatchSize = config.maxBatchSize || config.batchSize || 10;
    this.debug = config.debug || false;
    this.autoTrackPageViews = config.autoTrackPageViews || false;
    this.autoTrackClicks = config.autoTrackClicks || false;
    this.respectDoNotTrack = config.respectDoNotTrack !== false; // Default true
    this.sessionTimeout = (config.sessionTimeout || 30) * 60 * 1000; // Convert minutes to ms

    // Check Do Not Track
    if (this.respectDoNotTrack && this.isDoNotTrackEnabled()) {
      this.log('Do Not Track is enabled, tracking disabled');
      this.disabled = true;
      return;
    }

    // Initialize session
    this.initSession();

    // Auto-track page views if enabled
    if (this.autoTrackPageViews && typeof window !== 'undefined') {
      this.setupAutoPageTracking();
    }

    // Auto-track clicks if enabled
    if (this.autoTrackClicks && typeof document !== 'undefined') {
      this.setupAutoClickTracking();
    }

    // Flush on page unload using sendBeacon for reliability
    if (typeof window !== 'undefined') {
      const flushOnUnload = () => this.flushSync();
      window.addEventListener('beforeunload', flushOnUnload);
      window.addEventListener('pagehide', flushOnUnload);
      // Also handle visibility change for mobile browsers
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushSync();
        }
      });
    }
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[Serla]', ...args);
    }
  }

  private isDoNotTrackEnabled(): boolean {
    if (typeof navigator === 'undefined') return false;
    return navigator.doNotTrack === '1' ||
           navigator.doNotTrack === 'yes' ||
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           (typeof window !== 'undefined' && (window as any).doNotTrack === '1');
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private initSession(): void {
    // Try to restore session from storage
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('serla_session');
      if (stored) {
        try {
          const data: SessionData = JSON.parse(stored);
          const now = Date.now();
          // Check if session is still valid
          if (data.lastActivity && (now - data.lastActivity) < this.sessionTimeout) {
            this.sessionId = data.sessionId;
            this.userId = data.userId;
            this.lastActivityTime = data.lastActivity;
            this.log('Restored session:', this.sessionId);
            return;
          }
        } catch {
          // Invalid stored data, create new session
        }
      }
    }

    // Create new session
    this.sessionId = 'sess_' + this.generateId();
    this.log('Created new session:', this.sessionId);
    this.saveSession();
  }

  private saveSession(): void {
    if (typeof localStorage !== 'undefined') {
      const data: SessionData = {
        sessionId: this.sessionId!,
        userId: this.userId,
        lastActivity: this.lastActivityTime,
      };
      localStorage.setItem('serla_session', JSON.stringify(data));
    }
  }

  private updateActivity(): void {
    const now = Date.now();
    // Check if session has timed out
    if ((now - this.lastActivityTime) >= this.sessionTimeout) {
      this.log('Session timed out, creating new session');
      this.sessionId = 'sess_' + this.generateId();
    }
    this.lastActivityTime = now;
    this.saveSession();
  }

  private setupAutoPageTracking(): void {
    // Track initial page view
    this.trackPageView();

    // Track on history changes (SPA navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPushState.apply(history, args);
      this.trackPageView();
    };

    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      originalReplaceState.apply(history, args);
      this.trackPageView();
    };

    window.addEventListener('popstate', () => {
      this.trackPageView();
    });
  }

  private setupAutoClickTracking(): void {
    document.addEventListener('click', (e: MouseEvent) => {
      if (this.disabled) return;

      const target = e.target;
      if (!target || !(target instanceof Element)) return;

      // Find the nearest clickable element (button, link, etc.)
      const clickable = target.closest('a, button, [role="button"], input[type="submit"], input[type="button"]');
      const element = clickable || target;

      this.track('$click', {
        clickX: Math.round(e.clientX),
        clickY: Math.round(e.clientY),
        elementSelector: this.getSelector(element as HTMLElement),
        properties: {
          tagName: element.tagName.toLowerCase(),
          text: element.textContent?.slice(0, 100)?.trim() || undefined,
          href: (element as HTMLAnchorElement).href || undefined,
        }
      });
    }, { capture: true });
  }

  setDebug(enabled: boolean): void {
    this.debug = enabled;
    this.log('Debug mode', enabled ? 'enabled' : 'disabled');
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  reset(): void {
    this.log('Resetting identity and session');
    this.userId = null;
    this.sessionId = 'sess_' + this.generateId();
    this.lastActivityTime = Date.now();
    this.saveSession();
    this.log('New session:', this.sessionId);
  }

  async track(name: string, options: TrackOptions = {}): Promise<void> {
    if (this.disabled) return;

    this.updateActivity();
    this.log('Tracking event:', name, options);

    this.queue.push({ name, options });

    if (this.queue.length >= this.maxBatchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  async send(name: string, options: TrackOptions = {}): Promise<SendResponse> {
    if (this.disabled) {
      return { success: false, eventId: '', sessionId: '' } as SendResponse;
    }

    this.updateActivity();
    this.log('Sending event immediately:', name, options);

    const event: Record<string, unknown> = {
      name,
      distinctId: options.distinctId || this.userId,
      sessionId: options.sessionId || this.sessionId,
      properties: options.properties || {},
      pageUrl: options.pageUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
      pagePath: options.pagePath || (typeof window !== 'undefined' ? window.location.pathname : undefined),
      pageTitle: options.pageTitle || (typeof document !== 'undefined' ? document.title : undefined),
      referrer: options.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
      clickX: options.clickX,
      clickY: options.clickY,
      elementSelector: options.elementSelector,
    };

    if (options.timestamp) {
      event.timestamp = options.timestamp;
    }

    const response = await fetch(`${this.endpoint}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error: SerlaError = new Error(`Send failed: ${response.statusText}`);
      error.status = response.status;
      this.log('Send failed:', error);
      throw error;
    }

    const result = await response.json();
    this.log('Send successful:', result);
    return result;
  }

  async identify(distinctId: string, properties: IdentifyOptions = {}): Promise<void> {
    if (this.disabled) return;

    this.log('Identifying user:', distinctId, properties);
    this.userId = distinctId;
    this.saveSession();

    const response = await fetch(`${this.endpoint}/identify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ distinctId, properties }),
    });

    if (!response.ok) {
      const error: SerlaError = new Error(`Identify failed: ${response.statusText}`);
      error.status = response.status;
      this.log('Identify failed:', error);
      throw error;
    }

    this.log('Identify successful');
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  // Synchronous flush using sendBeacon for page unload scenarios
  private flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const events = this.queue.splice(0, this.maxBatchSize);
    this.log('Flushing (sync)', events.length, 'events');

    const payload = {
      events: events.map(({ name, options }) => ({
        name,
        distinctId: options.distinctId || this.userId,
        sessionId: options.sessionId || this.sessionId,
        properties: options.properties || {},
        timestamp: options.timestamp,
        pageUrl: options.pageUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
        pagePath: options.pagePath || (typeof window !== 'undefined' ? window.location.pathname : undefined),
        pageTitle: options.pageTitle || (typeof document !== 'undefined' ? document.title : undefined),
        referrer: options.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
        clickX: options.clickX,
        clickY: options.clickY,
        elementSelector: options.elementSelector,
      })),
    };

    // Use sendBeacon for reliable delivery during page unload
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = `${this.endpoint}/events/batch?api_key=${this.apiKey}`;
      const sent = navigator.sendBeacon(url, blob);
      if (sent) {
        this.log('Flush (sendBeacon) successful');
      } else {
        // sendBeacon failed, re-queue events
        this.queue.unshift(...events);
        this.log('Flush (sendBeacon) failed, events re-queued');
      }
    } else {
      // Fallback: re-queue and hope for next opportunity
      this.queue.unshift(...events);
      this.log('sendBeacon not available, events re-queued');
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const events = this.queue.splice(0, this.maxBatchSize);
    this.log('Flushing', events.length, 'events');

    const payload = {
      events: events.map(({ name, options }) => ({
        name,
        distinctId: options.distinctId || this.userId,
        sessionId: options.sessionId || this.sessionId,
        properties: options.properties || {},
        timestamp: options.timestamp,
        pageUrl: options.pageUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
        pagePath: options.pagePath || (typeof window !== 'undefined' ? window.location.pathname : undefined),
        pageTitle: options.pageTitle || (typeof document !== 'undefined' ? document.title : undefined),
        referrer: options.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
        // Click tracking fields
        clickX: options.clickX,
        clickY: options.clickY,
        elementSelector: options.elementSelector,
      })),
    };

    try {
      const response = await fetch(`${this.endpoint}/events/batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Re-queue failed events
        this.queue.unshift(...events);
        const error: SerlaError = new Error(`Batch failed: ${response.statusText}`);
        error.status = response.status;
        this.log('Flush failed:', error);
        throw error;
      }

      this.log('Flush successful');
    } catch (error) {
      // Re-queue on network failure
      this.queue.unshift(...events);
      throw error;
    }
  }

  // Auto-track page views
  trackPageView(options: Omit<TrackOptions, 'pageUrl' | 'pagePath' | 'pageTitle'> = {}): void {
    if (this.disabled) return;

    this.track('$pageview', {
      ...options,
      pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
    });
  }

  // Track click with coordinates
  trackClick(element: HTMLElement, options: TrackOptions = {}): void {
    if (this.disabled) return;

    const rect = element.getBoundingClientRect();
    this.track('$click', {
      ...options,
      clickX: Math.round(rect.left + rect.width / 2),
      clickY: Math.round(rect.top + rect.height / 2),
      elementSelector: this.getSelector(element),
    });
  }

  private getSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ').join('.')}`;
    return element.tagName.toLowerCase();
  }
}

export default Serla;
