/**
 * Session replay capture.
 *
 * Loads rrweb dynamically so users who don't enable recordSessions don't pay
 * the bundle cost. Buffers events client-side, flushes chunks of up to
 * MAX_BUFFER_EVENTS or MAX_BUFFER_BYTES at a time to /api/v1/recordings.
 *
 * Each chunk is { sessionId, chunkIndex, events[], ...context } - the server
 * stitches them on playback. chunkIndex resets when sessionId rotates.
 */

import type { ResolvedConfig } from './types';
import { getSessionId } from './session';

interface RrwebEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

// We don't depend on rrweb's exported types - it's a dynamic import and the
// rrweb package may not even be installed at the consumer's site. Use a
// minimal shape and a runtime cast.
type RrwebRecordFn = (options: {
  emit: (event: RrwebEvent) => void;
  maskAllInputs?: boolean;
  blockClass?: string;
  ignoreClass?: string;
}) => (() => void) | undefined;

const MAX_BUFFER_EVENTS = 100;
const MAX_BUFFER_BYTES = 256 * 1024; // 256KB before forced flush
const FLUSH_INTERVAL_MS = 10_000;

export interface RecorderOptions {
  /** Mask all <input> values so PII never leaves the user's browser. Default: true. */
  maskAllInputs?: boolean;
  /** CSS class on elements you want fully blocked from recording. */
  blockClass?: string;
  /** CSS class on elements whose interactions are ignored but layout still recorded. */
  ignoreClass?: string;
}

export class SessionRecorder {
  private config: ResolvedConfig;
  private recorderOptions: RecorderOptions;
  private buffer: RrwebEvent[] = [];
  private bufferBytes = 0;
  private currentSessionId: string | null = null;
  private chunkIndex = 0;
  private hasErrorThisChunk = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private stopRecording: (() => void) | null = null;
  private rrwebLoaded = false;
  private distinctIdGetter: () => string | null;

  constructor(
    config: ResolvedConfig,
    options: RecorderOptions,
    distinctIdGetter: () => string | null,
  ) {
    this.config = config;
    this.recorderOptions = options;
    this.distinctIdGetter = distinctIdGetter;
  }

  async start(): Promise<void> {
    if (typeof window === 'undefined' || this.rrwebLoaded) return;
    try {
      const rrwebMod = (await import('rrweb')) as unknown as { record: RrwebRecordFn };
      this.rrwebLoaded = true;

      const stop = rrwebMod.record({
        emit: (event: RrwebEvent) => this.handleEvent(event),
        maskAllInputs: this.recorderOptions.maskAllInputs ?? true,
        blockClass: this.recorderOptions.blockClass ?? 'serla-no-record',
        ignoreClass: this.recorderOptions.ignoreClass ?? 'serla-no-record-events',
      });
      this.stopRecording = stop ?? null;

      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

      // Flush whatever's buffered when the user leaves the page.
      window.addEventListener('pagehide', this.handlePageHide);
      window.addEventListener('beforeunload', this.handlePageHide);

      // Catch errors so the recording flags them - lets dashboard surface
      // "this session contained errors" in the replay list.
      window.addEventListener('error', this.handleError);
      window.addEventListener('unhandledrejection', this.handleError);

      if (this.config.debug) console.log('[serla] session recording started');
    } catch (err) {
      if (this.config.debug) console.warn('[serla] failed to start recording', err);
    }
  }

  private handleEvent(event: RrwebEvent): void {
    const sessionId = getSessionId(this.config.sessionTimeoutMs);
    // New session - flush old chunk and reset index.
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      void this.flush();
      this.chunkIndex = 0;
    }
    this.currentSessionId = sessionId;
    this.buffer.push(event);
    this.bufferBytes += approximateSize(event);
    if (this.buffer.length >= MAX_BUFFER_EVENTS || this.bufferBytes >= MAX_BUFFER_BYTES) {
      void this.flush();
    }
  }

  private handleError = (): void => {
    this.hasErrorThisChunk = true;
  };

  private handlePageHide = (): void => {
    // Best-effort sync flush via fetch keepalive.
    void this.flush(true);
  };

  async flush(keepalive = false): Promise<void> {
    if (this.buffer.length === 0 || !this.currentSessionId) return;
    const events = this.buffer;
    const hasError = this.hasErrorThisChunk;
    const chunkIndex = this.chunkIndex++;
    this.buffer = [];
    this.bufferBytes = 0;
    this.hasErrorThisChunk = false;

    const isFirstChunk = chunkIndex === 0;
    const browserUA = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

    const body = JSON.stringify({
      sessionId: this.currentSessionId,
      distinctId: this.distinctIdGetter() ?? undefined,
      chunkIndex,
      events,
      startUrl: isFirstChunk && typeof window !== 'undefined' ? window.location.href : undefined,
      browser: isFirstChunk ? parseBrowser(browserUA) : undefined,
      os: isFirstChunk ? parseOs(browserUA) : undefined,
      deviceType: isFirstChunk ? parseDeviceType(browserUA) : undefined,
      hasError,
    });

    try {
      await fetch(`${this.config.host}/api/v1/recordings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body,
        keepalive,
      });
    } catch (err) {
      if (this.config.debug) console.warn('[serla] recording flush failed', err);
    }
  }

  stop(): void {
    if (this.stopRecording) {
      this.stopRecording();
      this.stopRecording = null;
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.handlePageHide);
      window.removeEventListener('beforeunload', this.handlePageHide);
      window.removeEventListener('error', this.handleError);
      window.removeEventListener('unhandledrejection', this.handleError);
    }
    void this.flush();
  }
}

function approximateSize(event: RrwebEvent): number {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 1024;
  }
}

function parseBrowser(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return undefined;
}

function parseOs(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  return undefined;
}

function parseDeviceType(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  if (/Mobile|iPhone|Android.*Mobile/.test(ua)) return 'mobile';
  if (/iPad|Tablet/.test(ua)) return 'tablet';
  return 'desktop';
}
