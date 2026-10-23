"""Fixtures compartilhadas pelos testes do backend."""

import io
import zipfile
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from config import settings
from services.verilog import VerilogService

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
