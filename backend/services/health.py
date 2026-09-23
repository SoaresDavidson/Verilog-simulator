"""Readiness checks for the external dependencies the API relies on."""

import os
import threading
import time
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import ClassVar

from integrations.docker import (
    DockerIntegration,
    DockerIntegrationError,
)


class HealthStatus(StrEnum):
    """Severity of a single check or of the aggregated report."""

    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class HealthConfig:
    """Runtime settings for the readiness checks."""

    yosys_container_name: str = "yosys"
    icarus_container_name: str = "icarus-verilog"
    runs_dir: Path = Path("/verilog_code/runs")
    timeout_seconds: float = 5
    cache_ttl_seconds: float = 5

    def __post_init__(self) -> None:
        """Validate configuration values."""
        if not self.yosys_container_name.strip():
            raise ValueError("Yosys container name cannot be empty.")
        if not self.icarus_container_name.strip():
            raise ValueError("Icarus container name cannot be empty.")
        if self.timeout_seconds <= 0:
            raise ValueError("Health check timeout must be greater than zero.")
        if self.cache_ttl_seconds < 0:
            raise ValueError("Health check cache TTL cannot be negative.")


@dataclass(frozen=True, slots=True)
class CheckResult:
    """Outcome of one individual dependency check."""

    status: HealthStatus
    detail: str | None = None
    container: str | None = None


@dataclass(frozen=True, slots=True)
class HealthReport:
    """Aggregated readiness report for every dependency."""

    status: HealthStatus
    checks: dict[str, CheckResult] = field(default_factory=dict)

    @property
    def is_ready(self) -> bool:
        """Tell whether the API can currently serve execution requests."""
        return self.status is not HealthStatus.ERROR


class HealthService:
    """Check Docker, the tool containers and the runs storage."""

    #: Command used to confirm each tool binary answers inside its container.
    _VERSION_COMMANDS: ClassVar[dict[str, list[str]]] = {
        "yosys": ["yosys", "-V"],
        "icarus": ["iverilog", "-V"],
    }

    def __init__(
        self,
        config: HealthConfig | None = None,
        docker_integration: DockerIntegration | None = None,
    ) -> None:
        self.config = config or HealthConfig()
        self.docker_integration = docker_integration or DockerIntegration()
        self._lock = threading.Lock()
        self._cached_report: HealthReport | None = None
        self._cached_at: float = 0.0

    def check(self, use_cache: bool = True) -> HealthReport:
        """Return the readiness report, reusing a recent one when allowed."""
        if use_cache:
            with self._lock:
                cached = self._cached_report
                is_fresh = (
                    time.monotonic() - self._cached_at
                ) < self.config.cache_ttl_seconds
                if cached is not None and is_fresh:
                    return cached

        report = self._build_report()

        with self._lock:
            self._cached_report = report
            self._cached_at = time.monotonic()
        return report

    def _build_report(self) -> HealthReport:
        checks: dict[str, CheckResult] = {}
        daemon_check = self._check_docker_daemon()
        checks["docker_daemon"] = daemon_check

        if daemon_check.status is HealthStatus.OK:
            checks["yosys"] = self._check_tool(
                "yosys", self.config.yosys_container_name
            )
            checks["icarus"] = self._check_tool(
                "icarus", self.config.icarus_container_name
            )
        else:
            unreachable = CheckResult(
                status=HealthStatus.ERROR,
                detail="Docker daemon unreachable, container not verified.",
            )
            checks["yosys"] = CheckResult(
                status=unreachable.status,
                detail=unreachable.detail,
                container=self.config.yosys_container_name,
            )
            checks["icarus"] = CheckResult(
                status=unreachable.status,
                detail=unreachable.detail,
                container=self.config.icarus_container_name,
            )

        checks["storage"] = self._check_storage()
        return HealthReport(status=self._aggregate(checks), checks=checks)

    def _check_docker_daemon(self) -> CheckResult:
        try:
            self.docker_integration.get_client().ping()
        except DockerIntegrationError as exc:
            return CheckResult(status=HealthStatus.ERROR, detail=str(exc))
        except OSError as exc:
            return CheckResult(
                status=HealthStatus.ERROR,
                detail=f"Could not reach Docker daemon: {exc}",
            )
        return CheckResult(status=HealthStatus.OK, detail="Docker daemon reachable.")

    def _check_tool(self, tool: str, container_name: str) -> CheckResult:
        try:
            result = self.docker_integration.execute(
                container_name=container_name,
                command=self._VERSION_COMMANDS[tool],
                workdir="/",
                timeout_seconds=self.config.timeout_seconds,
            )
        except DockerIntegrationError as exc:
            return CheckResult(
                status=HealthStatus.ERROR,
                detail=str(exc),
                container=container_name,
            )

        if not result.success:
            # Container is up but the binary did not answer: still usable for
            # other routes, so the API is degraded rather than unavailable.
            return CheckResult(
                status=HealthStatus.DEGRADED,
                detail=(
                    f"Version command exited with {result.exit_code}: "
                    f"{(result.stderr or result.stdout).strip()[:200]}"
                ),
                container=container_name,
            )

        version = (result.stdout or result.stderr).strip().splitlines()
        return CheckResult(
            status=HealthStatus.OK,
            detail=version[0][:200] if version else None,
            container=container_name,
        )

    def _check_storage(self) -> CheckResult:
        runs_dir = self.config.runs_dir
        if not runs_dir.is_dir():
            return CheckResult(
                status=HealthStatus.ERROR,
                detail=f"Runs directory '{runs_dir}' does not exist.",
            )
        if not os.access(runs_dir, os.W_OK):
            return CheckResult(
                status=HealthStatus.ERROR,
                detail=f"Runs directory '{runs_dir}' is not writable.",
            )
        return CheckResult(
            status=HealthStatus.OK,
            detail=f"Runs directory '{runs_dir}' is writable.",
        )

    @staticmethod
    def _aggregate(checks: dict[str, CheckResult]) -> HealthStatus:
        statuses = {check.status for check in checks.values()}
        if HealthStatus.ERROR in statuses:
            return HealthStatus.ERROR
        if HealthStatus.DEGRADED in statuses:
            return HealthStatus.DEGRADED
        return HealthStatus.OK
