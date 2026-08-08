"""Unit tests for reusable Docker integration."""

import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from docker.errors import DockerException, NotFound

from integrations.docker import (
    DockerConfig,
    DockerConnectionError,
    DockerContainerNotFoundError,
    DockerContainerUnavailableError,
    DockerExecutionError,
    DockerIntegration,
    DockerTimeoutError,
)


@pytest.fixture
def docker_client() -> MagicMock:
    """Return injected client with running container."""
    client = MagicMock()
    client.containers.get.return_value.status = "running"
    return client


def test_injected_client_is_returned_without_recreation(
    docker_client: MagicMock,
) -> None:
    """Client injection avoids daemon connection during unit tests."""
    integration = DockerIntegration(docker_client=docker_client)

    assert integration.get_client() is docker_client
    docker_client.ping.assert_not_called()


def test_connection_failure_raises_specific_error(mocker: MagicMock) -> None:
    """Daemon connection errors are normalized."""
    mocker.patch(
        "integrations.docker.docker_sdk.from_env",
        side_effect=DockerException("daemon unavailable"),
    )

    with pytest.raises(DockerConnectionError, match="daemon unavailable"):
        DockerIntegration().get_client()


def test_running_container_is_returned(docker_client: MagicMock) -> None:
    """Running container passes availability validation."""
    container = docker_client.containers.get.return_value

    assert (
        DockerIntegration(docker_client=docker_client).get_container("yosys")
        is container
    )
    docker_client.containers.get.assert_called_once_with("yosys")


def test_missing_container_raises_specific_error(docker_client: MagicMock) -> None:
    """Missing container is distinguished from daemon failure."""
    docker_client.containers.get.side_effect = NotFound("missing")

    with pytest.raises(DockerContainerNotFoundError, match="was not found"):
        DockerIntegration(docker_client=docker_client).get_container("yosys")


def test_stopped_container_raises_unavailable_error(docker_client: MagicMock) -> None:
    """Stopped container cannot receive commands."""
    docker_client.containers.get.return_value.status = "exited"

    with pytest.raises(DockerContainerUnavailableError, match="not running"):
        DockerIntegration(docker_client=docker_client).get_container("yosys")


def test_successful_execution_returns_typed_result(docker_client: MagicMock) -> None:
    """Command execution returns exit code and decoded streams."""
    container = docker_client.containers.get.return_value
    container.exec_run.return_value = SimpleNamespace(
        exit_code=0,
        output=(b"compiled", b"warning"),
    )

    result = DockerIntegration(docker_client=docker_client).execute(
        container_name="yosys",
        command=["yosys", "-V"],
        workdir="/verilog_code",
    )

    assert result.success is True
    assert result.exit_code == 0
    assert result.stdout == "compiled"
    assert result.stderr == "warning"
    container.exec_run.assert_called_once_with(
        cmd=["yosys", "-V"],
        workdir="/verilog_code",
        demux=True,
    )


def test_execution_failure_is_normalized(docker_client: MagicMock) -> None:
    """Docker SDK execution errors use integration exception."""
    container = docker_client.containers.get.return_value
    container.exec_run.side_effect = DockerException("exec failed")

    with pytest.raises(DockerExecutionError, match="exec failed"):
        DockerIntegration(docker_client=docker_client).execute(
            "yosys", ["yosys", "-V"], "/verilog_code"
        )


def test_execution_timeout_raises_specific_error(docker_client: MagicMock) -> None:
    """Long-running command respects per-call timeout."""
    container = docker_client.containers.get.return_value

    def slow_execution(**_kwargs: object) -> SimpleNamespace:
        time.sleep(0.05)
        return SimpleNamespace(exit_code=0, output=(b"", b""))

    container.exec_run.side_effect = slow_execution

    with pytest.raises(DockerTimeoutError, match="exceeded"):
        DockerIntegration(
            config=DockerConfig(timeout_seconds=0.01),
            docker_client=docker_client,
        ).execute("yosys", ["yosys", "-V"], "/verilog_code")
