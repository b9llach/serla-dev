"""Internal type definitions for the Serla SDK.

We use TypedDict over dataclasses here because the wire format is JSON-shaped
and TypedDicts serialize via `json.dumps` without any helper code, while staying
zero-cost at runtime.
"""

from __future__ import annotations

from typing import Any, Dict, TypedDict


# Arbitrary JSON-serializable event properties keyed by string. Values are
# typed as Any because user-supplied properties can be anything JSON-encodable
# (nested dicts, lists, primitives) - constraining further would just push the
# `type: ignore` comments onto callers.
EventProperties = Dict[str, Any]


class QueuedEvent(TypedDict):
    """The serialized shape of a single event as it sits in the queue and as
    it's posted to ``/api/v1/events/batch``. Field names match the Node SDK
    (camelCase) because they hit the same server endpoint.
    """

    name: str
    distinctId: str
    properties: EventProperties
    timestamp: str


class ResolvedConfig(TypedDict):
    """Config after defaults have been applied. Used internally by the queue
    and client so neither has to re-handle ``None``s.
    """

    api_key: str
    host: str
    batch_size: int
    flush_interval_seconds: float
    debug: bool
    flush_on_exit: bool
