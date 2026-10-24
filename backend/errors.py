"""Single error schema of the API and the handlers that produce it (#12).

Every error response has the body::

    {"error": {"code": "YOSYS_TIMEOUT", "message": "...", "request_id": "..."}}

Routes do not translate exceptions themselves: domain exceptions raised by the
integrations propagate and are mapped here to a status, a stable ``code`` and a
pt-BR message that is safe to show to the student (no internal paths, container
names, tracebacks or ``str()`` of Docker library errors). The original
exception is logged on the server.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from http import HTTPStatus

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from integrations.docker import (
    DockerConnectionError,
    DockerContainerNotFoundError,
    DockerContainerUnavailableError,
    DockerIntegrationError,
    DockerResourceLimitError,
    DockerTimeoutError,
)
from integrations.icarus import (
    IcarusContainerNotFoundError,
    IcarusError,
    IcarusResourceLimitError,
    IcarusTimeoutError,
)
from integrations.projects import NoVerilogSourcesError
from integrations.yosys import (
    YosysContainerNotFoundError,
    YosysError,
    YosysResourceLimitError,
    YosysTimeoutError,
)
from logging_config import request_id_var
from services.project_upload import ProjectUploadError

logger = logging.getLogger(__name__)

SYNTHESIS_TIMEOUT_MESSAGE = (
    "O mapeamento excedeu o limite de {seconds:g} segundos e foi interrompido. "
    "Verifique se o projeto não possui hierarquia recursiva ou módulos "
    "excessivamente grandes."
)
SIMULATION_TIMEOUT_MESSAGE = (
    "A simulação excedeu o limite de {seconds:g} segundos e foi interrompida. "
    "Verifique se o seu testbench possui `$finish` e se não há laços infinitos."
)
INTERNAL_ERROR_MESSAGE = (
    "Erro interno no servidor. Tente novamente; se persistir, avise o professor "
    "informando o request_id."
)

_DEFAULT_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    408: "REQUEST_TIMEOUT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}
_DEFAULT_MESSAGES = {
    404: "Recurso não encontrado.",
    405: "Método não permitido para este recurso.",
}


class ApiError(HTTPException):
    """HTTP error with an explicit, stable ``code`` for the error body."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code


def current_request_id() -> str:
    """Return the id of the request being served (``-`` outside a request)."""
    return request_id_var.get() or "-"


