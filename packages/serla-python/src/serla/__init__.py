"""Serla - official Python SDK.

See https://serla.dev for documentation.

Public surface::

    from serla import Serla

    serla = Serla(api_key="sk_live_...")
    serla.track(event="signup", distinct_id="user_123", properties={"plan": "pro"})
    serla.identify("user_123", properties={"email": "a@example.com"})
    serla.flush()
    serla.shutdown()
"""

from __future__ import annotations

from ._client import Serla
from ._types import EventProperties

__version__ = "0.1.0"

__all__ = [
    "Serla",
    "EventProperties",
    "__version__",
]
