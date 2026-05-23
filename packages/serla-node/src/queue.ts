import type { QueuedEvent, ResolvedConfig } from './types';

/**
 * Server-side event queue.
 *
 *  - Events accumulate in memory.
 *  - Auto-flush every `flushIntervalMs` via setInterval.
 *  - Forced flush when batch reaches `batchSize`.
 *  - Failed flushes use exponential backoff (1s, 2s, 4s, ..., max 30s) so a
 *    broken endpoint isn't hammered every tick.
 *  - On flush failure, events are re-queued at the front (capped at 1000 to
 *    prevent unbounded growth if the endpoint stays down).
 *  - Each batch carries an `X-Idempotency-Key` so the server can dedupe
 *    retried-and-eventually-succeeded batches.
 *
 * Unlike the browser SDK there's no sendBeacon - graceful shutdown is driven
 * by `await flush()` from the caller (or our beforeExit hook in long-lived
 * Node processes).
 */
export class EventQueue {
  private buffer: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** Tracks the currently in-flight flush so callers can `await flush()`. */
  private inflight: Promise<void> | null = null;
  /** Wall-clock ms; flushes before this time are deferred. */
  private nextFlushAt = 0;
  /** Consecutive failures - drives exponential backoff. Reset on success. */
  private consecutiveFailures = 0;

  constructor(private config: ResolvedConfig) {}

  start(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
    // setInterval keeps the Node event loop alive. unref() lets the process
    // exit naturally; we don't want a server analytics SDK to hold a CLI
    // script open after main() returns.
    const timer = this.flushTimer as unknown as { unref?: () => void };
    if (typeof timer.unref === 'function') timer.unref();
  }

  enqueue(event: QueuedEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  /**
   * Flush queued events. Awaits any in-flight request so callers chaining
   * `await flush()` don't return before the network is settled.
   *
   * Honors backoff: if a previous attempt failed, returns early until the
   * backoff window elapses.
   */
  async flush(): Promise<void> {
    // If a flush is already running, return the same promise so concurrent
    // callers don't kick off overlapping batches.
    if (this.inflight) return this.inflight;
    if (this.buffer.length === 0) return;
    if (Date.now() < this.nextFlushAt) return;

    this.inflight = this.doFlush().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async doFlush(): Promise<void> {
    // Drain everything we've got - server SDKs can usually post large batches
    // in one shot. Cap at 10x batchSize so an unbounded buffer doesn't try
    // to be POSTed in a single 10MB request.
    const drainLimit = Math.max(this.config.batchSize, this.buffer.length);
    const batch = this.buffer.splice(0, Math.min(drainLimit, this.config.batchSize * 10));
    if (batch.length === 0) return;
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
      });
      if (res.ok) {
        this.consecutiveFailures = 0;
        this.nextFlushAt = 0;
        if (this.config.debug) {
          // eslint-disable-next-line no-console
          console.log(`[serla] flushed ${batch.length} event(s)`);
        }
      } else {
        this.handleFailure(batch, `HTTP ${res.status}`);
      }
    } catch (err) {
      this.handleFailure(batch, err);
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
      // eslint-disable-next-line no-console
      console.warn(
        `[serla] flush failed (${reason instanceof Error ? reason.message : String(reason)}), retry in ${Math.round(backoff / 1000)}s`,
      );
    }
  }

  /** Drain everything in the queue, waiting for any in-flight request first. */
  async drain(): Promise<void> {
    // Wait for an in-flight request to settle, then keep flushing until the
    // buffer is empty (or the backoff says "wait"). Bounded by attempts so
    // a permanently-broken endpoint doesn't deadlock shutdown.
    if (this.inflight) {
      await this.inflight;
    }
    let attempts = 0;
    while (this.buffer.length > 0 && attempts < 5) {
      attempts++;
      // Bypass backoff during drain - the caller has asked us to flush now.
      this.nextFlushAt = 0;
      await this.flush();
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Exposed for tests / debug introspection. */
  pendingCount(): number {
    return this.buffer.length;
  }
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: 16 random hex chars + timestamp.
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${Date.now().toString(36)}-${s}`;
}
