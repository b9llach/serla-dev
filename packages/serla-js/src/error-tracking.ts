/**
 * Automatic error capture. Hooks `window.onerror` + `unhandledrejection` and
 * surfaces them as `$error` events.
 *
 * Design notes:
 *  - We throttle to avoid flooding the queue if a render loop is spamming
 *    errors. Same error fingerprint within 30 seconds = dropped.
 *  - Cross-origin script errors lose detail (browser hides the stack/message
 *    for security). We tag them and pass through the limited info.
 *  - Returns a teardown so test code / shutdown() can detach the listeners.
 */

const DEDUP_WINDOW_MS = 30_000;
const seenFingerprints = new Map<string, number>();

export interface CapturedError {
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack?: string;
  errorType: 'error' | 'unhandledrejection';
}

function fingerprint(err: CapturedError): string {
  return `${err.errorType}:${err.message}:${err.source ?? ''}:${err.line ?? ''}`;
}

function shouldEmit(err: CapturedError): boolean {
  const fp = fingerprint(err);
  const now = Date.now();
  const last = seenFingerprints.get(fp);
  if (last && now - last < DEDUP_WINDOW_MS) return false;
  seenFingerprints.set(fp, now);

  // Bound the map - drop oldest entries if it grows too large.
  if (seenFingerprints.size > 200) {
    const entries = Array.from(seenFingerprints.entries()).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < 100; i++) {
      const e = entries[i];
      if (e) seenFingerprints.delete(e[0]);
    }
  }
  return true;
}

export function watchErrors(onError: (err: CapturedError) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const errorHandler = (e: ErrorEvent) => {
    const err: CapturedError = {
      errorType: 'error',
      message: e.message || 'Unknown error',
      source: e.filename || undefined,
      line: e.lineno || undefined,
      col: e.colno || undefined,
      stack: e.error?.stack,
    };
    if (shouldEmit(err)) onError(err);
  };

  const rejectionHandler = (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const err: CapturedError = {
      errorType: 'unhandledrejection',
      message:
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection',
      stack: reason instanceof Error ? reason.stack : undefined,
    };
    if (shouldEmit(err)) onError(err);
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
}
