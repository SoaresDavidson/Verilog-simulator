"""Central logging configuration and per-request log context (#12).

Every log record carries ``request_id`` and ``project_id`` attributes, taken
from context variables bound by the request-id middleware and by the routes
that operate on a run. The output is either human-readable text (development)
or one JSON object per line (production), selected by ``LOG_FORMAT``.
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

#: Request being served by the current task (``-`` outside a request).
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
#: Run the current request operates on, when there is one.
project_id_var: ContextVar[str | None] = ContextVar("project_id", default=None)

#: Longest tool output (stdout/stderr) written to a single log line.
MAX_LOGGED_OUTPUT_CHARS = 2000

_UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")
_TEXT_FORMAT = "%(asctime)s %(levelname)-8s [%(request_id)s]%(project_suffix)s %(name)s: %(message)s"
_record_factory_installed = False


def bind_project_id(project_id: str) -> None:
    """Attach ``project_id`` to every log line emitted for the current request."""
    project_id_var.set(project_id)


def truncate_for_log(text: str | None, limit: int = MAX_LOGGED_OUTPUT_CHARS) -> str:
    """Shorten tool output before logging it, keeping the tail (where errors are)."""
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return f"[... {len(text) - limit} caracteres omitidos ...]{text[-limit:]}"


def _install_record_factory() -> None:
    """Add the context attributes to every record, whichever handler formats it."""
    global _record_factory_installed
    if _record_factory_installed:
        return
    previous = logging.getLogRecordFactory()

    def factory(*args: object, **kwargs: object) -> logging.LogRecord:
        record = previous(*args, **kwargs)
        record.request_id = request_id_var.get() or "-"
        record.project_id = project_id_var.get()
        return record

    logging.setLogRecordFactory(factory)
    _record_factory_installed = True


class TextFormatter(logging.Formatter):
    """Readable single-line format with the request id (and run, when bound)."""

    def __init__(self) -> None:
        super().__init__(_TEXT_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        project_id = getattr(record, "project_id", None)
        record.project_suffix = f" [{project_id}]" if project_id else ""
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return super().format(record)


class JsonFormatter(logging.Formatter):
    """One JSON object per line, ready for a log collector."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        project_id = getattr(record, "project_id", None)
        if project_id:
            payload["project_id"] = project_id
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _AppHandler(logging.StreamHandler):
    """Marker type so reconfiguring replaces only the handler installed here."""


def configure_logging(level: str = "INFO", log_format: str = "text") -> None:
    """Configure the root logger and route uvicorn's loggers through it.

    Safe to call more than once: the previous handler installed by this
    function is replaced, handlers added by others (e.g. pytest) are kept.

    Args:
        level: Level name (``DEBUG``, ``INFO``, ...). Unknown names fall back to INFO.
        log_format: ``json`` for structured output, anything else for text.
    """
    _install_record_factory()
    numeric_level = logging.getLevelNamesMapping().get(level.upper(), logging.INFO)

    handler = _AppHandler(sys.stderr)
    handler.setFormatter(JsonFormatter() if log_format == "json" else TextFormatter())

    root = logging.getLogger()
    for existing in [h for h in root.handlers if isinstance(h, _AppHandler)]:
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(numeric_level)

    for name in _UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
        uvicorn_logger.setLevel(numeric_level)
    # The request-id middleware already logs one line per request (with its
    # id); uvicorn's access line would duplicate it without the context.
    logging.getLogger("uvicorn.access").setLevel(max(numeric_level, logging.WARNING))
