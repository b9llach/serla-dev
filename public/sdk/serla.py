"""
Serla Analytics SDK for Python
Simple, privacy-focused analytics

Supports both synchronous and asynchronous usage.

Methods:
    - track(name, ...) - Queue an event for batched sending (efficient for high volume)
    - send(name, ...)  - Send a single event immediately (for critical events)
    - identify(distinct_id, properties) - Identify a user
    - flush() - Force send all queued events
    - reset() - Clear user identity and session
    - get_session_id() - Get current session ID
    - get_user_id() - Get current user ID
    - set_debug(enabled) - Enable/disable debug mode

Sync Usage:
    from serla import Serla

    serla = Serla('sk_live_...', debug=True)
    serla.track('page_view', distinct_id='user_123')  # Batched
    serla.send('purchase', distinct_id='user_123', properties={'amount': 99.99})  # Immediate
    serla.flush()  # Send remaining batched events

Async Usage:
    from serla import AsyncSerla

    async with AsyncSerla('sk_live_...') as serla:
        await serla.track('page_view', distinct_id='user_123')  # Batched
        await serla.send('purchase', properties={'amount': 99.99})  # Immediate
"""

import json
import asyncio
import threading
import uuid
from typing import Optional, Dict, Any, List
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from datetime import datetime

# Check if aiohttp is available for async support
try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False


def _generate_id() -> str:
    """Generate a UUID-based ID."""
    return str(uuid.uuid4())


