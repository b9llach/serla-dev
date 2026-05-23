import type { QueuedEvent, ResolvedConfig } from './types';

/**
 * Event queue with periodic flush and reliable pagehide flush via sendBeacon.
 *
 *  - Events accumulate in memory.
 *  - Auto-flush every `flushIntervalMs`.
 *  - Forced flush when batch reaches `batchSize`.
 *  - On `pagehide` / `visibilitychange=hidden`, send remaining via
 *    `navigator.sendBeacon` (cannot set headers, so the API key goes in
 *    the query string - documented escape hatch).
 *  - Failed flushes use exponential backoff (1s, 2s, 4s, ..., max 30s)
 *    so a broken endpoint isn't hammered every flushIntervalMs.
 *  - Each batch carries an `idempotencyKey` header so server-side dedup
 *    can de-duplicate retried-and-eventually-succeeded batches.
 */
export class EventQueue {
  private buffer: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  /** Wall-clock ms; flushes before this time are deferred. */
  private nextFlushAt = 0;
  /** Consecutive failures - drives exponential backoff. Reset on success. */
  private consecutiveFailures = 0;

  constructor(private config: ResolvedConfig) {}

  start(): void {
    if (typeof window === 'undefined') return;

    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);

    const onHide = () => this.flushBeacon();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
  }

  enqueue(event: QueuedEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  /** Async flush via fetch with Authorization header. Honors backoff. */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    if (Date.now() < this.nextFlushAt) return;

    this.flushing = true;
    const batch = this.buffer.splice(0, this.config.batchSize);
    const idempotencyKey = generateIdempotencyKey();

    try {
      const res = await fetch(`${this.config.host}/api/v1/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (res.ok) {
        this.consecutiveFailures = 0;
        this.nextFlushAt = 0;
      } else {
        this.handleFailure(batch, `HTTP ${res.status}`);
      }
    } catch (err) {
      this.handleFailure(batch, err);
    } finally {
      this.flushing = false;
    }
  }

  private handleFailure(batch: QueuedEvent[], reason: unknown): void {
    // Re-queue events at the front, capped to prevent unbounded growth.
    if (this.buffer.length < 1000) {
      this.buffer.unshift(...batch);
    }
    this.consecutiveFailures++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s.
    const backoff = Math.min(1000 * Math.pow(2, this.consecutiveFailures - 1), 30_000);
    this.nextFlushAt = Date.now() + backoff;
    if (this.config.debug) {
      console.warn(
        `[serla] flush failed (${reason}), retry in ${Math.round(backoff / 1000)}s`,
      );
    }
  }

  /** Synchronous flush via navigator.sendBeacon - survives page unload. */
  flushBeacon(): void {
    if (this.buffer.length === 0) return;
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      void this.flush();
      return;
    }

    const batch = this.buffer.splice(0);
    const body = JSON.stringify({ events: batch });
    const blob = new Blob([body], { type: 'application/json' });
    // sendBeacon cannot set headers - API key + idempotency key go in URL.
    const idem = generateIdempotencyKey();
    const url = `${this.config.host}/api/v1/events/batch?api_key=${encodeURIComponent(
      this.config.apiKey
    )}&idempotency_key=${idem}`;
    const ok = navigator.sendBeacon(url, blob);
    if (!ok && this.buffer.length < 1000) {
      this.buffer.unshift(...batch);
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers - 16 random hex chars + timestamp.
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${Date.now().toString(36)}-${s}`;
}
