"""Reusable Docker container command integration."""

import logging
import threading
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import docker as docker_sdk
import requests
from docker.errors import DockerException, ImageNotFound, NotFound
from docker.types import LogConfig

logger = logging.getLogger(__name__)

TIMEOUT_EXIT_CODE = 124
"""Exit code of coreutils ``timeout`` when the limit is reached."""

KILLED_EXIT_CODE = 137
"""Exit code (128 + SIGKILL) reported when ``timeout --signal=KILL`` fires."""


EPHEMERAL_LABEL = "verilog-classroom.execution"
"""Label set on every ephemeral container (lets operators find leftovers)."""


class ExecutionMode(StrEnum):
    """How the tools run untrusted projects."""

    EPHEMERAL = "ephemeral"
    """One fresh, locked-down container per execution, seeing only its run."""

    EXEC = "exec"
    """``docker exec`` in the long-lived ``yosys``/``icarus-verilog`` containers."""


@dataclass(frozen=True, slots=True)
class SandboxConfig:
    """Restrictions applied to every ephemeral execution container."""

    user: str = "1000:1000"
    mem_limit: str = "512m"
    cpus: float = 1.0
    pids_limit: int = 256
    tmpfs_size: str = "64m"

    def __post_init__(self) -> None:
        if not self.user.strip():
            raise ValueError("Sandbox user cannot be empty.")
        if self.user.split(":")[0] in {"0", "root"}:
            raise ValueError("Sandbox user must not be root.")
        if not self.mem_limit.strip():
            raise ValueError("Sandbox memory limit cannot be empty.")
        if self.cpus <= 0:
            raise ValueError("Sandbox CPU limit must be greater than zero.")
        if self.pids_limit <= 0:
            raise ValueError("Sandbox process limit must be greater than zero.")


@dataclass(frozen=True, slots=True)
class DockerConfig:
    """Docker connection and execution defaults."""

    docker_host: str | None = None
    timeout_seconds: float = 30
    kill_grace_seconds: float = 5
    max_output_bytes: int = 1024 * 1024
    sandbox: SandboxConfig = field(default_factory=SandboxConfig)

    def __post_init__(self) -> None:
        if self.timeout_seconds <= 0:
            raise ValueError("Docker timeout must be greater than zero.")
        if self.kill_grace_seconds < 0:
            raise ValueError("Docker kill grace period cannot be negative.")
        if self.max_output_bytes <= 0:
            raise ValueError("Docker output limit must be greater than zero.")


@dataclass(frozen=True, slots=True)
class DockerCommandResult:
    """Typed output from command execution inside a container."""

    success: bool
    exit_code: int
    stdout: str
    stderr: str


class DockerIntegrationError(Exception):
    """Base error for Docker integration failures."""


class DockerConnectionError(DockerIntegrationError):
    """Raised when Docker daemon cannot be reached."""


class DockerContainerNotFoundError(DockerIntegrationError):
    """Raised when requested container does not exist."""


class DockerContainerUnavailableError(DockerIntegrationError):
    """Raised when requested container is not running."""


class DockerExecutionError(DockerIntegrationError):
    """Raised when Docker SDK cannot execute a command."""


class DockerTimeoutError(DockerIntegrationError):
    """Raised when command execution exceeds configured timeout."""


class DockerResourceLimitError(DockerIntegrationError):
    """Raised when the execution is killed for exceeding a resource limit.

    ``str(error)`` is a pt-BR message safe to show to the student (no paths).
    ``limit`` names the exhausted resource (currently only ``"memory"``).
    """

    def __init__(self, message: str, limit: str = "memory") -> None:
        super().__init__(message)
        self.limit = limit


def memory_limit_message(mem_limit: str | None = None) -> str:
    """Return the pt-BR explanation used for executions killed by OOM."""
    limit = f" ({mem_limit})" if mem_limit else ""
    return (
        f"A execução foi interrompida por exceder o limite de memória{limit}. "
        "Reduza o uso de memória do projeto (memórias/vetores muito grandes, "
        "laços que alocam sem parar no testbench) e tente novamente."
    )


def wrap_with_timeout(command: list[str], timeout_seconds: float) -> list[str]:
    """Prefix ``command`` with coreutils ``timeout`` so it is killed in place.

    On expiry ``timeout`` exits with :data:`TIMEOUT_EXIT_CODE`, or with
    :data:`KILLED_EXIT_CODE` when the KILL signal status is propagated.
    """
    if timeout_seconds <= 0:
        raise ValueError("Docker timeout must be greater than zero.")
    return ["timeout", "--signal=KILL", f"{timeout_seconds:g}s", *command]