class Serla:
    """Synchronous Serla client with automatic batching."""

    def __init__(
        self,
        api_key: str,
        endpoint: str = "https://serla.dev/api/v1",
        flush_interval: float = 5.0,
        max_batch_size: int = 10,
        debug: bool = False,
    ):
        self.api_key = api_key
        self.endpoint = endpoint
        self.flush_interval = flush_interval
        self.max_batch_size = max_batch_size
        self._debug = debug
        self._queue: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._timer: Optional[threading.Timer] = None
        self._user_id: Optional[str] = None
        self._session_id: str = "sess_" + _generate_id()

    def _log(self, *args) -> None:
        """Log debug messages."""
        if self._debug:
            print("[Serla]", *args)

    def set_debug(self, enabled: bool) -> None:
        """Enable or disable debug mode."""
        self._debug = enabled
        self._log("Debug mode", "enabled" if enabled else "disabled")

    def get_session_id(self) -> str:
        """Get the current session ID."""
        return self._session_id

    def get_user_id(self) -> Optional[str]:
        """Get the current user ID."""
        return self._user_id

    def reset(self) -> None:
        """Clear user identity and create a new session."""
        self._log("Resetting identity and session")
        self._user_id = None
        self._session_id = "sess_" + _generate_id()
        self._log("New session:", self._session_id)

    def track(
        self,
        name: str,
        distinct_id: Optional[str] = None,
        session_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> None:
        """Track an event (batched)."""
        event: Dict[str, Any] = {
            "name": name,
            "properties": properties or {},
            "timestamp": timestamp or datetime.utcnow().isoformat() + "Z",
        }
        # Use provided IDs or fall back to stored IDs
        event["distinctId"] = distinct_id or self._user_id
        event["sessionId"] = session_id or self._session_id

        self._log("Tracking event:", name, event)

        with self._lock:
            self._queue.append(event)

            if len(self._queue) >= self.max_batch_size:
                self._flush()
            else:
                self._schedule_flush()

    def send(
        self,
        name: str,
        distinct_id: Optional[str] = None,
        session_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send a single event immediately (no batching)."""
        event: Dict[str, Any] = {
            "name": name,
            "properties": properties or {},
        }
        # Use provided IDs or fall back to stored IDs
        event["distinctId"] = distinct_id or self._user_id
        event["sessionId"] = session_id or self._session_id
        if timestamp is not None:
            event["timestamp"] = timestamp

        self._log("Sending event immediately:", name, event)
        result = self._request("POST", "/events", event)
        self._log("Send successful:", result)
        return result

    def identify(self, distinct_id: str, properties: Dict[str, Any]) -> None:
        """Identify a user with properties."""
        self._log("Identifying user:", distinct_id, properties)
        self._user_id = distinct_id
        payload = {"distinctId": distinct_id, "properties": properties}
        self._request("POST", "/identify", payload)
        self._log("Identify successful")

    def flush(self) -> None:
        """Force flush all queued events."""
        with self._lock:
            self._flush()

    def _flush(self) -> None:
        """Internal flush (must hold lock)."""
        if self._timer:
            self._timer.cancel()
            self._timer = None

        if not self._queue:
            return

        events = self._queue[: self.max_batch_size]
        self._queue = self._queue[self.max_batch_size :]

        self._log("Flushing", len(events), "events")

        try:
            self._request("POST", "/events/batch", {"events": events})
            self._log("Flush successful")
        except Exception as e:
            # Re-queue failed events
            self._queue = events + self._queue
            self._log("Flush failed:", str(e))
            raise e

    def _schedule_flush(self) -> None:
        """Schedule a flush (must hold lock)."""
        if self._timer:
            return

        self._timer = threading.Timer(self.flush_interval, self._timer_flush)
        self._timer.daemon = True
        self._timer.start()

    def _timer_flush(self) -> None:
        """Flush triggered by timer."""
        with self._lock:
            self._timer = None
            self._flush()

    def _request(self, method: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make an HTTP request to the API."""
        url = f"{self.endpoint}{path}"
        data = json.dumps(payload).encode("utf-8")

        request = Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method=method,
        )

        try:
            with urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as e:
            raise Exception(f"HTTP {e.code}: {e.read().decode('utf-8')}")
        except URLError as e:
            raise Exception(f"Network error: {e.reason}")

    def __del__(self):
        """Flush remaining events on destruction."""
        try:
            self.flush()
        except Exception:
            pass


class AsyncSerla:
    """Asynchronous Serla client with automatic batching.

    Requires aiohttp: pip install aiohttp

    Usage:
        async with AsyncSerla('sk_live_...') as serla:
            await serla.track('event_name', distinct_id='user_123')

    Or:
        serla = AsyncSerla('sk_live_...')
        await serla.track('event_name')
        await serla.close()
    """

    def __init__(
        self,
        api_key: str,
        endpoint: str = "https://serla.dev/api/v1",
        flush_interval: float = 5.0,
        max_batch_size: int = 10,
        debug: bool = False,
    ):
        if not HAS_AIOHTTP:
            raise ImportError("aiohttp is required for async support. Install with: pip install aiohttp")

        self.api_key = api_key
        self.endpoint = endpoint
        self.flush_interval = flush_interval
        self.max_batch_size = max_batch_size
        self._debug = debug
        self._queue: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._flush_task: Optional[asyncio.Task] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._closed = False
        self._user_id: Optional[str] = None
        self._session_id: str = "sess_" + _generate_id()

    def _log(self, *args) -> None:
        """Log debug messages."""
        if self._debug:
            print("[Serla]", *args)

    def set_debug(self, enabled: bool) -> None:
        """Enable or disable debug mode."""
        self._debug = enabled
        self._log("Debug mode", "enabled" if enabled else "disabled")

    def get_session_id(self) -> str:
        """Get the current session ID."""
        return self._session_id

    def get_user_id(self) -> Optional[str]:
        """Get the current user ID."""
        return self._user_id

    def reset(self) -> None:
        """Clear user identity and create a new session."""
        self._log("Resetting identity and session")
        self._user_id = None
        self._session_id = "sess_" + _generate_id()
        self._log("New session:", self._session_id)

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create the aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=10),
            )
        return self._session

    async def track(
        self,
        name: str,
        distinct_id: Optional[str] = None,
        session_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> None:
        """Track an event asynchronously (batched)."""
        if self._closed:
            raise RuntimeError("Client has been closed")

        event: Dict[str, Any] = {
            "name": name,
            "properties": properties or {},
            "timestamp": timestamp or datetime.utcnow().isoformat() + "Z",
        }
        # Use provided IDs or fall back to stored IDs
        event["distinctId"] = distinct_id or self._user_id
        event["sessionId"] = session_id or self._session_id

        self._log("Tracking event:", name, event)

        async with self._lock:
            self._queue.append(event)

            if len(self._queue) >= self.max_batch_size:
                await self._flush()
            else:
                self._schedule_flush()

    async def send(
        self,
        name: str,
        distinct_id: Optional[str] = None,
        session_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send a single event immediately (no batching)."""
        if self._closed:
            raise RuntimeError("Client has been closed")

        event: Dict[str, Any] = {
            "name": name,
            "properties": properties or {},
        }
        # Use provided IDs or fall back to stored IDs
        event["distinctId"] = distinct_id or self._user_id
        event["sessionId"] = session_id or self._session_id
        if timestamp is not None:
            event["timestamp"] = timestamp

        self._log("Sending event immediately:", name, event)
        result = await self._request("POST", "/events", event)
        self._log("Send successful:", result)
        return result

    async def identify(self, distinct_id: str, properties: Dict[str, Any]) -> None:
        """Identify a user with properties asynchronously."""
        if self._closed:
            raise RuntimeError("Client has been closed")
        self._log("Identifying user:", distinct_id, properties)
        self._user_id = distinct_id
        payload = {"distinctId": distinct_id, "properties": properties}
        await self._request("POST", "/identify", payload)
        self._log("Identify successful")

    async def flush(self) -> None:
        """Force flush all queued events asynchronously."""
        async with self._lock:
            await self._flush()

    async def _flush(self) -> None:
        """Internal flush (must hold lock)."""
        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()
            self._flush_task = None

        if not self._queue:
            return

        events = self._queue[: self.max_batch_size]
        self._queue = self._queue[self.max_batch_size :]

        self._log("Flushing", len(events), "events")

        try:
            await self._request("POST", "/events/batch", {"events": events})
            self._log("Flush successful")
        except Exception as e:
            # Re-queue failed events
            self._queue = events + self._queue
            self._log("Flush failed:", str(e))
            raise e

    def _schedule_flush(self) -> None:
        """Schedule a flush."""
        if self._flush_task and not self._flush_task.done():
            return

        async def delayed_flush():
            await asyncio.sleep(self.flush_interval)
            async with self._lock:
                await self._flush()

        self._flush_task = asyncio.create_task(delayed_flush())

    async def _request(self, method: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make an async HTTP request to the API."""
        url = f"{self.endpoint}{path}"
        session = await self._get_session()

        async with session.request(method, url, json=payload) as response:
            if response.status >= 400:
                text = await response.text()
                raise Exception(f"HTTP {response.status}: {text}")
            return await response.json()

    async def close(self) -> None:
        """Close the client and flush remaining events."""
        if self._closed:
            return
        self._closed = True

        try:
            await self.flush()
        except Exception:
            pass

        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()

        if self._session and not self._session.closed:
            await self._session.close()

    async def __aenter__(self) -> "AsyncSerla":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()


# Convenience functions for sync usage
_default_client: Optional[Serla] = None


def init(api_key: str, **kwargs) -> Serla:
    """Initialize the default Serla client."""
    global _default_client
    _default_client = Serla(api_key, **kwargs)
    return _default_client


def track(name: str, **kwargs) -> None:
    """Track an event using the default client (batched)."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    _default_client.track(name, **kwargs)


def send(name: str, **kwargs) -> Dict[str, Any]:
    """Send a single event immediately using the default client (no batching)."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    return _default_client.send(name, **kwargs)


def identify(distinct_id: str, properties: Dict[str, Any]) -> None:
    """Identify a user using the default client."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    _default_client.identify(distinct_id, properties)


def flush() -> None:
    """Flush events using the default client."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    _default_client.flush()


def reset() -> None:
    """Reset identity using the default client."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    _default_client.reset()


def get_session_id() -> str:
    """Get session ID using the default client."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    return _default_client.get_session_id()


def get_user_id() -> Optional[str]:
    """Get user ID using the default client."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    return _default_client.get_user_id()


def set_debug(enabled: bool) -> None:
    """Set debug mode using the default client."""
    if _default_client is None:
        raise RuntimeError("Call serla.init() first")
    _default_client.set_debug(enabled)


# Async convenience functions
_async_client: Optional[AsyncSerla] = None


async def async_init(api_key: str, **kwargs) -> AsyncSerla:
    """Initialize the default async Serla client."""
    global _async_client
    _async_client = AsyncSerla(api_key, **kwargs)
    return _async_client


async def async_track(name: str, **kwargs) -> None:
    """Track an event using the default async client (batched)."""
    if _async_client is None:
        raise RuntimeError("Call await serla.async_init() first")
    await _async_client.track(name, **kwargs)


async def async_send(name: str, **kwargs) -> Dict[str, Any]:
    """Send a single event immediately using the default async client (no batching)."""
    if _async_client is None:
        raise RuntimeError("Call await serla.async_init() first")
    return await _async_client.send(name, **kwargs)


async def async_identify(distinct_id: str, properties: Dict[str, Any]) -> None:
    """Identify a user using the default async client."""
    if _async_client is None:
        raise RuntimeError("Call await serla.async_init() first")
    await _async_client.identify(distinct_id, properties)


async def async_flush() -> None:
    """Flush events using the default async client."""
    if _async_client is None:
        raise RuntimeError("Call await serla.async_init() first")
    await _async_client.flush()


async def async_reset() -> None:
    """Reset identity using the default async client."""
    if _async_client is None:
        raise RuntimeError("Call await serla.async_init() first")
    _async_client.reset()


async def async_close() -> None:
    """Close the default async client."""
    global _async_client
    if _async_client is not None:
        await _async_client.close()
        _async_client = None
