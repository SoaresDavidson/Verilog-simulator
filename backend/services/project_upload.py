"""Validation and hardened extraction of uploaded project archives (UC01, #18, #9)."""

import shutil
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

#: Extensions that make an archive a Verilog/SystemVerilog project (RN04).
SOURCE_EXTENSIONS = frozenset({".v", ".sv"})

#: Extensions extracted from the archive; everything else is silently skipped.
#:
#: * ``.v``/``.sv``: Verilog and SystemVerilog sources;
#: * ``.vh``/``.svh``: headers pulled in with ```include``;
#: * ``.mem``/``.hex``/``.txt``: memory images and stimulus files read by
#:   ``$readmemh``/``$readmemb``/``$fopen`` (program ROMs are the norm in the
#:   processor projects this tool targets).
#:
#: Tool outputs (``.json``, ``.vcd``) are never extracted, so a ZIP cannot ship
#: a prefabricated ``estrutura.json`` or waveform that would be returned as if
#: it were the result of synthesis or simulation.
ALLOWED_EXTENSIONS = SOURCE_EXTENSIONS | frozenset(
    {".vh", ".svh", ".mem", ".hex", ".txt"}
)

#: Files written by the tools inside the run; never taken from the archive.
RESERVED_NAMES = frozenset({"relatorio.txt", "estrutura.json"})

#: Entries produced by archivers that never belong to the project itself.
_IGNORED_TOP_LEVEL = frozenset({"__MACOSX"})

#: Characters rejected in entry names (control characters are rejected too).
_INVALID_NAME_CHARS = frozenset('<>:"|?*\x00')

#: Entries smaller than this are never treated as zip bombs, whatever the ratio
#: (e.g. a zero-filled memory image compresses extremely well).
_RATIO_CHECK_FLOOR_BYTES = 1024 * 1024

_CHUNK_SIZE = 64 * 1024


class ProjectUploadError(ValueError):
    """Upload rejected because of the archive content.

    The message is written in Portuguese and is safe to show to the user: it
    never contains internal paths.
    """

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class UploadLimits:
    """Limits enforced while extracting an uploaded archive."""

    max_uncompressed_bytes: int = 50 * 1024 * 1024
    max_entries: int = 500
    max_depth: int = 8
    max_path_length: int = 255
    max_compression_ratio: int = 200

    def __post_init__(self) -> None:
        """Validate configuration values."""
        for name in (
            "max_uncompressed_bytes",
            "max_entries",
            "max_depth",
            "max_path_length",
            "max_compression_ratio",
        ):
            if getattr(self, name) <= 0:
                raise ValueError(f"Upload limit '{name}' must be greater than zero.")


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


def open_project_zip(archive_path: Path) -> zipfile.ZipFile:
    """Open the uploaded archive, translating format errors to ``400``."""
    try:
        return zipfile.ZipFile(archive_path)
    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError) as exc:
        raise ProjectUploadError(
            "O arquivo enviado não é um ZIP válido ou está corrompido."
        ) from exc


def extract_project_zip(
    archive: zipfile.ZipFile,
    runs_dir: Path,
    limits: UploadLimits | None = None,
    run_name: str | None = None,
) -> str:
    """Extract ``archive`` into a new run folder and return its canonical project ID.

    Every entry name is validated before anything is written; then files with an
    allowed extension are extracted one by one, counting the bytes actually
    written (the sizes declared in the ZIP headers are not trusted).

    When every extracted file lives below one single top-level folder (the usual
    result of compressing the project folder itself), that wrapper folder is
    stripped, so the run root is also the project root. The project ID is always
    ``runs/run_<32hex>`` regardless of the archive layout.

    Raises:
        ProjectUploadError: If the archive is empty, unsafe, too large or has no
            sources (``400``/``413``). The run folder is removed before raising.
    """
    limits = limits or UploadLimits()
    members = _plan_members(archive, limits)

    run_name = run_name or new_run_name()
    run_dir = runs_dir / run_name
    run_dir.mkdir(parents=True, exist_ok=False)
    try:
        _extract_members(archive, members, run_dir.resolve(), limits)
        if not has_verilog_sources(run_dir):
            raise ProjectUploadError(
                "O projeto não contém nenhum arquivo Verilog (.v) ou "
                "SystemVerilog (.sv)."
            )
    except (
        zipfile.BadZipFile,
        zipfile.LargeZipFile,
        NotImplementedError,
        RuntimeError,
        EOFError,
    ) as exc:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise ProjectUploadError(
            "O arquivo ZIP está corrompido, protegido por senha ou usa um formato "
            "não suportado."
        ) from exc
    except BaseException:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise
    return project_id_for(run_name)


