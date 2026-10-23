"""Shared fixtures for backend tests."""

import time
from collections.abc import Callable, Iterator
from pathlib import Path
from unittest.mock import MagicMock

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class FakeExec:
    """Handle to a mocked Docker command execution (low-level exec API)."""

    def __init__(self, api: MagicMock) -> None:
        self.api = api

    @property
    def called(self) -> bool:
        """Whether the command was executed."""
        return self.api.exec_create.called

    @property
    def full_command(self) -> list[str]:
        """Command sent to Docker, including the ``timeout`` prefix."""
        return list(self.api.exec_create.call_args.kwargs["cmd"])

    @property
    def command(self) -> list[str]:
        """Command sent to Docker without the ``timeout`` prefix."""
        command = self.full_command
        assert command[:2] == ["timeout", "--signal=KILL"]
        return command[3:]

    @property
    def workdir(self) -> str:
        """Working directory passed to Docker."""
        return self.api.exec_create.call_args.kwargs["workdir"]


type ExecConfigurator = Callable[..., FakeExec]


@pytest.fixture
def fixtures_dir() -> Path:
    """Return directory with static test fixtures."""
    return FIXTURES_DIR


@pytest.fixture
def fake_exec() -> ExecConfigurator:
    """Configure a Docker client mock to answer one command execution.

    Returns a function ``(docker_client, exit_code=0, stdout=b"", stderr=b"",
    side_effect=None, delay=0) -> FakeExec``. ``side_effect`` runs while the
    command "executes" (e.g. to write artifacts); ``delay`` makes the output
    stream block for that many seconds.
    """

    def configure(
        docker_client: MagicMock,
        exit_code: int = 0,
        stdout: bytes = b"",
        stderr: bytes = b"",
        side_effect: Callable[..., object] | None = None,
        delay: float = 0,
    ) -> FakeExec:
        api = docker_client.api
        api.exec_create.return_value = {"Id": "exec-1"}

        def exec_start(*_args: object, **_kwargs: object) -> Iterator[tuple]:
            if side_effect is not None:
                side_effect(**api.exec_create.call_args.kwargs)
            if delay:
                time.sleep(delay)
            yield (stdout or None, stderr or None)

        api.exec_start.side_effect = exec_start
        api.exec_inspect.return_value = {"ExitCode": exit_code, "Running": False}
        return FakeExec(api)

    return configure