class DockerIntegration:
    """Provide reusable, testable access to Docker containers."""

    def __init__(
        self,
        config: DockerConfig | None = None,
        docker_client: Any | None = None,
    ) -> None:
        self.config = config or DockerConfig()
        self._docker_client = docker_client

    def get_client(self) -> Any:
        """Return configured Docker client, creating it lazily."""
        if self._docker_client is not None:
            return self._docker_client

        try:
            self._docker_client = (
                docker_sdk.DockerClient(base_url=self.config.docker_host)
                if self.config.docker_host
                else docker_sdk.from_env()
            )
            self._docker_client.ping()
        except (DockerException, OSError) as exc:
            raise DockerConnectionError(
                f"Could not connect to Docker daemon: {exc}"
            ) from exc
        return self._docker_client

    def get_container(self, container_name: str) -> Any:
        """Find a running container by name."""
        if not container_name.strip():
            raise ValueError("Container name cannot be empty.")

        try:
            container = self.get_client().containers.get(container_name)
        except NotFound as exc:
            raise DockerContainerNotFoundError(
                f"Container '{container_name}' was not found."
            ) from exc
        except DockerConnectionError:
            raise
        except (DockerException, OSError) as exc:
            raise DockerConnectionError(
                f"Could not access container '{container_name}': {exc}"
            ) from exc

        if container.status != "running":
            raise DockerContainerUnavailableError(
                f"Container '{container_name}' is '{container.status}', not running."
            )
        return container

    def execute(
        self,
        container_name: str,
        command: list[str],
        workdir: str,
        timeout_seconds: float | None = None,
    ) -> DockerCommandResult:
        """Execute a command with a hard time limit and return decoded output.

        The limit is enforced twice: inside the container the command runs
        under ``timeout --signal=KILL`` (the process dies even if the backend
        loses the daemon connection), and the backend stops waiting for the
        output stream after the limit plus ``kill_grace_seconds``.

        Raises:
            ValueError: If arguments or timeout are invalid.
            DockerConnectionError: If Docker daemon cannot be reached.
            DockerContainerNotFoundError: If container does not exist.
            DockerContainerUnavailableError: If container is not running.
            DockerTimeoutError: If the command exceeds the time limit.
            DockerResourceLimitError: If the command is SIGKILLed before the
                deadline (the container's memory limit).
            DockerExecutionError: If Docker cannot run the command.
        """
        if not command:
            raise ValueError("Docker command cannot be empty.")
        if not workdir.strip():
            raise ValueError("Docker command working directory cannot be empty.")

        timeout = (
            self.config.timeout_seconds if timeout_seconds is None else timeout_seconds
        )
        if timeout <= 0:
            raise ValueError("Docker timeout must be greater than zero.")

        container = self.get_container(container_name)
        api = self.get_client().api
        started_at = time.monotonic()
        try:
            exec_id = api.exec_create(
                container.id,
                cmd=wrap_with_timeout(command, timeout),
                workdir=workdir,
                stdout=True,
                stderr=True,
            )["Id"]
            stream = api.exec_start(exec_id, stream=True, demux=True)
        except (DockerException, OSError, KeyError, TypeError) as exc:
            raise DockerExecutionError(
                f"Failed to execute command in container '{container_name}': {exc}"
            ) from exc

        output = _StreamReader(stream, self.config.max_output_bytes)
        if not output.wait(timeout + self.config.kill_grace_seconds):
            raise DockerTimeoutError(
                f"Command in container '{container_name}' exceeded {timeout:g} seconds."
            )
        if output.error is not None:
            raise DockerExecutionError(
                f"Failed to read output from container '{container_name}': "
                f"{output.error}"
            ) from output.error

        try:
            exit_code = int(api.exec_inspect(exec_id)["ExitCode"])
        except (DockerException, OSError, KeyError, TypeError, ValueError) as exc:
            raise DockerExecutionError(
                f"Container '{container_name}' returned an invalid execution result."
            ) from exc

        elapsed = time.monotonic() - started_at
        if exit_code == TIMEOUT_EXIT_CODE or (
            exit_code == KILLED_EXIT_CODE and elapsed >= timeout
        ):
            raise DockerTimeoutError(
                f"Command in container '{container_name}' exceeded {timeout:g} seconds."
            )
        if exit_code == KILLED_EXIT_CODE:
            # SIGKILL before the deadline: the container's memory cgroup OOM killer.
            raise DockerResourceLimitError(memory_limit_message())

        stdout, stderr = output.decoded()
        return DockerCommandResult(
            success=exit_code == 0,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
        )

    def run_ephemeral(
        self,
        image: str,
        command: list[str],
        run_dir_host: str,
        workdir: str,
        timeout_seconds: float | None = None,
        read_only_mounts: Mapping[str, str] | None = None,
        run_dir_container: str | None = None,
    ) -> DockerCommandResult:
        """Run ``command`` in a fresh, locked-down container and remove it.

        The container sees only ``run_dir_host`` (bind-mounted read-write at
        ``run_dir_container``, default ``workdir``) plus ``read_only_mounts``
        (``{host_path: container_path}``).
        It has no network, a read-only root filesystem with a small ``/tmp``
        tmpfs, no capabilities, ``no-new-privileges``, the limits of
        :class:`SandboxConfig` and runs as its unprivileged user. Host paths
        are resolved by the Docker daemon, so they must be paths on the
        daemon's host, not inside the backend container.

        The time limit follows :meth:`execute`: ``timeout --signal=KILL``
        inside the container plus a backend deadline, after which the
        container is killed.

        Raises:
            ValueError: If arguments or timeout are invalid.
            DockerConnectionError: If Docker daemon cannot be reached.
            DockerContainerNotFoundError: If ``image`` does not exist locally.
            DockerTimeoutError: If the command exceeds the time limit.
            DockerResourceLimitError: If the container is OOM-killed.
            DockerExecutionError: If Docker cannot run the container.
        """
        if not image.strip():
            raise ValueError("Docker image cannot be empty.")
        if not command:
            raise ValueError("Docker command cannot be empty.")
        if not run_dir_host.strip() or not workdir.strip():
            raise ValueError("Run directory and working directory cannot be empty.")

        timeout = (
            self.config.timeout_seconds if timeout_seconds is None else timeout_seconds
        )
        if timeout <= 0:
            raise ValueError("Docker timeout must be greater than zero.")

        volumes = {run_dir_host: {"bind": run_dir_container or workdir, "mode": "rw"}}
        for host_path, container_path in (read_only_mounts or {}).items():
            volumes[host_path] = {"bind": container_path, "mode": "ro"}

        client = self.get_client()
        started_at = time.monotonic()
        try:
            container = client.containers.run(
                image,
                command=wrap_with_timeout(command, timeout),
                detach=True,
                working_dir=workdir,
                volumes=volumes,
                **self.sandbox_options(),
            )
        except ImageNotFound as exc:
            raise DockerContainerNotFoundError(
                f"Image '{image}' was not found; build it with docker compose build."
            ) from exc
        except (DockerException, OSError) as exc:
            raise DockerExecutionError(
                f"Failed to start a container from image '{image}': {exc}"
            ) from exc

        try:
            exit_code, oom_killed, stdout, stderr = self._collect(
                container, image, timeout, started_at
            )
        finally:
            _remove_container(container)

        elapsed = time.monotonic() - started_at
        if oom_killed:
            raise DockerResourceLimitError(
                memory_limit_message(self.config.sandbox.mem_limit)
            )
        if exit_code == TIMEOUT_EXIT_CODE or (
            exit_code == KILLED_EXIT_CODE and elapsed >= timeout
        ):
            raise DockerTimeoutError(
                f"Container from image '{image}' exceeded {timeout:g} seconds."
            )
        if exit_code == KILLED_EXIT_CODE:
            raise DockerResourceLimitError(
                memory_limit_message(self.config.sandbox.mem_limit)
            )

        return DockerCommandResult(
            success=exit_code == 0,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
        )

    def sandbox_options(self) -> dict[str, Any]:
        """Return the ``containers.run`` keyword arguments that confine a run."""
        sandbox = self.config.sandbox
        return {
            "user": sandbox.user,
            "environment": {"HOME": "/tmp"},
            "network_disabled": True,
            "network_mode": "none",
            "mem_limit": sandbox.mem_limit,
            "memswap_limit": sandbox.mem_limit,
            "nano_cpus": int(sandbox.cpus * 1_000_000_000),
            "pids_limit": sandbox.pids_limit,
            "read_only": True,
            "tmpfs": {"/tmp": f"rw,noexec,nosuid,nodev,size={sandbox.tmpfs_size}"},
            "cap_drop": ["ALL"],
            "security_opt": ["no-new-privileges:true"],
            "init": True,
            "labels": {EPHEMERAL_LABEL: "true"},
            # Bounds the daemon-side log; output beyond it is cut below anyway.
            "log_config": LogConfig(
                type=LogConfig.types.JSON,
                config={"max-size": str(4 * self.config.max_output_bytes), "max-file": "1"},
            ),
        }

    def _collect(
        self, container: Any, image: str, timeout: float, started_at: float
    ) -> tuple[int, bool, str, str]:
        """Wait for ``container`` and return exit code, OOM flag and output."""
        try:
            status = container.wait(timeout=timeout + self.config.kill_grace_seconds)
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as exc:
            if time.monotonic() - started_at < timeout:
                raise DockerConnectionError(
                    f"Lost connection to Docker while waiting for '{image}': {exc}"
                ) from exc
            _kill_container(container)
            raise DockerTimeoutError(
                f"Container from image '{image}' exceeded {timeout:g} seconds."
            ) from exc
        except (DockerException, OSError) as exc:
            raise DockerExecutionError(
                f"Failed to wait for container from image '{image}': {exc}"
            ) from exc

        try:
            exit_code = int(status["StatusCode"])
            container.reload()
            oom_killed = bool(container.attrs.get("State", {}).get("OOMKilled"))
            limit = self.config.max_output_bytes
            stdout = _decode_limited(container.logs(stdout=True, stderr=False), limit)
            stderr = _decode_limited(container.logs(stdout=False, stderr=True), limit)
        except (DockerException, OSError, KeyError, TypeError, ValueError) as exc:
            raise DockerExecutionError(
                f"Container from image '{image}' returned an invalid execution result."
            ) from exc
        return exit_code, oom_killed, stdout, stderr


