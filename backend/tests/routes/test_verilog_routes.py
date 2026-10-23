"""Testes das rotas de Verilog com o service mockado."""

from collections.abc import Iterator
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from auth import (
    AuthorizedRun,
    require_run_in_use_from_body,
    require_run_session_from_path,
)
from main import app
from routes.verilog import get_verilog_service

BASE = "/api/v1/verilog"


@pytest.fixture
def svc() -> MagicMock:
    return MagicMock()


@pytest.fixture
def client(svc: MagicMock) -> Iterator[TestClient]:
    # Autenticação é coberta em test_auth_routes.py; aqui só o mapeamento de erros.
    app.dependency_overrides[get_verilog_service] = lambda: svc
    app.dependency_overrides[require_run_in_use_from_body] = lambda: None
    app.dependency_overrides[require_run_session_from_path] = lambda: AuthorizedRun(
        project_id="runs/run_x", run_name="run_x", run_dir=Path("/nonexistent")
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_upload_rejects_non_zip(client: TestClient, svc: MagicMock) -> None:
    response = client.post(f"{BASE}/upload-projeto-zip", files={"file": ("a.txt", b"x")})

    assert response.status_code == 400
    svc.upload_zip_project.assert_not_called()


def test_delete_invalid_id_value_error_is_400(client: TestClient, svc: MagicMock) -> None:
    svc.delete_project.side_effect = ValueError("invalid")

    assert client.delete(f"{BASE}/projeto/runs/run_x").status_code == 400


def test_delete_unknown_run_returns_404(client: TestClient, svc: MagicMock) -> None:
    svc.delete_project.return_value = False

    assert client.delete(f"{BASE}/projeto/runs/run_x").status_code == 404


def test_mapear_invalid_id_returns_400(client: TestClient, svc: MagicMock) -> None:
    svc.mapear_processador.side_effect = ValueError("invalid")

    response = client.post(f"{BASE}/mapear-processador", json={"project_id": "../x"})

    assert response.status_code == 400


def test_mapear_unknown_run_returns_404(client: TestClient, svc: MagicMock) -> None:
    svc.mapear_processador.side_effect = FileNotFoundError("missing")

    response = client.post(f"{BASE}/mapear-processador", json={"project_id": "runs/run_x"})

    assert response.status_code == 404


def test_simular_unknown_run_returns_404(client: TestClient, svc: MagicMock) -> None:
    svc.simular_execucao.side_effect = FileNotFoundError("missing")

    response = client.post(f"{BASE}/simular-execucao", json={"project_id": "runs/run_x"})

    assert response.status_code == 404


def test_simular_without_netlist_returns_200(client: TestClient, svc: MagicMock) -> None:
    svc.simular_execucao.return_value = {
        "success": True,
        "stdout": "ok",
        "stderr": "",
        "simulation_log": None,
    }

    response = client.post(f"{BASE}/simular-execucao", json={"project_id": "runs/run_x"})

    assert response.status_code == 200
    assert response.json()["simulation_log"] is None
