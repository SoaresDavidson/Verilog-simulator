"""Authorization dependencies: run sessions and the admin token (#8).

Each upload creates a session: an opaque token (``secrets.token_urlsafe``) is
returned to the client once, and only its SHA-256 digest is stored in the run
folder (``.session``). Routes that operate on a run require the token in the
``X-Session-Token`` header; administrative routes require ``X-Admin-Token``.
"""

import hashlib
import os
import re
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Header, Request, status

from config import settings
from errors import ApiError
from logging_config import bind_project_id
from services.runs_gc import run_registry

#: Session metadata file kept inside every run. Hidden (dot) files are never
#: extracted from uploads nor read as Verilog sources.
SESSION_FILE_NAME = ".session"
SESSION_HEADER = "X-Session-Token"
ADMIN_HEADER = "X-Admin-Token"

_PROJECT_ID_PATTERN = re.compile(r"^runs/(run_[0-9a-f]{32})$")

type SessionTokenHeader = Annotated[
    str | None,
    Header(alias=SESSION_HEADER, description="Token devolvido pelo upload do projeto"),
]
type AdminTokenHeader = Annotated[
    str | None,
    Header(alias=ADMIN_HEADER, description="Valor configurado em ADMIN_TOKEN"),
]


@dataclass(frozen=True, slots=True)
class AuthorizedRun:
    """Run whose session token was verified for the current request."""

    project_id: str
    run_name: str
    run_dir: Path


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(run_dir: Path) -> str:
    """Create the session of ``run_dir`` and return its token (shown only once)."""
    token = secrets.token_urlsafe(32)
    descriptor = os.open(
        run_dir / SESSION_FILE_NAME, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
    )
    with os.fdopen(descriptor, "w", encoding="utf-8") as session_file:
        session_file.write(_digest(token))
    return token


def session_matches(run_dir: Path, token: str) -> bool:
    """Tell whether ``token`` is the session token of ``run_dir``."""
    try:
        stored = (run_dir / SESSION_FILE_NAME).read_text(encoding="utf-8").strip()
    except OSError:
        return False
    return secrets.compare_digest(
        stored.encode("ascii"), _digest(token).encode("ascii")
    )


def run_name_from_project_id(project_id: str) -> str:
    """Return ``run_<32hex>`` for a canonical project ID or raise ``400`` (``ApiError``)."""
    match = _PROJECT_ID_PATTERN.fullmatch(project_id)
    if match is None:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_PROJECT_ID",
            "project_id inválido: use o valor devolvido pelo upload.",
        )
    return match.group(1)


def authorize_run(project_id: str, token: str | None) -> AuthorizedRun:
    """Check that ``token`` owns the run ``project_id``.

    Raises:
        ApiError: ``401`` without token, ``400`` for a malformed ID, ``404``
            when the run does not exist and ``403`` when the token belongs to
            another session.
    """
    if not token:
        raise ApiError(
            status.HTTP_401_UNAUTHORIZED,
            "SESSION_TOKEN_MISSING",
            f"Envie o token de sessão no header {SESSION_HEADER}.",
        )
    run_name = run_name_from_project_id(project_id)
    bind_project_id(project_id)
    run_dir = settings.VERILOG_RUNS_DIR / run_name
    if not run_dir.is_dir():
        raise ApiError(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Projeto não encontrado.")
    if not session_matches(run_dir, token):
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            "SESSION_TOKEN_INVALID",
            "Token de sessão inválido para este projeto.",
        )
    return AuthorizedRun(project_id=project_id, run_name=run_name, run_dir=run_dir)


async def require_run_session_from_body(
    request: Request, x_session_token: SessionTokenHeader = None
) -> AuthorizedRun | None:
    """Dependency for routes whose JSON body carries ``project_id``.

    A body without a string ``project_id`` is left to the route's own body
    validation, which rejects it with ``422`` before the endpoint runs.
    """
    try:
        body = await request.json()
    except ValueError:
        return None
    project_id = body.get("project_id") if isinstance(body, dict) else None
    if not isinstance(project_id, str):
        return None
    return authorize_run(project_id, x_session_token)


async def require_run_in_use_from_body(
    run: Annotated[AuthorizedRun | None, Depends(require_run_session_from_body)],
) -> AsyncIterator[AuthorizedRun | None]:
    """Authorize the run and keep it marked as in use while the request runs.

    Marked runs are never removed by the automatic collection (#10).
    """
    if run is None:
        yield None
        return
    with run_registry.in_use(run.run_name):
        # The collector may have removed the run between authorization and marking.
        if not run.run_dir.is_dir():
            raise ApiError(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Projeto não encontrado.")
        yield run


def require_run_session_from_path(
    project_id: str, x_session_token: SessionTokenHeader = None
) -> AuthorizedRun:
    """Dependency for routes with ``{project_id}`` in the path."""
    return authorize_run(project_id, x_session_token)


def require_admin(x_admin_token: AdminTokenHeader = None) -> None:
    """Dependency for administrative routes.

    Without ``ADMIN_TOKEN`` configured the route is disabled (``404``) instead
    of being left open.
    """
    configured = settings.ADMIN_TOKEN
    if not configured:
        raise ApiError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Recurso não encontrado.")
    if not x_admin_token:
        raise ApiError(
            status.HTTP_401_UNAUTHORIZED,
            "ADMIN_TOKEN_MISSING",
            f"Envie o token de administrador no header {ADMIN_HEADER}.",
        )
    if not secrets.compare_digest(
        x_admin_token.encode("utf-8"), configured.encode("utf-8")
    ):
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            "ADMIN_TOKEN_INVALID",
            "Token de administrador inválido.",
        )


def request_origin(request: Request) -> str:
    """Describe where a request came from, for audit logs."""
    client = request.client.host if request.client else "desconhecido"
    forwarded = request.headers.get("x-forwarded-for")
    return f"{client} (X-Forwarded-For: {forwarded})" if forwarded else client
