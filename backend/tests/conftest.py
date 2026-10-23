"""Shared fixtures for backend tests."""

from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class FakeExec:
    """Handle to a mocked Docker command execution."""

    def __init__(self, mock: MagicMock) -> None:
        self.mock = mock

    @property
    def called(self) -> bool:
        """Whether the command was executed."""
        return self.mock.called

    @property
    def command(self) -> list[str]:
        """Command list passed to Docker."""
        return list(self.mock.call_args.kwargs["cmd"])

    @property
    def workdir(self) -> str:
        """Working directory passed to Docker."""
        return self.mock.call_args.kwargs["workdir"]


type ExecConfigurator = Callable[..., FakeExec]


@pytest.fixture
def fixtures_dir() -> Path:
    """Return directory with static test fixtures."""
    return FIXTURES_DIR


@pytest.fixture
def fake_exec() -> ExecConfigurator:
    """Configure a Docker client mock to answer one command execution.

    Returns a function ``(docker_client, exit_code=0, stdout=b"", stderr=b"",
    side_effect=None) -> FakeExec``.
    ``side_effect`` runs before the result is returned (e.g. to write artifacts).
    """

    def configure(
        docker_client: MagicMock,
        exit_code: int = 0,
        stdout: bytes = b"",
        stderr: bytes = b"",
        side_effect: Callable[..., object] | None = None,
    ) -> FakeExec:
        container = docker_client.containers.get.return_value

        def exec_run(**kwargs: object) -> SimpleNamespace:
            if side_effect is not None:
                side_effect(**kwargs)
            return SimpleNamespace(exit_code=exit_code, output=(stdout, stderr))

        container.exec_run.side_effect = exec_run
        return FakeExec(container.exec_run)

    return configure
