"""Thread-safe event queue with a daemon flusher thread.

Design mirrors the Node SDK's queue:

  - Events accumulate in an in-memory deque guarded by a lock.
  - A daemon thread wakes every ``flush_interval_seconds`` and POSTs the buffer.
  - Reaching ``batch_size`` signals the worker to flush immediately.
  - Failed flushes use exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s).
  - On failure, events are re-queued at the front, capped at 1000 entries.
  - Every batch carries an ``X-Idempotency-Key`` header for server-side dedup.

We deliberately use ``urllib.request`` (stdlib) instead of ``requests``/``httpx``
to keep runtime deps at zero - a strong DX signal for an analytics SDK that's
going to be embedded in customer apps with their own dependency trees.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from collections import deque
from typing import Deque, List, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from ._types import QueuedEvent, ResolvedConfig


# Module-level logger. Users configure it via ``logging.getLogger("serla")``.
_log = logging.getLogger("serla")


# Hard cap on the buffer size to avoid unbounded memory growth when the
# endpoint is down for an extended period. Matches the Node SDK's cap.
_MAX_BUFFER_SIZE = 1000

# Cap a single POST at 10x batch_size so a buffer-up-the-wazoo doesn't try to
# ship a 10MB JSON body in one shot.
_BATCH_DRAIN_MULTIPLIER = 10

# Backoff bounds.
_BACKOFF_BASE_SECONDS = 1.0
_BACKOFF_MAX_SECONDS = 30.0


class EventQueue:
    """Background-flushing event queue.

    Lifecycle:

      1. ``start()`` spawns the daemon worker thread.
      2. ``enqueue()`` appends an event; if the buffer hits ``batch_size`` it
         signals the worker via an ``Event`` so the flush happens promptly.
      3. ``drain()`` blocks the caller until the buffer is empty (or attempts
         are exhausted) - this is what powers ``serla.flush()``.
      4. ``stop()`` tells the worker to exit and joins it.

    Thread-safety: the buffer is guarded by ``self._lock``. The worker copies
    a batch out under the lock, then releases the lock before doing network
    I/O - we don't want enqueue() callers blocked on a slow flush.
    """

    def __init__(self, config: ResolvedConfig) -> None:
        self._config = config
        self._buffer: Deque[QueuedEvent] = deque()
        self._lock = threading.Lock()
        # Signals the worker to wake up early (batch full, or drain requested).
        self._wake = threading.Event()
        # Signals the worker to exit its loop.
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        # Wall-clock time (seconds since epoch) before which the worker should
        # not attempt another flush. Driven by exponential backoff on failure.
        self._next_flush_at = 0.0
        self._consecutive_failures = 0
        # Tracks whether a flush is currently in progress, so drain() can wait
        # for it. Set/cleared by the worker; ``_idle`` is set when no flush
        # is running AND the buffer is empty.
        self._idle = threading.Event()
        self._idle.set()

    # -- lifecycle -----------------------------------------------------------

    def start(self) -> None:
        """Spawn the daemon worker thread. Idempotent."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        # daemon=True so the thread doesn't keep the interpreter alive when
        # the main program exits - matches the Node SDK's ``timer.unref()``.
        self._thread = threading.Thread(
            target=self._run,
            name="serla-flusher",
            daemon=True,
        )
        self._thread.start()

    def stop(self, timeout: Optional[float] = 5.0) -> None:
        """Signal the worker thread to exit and join it. Idempotent."""
        self._stop.set()
        # Wake the worker so it notices the stop flag without waiting for the
        # next interval.
        self._wake.set()
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)
        self._thread = None

    # -- producer side -------------------------------------------------------

    def enqueue(self, event: QueuedEvent) -> None:
        """Append an event to the buffer. Non-blocking. Triggers an early
        flush if the buffer has reached ``batch_size``.
        """
        with self._lock:
            self._buffer.append(event)
            should_flush_now = len(self._buffer) >= self._config["batch_size"]
        self._idle.clear()
        if should_flush_now:
            self._wake.set()

    def pending_count(self) -> int:
        """Snapshot of the current buffer size."""
        with self._lock:
            return len(self._buffer)

    # -- consumer side -------------------------------------------------------

    def drain(self, timeout: Optional[float] = 30.0) -> None:
        """Block until the buffer is empty (or ``timeout`` elapses).

        Bypasses backoff for the duration of the drain - the caller has
        explicitly asked us to flush now, so we shouldn't sit on the queue.

        Bounded retry attempts so a permanently-broken endpoint doesn't
        deadlock shutdown.
        """
        deadline = time.monotonic() + timeout if timeout is not None else None
        attempts = 0
        max_attempts = 5
        while attempts < max_attempts:
            with self._lock:
                empty = len(self._buffer) == 0
            if empty:
                # Wait for an in-flight flush (if any) to finish so callers
                # know the wire has settled before drain() returns.
                remaining = (
                    None if deadline is None else max(0.0, deadline - time.monotonic())
                )
                self._idle.wait(timeout=remaining)
                return
            # Bypass backoff: caller asked us to flush right now.
            self._next_flush_at = 0.0
            self._wake.set()
            # Give the worker a chance to make progress. Poll rather than
            # block forever - if the worker is wedged we still want to bail
            # out at the deadline.
            remaining = (
                None if deadline is None else max(0.0, deadline - time.monotonic())
            )
            if remaining is not None and remaining <= 0:
                return
            self._idle.wait(timeout=min(1.0, remaining) if remaining else 1.0)
            attempts += 1

    # -- worker loop ---------------------------------------------------------

    def _run(self) -> None:
        """Main worker loop. Wakes on interval or signal, attempts a flush,
        sleeps, repeats. Catches all exceptions so a bug in the SDK can never
        crash the host process.
        """
        interval = self._config["flush_interval_seconds"]
        while not self._stop.is_set():
            # Wait for either the interval to elapse or a wake signal.
            # ``wait()`` returns True if the event was set, False on timeout.
            self._wake.wait(timeout=interval)
            self._wake.clear()
            if self._stop.is_set():
                break
            # Respect backoff: if we failed recently, defer until the window
            # elapses. Don't busy-loop the worker thread.
            now = time.monotonic()
            if now < self._next_flush_at:
                continue
            try:
                self._flush_once()
            except Exception:  # pragma: no cover - belt-and-suspenders
                # Log and continue. We never want a flush bug to take down
                # the worker thread permanently.
                _log.exception("unexpected error in flush worker")

        # Last-chance drain on stop. Best-effort: we're already shutting down.
        try:
            self._flush_once()
        except Exception:  # pragma: no cover
            _log.exception("error during final flush on stop")

    def _flush_once(self) -> None:
        """Pull a batch off the buffer and POST it. Re-queues on failure."""
        with self._lock:
            if not self._buffer:
                self._idle.set()
                return
            # Drain up to batch_size * 10 to clear backlog quickly, but cap
            # so a single POST doesn't balloon to absurd sizes.
            drain_limit = self._config["batch_size"] * _BATCH_DRAIN_MULTIPLIER
            batch: List[QueuedEvent] = []
            for _ in range(min(drain_limit, len(self._buffer))):
                batch.append(self._buffer.popleft())

        if not batch:
            self._idle.set()
            return

        idempotency_key = str(uuid.uuid4())
        try:
            self._post_batch(batch, idempotency_key)
            self._consecutive_failures = 0
            self._next_flush_at = 0.0
            if self._config["debug"]:
                _log.debug("flushed %d event(s)", len(batch))
        except Exception as err:
            self._handle_failure(batch, err)
        finally:
            # Only mark idle if buffer drained completely; otherwise the
            # worker still has work and drain() should keep waiting.
            with self._lock:
                if not self._buffer:
                    self._idle.set()

    def _post_batch(
        self, batch: List[QueuedEvent], idempotency_key: str
    ) -> None:
        """POST a batch to ``/api/v1/events/batch``. Raises on non-2xx."""
        url = f"{self._config['host']}/api/v1/events/batch"
        body = json.dumps({"events": batch}).encode("utf-8")
        req = urllib_request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config['api_key']}",
                "X-Idempotency-Key": idempotency_key,
                "User-Agent": "serla-python/0.1.0",
            },
        )
        # urlopen raises HTTPError for non-2xx, URLError for transport errors.
        # Both bubble up to _flush_once which routes them to _handle_failure.
        with urllib_request.urlopen(req, timeout=30) as resp:
            # Consume the body so the connection can be returned to the pool.
            # We don't care about the response shape - the server returns
            # 202 on accept.
            resp.read()

    def _handle_failure(
        self, batch: List[QueuedEvent], reason: BaseException
    ) -> None:
        """Re-queue the failed batch (capped) and bump the backoff window."""
        with self._lock:
            # Only re-queue if we won't blow past the cap. Re-queue at the
            # front so chronological order is preserved as much as possible.
            if len(self._buffer) < _MAX_BUFFER_SIZE:
                # Note: deque.extendleft reverses order, so we iterate in
                # reverse to preserve the original sequence.
                for event in reversed(batch):
                    self._buffer.appendleft(event)
                    if len(self._buffer) >= _MAX_BUFFER_SIZE:
                        break
        self._consecutive_failures += 1
        backoff = min(
            _BACKOFF_BASE_SECONDS * (2 ** (self._consecutive_failures - 1)),
            _BACKOFF_MAX_SECONDS,
        )
        self._next_flush_at = time.monotonic() + backoff
        # Extract a useful error message for logging.
        if isinstance(reason, urllib_error.HTTPError):
            detail = f"HTTP {reason.code}"
        elif isinstance(reason, urllib_error.URLError):
            detail = f"URLError: {reason.reason}"
        else:
            detail = f"{type(reason).__name__}: {reason}"
        if self._config["debug"]:
            _log.warning(
                "flush failed (%s), retry in %ds", detail, int(round(backoff))
            )
