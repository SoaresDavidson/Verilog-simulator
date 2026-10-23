"""Fixtures compartilhadas pelos testes do backend."""

import io
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from config import settings


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
def api_client(runs_dir: Path) -> Iterator[TestClient]:
    """Cliente HTTP da aplicação usando o diretório de runs temporário."""
    from main import app

    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
