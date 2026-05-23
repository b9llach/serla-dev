import type {
  EventProperties,
  QueuedEvent,
  ResolvedConfig,
  SerlaConfig,
  TrackPayload,
} from './types';
import { EventQueue } from './queue';

const DEFAULTS = {
  host: 'https://serla.dev',
  batchSize: 50,
  flushIntervalMs: 5000,
  debug: false,
  flushOnExit: true,
};

/**
 * Server-side Serla client. Instantiate once per process (or once per project
 * key if you forward analytics from multiple projects through the same Node
 * server) and reuse the instance.
 *
 *   const serla = new Serla({ apiKey: process.env.SERLA_API_KEY! });
 *   serla.track({ name: 'signup_completed', distinctId: 'user_123' });
 *   await serla.flush();   // before process exits
 *   await serla.shutdown();
 */
export class Serla {
  private config: ResolvedConfig;
  private queue: EventQueue;
  private beforeExitHandler: (() => void) | null = null;
  private isShutdown = false;

  constructor(config: SerlaConfig) {
    if (!config || !config.apiKey) {
      throw new Error('Serla: apiKey is required');
    }
    this.config = {
      apiKey: config.apiKey,
      host: (config.host ?? DEFAULTS.host).replace(/\/$/, ''),
      batchSize: config.batchSize ?? DEFAULTS.batchSize,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      debug: config.debug ?? DEFAULTS.debug,
      flushOnExit: config.flushOnExit ?? DEFAULTS.flushOnExit,
    };

    this.queue = new EventQueue(this.config);
    this.queue.start();

    if (this.config.flushOnExit) {
      this.attachBeforeExit();
    }

    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.log('[serla] initialized', { host: this.config.host });
    }
  }

  /**
   * Enqueue an event. Non-blocking - returns immediately, the network call
   * happens on the next flush tick (or sooner if the batch fills up).
   *
   *   serla.track({
   *     name: 'signup_completed',
   *     distinctId: 'user_123',
   *     properties: { plan: 'pro' },
   *   });
   */
  track(payload: TrackPayload): void {
    if (this.isShutdown) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] track() called after shutdown() - ignoring');
      }
      return;
    }
    if (!payload || !payload.name) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] track() requires a name');
      }
      return;
    }
    if (!payload.distinctId) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] track() requires a distinctId (server-side has no anonymous-id fallback)');
      }
      return;
    }

    const ts =
      payload.timestamp instanceof Date
        ? payload.timestamp.toISOString()
        : typeof payload.timestamp === 'string'
        ? payload.timestamp
        : new Date().toISOString();

    const event: QueuedEvent = {
      name: payload.name,
      distinctId: payload.distinctId,
      properties: payload.properties ?? {},
      timestamp: ts,
    };

    this.queue.enqueue(event);
    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.log('[serla] track', payload.name, event);
    }
  }

  /**
   * Associate a distinct ID with user properties. POSTs synchronously to
   * `/api/v1/identify`. Unlike `track()`, this is awaited so callers can
   * gate user-creation flows on it.
   */
  async identify(distinctId: string, properties: EventProperties = {}): Promise<void> {
    if (this.isShutdown) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] identify() called after shutdown() - ignoring');
      }
      return;
    }
    if (!distinctId) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] identify() requires a distinctId');
      }
      return;
    }

    try {
      const res = await fetch(`${this.config.host}/api/v1/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ distinctId, properties }),
      });
      if (!res.ok && this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn(`[serla] identify failed: HTTP ${res.status}`);
      } else if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.log('[serla] identify', distinctId, properties);
      }
    } catch (err) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] identify failed', err);
      }
    }
  }

  /**
   * Track an LLM generation. Fire-and-forget POST to /api/v1/llm.
   *
   *   await serla.trackLLM({
   *     model: 'gpt-4o',
   *     provider: 'openai',
   *     distinctId: 'user_123',
   *     input: messages,
   *     output: response.choices[0].message,
   *     inputTokens: response.usage.prompt_tokens,
   *     outputTokens: response.usage.completion_tokens,
   *     latencyMs: Date.now() - startedAt,
   *   });
   */
  async trackLLM(generation: {
    model: string;
    distinctId?: string;
    traceId?: string;
    parentId?: string;
    provider?: string;
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
  }): Promise<void> {
    if (this.isShutdown) return;
    try {
      await fetch(`${this.config.host}/api/v1/llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...generation,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] trackLLM failed', err);
      }
    }
  }

  /**
   * Capture a server-side exception. Sends an error report grouped by
   * stack-trace fingerprint.
   *
   *   try { ... } catch (err) {
   *     await serla.captureException(err, { distinctId: 'user_123', context: 'checkout' });
   *   }
   */
  async captureException(
    error: unknown,
    options: { distinctId?: string; context?: Record<string, unknown>; release?: string; environment?: string } = {},
  ): Promise<void> {
    if (this.isShutdown) return;
    const err = error instanceof Error ? error : new Error(String(error));
    try {
      await fetch(`${this.config.host}/api/v1/errors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          message: err.message,
          type: err.name,
          stack: err.stack,
          distinctId: options.distinctId,
          release: options.release,
          environment: options.environment,
          metadata: options.context,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.warn('[serla] captureException failed', e);
      }
    }
  }

  /**
   * Force-flush the event queue. Resolves when all queued events at the time
   * of the call have been sent (or definitively failed and re-queued).
   *
   * Call this before exiting a serverless function so events aren't lost
   * when the runtime freezes the process.
   *
   *   await serla.flush();
   */
  async flush(): Promise<void> {
    await this.queue.drain();
  }

  /**
   * Graceful shutdown. Flushes the queue, stops the periodic timer, detaches
   * the beforeExit hook. Safe to call multiple times.
   *
   *   process.on('SIGTERM', async () => {
   *     await serla.shutdown();
   *     process.exit(0);
   *   });
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;
    try {
      await this.queue.drain();
    } finally {
      this.queue.stop();
      this.detachBeforeExit();
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.log('[serla] shutdown complete');
      }
    }
  }

  /** Count of events currently buffered (not yet sent). Useful for tests. */
  pendingCount(): number {
    return this.queue.pendingCount();
  }

  // -- internals -----------------------------------------------------------

  private attachBeforeExit(): void {
    // Feature-detect Node's process.on - Edge runtimes (Cloudflare Workers,
    // Vercel Edge) don't expose it, and we never want to throw on init in
    // a runtime that's otherwise compatible.
    const proc = getProcess();
    if (!proc || typeof proc.on !== 'function') return;
    this.beforeExitHandler = () => {
      // beforeExit fires when the loop is empty but a pending promise can
      // keep the process alive long enough to flush. If it fails, we don't
      // want to throw inside a process-exit handler.
      void this.flush().catch(() => {});
    };
    try {
      proc.on('beforeExit', this.beforeExitHandler);
    } catch {
      // Some runtimes expose `process.on` but reject unknown events. Ignore.
      this.beforeExitHandler = null;
    }
  }

  private detachBeforeExit(): void {
    if (!this.beforeExitHandler) return;
    const proc = getProcess();
    if (proc && typeof proc.off === 'function') {
      try {
        proc.off('beforeExit', this.beforeExitHandler);
      } catch {
        // Ignore
      }
    }
    this.beforeExitHandler = null;
  }
}

// Narrow type for the subset of `process` we use - avoids needing @types/node
// as a dep just to feature-detect.
interface MinimalProcess {
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
}

function getProcess(): MinimalProcess | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { process?: MinimalProcess };
  return g.process ?? null;
}

export default Serla;
export type { SerlaConfig, EventProperties, TrackPayload } from './types';
