"""Validation and extraction of uploaded project archives (UC01)."""

import shutil
import uuid
import zipfile
from pathlib import Path, PurePosixPath

#: Extensions that make an archive a Verilog/SystemVerilog project (RN04).
SOURCE_EXTENSIONS = frozenset({".v", ".sv"})

#: Entries produced by archivers that never belong to the project itself.
_IGNORED_TOP_LEVEL = frozenset({"__MACOSX"})


class ProjectUploadError(ValueError):
    """Upload rejected because of the archive content.

    The message is written in Portuguese and is safe to show to the user: it
    never contains internal paths.
    """

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def project_id_for(run_name: str) -> str:
    """Return the canonical project ID (``runs/run_<32hex>``) of a run folder."""
    return f"runs/{run_name}"


def new_run_name() -> str:
    """Generate a fresh, unguessable run folder name."""
    return f"run_{uuid.uuid4().hex}"


def has_verilog_sources(run_dir: Path) -> bool:
    """Tell whether ``run_dir`` contains at least one ``.v``/``.sv`` file, recursively."""
    return any(
        path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS
        for path in run_dir.rglob("*")
    )


def extract_project_zip(archive: zipfile.ZipFile, runs_dir: Path) -> str:
    """Extract ``archive`` into a new run folder and return its canonical project ID.

    When every file of the archive lives below one single top-level folder (the
    usual result of compressing the project folder itself), that wrapper folder
    is stripped, so the run root is also the project root. The project ID is
    always ``runs/run_<32hex>`` regardless of the archive layout.

    Raises:
        ProjectUploadError: If the archive is empty, unsafe or has no sources.
            The partially created run folder is removed before raising.
    """
    members = _plan_members(archive)
    if not members:
        raise ProjectUploadError("O arquivo ZIP está vazio.")

    run_name = new_run_name()
    run_dir = runs_dir / run_name
    run_dir.mkdir(parents=True, exist_ok=False)
    try:
        resolved_run_dir = run_dir.resolve()
        for info, relative in members:
            target = resolved_run_dir.joinpath(*relative.parts).resolve()
            if not target.is_relative_to(resolved_run_dir):
                raise ProjectUploadError(
                    "O arquivo ZIP contém caminhos fora da pasta do projeto."
                )
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)

        if not has_verilog_sources(run_dir):
            raise ProjectUploadError(
                "O projeto não contém nenhum arquivo Verilog (.v) ou "
                "SystemVerilog (.sv)."
            )
    except (zipfile.BadZipFile, zipfile.LargeZipFile, NotImplementedError, RuntimeError) as exc:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise ProjectUploadError(
            "O arquivo ZIP está corrompido ou usa um formato não suportado."
        ) from exc
    except BaseException:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise
    return project_id_for(run_name)


def _plan_members(
    archive: zipfile.ZipFile,
) -> list[tuple[zipfile.ZipInfo, PurePosixPath]]:
    """Return the file entries to extract with their path relative to the run."""
    planned: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
    for info in archive.infolist():
        if info.is_dir():
            continue
        relative = PurePosixPath(info.filename.replace("\\", "/"))
        if relative.is_absolute() or ".." in relative.parts:
            raise ProjectUploadError(
                "O arquivo ZIP contém caminhos fora da pasta do projeto."
            )
        if relative.parts and relative.parts[0] in _IGNORED_TOP_LEVEL:
            continue
        planned.append((info, relative))
    return _strip_wrapper_folder(planned)


def _strip_wrapper_folder(
    planned: list[tuple[zipfile.ZipInfo, PurePosixPath]],
) -> list[tuple[zipfile.ZipInfo, PurePosixPath]]:
    """Drop the single top-level folder shared by every entry, if there is one."""
    if not planned or any(len(relative.parts) < 2 for _, relative in planned):
        return planned
    top_levels = {relative.parts[0] for _, relative in planned}
    if len(top_levels) != 1:
        return planned
    return [
        (info, PurePosixPath(*relative.parts[1:])) for info, relative in planned
    ]
