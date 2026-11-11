"""Yosys synthesis integration executed through Docker."""

import json
import logging
import shlex
import time
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import Any

from .docker import (
    DockerCommandResult,
    DockerConfig,
    DockerConnectionError,
    DockerContainerNotFoundError,
    DockerContainerUnavailableError,
    DockerExecutionError,
    DockerIntegration,
    DockerResourceLimitError,
    DockerTimeoutError,
    ExecutionMode,
)
from .projects import (
    NoVerilogSourcesError,
    grant_run_access,
    is_fresh_artifact,
    remove_artifacts,
    resolve_project_dir,
    run_mount,
)

logger = logging.getLogger(__name__)

STRUCTURE_FILE_NAME = "estrutura.json"
"""Netlist written by ``write_json`` in the synthesis command."""

STAT_REPORT_FILE_NAME = "relatorio.txt"
"""Statistics report written by ``tee -o ... stat``."""


@dataclass(frozen=True, slots=True)
class YosysConfig:
    """Runtime settings for Yosys synthesis."""

    container_name: str = "yosys"
    timeout_seconds: float = 30
    verilog_base_dir: Path = Path("/verilog_code")
    docker_host: str | None = None
    run_owner: tuple[int, int] | None = None
    """``(uid, gid)`` that receives the run before execution; ``None`` keeps it."""
    execution_mode: ExecutionMode = ExecutionMode.EPHEMERAL
    image: str = "verilog-classroom/yosys:latest"
    """Image of the per-execution container (``ephemeral`` mode)."""
    host_verilog_root: str | None = None
    """Path of ``verilog_base_dir`` on the Docker host (``None``: same as local)."""

    def __post_init__(self) -> None:
        """Validate configuration values."""
        object.__setattr__(self, "execution_mode", ExecutionMode(self.execution_mode))
        if not self.image.strip():
            raise ValueError("Yosys image cannot be empty.")
        if not self.container_name.strip():
            raise ValueError("Yosys container name cannot be empty.")
        if self.timeout_seconds <= 0:
            raise ValueError("Yosys timeout must be greater than zero.")
        if not self.verilog_base_dir.is_absolute():
            raise ValueError("Yosys Verilog base directory must be absolute.")


@dataclass(frozen=True, slots=True)
class YosysResult:
    """Structured result returned after successful Yosys execution."""

    success: bool
    exit_code: int
    stdout: str
    stderr: str
    netlist_content: dict[str, Any] | None = None
    structure_file: Path | None = None
    stat_report_file: Path | None = None
    stat_report: str | None = None


class YosysError(Exception):
    """Base error for Yosys integration failures."""


class YosysContainerNotFoundError(YosysError):
    """Raised when configured Yosys container is unavailable."""


class YosysResourceLimitError(YosysError):
    """Raised when the execution is killed for exceeding a resource limit.

    The message is in pt-BR and safe to show to the student; ``limit`` names
    the exhausted resource (``"memory"``).
    """

    def __init__(self, message: str, limit: str = "memory") -> None:
        super().__init__(message)
        self.limit = limit


class YosysTimeoutError(YosysError):
    """Raised when Yosys execution exceeds configured timeout."""

    def __init__(self, message: str, timeout_seconds: float) -> None:
        super().__init__(message)
        self.timeout_seconds = timeout_seconds


class YosysSynthesisError(YosysError):
    """Raised when Yosys rejects or cannot synthesize a project."""

    def __init__(self, message: str, result: YosysResult) -> None:
        super().__init__(message)
        self.result = result


