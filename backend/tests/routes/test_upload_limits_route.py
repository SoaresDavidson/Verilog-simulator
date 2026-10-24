"""Testes de rota dos limites de upload (#9)."""

import asyncio
import os
import tempfile
from pathlib import Path

import pytest
from conftest import make_zip
from fastapi import HTTPException
from fastapi.testclient import TestClient

from body_limit import MULTIPART_OVERHEAD_BYTES, BodySizeLimitMiddleware
from config import settings

UPLOAD_URL = "/api/v1/verilog/upload-projeto-zip"


@pytest.fixture
def temp_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isola os arquivos temporários do upload para verificar a limpeza."""
    path = tmp_path / "tmp"
    path.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(path))
    return path


def _upload(client: TestClient, data: bytes):
    return client.post(UPLOAD_URL, files={"file": ("p.zip", data, "application/zip")})


def test_content_length_above_limit_returns_413(
    api_client: TestClient,
    runs_dir: Path,
    temp_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Content-Length acima do limite é rejeitado antes de ler o corpo."""
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 1000)

    response = _upload(api_client, os.urandom(MULTIPART_OVERHEAD_BYTES + 5000))

    assert response.status_code == 413
    error = response.json()["error"]
    assert error["code"] == "UPLOAD_TOO_LARGE"
    assert "excede o limite" in error["message"]
    assert error["request_id"] == response.headers["X-Request-ID"]
    assert list(runs_dir.iterdir()) == []
    assert list(temp_dir.iterdir()) == []


def test_file_above_limit_is_aborted_while_copying(
    api_client: TestClient,
    runs_dir: Path,
    temp_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Arquivo acima do limite, mesmo com corpo aceito, aborta a cópia com 413."""
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 1000)

    response = _upload(api_client, os.urandom(3000))

    assert response.status_code == 413
    assert list(runs_dir.iterdir()) == []
    assert list(temp_dir.iterdir()) == []


def test_rejected_archive_leaves_no_residue(api_client: TestClient, runs_dir: Path, temp_dir: Path) -> None:
    """Em erro de validação não sobra run nem arquivo temporário."""
    response = _upload(api_client, make_zip({"top.v": "x", "../fora.v": "x"}))

    assert response.status_code == 400
    assert list(runs_dir.iterdir()) == []
    assert list(temp_dir.iterdir()) == []


def test_accepted_upload_removes_temp_file(api_client: TestClient, runs_dir: Path, temp_dir: Path) -> None:
    """Upload aceito também remove o arquivo temporário."""
    response = _upload(api_client, make_zip({"top.v": "module top; endmodule"}))

    assert response.status_code == 200
    assert list(temp_dir.iterdir()) == []


def test_middleware_counts_streamed_bytes_without_content_length() -> None:
    """Sem Content-Length (chunked), o acumulado recebido ainda é limitado."""
    chunks = [b"x" * 40_000, b"x" * 40_000, b""]

    async def app(scope, receive, send):
        while (await receive()).get("more_body"):
            pass

    async def receive():
        body = chunks.pop(0)
        return {"type": "http.request", "body": body, "more_body": bool(chunks)}

    async def send(message):
        raise AssertionError("nenhuma resposta deveria ser enviada")

    middleware = BodySizeLimitMiddleware(app, limit_bytes=lambda: 1000)
    scope = {"type": "http", "headers": []}

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(middleware(scope, receive, send))
    assert excinfo.value.status_code == 413
