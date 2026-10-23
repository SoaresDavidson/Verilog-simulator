"""Resolution of project run directories shared by tool integrations."""

from pathlib import Path, PurePosixPath

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