def error_response(
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build a response that follows the API error schema."""
    return JSONResponse(
        {"error": {"code": code, "message": message, "request_id": current_request_id()}},
        status_code=status_code,
        headers=headers,
    )


@dataclass(frozen=True, slots=True)
class _DomainError:
    """How a domain exception is presented to the client."""

    status_code: int
    code: str
    message: Callable[[Exception], str]


def _fixed(text: str) -> Callable[[Exception], str]:
    return lambda _exc: text


#: Most specific types first: the first ``isinstance`` match wins.
_DOMAIN_ERRORS: tuple[tuple[type[Exception], _DomainError], ...] = (
    (
        # Estouro do limite de memória do container (#7): problema do projeto do
        # aluno, não da infraestrutura; a mensagem pt-BR já vem da integração.
        YosysResourceLimitError | IcarusResourceLimitError | DockerResourceLimitError,
        _DomainError(422, "RESOURCE_LIMIT_EXCEEDED", str),
    ),
    (
        YosysTimeoutError,
        _DomainError(
            408,
            "YOSYS_TIMEOUT",
            lambda exc: SYNTHESIS_TIMEOUT_MESSAGE.format(seconds=exc.timeout_seconds),
        ),
    ),
    (
        IcarusTimeoutError,
        _DomainError(
            408,
            "ICARUS_TIMEOUT",
            lambda exc: SIMULATION_TIMEOUT_MESSAGE.format(seconds=exc.timeout_seconds),
        ),
    ),
    (
        YosysContainerNotFoundError,
        _DomainError(
            503,
            "YOSYS_UNAVAILABLE",
            _fixed(
                "O serviço de síntese (Yosys) está indisponível no momento. "
                "Tente novamente em instantes; se persistir, avise o professor."
            ),
        ),
    ),
    (
        IcarusContainerNotFoundError,
        _DomainError(
            503,
            "ICARUS_UNAVAILABLE",
            _fixed(
                "O serviço de simulação (Icarus Verilog) está indisponível no momento. "
                "Tente novamente em instantes; se persistir, avise o professor."
            ),
        ),
    ),
    (
        YosysError,
        _DomainError(
            500,
            "YOSYS_ERROR",
            _fixed("Falha interna ao executar a síntese. Tente novamente; se persistir, avise o professor."),
        ),
    ),
    (
        IcarusError,
        _DomainError(
            500,
            "ICARUS_ERROR",
            _fixed("Falha interna ao executar a simulação. Tente novamente; se persistir, avise o professor."),
        ),
    ),
    (
        DockerTimeoutError,
        _DomainError(
            408,
            "TOOL_TIMEOUT",
            _fixed("A execução da ferramenta excedeu o tempo limite e foi interrompida."),
        ),
    ),
    (
        DockerConnectionError | DockerContainerNotFoundError | DockerContainerUnavailableError,
        _DomainError(
            503,
            "DOCKER_UNAVAILABLE",
            _fixed(
                "O ambiente de execução das ferramentas está indisponível no momento. "
                "Tente novamente em instantes; se persistir, avise o professor."
            ),
        ),
    ),
    (
        DockerIntegrationError,
        _DomainError(500, "TOOL_EXECUTION_ERROR", _fixed(INTERNAL_ERROR_MESSAGE)),
    ),
    (
        ProjectUploadError,
        _DomainError(
            400,  # replaced by the exception's own status (400/413)
            "INVALID_UPLOAD",
            lambda exc: exc.message,
        ),
    ),
    (
        NoVerilogSourcesError,
        _DomainError(404, "NO_VERILOG_SOURCES", str),  # message is pt-BR and path-free
    ),
    (
        FileNotFoundError,
        _DomainError(404, "PROJECT_NOT_FOUND", _fixed("Projeto não encontrado.")),
    ),
    (
        NotADirectoryError,
        _DomainError(
            400,
            "INVALID_PROJECT_ID",
            _fixed("project_id inválido: use o valor devolvido pelo upload."),
        ),
    ),
    (
        ValueError,
        _DomainError(
            400,
            "INVALID_REQUEST",
            _fixed("Requisição inválida: use o project_id devolvido pelo upload e parâmetros válidos."),
        ),
    ),
)

DOMAIN_EXCEPTION_TYPES: tuple[type[Exception], ...] = (
    YosysError,
    IcarusError,
    DockerIntegrationError,
    DockerResourceLimitError,
    FileNotFoundError,
    NotADirectoryError,
    ValueError,
)


def _describe_domain_error(exc: Exception) -> tuple[int, str, str]:
    for exc_type, spec in _DOMAIN_ERRORS:
        if isinstance(exc, exc_type):
            status_code, code = spec.status_code, spec.code
            if isinstance(exc, ProjectUploadError):
                status_code = exc.status_code
                code = "UPLOAD_TOO_LARGE" if status_code == 413 else "INVALID_UPLOAD"
            return status_code, code, spec.message(exc)
    return 500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE


async def domain_exception_handler(_request: Request, exc: Exception) -> Response:
    """Translate an integration/domain exception into the error schema."""
    status_code, code, message = _describe_domain_error(exc)
    if status_code >= 500:
        logger.error("%s: %s", code, exc, exc_info=exc)
    else:
        logger.warning("%s (%d): %s: %s", code, status_code, type(exc).__name__, exc)
    return error_response(status_code, code, message)


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> Response:
    """Wrap ``HTTPException`` (ours and the framework's) in the error schema."""
    status_code = exc.status_code
    code = getattr(exc, "code", None) or _DEFAULT_CODES.get(status_code, f"HTTP_{status_code}")
    detail = exc.detail
    try:
        phrase = HTTPStatus(status_code).phrase
    except ValueError:
        phrase = ""
    if not isinstance(detail, str) or not detail or detail == phrase:
        detail = _DEFAULT_MESSAGES.get(status_code, phrase or "Erro na requisição.")
    if status_code >= 500:
        logger.error("%s (%d): %s", code, status_code, detail)
    else:
        logger.info("%s (%d): %s", code, status_code, detail)
    return error_response(status_code, code, detail, headers=exc.headers)


def _describe_validation_error(exc: RequestValidationError) -> str:
    """Summarize validation errors without echoing the submitted values."""
    parts = []
    for error in exc.errors()[:5]:
        location = ".".join(str(part) for part in error.get("loc", ()))
        parts.append(f"{location}: {error.get('msg', 'valor inválido')}")
    summary = "; ".join(parts)
    return f"Dados da requisição inválidos ({summary})." if summary else "Dados da requisição inválidos."


async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> Response:
    """Answer body/query validation failures with ``422 VALIDATION_ERROR``."""
    message = _describe_validation_error(exc)
    logger.info("VALIDATION_ERROR (422): %s", message)
    return error_response(422, "VALIDATION_ERROR", message)


def internal_error_response(exc: BaseException) -> Response:
    """Log the full traceback and return the generic ``500`` body."""
    logger.error("Erro não tratado: %s", type(exc).__name__, exc_info=exc)
    return error_response(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE)


class CatchUnhandledErrorsMiddleware:
    """Turn any unhandled exception into the generic ``500`` error body.

    Starlette routes ``Exception`` handlers to its outermost middleware, which
    runs outside CORS and the request-id middleware. This one sits innermost,
    so the ``500`` still gets the CORS headers, the ``X-Request-ID`` header and
    the request id in the log.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception as exc:
            if response_started:
                raise
            response = internal_error_response(exc)
            await response(scope, receive, send)


def register_error_handlers(app: FastAPI) -> None:
    """Install the error schema handlers and the unhandled-error middleware."""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    for exc_type in DOMAIN_EXCEPTION_TYPES:
        app.add_exception_handler(exc_type, domain_exception_handler)
    app.add_middleware(CatchUnhandledErrorsMiddleware)
