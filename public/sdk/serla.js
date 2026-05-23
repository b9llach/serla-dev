/**
 * Serla Analytics SDK for JavaScript
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

class Serla {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.endpoint = config.endpoint || 'https://serla.dev/api/v1';
    this.flushInterval = config.flushInterval || 5000;
    this.maxBatchSize = config.maxBatchSize || config.batchSize || 10;
    this.debug = config.debug || false;
    this.autoTrackPageViews = config.autoTrackPageViews || false;
    this.autoTrackClicks = config.autoTrackClicks || false;
    this.respectDoNotTrack = config.respectDoNotTrack !== false; // Default true
    this.sessionTimeout = (config.sessionTimeout || 30) * 60 * 1000; // Convert minutes to ms

    this.queue = [];
    this.flushTimer = null;
    this.userId = null;
    this.sessionId = null;
    this.lastActivityTime = Date.now();

    // Check Do Not Track
    if (this.respectDoNotTrack && this._isDoNotTrackEnabled()) {
      this._log('Do Not Track is enabled, tracking disabled');
      this.disabled = true;
      return;
    }

    this.disabled = false;

    // Initialize session
    this._initSession();

    // Auto-track page views if enabled
    if (this.autoTrackPageViews && typeof window !== 'undefined') {
      this._setupAutoPageTracking();
    }

    // Auto-track clicks if enabled
    if (this.autoTrackClicks && typeof document !== 'undefined') {
      this._setupAutoClickTracking();
    }

    // Flush on page unload using sendBeacon for reliability
    if (typeof window !== 'undefined') {
      const flushOnUnload = () => this._flushSync();
      window.addEventListener('beforeunload', flushOnUnload);
      window.addEventListener('pagehide', flushOnUnload);
      // Also handle visibility change for mobile browsers
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this._flushSync();
        }
      });
    }
  }

  _log(...args) {
    if (this.debug) {
      console.log('[Serla]', ...args);
    }
  }

  _isDoNotTrackEnabled() {
    if (typeof navigator === 'undefined') return false;
    return navigator.doNotTrack === '1' ||
           navigator.doNotTrack === 'yes' ||
           (typeof window !== 'undefined' && window.doNotTrack === '1');
  }

  _generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  _initSession() {
    // Try to restore session from storage
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('serla_session');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          const now = Date.now();
          // Check if session is still valid
          if (data.lastActivity && (now - data.lastActivity) < this.sessionTimeout) {
            this.sessionId = data.sessionId;
            this.userId = data.userId;
            this.lastActivityTime = data.lastActivity;
            this._log('Restored session:', this.sessionId);
            return;
          }
        } catch {
          // Invalid stored data, create new session
        }
      }
    }

    // Create new session
    this.sessionId = 'sess_' + this._generateId();
    this._log('Created new session:', this.sessionId);
    this._saveSession();
  }

  _saveSession() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('serla_session', JSON.stringify({
        sessionId: this.sessionId,
        userId: this.userId,
        lastActivity: this.lastActivityTime
      }));
    }
  }

  _updateActivity() {
    const now = Date.now();
    // Check if session has timed out
    if ((now - this.lastActivityTime) >= this.sessionTimeout) {
      this._log('Session timed out, creating new session');
      this.sessionId = 'sess_' + this._generateId();
    }
    this.lastActivityTime = now;
    this._saveSession();
  }

  _setupAutoPageTracking() {
    // Track initial page view
    this.trackPageView();

    // Track on history changes (SPA navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.trackPageView();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.trackPageView();
    };

    window.addEventListener('popstate', () => {
      this.trackPageView();
    });
  }

  _setupAutoClickTracking() {
    document.addEventListener('click', (e) => {
      if (this.disabled) return;

      const target = e.target;
      if (!target || !(target instanceof Element)) return;

      // Find the nearest clickable element (button, link, etc.)
      const clickable = target.closest('a, button, [role="button"], input[type="submit"], input[type="button"]');
      const element = clickable || target;

      this.track('$click', {
        clickX: Math.round(e.clientX),
        clickY: Math.round(e.clientY),
        elementSelector: this.getSelector(element),
        properties: {
          tagName: element.tagName.toLowerCase(),
          text: element.textContent?.slice(0, 100)?.trim() || undefined,
          href: element.href || undefined,
        }
      });
    }, { capture: true });
  }

  setDebug(enabled) {
    this.debug = enabled;
    this._log('Debug mode', enabled ? 'enabled' : 'disabled');
  }

  getSessionId() {
    return this.sessionId;
  }

  getUserId() {
    return this.userId;
  }

  reset() {
    this._log('Resetting identity and session');
    this.userId = null;
    this.sessionId = 'sess_' + this._generateId();
    this.lastActivityTime = Date.now();
    this._saveSession();
    this._log('New session:', this.sessionId);
  }

  async track(name, options = {}) {
    if (this.disabled) return;

    this._updateActivity();
    this._log('Tracking event:', name, options);

    this.queue.push({ name, options });

    if (this.queue.length >= this.maxBatchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  async send(name, options = {}) {
    if (this.disabled) return { success: false, reason: 'tracking_disabled' };

    this._updateActivity();
    this._log('Sending event immediately:', name, options);

    const event = {
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
      const error = new Error(`Send failed: ${response.statusText}`);
      error.status = response.status;
      this._log('Send failed:', error);
      throw error;
    }

    const result = await response.json();
    this._log('Send successful:', result);
    return result;
  }

  async identify(distinctId, properties = {}) {
    if (this.disabled) return;

    this._log('Identifying user:', distinctId, properties);
    this.userId = distinctId;
    this._saveSession();

    const response = await fetch(`${this.endpoint}/identify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ distinctId, properties }),
    });

    if (!response.ok) {
      const error = new Error(`Identify failed: ${response.statusText}`);
      error.status = response.status;
      this._log('Identify failed:', error);
      throw error;
    }

    this._log('Identify successful');
  }

  scheduleFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  // Synchronous flush using sendBeacon for page unload scenarios
  _flushSync() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const events = this.queue.splice(0, this.maxBatchSize);
    this._log('Flushing (sync)', events.length, 'events');

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
        this._log('Flush (sendBeacon) successful');
      } else {
        // sendBeacon failed, re-queue events
        this.queue.unshift(...events);
        this._log('Flush (sendBeacon) failed, events re-queued');
      }
    } else {
      // Fallback: re-queue and hope for next opportunity
      this.queue.unshift(...events);
      this._log('sendBeacon not available, events re-queued');
    }
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const events = this.queue.splice(0, this.maxBatchSize);
    this._log('Flushing', events.length, 'events');

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
        this.queue.unshift(...events);
        const error = new Error(`Batch failed: ${response.statusText}`);
        error.status = response.status;
        this._log('Flush failed:', error);
        throw error;
      }

      this._log('Flush successful');
    } catch (error) {
      this.queue.unshift(...events);
      throw error;
    }
  }

  trackPageView(options = {}) {
    if (this.disabled) return;

    this.track('$pageview', {
      ...options,
      pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
    });
  }

  trackClick(element, options = {}) {
    if (this.disabled) return;

    const rect = element.getBoundingClientRect();
    this.track('$click', {
      ...options,
      clickX: Math.round(rect.left + rect.width / 2),
      clickY: Math.round(rect.top + rect.height / 2),
      elementSelector: this.getSelector(element),
    });
  }

  getSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ').join('.')}`;
    return element.tagName.toLowerCase();
  }
}

// UMD export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Serla;
} else if (typeof window !== 'undefined') {
  window.Serla = Serla;
}
