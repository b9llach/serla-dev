import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchErrors } from './error-tracking';

describe('error-tracking', () => {
  let captured: any[];
  let teardown: () => void;

  beforeEach(() => {
    captured = [];
    teardown = watchErrors(err => captured.push(err));
  });

  afterEach(() => {
    teardown();
  });

  it('captures error events', () => {
    const event = new ErrorEvent('error', {
      message: 'boom',
      filename: 'app.js',
      lineno: 42,
      colno: 7,
      error: new Error('boom'),
    });
    window.dispatchEvent(event);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      errorType: 'error',
      message: 'boom',
      source: 'app.js',
      line: 42,
      col: 7,
    });
  });

  it('captures unhandled promise rejections', () => {
    // jsdom doesn't expose a PromiseRejectionEvent constructor reliably -
    // synthesize one via a plain Event with `reason` patched on.
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('rejected');
    window.dispatchEvent(event);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      errorType: 'unhandledrejection',
      message: 'rejected',
    });
  });

  it('dedups same error within the 30s window', () => {
    const fire = () =>
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'dup', filename: 'a.js', lineno: 1, colno: 1 })
      );

    fire();
    fire();
    fire();
    expect(captured).toHaveLength(1);
  });

  it('cleanup detaches the listeners', () => {
    teardown();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after-teardown' }));
    expect(captured).toHaveLength(0);
  });
});
