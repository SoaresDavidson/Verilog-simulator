"""Testes de autorização por sessão e da rota administrativa (#8)."""

import logging
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from conftest import make_zip
from fastapi.testclient import TestClient

from auth import SESSION_FILE_NAME
from config import settings
from integrations.yosys import YosysIntegration
from main import app
from routes.verilog import get_verilog_service
from services.verilog import VerilogService

BASE = "/api/v1/verilog"


def _upload(client: TestClient) -> dict:
    response = client.post(
        f"{BASE}/upload-projeto-zip",
        files={
            "file": (
                "p.zip",
                make_zip({"top.v": "module top; endmodule"}),
                "application/zip",
            )
        },
    )
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def fake_tools() -> VerilogService:
    """Serviço real para upload/exclusão, com síntese e simulação simuladas."""
    service = VerilogService(
        yosys_integration=MagicMock(), docker_integration=MagicMock()
    )
    service.mapear_processador = MagicMock(
        return_value={
            "success": True,
            "stdout": "",
            "stderr": "",
            "top_module": None,
            "netlist_content": None,
            "stat_report": None,
        }
    )
    service.simular_execucao = MagicMock(
        return_value={
            "success": True,
            "stdout": "",
            "stderr": "",
            "simulation_log": None,
        }
    )
    app.dependency_overrides[get_verilog_service] = lambda: service
    return service


def test_upload_returns_session_token_and_stores_only_digest(
    api_client: TestClient, runs_dir: Path
) -> None:
    """O token volta ao cliente e só o hash fica gravado no run."""
    body = _upload(api_client)

    session_file = runs_dir.parent / body["project_id"] / SESSION_FILE_NAME
    assert len(body["session_token"]) >= 32
    assert session_file.is_file()
    assert body["session_token"] not in session_file.read_text()


def test_session_file_is_not_a_verilog_source(
    api_client: TestClient, runs_dir: Path
) -> None:
    """O `.session` nunca é tratado como fonte."""
    body = _upload(api_client)

    sources = YosysIntegration._find_verilog_sources(
        runs_dir.parent / body["project_id"]
    )

    assert [source.as_posix() for source in sources] == ["top.v"]


@pytest.mark.parametrize("route", ["mapear-processador", "simular-execucao"])
def test_run_routes_require_session_token(
    api_client: TestClient, fake_tools: VerilogService, route: str
) -> None:
    """Sem token → 401; token de outra sessão → 403; token correto → 200."""
    mine, other = _upload(api_client), _upload(api_client)
    payload = {"project_id": mine["project_id"]}

    missing = api_client.post(f"{BASE}/{route}", json=payload)
    crossed = api_client.post(
        f"{BASE}/{route}",
        json=payload,
        headers={"X-Session-Token": other["session_token"]},
    )
    ok = api_client.post(
        f"{BASE}/{route}",
        json=payload,
        headers={"X-Session-Token": mine["session_token"]},
    )

    assert missing.status_code == 401
    assert crossed.status_code == 403
    assert missing.json()["error"]["code"] == "SESSION_TOKEN_MISSING"
    assert crossed.json()["error"]["code"] == "SESSION_TOKEN_INVALID"
    assert ok.status_code == 200
    tool = (
        fake_tools.mapear_processador
        if route == "mapear-processador"
        else fake_tools.simular_execucao
    )
    assert tool.call_args.args[0] == mine["project_id"]
    tool.assert_called_once()


def test_run_routes_reject_unknown_or_malformed_ids(
    api_client: TestClient, fake_tools: VerilogService
) -> None:
    """Run inexistente → 404; id fora do formato canônico → 400."""
    headers = {"X-Session-Token": "qualquer"}

    unknown = api_client.post(
        f"{BASE}/mapear-processador",
        json={"project_id": "runs/run_" + "0" * 32},
        headers=headers,
    )
    malformed = api_client.post(
        f"{BASE}/mapear-processador",
        json={"project_id": "runs/../etc"},
        headers=headers,
    )

    assert unknown.status_code == 404
    assert malformed.status_code == 400
    fake_tools.mapear_processador.assert_not_called()


def test_delete_with_other_session_is_forbidden_and_preserves_run(
    api_client: TestClient, runs_dir: Path
) -> None:
    """Exclusão cruzada responde 403 e mantém o diretório."""
    mine, other = _upload(api_client), _upload(api_client)

    response = api_client.delete(
        f"{BASE}/projeto/{mine['project_id']}",
        headers={"X-Session-Token": other["session_token"]},
    )

    assert response.status_code == 403
    assert (runs_dir.parent / mine["project_id"]).is_dir()


def test_happy_path_upload_map_simulate_delete(
    api_client: TestClient, runs_dir: Path, fake_tools: VerilogService
) -> None:
    """Fluxo completo com o mesmo token funciona ponta a ponta."""
    body = _upload(api_client)
    headers = {"X-Session-Token": body["session_token"]}
    payload = {"project_id": body["project_id"]}

    assert (
        api_client.post(
            f"{BASE}/mapear-processador", json=payload, headers=headers
        ).status_code
        == 200
    )
    assert (
        api_client.post(
            f"{BASE}/simular-execucao", json=payload, headers=headers
        ).status_code
        == 200
    )
    deleted = api_client.delete(f"{BASE}/projeto/{body['project_id']}", headers=headers)

    assert deleted.status_code == 200
    assert not (runs_dir.parent / body["project_id"]).exists()


def test_limpar_disabled_without_admin_token(
    api_client: TestClient, runs_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sem ADMIN_TOKEN configurado a rota não existe (404) e nada é apagado."""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", None)
    body = _upload(api_client)

    response = api_client.post(f"{BASE}/limpar", headers={"X-Admin-Token": "x"})

    assert response.status_code == 404
    assert (runs_dir.parent / body["project_id"]).is_dir()


def test_limpar_requires_valid_admin_token(
    api_client: TestClient,
    runs_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Sem token → 401; token errado → 403; token certo limpa e registra em log."""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "segredo-admin")
    body = _upload(api_client)

    missing = api_client.post(f"{BASE}/limpar")
    wrong = api_client.post(f"{BASE}/limpar", headers={"X-Admin-Token": "errado"})
    assert missing.status_code == 401
    assert wrong.status_code == 403
    assert missing.json()["error"]["code"] == "ADMIN_TOKEN_MISSING"
    assert wrong.json()["error"]["code"] == "ADMIN_TOKEN_INVALID"
    assert (runs_dir.parent / body["project_id"]).is_dir()

    with caplog.at_level(logging.WARNING, logger="routes.verilog"):
        ok = api_client.post(
            f"{BASE}/limpar", headers={"X-Admin-Token": "segredo-admin"}
        )

    assert ok.status_code == 200
    assert ok.json()["details"]["deleted_count"] == 1
    assert not (runs_dir.parent / body["project_id"]).exists()
    assert any(
        "Limpeza global" in record.getMessage() and "1 run(s)" in record.getMessage()
        for record in caplog.records
    )