_TRUNCATED_NOTICE = b"\n[output truncated]\n"


def _decode_limited(data: bytes | None, max_bytes: int) -> str:
    """Decode output as UTF-8, cutting it at ``max_bytes`` with a notice."""
    data = data or b""
    if len(data) > max_bytes:
        data = data[:max_bytes] + _TRUNCATED_NOTICE
    return data.decode("utf-8", errors="replace")


def _kill_container(container: Any) -> None:
    try:
        container.kill()
    except (DockerException, OSError) as exc:
        logger.warning("Could not kill execution container: %s", exc)


def _remove_container(container: Any) -> None:
    try:
        container.remove(force=True)
    except (DockerException, OSError) as exc:
        logger.warning("Could not remove execution container: %s", exc)


class _StreamReader:
    """Drain a demultiplexed exec stream in a background thread.

    The thread only blocks on the Docker socket; the in-container ``timeout``
    closes the stream shortly after the deadline, so it does not leak.
    """

    def __init__(self, stream: Iterable[Any], max_bytes: int) -> None:
        self._stream = stream
        self._max_bytes = max_bytes
        self._buffers = {"stdout": bytearray(), "stderr": bytearray()}
        self._truncated = {"stdout": False, "stderr": False}
        self.error: BaseException | None = None
        self._thread = threading.Thread(
            target=self._run, name="docker-exec-stream", daemon=True
        )
        self._thread.start()

    def wait(self, seconds: float) -> bool:
        """Wait until the stream ends; return ``False`` on deadline."""
        self._thread.join(seconds)
        return not self._thread.is_alive()

    def decoded(self) -> tuple[str, str]:
        """Return stdout and stderr decoded as UTF-8."""
        return self._decode("stdout"), self._decode("stderr")

    def _run(self) -> None:
        try:
            for chunk in self._stream:
                stdout, stderr = chunk if isinstance(chunk, tuple) else (chunk, None)
                self._append("stdout", stdout)
                self._append("stderr", stderr)
        except (DockerException, OSError, ValueError) as exc:
            self.error = exc

    def _append(self, name: str, data: bytes | None) -> None:
        if not data:
            return
        buffer = self._buffers[name]
        room = self._max_bytes - len(buffer)
        if len(data) > room:
            self._truncated[name] = True
        buffer.extend(data[: max(room, 0)])

    def _decode(self, name: str) -> str:
        data = bytes(self._buffers[name])
        if self._truncated[name]:
            data += _TRUNCATED_NOTICE
        return data.decode("utf-8", errors="replace")
