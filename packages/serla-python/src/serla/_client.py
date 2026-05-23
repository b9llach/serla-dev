"""The public ``Serla`` client class.

Mirrors the Node SDK's surface area, translated to Pythonic snake_case and
extended with a context-manager protocol for one-shot scripts. The whole
contract is: instantiate once per process, call ``track()``/``identify()``
from anywhere, and let the daemon thread + ``atexit`` hook handle delivery.
"""

from __future__ import annotations

import atexit
import datetime as _dt
import json
import logging
import threading
from typing import Any, Optional, Union
from urllib import error as urllib_error
from urllib import request as urllib_request

from ._queue import EventQueue
from ._types import EventProperties, QueuedEvent, ResolvedConfig


_DEFAULT_HOST = "https://serla.dev"
_DEFAULT_BATCH_SIZE = 50
_DEFAULT_FLUSH_INTERVAL_SECONDS = 5.0
_DEFAULT_DEBUG = False
_DEFAULT_FLUSH_ON_EXIT = True

_log = logging.getLogger("serla")


class Serla:
    """Server-side Serla analytics client.

    Instantiate once per process (or once per project key if you forward
    analytics from multiple projects through the same server) and reuse the
    instance for the lifetime of the process.

    Example::

        from serla import Serla

        serla = Serla(api_key="sk_live_...")
        serla.track(event="signup_completed", distinct_id="user_123")
        serla.flush()
        serla.shutdown()

    Context-manager form auto-flushes on exit, handy for one-shot scripts::

        with Serla(api_key="sk_live_...") as serla:
            serla.track(event="cron_finished", distinct_id="cron")
    """

    def __init__(
        self,
        api_key: str,
        *,
        host: str = _DEFAULT_HOST,
        flush_interval_seconds: float = _DEFAULT_FLUSH_INTERVAL_SECONDS,
        batch_size: int = _DEFAULT_BATCH_SIZE,
        debug: bool = _DEFAULT_DEBUG,
        flush_on_exit: bool = _DEFAULT_FLUSH_ON_EXIT,
    ) -> None:
        if not api_key:
            raise ValueError("Serla: api_key is required")
        if batch_size <= 0:
            raise ValueError("Serla: batch_size must be > 0")
        if flush_interval_seconds <= 0:
            raise ValueError("Serla: flush_interval_seconds must be > 0")

        # Strip trailing slash so we can concatenate paths cleanly.
        normalized_host = host.rstrip("/") if host else _DEFAULT_HOST

        config: ResolvedConfig = {
            "api_key": api_key,
            "host": normalized_host,
            "batch_size": batch_size,
            "flush_interval_seconds": flush_interval_seconds,
            "debug": debug,
            "flush_on_exit": flush_on_exit,
        }
        self._config = config

        if debug:
            # Be conservative: only escalate the logger to DEBUG if the caller
            # explicitly opted in. We never touch the root logger.
            _log.setLevel(logging.DEBUG)
            # Attach a default handler iff none is configured, so debug logs
            # are actually visible during development without requiring the
            # caller to wire up `logging.basicConfig()`.
            if not _log.handlers:
                handler = logging.StreamHandler()
                handler.setFormatter(
                    logging.Formatter("[serla] %(levelname)s %(message)s")
                )
                _log.addHandler(handler)

        self._queue = EventQueue(config)
        self._queue.start()

        # Track shutdown state so repeated/atexit calls are no-ops, and so
        # post-shutdown track()/identify() calls log a warning instead of
        # silently dropping events.
        self._shutdown_lock = threading.Lock()
        self._is_shutdown = False

        self._atexit_registered = False
        if flush_on_exit:
            atexit.register(self._atexit_handler)
            self._atexit_registered = True

        if debug:
            _log.debug("initialized host=%s", normalized_host)

    # -- public API ----------------------------------------------------------

    def track(
        self,
        event: str,
        distinct_id: str,
        properties: Optional[EventProperties] = None,
        timestamp: Optional[Union[_dt.datetime, str]] = None,
    ) -> None:
        """Enqueue an event for asynchronous delivery.

        Non-blocking: returns immediately. The event is sent on the next flush
        tick (every ``flush_interval_seconds``) or sooner if the buffer reaches
        ``batch_size``.

        :param event: Event name (e.g. ``"signup_completed"``).
        :param distinct_id: User identifier. Required server-side - there's no
            anonymous-ID fallback. If you don't have a user yet, pass a stable
            system identifier (org ID, hashed IP, etc).
        :param properties: Optional arbitrary properties dict. The key
            ``$groups`` is reserved for group analytics, e.g.
            ``{"$groups": {"team": "team_42"}}``.
        :param timestamp: Optional event timestamp. Accepts a ``datetime`` (it
            will be ISO-formatted) or a pre-formatted string. Defaults to the
            current UTC time at enqueue.
        """
        if self._is_shutdown:
            if self._config["debug"]:
                _log.warning("track() called after shutdown() - ignoring")
            return
        if not event:
            if self._config["debug"]:
                _log.warning("track() requires an event name")
            return
        if not distinct_id:
            if self._config["debug"]:
                _log.warning(
                    "track() requires a distinct_id "
                    "(server-side has no anonymous-id fallback)"
                )
            return

        ts = _coerce_timestamp(timestamp)
        queued: QueuedEvent = {
            "name": event,
            "distinctId": distinct_id,
            "properties": properties if properties is not None else {},
            "timestamp": ts,
        }
        self._queue.enqueue(queued)
        if self._config["debug"]:
            _log.debug("track %s distinct_id=%s", event, distinct_id)

    def identify(
        self,
        distinct_id: str,
        properties: Optional[EventProperties] = None,
    ) -> None:
        """Associate a distinct ID with a set of user properties.

        Unlike ``track()``, this POSTs synchronously to ``/api/v1/identify`` -
        callers can gate user-creation flows on it returning.

        Failures are logged but never raised; we never want an analytics call
        to break the host application's control flow.

        :param distinct_id: The user identifier to attach properties to.
        :param properties: Property bag (e.g. ``{"email": "...", "plan": "pro"}``).
        """
        if self._is_shutdown:
            if self._config["debug"]:
                _log.warning("identify() called after shutdown() - ignoring")
            return
        if not distinct_id:
            if self._config["debug"]:
                _log.warning("identify() requires a distinct_id")
            return

        url = f"{self._config['host']}/api/v1/identify"
        body = json.dumps(
            {
                "distinctId": distinct_id,
                "properties": properties if properties is not None else {},
            }
        ).encode("utf-8")
        req = urllib_request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config['api_key']}",
                "User-Agent": "serla-python/0.1.0",
            },
        )
        try:
            with urllib_request.urlopen(req, timeout=30) as resp:
                resp.read()
            if self._config["debug"]:
                _log.debug("identify distinct_id=%s", distinct_id)
        except urllib_error.HTTPError as err:
            if self._config["debug"]:
                _log.warning("identify failed: HTTP %s", err.code)
        except urllib_error.URLError as err:
            if self._config["debug"]:
                _log.warning("identify failed: %s", err.reason)
        except Exception as err:  # pragma: no cover - defensive
            if self._config["debug"]:
                _log.warning("identify failed: %s", err)

    def flush(self, timeout: Optional[float] = 30.0) -> None:
        """Block until queued events have been delivered (or fail).

        Call this before exiting a serverless function so events aren't lost
        when the runtime freezes the process. Use ``timeout`` to bound the
        wait if the endpoint is unreachable.

        :param timeout: Max seconds to wait. Pass ``None`` for unbounded.
        """
        self._queue.drain(timeout=timeout)

    def shutdown(self, timeout: Optional[float] = 30.0) -> None:
        """Flush remaining events and stop the worker thread.

        Idempotent: calling shutdown multiple times is safe. After shutdown,
        subsequent ``track()``/``identify()`` calls log a warning and drop
        the event.

        :param timeout: Max seconds to wait for the final flush.
        """
        with self._shutdown_lock:
            if self._is_shutdown:
                return
            self._is_shutdown = True

        try:
            self._queue.drain(timeout=timeout)
        finally:
            # Stop the worker even if drain timed out - otherwise the daemon
            # thread keeps spinning until the interpreter exits.
            self._queue.stop(timeout=timeout)
            if self._atexit_registered:
                # Unregister so shutdown() called during atexit doesn't try to
                # re-enter via the atexit handler.
                try:
                    atexit.unregister(self._atexit_handler)
                except Exception:  # pragma: no cover - defensive
                    pass
                self._atexit_registered = False
            if self._config["debug"]:
                _log.debug("shutdown complete")

    def pending_count(self) -> int:
        """Number of events currently buffered (not yet sent).

        Useful for tests, debugging, or simple "are we caught up?" health
        checks.
        """
        return self._queue.pending_count()

    # -- context-manager protocol -------------------------------------------

    def __enter__(self) -> "Serla":
        return self

    def __exit__(
        self,
        exc_type: Any,
        exc: Any,
        tb: Any,
    ) -> None:
        # On context exit, drain and stop the worker. We pass a generous
        # timeout so one-shot scripts have a real shot at delivery, but bound
        # it so a wedged endpoint can't hang the script forever.
        self.shutdown(timeout=30.0)

    # -- internals -----------------------------------------------------------

    def _atexit_handler(self) -> None:
        """Best-effort flush on normal interpreter exit.

        We swallow everything here - we're already in process teardown and
        raising an exception out of an atexit handler is purely noise.
        """
        try:
            self.shutdown(timeout=5.0)
        except Exception:
            # Last-resort: log via the stdlib root since our logger may be
            # torn down. Even this can fail during interpreter shutdown,
            # so wrap it too.
            try:
                _log.warning("error during atexit shutdown", exc_info=True)
            except Exception:
                pass


def _coerce_timestamp(ts: Optional[Union[_dt.datetime, str]]) -> str:
    """Normalize a timestamp input to an ISO-8601 string.

    Naive datetimes are assumed to be UTC - this matches the Node SDK's
    ``new Date().toISOString()`` which also emits a 'Z' suffix.
    """
    if ts is None:
        return _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
    if isinstance(ts, _dt.datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=_dt.timezone.utc)
        return ts.isoformat().replace("+00:00", "Z")
    # Trust the caller to have formatted it correctly. We don't try to parse
    # and re-emit because that risks lossy round-tripping.
    return str(ts)