class YosysIntegration:
    """Build and execute Yosys synthesis commands in Docker."""

    def __init__(
        self,
        config: YosysConfig | None = None,
        docker_integration: DockerIntegration | None = None,
    ) -> None:
        """Initialize integration.

        Args:
            config: Yosys and Docker runtime settings.
            docker_integration: Reusable Docker integration.
        """
        self.config = config or YosysConfig()
        self.docker = docker_integration or DockerIntegration(
            DockerConfig(
                docker_host=self.config.docker_host,
                timeout_seconds=self.config.timeout_seconds,
            )
        )

    @staticmethod
    def build_command(verilog_files: list[Path]) -> list[str]:
        """Build Yosys command for relative Verilog source paths.

        Args:
            verilog_files: Source paths relative to project directory.

        Returns:
            Docker exec argument list.

        Raises:
            ValueError: If source list is empty or contains unsafe paths.
        """
        if not verilog_files:
            raise ValueError("At least one Verilog source file is required.")

        commands: list[str] = []
        for source in verilog_files:
            posix_source = PurePosixPath(source.as_posix())
            if posix_source.is_absolute() or ".." in posix_source.parts:
                raise ValueError(f"Invalid Verilog source path: '{source}'.")
            commands.append(f"read_verilog -sv {shlex.quote(posix_source.as_posix())}")

        commands.extend(
            (
                "hierarchy -auto-top",
                # write_json rejeita módulos com processos (blocos always) sem proc.
                "proc",
                f"tee -o {STAT_REPORT_FILE_NAME} stat",
                f"write_json {STRUCTURE_FILE_NAME}",
            )
        )
        return ["yosys", "-p", "; ".join(commands)]

    def synthesize(self, project_id: str) -> YosysResult:
        """Synthesize project and return generated netlist.

        Args:
            project_id: Safe project path below ``runs/run_<uuid>``.

        Returns:
            Structured Yosys execution result.

        Raises:
            FileNotFoundError: If project or Verilog sources do not exist.
            NotADirectoryError: If project path is not a directory.
            ValueError: If project ID is unsafe.
            YosysContainerNotFoundError: If container is unavailable.
            YosysTimeoutError: If execution exceeds configured timeout.
            YosysResourceLimitError: If execution is killed by the memory limit.
            YosysSynthesisError: If Yosys exits unsuccessfully or output is invalid.
        """
        project_dir, container_dir = self._resolve_project(project_id)
        verilog_files = self._find_verilog_sources(project_dir)
        command = self.build_command(verilog_files)
        structure_file = project_dir / STRUCTURE_FILE_NAME
        stat_report_file = project_dir / STAT_REPORT_FILE_NAME
        remove_artifacts((structure_file, stat_report_file))
        if self.config.run_owner is not None:
            grant_run_access(project_dir, *self.config.run_owner)
        started_at = time.time()

        try:
            execution = self._run(command, project_dir, container_dir)
        except DockerResourceLimitError as exc:
            raise YosysResourceLimitError(str(exc), exc.limit) from exc
        except (
            DockerConnectionError,
            DockerContainerNotFoundError,
            DockerContainerUnavailableError,
        ) as exc:
            raise YosysContainerNotFoundError(str(exc)) from exc
        except DockerTimeoutError as exc:
            raise YosysTimeoutError(
                f"Yosys execution exceeded {self.config.timeout_seconds:g} seconds.",
                self.config.timeout_seconds,
            ) from exc
        except DockerExecutionError as exc:
            raise YosysError(f"Yosys Docker execution failed: {exc}") from exc

        stdout, stderr = execution.stdout, execution.stderr
        stat_report_file = stat_report_file if is_fresh_artifact(stat_report_file, started_at) else None
        stat_report = self._read_stat_report(stat_report_file)
        has_structure = is_fresh_artifact(structure_file, started_at)
        base_result = YosysResult(
            success=execution.exit_code == 0,
            exit_code=execution.exit_code,
            stdout=stdout,
            stderr=stderr,
            structure_file=structure_file if has_structure else None,
            stat_report_file=stat_report_file,
            stat_report=stat_report,
        )

        if execution.exit_code != 0:
            raise YosysSynthesisError(
                f"Yosys synthesis failed with exit code {execution.exit_code}.",
                base_result,
            )

        if not has_structure:
            logger.warning(
                "Yosys completed without generating estrutura.json. Project: %s",
                project_id,
            )
            message = (
                "O Yosys terminou sem gerar estrutura.json. Verifique se o projeto "
                "tem um módulo de topo sintetizável e consulte os avisos acima."
            )
            raise YosysSynthesisError(
                message,
                replace(
                    base_result,
                    success=False,
                    stderr=self._append_error(stderr, message),
                ),
            )

        try:
            netlist_content = json.loads(structure_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            logger.warning(
                "Yosys generated an invalid estrutura.json. Project: %s. Cause: %s",
                project_id,
                exc,
            )
            message = (
                "O Yosys gerou um estrutura.json ilegível (JSON malformado). "
                "Execute o mapeamento novamente; se persistir, avise o professor."
            )
            raise YosysSynthesisError(
                message,
                replace(
                    base_result,
                    success=False,
                    stderr=self._append_error(stderr, message),
                ),
            ) from exc

        return replace(base_result, success=True, netlist_content=netlist_content)

    def _run(self, command: list[str], project_dir: Path, container_dir: str) -> DockerCommandResult:
        """Execute ``command`` in the configured mode (see ``ExecutionMode``)."""
        if self.config.execution_mode is ExecutionMode.EXEC:
            return self.docker.execute(
                container_name=self.config.container_name,
                command=command,
                workdir=container_dir,
                timeout_seconds=self.config.timeout_seconds,
            )
        run_dir_host, run_dir_container = run_mount(
            self.config.verilog_base_dir, project_dir, self.config.host_verilog_root
        )
        return self.docker.run_ephemeral(
            image=self.config.image,
            command=command,
            run_dir_host=run_dir_host,
            run_dir_container=run_dir_container,
            workdir=container_dir,
            timeout_seconds=self.config.timeout_seconds,
        )

    @staticmethod
    def _read_stat_report(path: Path | None) -> str | None:
        if path is None:
            return None
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            logger.warning("Could not read Yosys stat report %s: %s", path, exc)
            return None

    def _resolve_project(self, project_id: str) -> tuple[Path, str]:
        return resolve_project_dir(self.config.verilog_base_dir, project_id)

    @staticmethod
    def _find_verilog_sources(project_dir: Path) -> list[Path]:
        sources: list[Path] = []
        for path in project_dir.rglob("*"):
            relative_path = path.relative_to(project_dir)
            if (
                path.is_file()
                and path.suffix.lower() in {".v", ".sv"}
                and "tb_" not in path.name.lower()
                and "testbench" not in relative_path.as_posix().lower()
            ):
                sources.append(relative_path)
        sources.sort(key=lambda path: path.as_posix())
        if not sources:
            raise NoVerilogSourcesError(
                "Nenhum arquivo Verilog sintetizável (.v ou .sv fora de testbenches) foi encontrado no projeto."
            )
        return sources

    @staticmethod
    def _append_error(stderr: str, message: str) -> str:
        return "\n".join(part for part in (stderr, message) if part)
