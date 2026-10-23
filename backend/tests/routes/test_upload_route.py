"""Testes de rota do upload de projeto (#18)."""

import re
from pathlib import Path

from conftest import make_zip
from fastapi.testclient import TestClient

UPLOAD_URL = "/api/v1/verilog/upload-projeto-zip"


def _upload(client: TestClient, data: bytes, filename: str = "projeto.zip"):
    return client.post(UPLOAD_URL, files={"file": (filename, data, "application/zip")})


def test_upload_returns_canonical_project_id(
    api_client: TestClient, runs_dir: Path
) -> None:
    """Upload válido com pasta raiz responde 200 e id canônico."""
    response = _upload(api_client, make_zip({"proj/top.v": "module top; endmodule"}))

    assert response.status_code == 200
    project_id = response.json()["project_id"]
    assert re.fullmatch(r"runs/run_[0-9a-f]{32}", project_id)
    assert (runs_dir.parent / project_id / "top.v").is_file()


def test_upload_without_sources_returns_400(
    api_client: TestClient, runs_dir: Path
) -> None:
    """ZIP sem .v/.sv responde 400 com mensagem clara e sem resíduo."""
    response = _upload(api_client, make_zip({"leia.txt": "nada"}))

    assert response.status_code == 400
    assert "Verilog" in response.json()["detail"]
    assert list(runs_dir.iterdir()) == []


def test_upload_corrupted_returns_400(api_client: TestClient, runs_dir: Path) -> None:
    """ZIP corrompido responde 400, não 500."""
    response = _upload(api_client, b"PK\x03\x04lixo")

    assert response.status_code == 400
    assert list(runs_dir.iterdir()) == []


def test_upload_empty_zip_returns_400(api_client: TestClient, runs_dir: Path) -> None:
    """ZIP sem entradas responde 400."""
    response = _upload(api_client, make_zip({}))

    assert response.status_code == 400
    assert list(runs_dir.iterdir()) == []


def test_upload_rejects_non_zip_filename(
    api_client: TestClient, runs_dir: Path
) -> None:
    """Somente arquivos .zip são aceitos."""
    response = _upload(api_client, b"module top; endmodule", filename="top.v")

    assert response.status_code == 400
