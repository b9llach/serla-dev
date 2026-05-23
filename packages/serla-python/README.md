# serla

Official Python SDK for [Serla](https://serla.dev) - privacy-focused product analytics for developers.

- Zero runtime dependencies (stdlib `urllib` for HTTP)
- Class-based: instantiate as many clients as you need
- Background daemon-thread flusher with exponential-backoff retries
- Batched delivery with per-batch idempotency keys
- Graceful shutdown via `flush()` / `shutdown()` / `atexit` hook
- Context-manager support for one-shot scripts
- Type hints throughout, Python 3.9+

## Install

```bash
pip install serla
```

## Quick start

```python
from serla import Serla

serla = Serla(
    api_key="sk_live_...",
    # Optional - defaults shown
    host="https://serla.dev",
    flush_interval_seconds=5,
    batch_size=50,
    debug=False,
)

# Track an event
serla.track(
    event="signup_completed",
    distinct_id="user_123",
    properties={"plan": "pro", "source": "organic"},
)

# Identify a user (synchronous - hits /api/v1/identify directly)
serla.identify(
    "user_123",
    properties={"email": "a@example.com", "plan": "pro"},
)

# Force a flush before shutdown
serla.flush()
serla.shutdown()
```

### One-shot scripts: use the context manager

For cron jobs and one-off scripts, the `with` form auto-flushes on exit:

```python
from serla import Serla

with Serla(api_key="sk_live_...") as serla:
    serla.track(event="cron_finished", distinct_id="cron")
    # shutdown() + flush() happen automatically when the block exits
```

## Configuration

| Option                   | Type    | Default               | Description                                                              |
| ------------------------ | ------- | --------------------- | ------------------------------------------------------------------------ |
| `api_key`                | `str`   | (required)            | Your project API key (`sk_live_...`).                                    |
| `host`                   | `str`   | `https://serla.dev`   | Base URL of your Serla deployment.                                       |
| `batch_size`             | `int`   | `50`                  | Max events per flushed batch. Larger batches reduce network overhead.    |
| `flush_interval_seconds` | `float` | `5.0`                 | How often the background thread flushes the queue.                       |
| `debug`                  | `bool`  | `False`               | Sets the `serla` logger to `DEBUG` and attaches a default stderr handler.|
| `flush_on_exit`          | `bool`  | `True`                | Register an `atexit` hook for best-effort flush on interpreter exit.     |

## API reference

### `Serla(api_key, *, host=..., flush_interval_seconds=..., batch_size=..., debug=..., flush_on_exit=...)`

Construct a client. Raises `ValueError` if `api_key` is empty. Reuse the instance for the lifetime of the process.

### `serla.track(event, distinct_id, properties=None, timestamp=None)`

Enqueue an event for asynchronous delivery. Non-blocking - returns immediately. The event is sent on the next flush tick or when the buffer fills up.

```python
import datetime

serla.track(
    event="order_placed",
    distinct_id="user_123",
    properties={"total_cents": 4900, "currency": "USD"},
    timestamp=datetime.datetime.now(datetime.timezone.utc),  # optional
)
```

`distinct_id` is **required** - there's no anonymous-ID fallback on the server. If you don't know the user yet, pass a stable system identifier (org ID, hashed IP, etc).

`timestamp` accepts a `datetime` (naive datetimes are assumed to be UTC) or a pre-formatted ISO-8601 string. If omitted, the current UTC time is used.

### `serla.identify(distinct_id, properties=None)`

Set user properties for a distinct ID. POSTs synchronously to `/api/v1/identify` and returns when the response arrives. Failures are logged but never raised.

```python
serla.identify(
    "user_123",
    properties={
        "email": "a@example.com",
        "plan": "pro",
        "signed_up_at": "2025-01-01T00:00:00Z",
    },
)
```

### `serla.flush(timeout=30.0)`

Block until all currently-queued events have been delivered (or definitively failed and re-queued for retry). Pass `timeout=None` for an unbounded wait.

Call this before a serverless function returns so events aren't lost when the runtime freezes the process.

### `serla.shutdown(timeout=30.0)`

Flush the queue, stop the worker thread, and unregister the `atexit` hook. Safe to call multiple times. After shutdown, `track()` and `identify()` calls are dropped (with a warning logged in debug mode).

### `serla.pending_count() -> int`

Returns the number of events currently buffered. Useful for tests or "are we caught up?" health checks.

### Context-manager protocol

```python
with Serla(api_key="...") as serla:
    serla.track(event="x", distinct_id="u")
# shutdown() is called automatically on block exit
```

## Framework examples

### Django

```python
# settings.py
import os
SERLA_API_KEY = os.environ["SERLA_API_KEY"]
```

```python
# analytics.py - one shared client for the whole process
from django.conf import settings
from serla import Serla

serla = Serla(api_key=settings.SERLA_API_KEY)
```

```python
# views.py
from django.http import JsonResponse
from .analytics import serla

def signup(request):
    user = create_user(request.POST)
    serla.track(
        event="signup_completed",
        distinct_id=str(user.id),
        properties={"plan": user.plan},
    )
    return JsonResponse({"ok": True})
```

Optional middleware idea - track every request:

```python
# middleware.py
from .analytics import serla

class AnalyticsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.user.is_authenticated:
            serla.track(
                event="request_handled",
                distinct_id=str(request.user.id),
                properties={"path": request.path, "status": response.status_code},
            )
        return response
```

### FastAPI

Use a lifespan handler to ensure events flush on shutdown:

```python
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from serla import Serla

serla = Serla(api_key="sk_live_...")

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    serla.shutdown()

app = FastAPI(lifespan=lifespan)

def get_serla() -> Serla:
    return serla

@app.post("/signup")
async def signup(user_id: str, serla: Serla = Depends(get_serla)):
    serla.track(
        event="signup_completed",
        distinct_id=user_id,
        properties={"source": "api"},
    )
    return {"ok": True}
```

### Flask

```python
from flask import Flask, request
from serla import Serla

app = Flask(__name__)
serla = Serla(api_key="sk_live_...")

@app.post("/signup")
def signup():
    serla.track(
        event="signup_completed",
        distinct_id=request.json["user_id"],
        properties={"plan": request.json.get("plan")},
    )
    return {"ok": True}

@app.teardown_appcontext
def _teardown(_exc):
    # Optional: ensure pending events are flushed at the end of each request.
    # In a long-running gunicorn worker, the periodic flusher will handle
    # this on its own - you only need this for short-lived processes.
    pass

import atexit
atexit.register(serla.shutdown)
```

### AWS Lambda

```python
from serla import Serla

# Module-level: reused across warm invocations.
serla = Serla(api_key="...")

def handler(event, context):
    serla.track(
        event="lambda_invoked",
        distinct_id=event["user_id"],
        properties={"region": "us-east-1"},
    )
    # CRITICAL: Lambda freezes the execution context when the handler returns.
    # If you don't flush, events queued during this invocation sit in the
    # buffer until the next invocation (or are lost if the container is
    # recycled).
    serla.flush()
    return {"statusCode": 200}
```

### One-shot script

```python
from serla import Serla

with Serla(api_key="sk_live_...") as serla:
    for record in batch_records:
        serla.track(
            event="record_processed",
            distinct_id=record["user_id"],
            properties={"size": record["size"]},
        )
# All events flush automatically on context exit.
```

### Plain script with `atexit`

If you can't use the context manager, the default `flush_on_exit=True` already registers an `atexit` hook so events flush on normal interpreter exit:

```python
from serla import Serla

serla = Serla(api_key="sk_live_...")
serla.track(event="started", distinct_id="cron")
# Script exits, atexit hook flushes the queue.
```

## Reliability

- Events are queued in memory and flushed every `flush_interval_seconds`.
- Forced flush when the buffer reaches `batch_size`.
- On flush failure, events are re-queued at the front of the buffer.
- Buffer is capped at **1000 events** to prevent unbounded memory growth when the endpoint is down.
- **Exponential backoff** on failure: 1s, 2s, 4s, 8s, 16s, max 30s. The worker thread will not retry until the backoff window elapses, so a broken endpoint isn't hammered.
- Every batch carries an `X-Idempotency-Key` (`uuid4`) header so the server can dedupe retried-and-eventually-succeeded batches.
- All network I/O happens on a daemon thread. The thread is started in `__init__` and stopped in `shutdown()`. Because it's `daemon=True`, it won't prevent the interpreter from exiting even if `shutdown()` is never called.

## Comparison

|                       | `serla-python`              | `serla-node`                  | `serla-js` (browser)         |
| --------------------- | --------------------------- | ----------------------------- | ---------------------------- |
| Runtime               | Python 3.9+                 | Node 18+                      | Browsers                     |
| Singleton             | No (`Serla(api_key=...)`)   | No (`new Serla({...})`)       | Yes (`Serla.init()`)         |
| Distinct ID           | **Required** on every track | **Required** on every track   | Auto-generated, localStorage |
| Session tracking      | None                        | None                          | Auto, 30min inactivity       |
| Page context          | None                        | None                          | window.location, document    |
| Async API             | Blocking-on-flush           | `await flush()`               | Fire-and-forget              |
| Unload flush          | `atexit` + daemon thread    | `beforeExit` hook             | `navigator.sendBeacon`       |
| Worker delivery       | `threading.Thread(daemon)`  | `setInterval(...).unref()`    | `setInterval` + sendBeacon   |
| HTTP transport        | `urllib.request` (stdlib)   | `fetch` (Node 18+)            | `fetch` / `sendBeacon`       |
| Runtime deps          | Zero                        | Zero                          | Zero                         |

## License

MIT
