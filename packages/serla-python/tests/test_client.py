"""Tests for the Serla Python SDK.

These tests mock ``urllib.request.urlopen`` so they never make a real network
call. They verify the public-API contract: request shape, headers, threading
behavior, idempotent shutdown, and context-manager handling.
"""

from __future__ import annotations

import json
import threading
import time
from typing import Any, List
from unittest import mock

import pytest

from serla import Serla


class _FakeResponse:
    """A context-manager-shaped stand-in for ``http.client.HTTPResponse``."""

    def __init__(self, status: int = 202, body: bytes = b"") -> None:
        self.status = status
        self._body = body

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def read(self) -> bytes:
        return self._body


class _Recorder:
    """Captures urllib requests so we can assert against them."""

    def __init__(self) -> None:
        self.requests: List[Any] = []
        self.lock = threading.Lock()

    def __call__(self, req: Any, timeout: float = 30) -> _FakeResponse:
        with self.lock:
            self.requests.append(
                {
                    "url": req.full_url,
                    "method": req.get_method(),
                    "headers": dict(req.header_items()),
                    "body": req.data,
                }
            )
        return _FakeResponse()


@pytest.fixture
def recorder() -> _Recorder:
    return _Recorder()


def test_init_requires_api_key() -> None:
    with pytest.raises(ValueError):
        Serla(api_key="")


def test_track_enqueues_event(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(api_key="sk_test_key", flush_on_exit=False)
            try:
                serla.track(
                    event="signup",
                    distinct_id="user_123",
                    properties={"plan": "pro"},
                )
                # Before flush, the event sits in the buffer.
                assert serla.pending_count() == 1
                serla.flush(timeout=5.0)
                assert serla.pending_count() == 0
            finally:
                serla.shutdown(timeout=5.0)

    # Exactly one POST should have happened for the batch.
    batch_requests = [r for r in recorder.requests if "events/batch" in r["url"]]
    assert len(batch_requests) == 1
    req = batch_requests[0]
    assert req["url"].endswith("/api/v1/events/batch")
    assert req["method"] == "POST"

    body = json.loads(req["body"].decode("utf-8"))
    assert "events" in body
    assert len(body["events"]) == 1
    event = body["events"][0]
    assert event["name"] == "signup"
    assert event["distinctId"] == "user_123"
    assert event["properties"] == {"plan": "pro"}
    assert "timestamp" in event


def test_authorization_header_present(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(api_key="sk_test_key", flush_on_exit=False)
            try:
                serla.track(event="x", distinct_id="u")
                serla.flush(timeout=5.0)
            finally:
                serla.shutdown(timeout=5.0)

    req = next(r for r in recorder.requests if "events/batch" in r["url"])
    # urllib lowercases header names; check case-insensitively.
    headers = {k.lower(): v for k, v in req["headers"].items()}
    assert headers.get("authorization") == "Bearer sk_test_key"
    assert headers.get("content-type") == "application/json"


def test_idempotency_key_present(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(api_key="sk_test_key", flush_on_exit=False)
            try:
                serla.track(event="x", distinct_id="u")
                serla.flush(timeout=5.0)
            finally:
                serla.shutdown(timeout=5.0)

    req = next(r for r in recorder.requests if "events/batch" in r["url"])
    headers = {k.lower(): v for k, v in req["headers"].items()}
    key = headers.get("x-idempotency-key")
    assert key is not None
    # uuid4 strings are 36 chars: 8-4-4-4-12.
    assert len(key) == 36


def test_identify_posts_to_identify_endpoint(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(api_key="sk_test_key", flush_on_exit=False)
            try:
                serla.identify(
                    "user_123",
                    properties={"email": "a@example.com", "plan": "pro"},
                )
            finally:
                serla.shutdown(timeout=5.0)

    ident = [r for r in recorder.requests if "identify" in r["url"]]
    assert len(ident) == 1
    req = ident[0]
    assert req["url"].endswith("/api/v1/identify")
    assert req["method"] == "POST"

    body = json.loads(req["body"].decode("utf-8"))
    assert body == {
        "distinctId": "user_123",
        "properties": {"email": "a@example.com", "plan": "pro"},
    }
    headers = {k.lower(): v for k, v in req["headers"].items()}
    assert headers.get("authorization") == "Bearer sk_test_key"


def test_context_manager_flushes_on_exit(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            with Serla(api_key="sk_test_key", flush_on_exit=False) as serla:
                serla.track(event="ctx_test", distinct_id="u")
            # After context exit, no events should remain buffered.
            assert serla.pending_count() == 0

    batch_requests = [r for r in recorder.requests if "events/batch" in r["url"]]
    assert len(batch_requests) == 1


def test_shutdown_is_idempotent(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(api_key="sk_test_key", flush_on_exit=False)
            serla.track(event="x", distinct_id="u")
            serla.shutdown(timeout=5.0)
            # Calling again must not raise and must be a no-op.
            serla.shutdown(timeout=5.0)
            serla.shutdown(timeout=5.0)
            # Post-shutdown track() is silently dropped.
            serla.track(event="dropped", distinct_id="u")
            assert serla.pending_count() == 0


def test_batch_size_triggers_immediate_flush(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(
                api_key="sk_test_key",
                batch_size=3,
                flush_interval_seconds=60,  # so only batch-size triggers flush
                flush_on_exit=False,
            )
            try:
                serla.track(event="a", distinct_id="u")
                serla.track(event="b", distinct_id="u")
                serla.track(event="c", distinct_id="u")
                # Give the worker thread a moment to wake up and POST.
                deadline = time.monotonic() + 5.0
                while time.monotonic() < deadline:
                    if serla.pending_count() == 0:
                        break
                    time.sleep(0.05)
                assert serla.pending_count() == 0
            finally:
                serla.shutdown(timeout=5.0)

    batch_requests = [r for r in recorder.requests if "events/batch" in r["url"]]
    assert len(batch_requests) >= 1


def test_track_validates_inputs(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(api_key="sk_test_key", flush_on_exit=False)
            try:
                # Missing event name - silently dropped.
                serla.track(event="", distinct_id="u")
                # Missing distinct_id - silently dropped.
                serla.track(event="x", distinct_id="")
                assert serla.pending_count() == 0
            finally:
                serla.shutdown(timeout=5.0)


def test_host_trailing_slash_normalized(recorder: _Recorder) -> None:
    with mock.patch("serla._queue.urllib_request.urlopen", recorder):
        with mock.patch("serla._client.urllib_request.urlopen", recorder):
            serla = Serla(
                api_key="sk_test_key",
                host="https://example.com/",
                flush_on_exit=False,
            )
            try:
                serla.identify("u", properties={"x": 1})
            finally:
                serla.shutdown(timeout=5.0)

    req = next(r for r in recorder.requests if "identify" in r["url"])
    assert req["url"] == "https://example.com/api/v1/identify"
