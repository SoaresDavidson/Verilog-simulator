"""Reusable Docker container command integration."""

import threading
import time
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import docker as docker_sdk
from docker.errors import DockerException, NotFound

TIMEOUT_EXIT_CODE = 124
"""Exit code of coreutils ``timeout`` when the limit is reached."""

KILLED_EXIT_CODE = 137
"""Exit code (128 + SIGKILL) reported when ``timeout --signal=KILL`` fires."""


@dataclass(frozen=True, slots=True)
class DockerConfig:
    """Docker connection and execution defaults."""

    docker_host: str | None = None
    timeout_seconds: float = 30
    kill_grace_seconds: float = 5
    max_output_bytes: int = 1024 * 1024

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

        stdout, stderr = output.decoded()
        return DockerCommandResult(
            success=exit_code == 0,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
        )


class _StreamReader:
    """Drain a demultiplexed exec stream in a background thread.

    The thread only blocks on the Docker socket; the in-container ``timeout``
    closes the stream shortly after the deadline, so it does not leak.
    """

    _TRUNCATED_NOTICE = b"\n[output truncated]\n"

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
            data += self._TRUNCATED_NOTICE
        return data.decode("utf-8", errors="replace")