def _plan_members(
    archive: zipfile.ZipFile, limits: UploadLimits
) -> list[tuple[zipfile.ZipInfo, PurePosixPath]]:
    """Validate every entry name and return the files to extract."""
    entries = archive.infolist()
    if not entries:
        raise ProjectUploadError("O arquivo ZIP está vazio.")
    if len(entries) > limits.max_entries:
        raise ProjectUploadError(
            f"O projeto excede o limite de {limits.max_entries} arquivos.",
            status_code=413,
        )

    planned: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
    for info in entries:
        relative = _validate_entry_name(info.filename, limits)
        if info.is_dir() or relative is None:
            continue
        if relative.parts[0] in _IGNORED_TOP_LEVEL:
            continue
        if any(part.startswith(".") for part in relative.parts):
            continue
        if relative.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        planned.append((info, relative))

    planned = _strip_wrapper_folder(planned)
    planned = [
        (info, relative)
        for info, relative in planned
        if relative.name.lower() not in RESERVED_NAMES
    ]
    if not planned:
        raise ProjectUploadError(
            "O projeto não contém nenhum arquivo Verilog (.v) ou SystemVerilog (.sv)."
        )
    return planned


def _validate_entry_name(name: str, limits: UploadLimits) -> PurePosixPath | None:
    """Reject unsafe names; return the relative path (``None`` for the root)."""
    if len(name) > limits.max_path_length:
        raise ProjectUploadError(
            "O arquivo ZIP contém um caminho mais longo que o limite de "
            f"{limits.max_path_length} caracteres."
        )
    if any(char in _INVALID_NAME_CHARS or ord(char) < 32 for char in name):
        raise ProjectUploadError(
            "O arquivo ZIP contém nomes de arquivo com caracteres inválidos."
        )

    normalized = name.replace("\\", "/")
    relative = PurePosixPath(normalized)
    if normalized.startswith("/") or ".." in relative.parts:
        raise ProjectUploadError(
            "O arquivo ZIP contém caminhos fora da pasta do projeto."
        )
    parts = [part for part in relative.parts if part != "."]
    if not parts:
        return None
    if len(parts) - 1 > limits.max_depth:
        raise ProjectUploadError(
            f"O projeto excede o limite de {limits.max_depth} níveis de pastas."
        )
    return PurePosixPath(*parts)


def _strip_wrapper_folder(
    planned: list[tuple[zipfile.ZipInfo, PurePosixPath]],
) -> list[tuple[zipfile.ZipInfo, PurePosixPath]]:
    """Drop the single top-level folder shared by every entry, if there is one."""
    if not planned or any(len(relative.parts) < 2 for _, relative in planned):
        return planned
    top_levels = {relative.parts[0] for _, relative in planned}
    if len(top_levels) != 1:
        return planned
    return [(info, PurePosixPath(*relative.parts[1:])) for info, relative in planned]


def _extract_members(
    archive: zipfile.ZipFile,
    members: list[tuple[zipfile.ZipInfo, PurePosixPath]],
    run_dir: Path,
    limits: UploadLimits,
) -> None:
    """Write each member below ``run_dir`` while enforcing the byte limits."""
    total_written = 0
    for info, relative in members:
        target = run_dir.joinpath(*relative.parts).resolve()
        if not target.is_relative_to(run_dir) or target == run_dir:
            raise ProjectUploadError(
                "O arquivo ZIP contém caminhos fora da pasta do projeto."
            )
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
        except (FileExistsError, NotADirectoryError) as exc:
            raise ProjectUploadError(
                "O arquivo ZIP contém arquivos duplicados ou conflitantes."
            ) from exc
        ratio_limit = max(
            info.compress_size * limits.max_compression_ratio,
            _RATIO_CHECK_FLOOR_BYTES,
        )

        entry_written = 0
        try:
            destination_file = target.open("xb")
        except (FileExistsError, IsADirectoryError, NotADirectoryError) as exc:
            raise ProjectUploadError(
                "O arquivo ZIP contém arquivos duplicados ou conflitantes."
            ) from exc
        with archive.open(info) as source, destination_file as destination:
            while chunk := source.read(_CHUNK_SIZE):
                entry_written += len(chunk)
                total_written += len(chunk)
                if total_written > limits.max_uncompressed_bytes:
                    raise ProjectUploadError(
                        "O projeto descompactado excede o limite de "
                        f"{limits.max_uncompressed_bytes / (1024 * 1024):.1f} MB.",
                        status_code=413,
                    )
                if entry_written > ratio_limit:
                    raise ProjectUploadError(
                        "O arquivo ZIP tem taxa de compressão suspeita "
                        "(possível zip bomb) e foi rejeitado."
                    )
                destination.write(chunk)
