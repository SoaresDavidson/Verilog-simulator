"""Reusable Docker container command integration."""

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from typing import Any

import docker as docker_sdk
from docker.errors import DockerException, NotFound


@dataclass(frozen=True, slots=True)
class DockerConfig:
    """Docker connection and execution defaults."""

    docker_host: str | None = None
    timeout_seconds: float = 30

    def __post_init__(self) -> None:
        if self.timeout_seconds <= 0:
            raise ValueError("Docker timeout must be greater than zero.")


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
        """Execute a command and return decoded process output."""
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
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="docker-exec")
        future = executor.submit(
            container.exec_run,
            cmd=command,
            workdir=workdir,
            demux=True,
        )
        try:
            execution = future.result(timeout=timeout)
        except FutureTimeoutError as exc:
            raise DockerTimeoutError(
                f"Command in container '{container_name}' exceeded {timeout} seconds."
            ) from exc
        except (DockerException, OSError) as exc:
            raise DockerExecutionError(
                f"Failed to execute command in container '{container_name}': {exc}"
            ) from exc
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

        try:
            stdout, stderr = self._decode_output(execution.output)
            exit_code = int(execution.exit_code)
        except (AttributeError, TypeError, ValueError) as exc:
            raise DockerExecutionError(
                f"Container '{container_name}' returned an invalid execution result."
            ) from exc

        return DockerCommandResult(
            success=exit_code == 0,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
        )

    @staticmethod
    def _decode_output(output: Any) -> tuple[str, str]:
        if not output:
            return "", ""
        stdout_bytes, stderr_bytes = output
        stdout = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
        stderr = stderr_bytes.decode("utf-8", errors="replace") if stderr_bytes else ""
        return stdout, stderr
