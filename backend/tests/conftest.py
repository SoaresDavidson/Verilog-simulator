"""Fixtures compartilhadas pelos testes do backend."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from config import settings
from services.verilog import VerilogService

MINIMAL_VERILOG = """module top(input a, output y);
  assign y = ~a;
endmodule
"""


@pytest.fixture
def runs_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Diretório de runs temporário, isolado do /verilog_code real."""
    path = tmp_path / "runs"
    path.mkdir()
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
