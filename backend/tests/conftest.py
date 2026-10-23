"""Fixtures compartilhadas pelos testes do backend."""

import io
import time
import zipfile
from collections.abc import Callable, Iterator
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from config import settings
from services.verilog import VerilogService

FIXTURES_DIR = Path(__file__).parent / "fixtures"

MINIMAL_VERILOG = """module top(input a, output y);
  assign y = ~a;
endmodule
"""


def make_zip(files: dict[str, bytes | str]) -> bytes:
    """Monta um ZIP em memória a partir de ``{caminho: conteúdo}``."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


@pytest.fixture
def runs_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Aponta ``settings.VERILOG_RUNS_DIR`` para um diretório temporário vazio."""
    path = tmp_path / "verilog_code" / "runs"
    path.mkdir(parents=True)
    monkeypatch.setattr(settings, "VERILOG_RUNS_DIR", path)
    return path


@pytest.fixture
def mock_docker() -> MagicMock:
    """Integração Docker falsa: nenhum teste unitário fala com o daemon."""
    return MagicMock()


@pytest.fixture
def service(runs_dir: Path, mock_docker: MagicMock) -> VerilogService:
    """VerilogService com Yosys e Docker mockados, apontando para runs_dir."""
    return VerilogService(yosys_integration=MagicMock(), docker_integration=mock_docker)


@pytest.fixture
def verilog_project(runs_dir: Path) -> Path:
    """Run com um projeto Verilog mínimo (runs/run_<id>/top.v)."""
    project = runs_dir / "run_test"
    project.mkdir()
    (project / "top.v").write_text(MINIMAL_VERILOG)
    return project


@pytest.fixture
def api_client(runs_dir: Path) -> Iterator[TestClient]:
    """Cliente HTTP da aplicação usando o diretório de runs temporário."""
    from main import app

    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


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


@pytest.fixture
def bypass_run_auth() -> None:
    """Dispensa o X-Session-Token; a autenticação é coberta em test_auth_routes.py."""
    from auth import (
        AuthorizedRun,
        require_run_in_use_from_body,
        require_run_session_from_path,
    )
    from main import app

    app.dependency_overrides[require_run_in_use_from_body] = lambda: None
    app.dependency_overrides[require_run_session_from_path] = lambda: AuthorizedRun(
        project_id="runs/run_x", run_name="run_x", run_dir=Path("/nonexistent")
    )
