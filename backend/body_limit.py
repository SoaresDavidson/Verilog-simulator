"""ASGI middleware that caps the size of request bodies while they arrive."""

from collections.abc import Callable

from fastapi import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: Room left for multipart boundaries and part headers around the uploaded file.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def too_large_message(limit_bytes: int) -> str:
    """Return the pt-BR message used for every oversized upload."""
    return (
        "O arquivo enviado excede o limite de "
        f"{limit_bytes / (1024 * 1024):.1f} MB."
    )


class RequestBodyTooLargeError(HTTPException):
    """Raised from ``receive`` once the streamed body passes the limit.

    Subclassing ``HTTPException`` makes FastAPI re-raise it untouched while it
    parses the body, so the client gets ``413`` instead of a generic ``400``.
    """

    def __init__(self, limit_bytes: int) -> None:
        super().__init__(status_code=413, detail=too_large_message(limit_bytes))


class BodySizeLimitMiddleware:
    """Reject bodies larger than the limit before they are buffered.

    The declared ``Content-Length`` is checked first (cheap early rejection) and
    the bytes actually received are counted as well, because the header is
    controlled by the client and may be absent (chunked transfer).
    """

    def __init__(self, app: ASGIApp, limit_bytes: Callable[[], int]) -> None:
        self.app = app
        self.limit_bytes = limit_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        file_limit = self.limit_bytes()
        body_limit = file_limit + MULTIPART_OVERHEAD_BYTES
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > body_limit:
            response = JSONResponse(
                {"detail": too_large_message(file_limit)}, status_code=413
            )
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > body_limit:
                    raise RequestBodyTooLargeError(file_limit)
            return message

        await self.app(scope, limited_receive, send)
