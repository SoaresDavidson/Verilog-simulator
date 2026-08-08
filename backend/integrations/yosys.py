"""Yosys synthesis integration executed through Docker."""

import json
import shlex
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import Any

from .docker import (
    DockerConfig,
    DockerConnectionError,
    DockerContainerNotFoundError,
    DockerContainerUnavailableError,
    DockerExecutionError,
    DockerIntegration,
    DockerTimeoutError,
)


@dataclass(frozen=True, slots=True)
class YosysConfig:
    """Runtime settings for Yosys synthesis."""

    container_name: str = "yosys"
    timeout_seconds: float = 30
    verilog_base_dir: Path = Path("/verilog_code")
    docker_host: str | None = None

    def __post_init__(self) -> None:
        """Validate configuration values."""
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


class YosysError(Exception):
    """Base error for Yosys integration failures."""


class YosysContainerNotFoundError(YosysError):
    """Raised when configured Yosys container is unavailable."""


class YosysTimeoutError(YosysError):
    """Raised when Yosys execution exceeds configured timeout."""


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
                "tee -o relatorio.txt stat",
                "write_json estrutura.json",
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
            YosysSynthesisError: If Yosys exits unsuccessfully or output is invalid.
        """
        project_dir, container_dir = self._resolve_project(project_id)
        verilog_files = self._find_verilog_sources(project_dir)
        command = self.build_command(verilog_files)

        try:
            execution = self.docker.execute(
                container_name=self.config.container_name,
                command=command,
                workdir=container_dir,
                timeout_seconds=self.config.timeout_seconds,
            )
        except (
            DockerConnectionError,
            DockerContainerNotFoundError,
            DockerContainerUnavailableError,
        ) as exc:
            raise YosysContainerNotFoundError(str(exc)) from exc
        except DockerTimeoutError as exc:
            raise YosysTimeoutError(
                f"Yosys execution exceeded {self.config.timeout_seconds} seconds."
            ) from exc
        except DockerExecutionError as exc:
            raise YosysError(f"Yosys Docker execution failed: {exc}") from exc

        stdout, stderr = execution.stdout, execution.stderr
        structure_file = project_dir / "estrutura.json"
        stat_report_file = project_dir / "relatorio.txt"
        base_result = YosysResult(
            success=execution.exit_code == 0,
            exit_code=execution.exit_code,
            stdout=stdout,
            stderr=stderr,
            structure_file=structure_file if structure_file.exists() else None,
            stat_report_file=stat_report_file if stat_report_file.exists() else None,
        )

        if execution.exit_code != 0:
            raise YosysSynthesisError(
                f"Yosys synthesis failed with exit code {execution.exit_code}.",
                base_result,
            )

        try:
            netlist_content = json.loads(structure_file.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            message = "Yosys completed without generating estrutura.json."
            raise YosysSynthesisError(
                message,
                replace(
                    base_result,
                    success=False,
                    stderr=self._append_error(stderr, message),
                ),
            ) from exc
        except json.JSONDecodeError as exc:
            message = "Yosys generated an invalid estrutura.json."
            raise YosysSynthesisError(
                message,
                replace(
                    base_result,
                    success=False,
                    stderr=self._append_error(stderr, message),
                ),
            ) from exc

        return YosysResult(
            success=True,
            exit_code=execution.exit_code,
            stdout=stdout,
            stderr=stderr,
            netlist_content=netlist_content,
            structure_file=structure_file,
            stat_report_file=stat_report_file if stat_report_file.exists() else None,
        )

    def _resolve_project(self, project_id: str) -> tuple[Path, str]:
        normalized = PurePosixPath(project_id.replace("\\", "/"))
        if (
            normalized.is_absolute()
            or ".." in normalized.parts
            or len(normalized.parts) < 2
            or normalized.parts[0] != "runs"
            or not normalized.parts[1].startswith("run_")
        ):
            raise ValueError("Project ID must reside inside 'runs/run_'.")

        base_dir = self.config.verilog_base_dir.resolve()
        project_dir = base_dir.joinpath(*normalized.parts).resolve()
        if not project_dir.is_relative_to(base_dir):
            raise ValueError("Invalid project ID: directory traversal detected.")
        if not project_dir.exists():
            raise FileNotFoundError(f"Project path '{project_id}' was not found.")
        if not project_dir.is_dir():
            raise NotADirectoryError(f"Project path '{project_id}' is not a directory.")

        container_dir = PurePosixPath("/verilog_code").joinpath(*normalized.parts)
        return project_dir, container_dir.as_posix()

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
            raise FileNotFoundError(
                f"No synthesizable Verilog (.v or .sv) files found in '{project_dir}'."
            )
        return sources

    @staticmethod
    def _append_error(stderr: str, message: str) -> str:
        return "\n".join(part for part in (stderr, message) if part)
