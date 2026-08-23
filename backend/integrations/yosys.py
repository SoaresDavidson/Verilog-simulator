"""Yosys synthesis integration executed through Docker."""

import json
from dataclasses import dataclass, replace
from pathlib import Path
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
    docker_host: str | None = None

    def __post_init__(self) -> None:
        """Validate configuration values."""
        if not self.container_name.strip():
            raise ValueError("Yosys container name cannot be empty.")
        if self.timeout_seconds <= 0:
            raise ValueError("Yosys timeout must be greater than zero.")


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

    def synthesize(
        self,
        output_dir: Path,
        container_workdir: str,
        command: list[str],
    ) -> YosysResult:
        """Synthesize already-resolved sources and return generated netlist.

        Args:
            output_dir: Local directory where Yosys artifacts are shared.
            container_workdir: Corresponding working directory inside container.
            command: Complete Yosys command prepared by caller.

        Returns:
            Structured Yosys execution result.

        Raises:
            ValueError: If command or container working directory is empty.
            YosysContainerNotFoundError: If container is unavailable.
            YosysTimeoutError: If execution exceeds configured timeout.
            YosysSynthesisError: If Yosys exits unsuccessfully or output is invalid.
        """
        try:
            execution = self.docker.execute(
                container_name=self.config.container_name,
                command=command,
                workdir=container_workdir,
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
        structure_file = output_dir / "estrutura.json"
        stat_report_file = output_dir / "relatorio.txt"
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

    @staticmethod
    def _append_error(stderr: str, message: str) -> str:
        return "\n".join(part for part in (stderr, message) if part)
