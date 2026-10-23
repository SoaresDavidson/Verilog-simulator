"""Correlation id per request (#12).

The middleware takes the client's ``X-Request-ID`` when it is a safe token
(otherwise generates one), binds it to the log context for the whole request,
returns it in the ``X-Request-ID`` response header and logs one line per
request with method, path, status and duration.
"""

import logging
import re
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from logging_config import project_id_var, request_id_var

REQUEST_ID_HEADER = "X-Request-ID"

#: Incoming ids are echoed into logs and headers, so only plain tokens are kept.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

logger = logging.getLogger("app.request")


def _incoming_request_id(scope: Scope) -> str | None:
    for name, value in scope["headers"]:
        if name == b"x-request-id":
            candidate = value.decode("latin-1").strip()
            return candidate if _VALID_REQUEST_ID.fullmatch(candidate) else None
    return None


class RequestIdMiddleware:
    """Bind a request id to the log context and echo it in the response.

    Registered as the outermost middleware so every response, including the
    ``413`` produced by the body limit and CORS preflights, carries the header.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _incoming_request_id(scope) or uuid.uuid4().hex
        request_token = request_id_var.set(request_id)
        project_token = project_id_var.set(None)
        status_code = 500
        started = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "%s %s -> %d (%.1f ms)",
                scope["method"],
                scope["path"],
                status_code,
                elapsed_ms,
            )
            project_id_var.reset(project_token)
            request_id_var.reset(request_token)
