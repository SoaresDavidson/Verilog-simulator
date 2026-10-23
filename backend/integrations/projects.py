"""Resolution of project run directories shared by tool integrations."""

import logging
from collections.abc import Iterable
from pathlib import Path, PurePosixPath

logger = logging.getLogger(__name__)

CONTAINER_VERILOG_ROOT = PurePosixPath("/verilog_code")
"""Mount point of the shared Verilog volume inside the tool containers."""


def resolve_project_dir(base_dir: Path, project_id: str) -> tuple[Path, str]:
    """Resolve a project ID into local and container directories.

    Args:
        base_dir: Local directory mounted as ``/verilog_code`` in the containers.
        project_id: Safe project path below ``runs/run_<id>``.

    Returns:
        Local project directory and its POSIX path inside the containers.

    Raises:
        ValueError: If project ID is unsafe.
        FileNotFoundError: If project directory does not exist.
        NotADirectoryError: If project path is not a directory.
    """
    normalized = PurePosixPath(project_id.replace("\\", "/"))
    if (
        normalized.is_absolute()
        or ".." in normalized.parts
        or len(normalized.parts) < 2
        or normalized.parts[0] != "runs"
        or not normalized.parts[1].startswith("run_")
    ):
        raise ValueError("Project ID must reside inside 'runs/run_'.")

    resolved_base = base_dir.resolve()
    project_dir = resolved_base.joinpath(*normalized.parts).resolve()
    if not project_dir.is_relative_to(resolved_base):
        raise ValueError("Invalid project ID: directory traversal detected.")
    if not project_dir.exists():
        raise FileNotFoundError(f"Project path '{project_id}' was not found.")
    if not project_dir.is_dir():
        raise NotADirectoryError(f"Project path '{project_id}' is not a directory.")

    container_dir = CONTAINER_VERILOG_ROOT.joinpath(*normalized.parts)
    return project_dir, container_dir.as_posix()


def validate_relative_source(source: Path) -> str:
    """Return a POSIX source path after rejecting absolute or parent paths.

    Raises:
        ValueError: If the path escapes the project directory.
    """
    posix_source = PurePosixPath(source.as_posix())
    if posix_source.is_absolute() or ".." in posix_source.parts:
        raise ValueError(f"Invalid Verilog source path: '{source}'.")
    return posix_source.as_posix()


ARTIFACT_MTIME_TOLERANCE_SECONDS = 1.0
"""Clock slack accepted between the backend and the shared volume."""


def remove_artifacts(paths: Iterable[Path]) -> None:
    """Delete artifacts a tool is about to regenerate.

    Removing them first means a missing file after the run unambiguously
    indicates the tool did not produce it. A failed removal is logged and
    tolerated: :func:`is_fresh_artifact` still rejects the stale file.
    """
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not remove stale artifact %s: %s", path, exc)


def is_fresh_artifact(path: Path, started_at: float) -> bool:
    """Return whether ``path`` exists and was written after ``started_at``.

    Args:
        path: Artifact path.
        started_at: ``time.time()`` captured right before the tool ran.
    """
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        return False
    return path.is_file() and mtime >= started_at - ARTIFACT_MTIME_TOLERANCE_SECONDS
