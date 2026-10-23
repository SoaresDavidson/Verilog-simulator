"""Testes de rota do ciclo de vida dos runs (#10)."""

import os
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from conftest import make_zip
from fastapi.testclient import TestClient

from config import settings
from integrations.docker import DockerCommandResult
from main import app
from routes.status import get_health_service
from routes.verilog import get_verilog_service
from services.health import HealthConfig, HealthService
from services.runs_gc import (
    CollectionState,
    RetentionPolicy,
    collect_and_record,
    run_registry,
)
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


def test_run_is_marked_in_use_during_synthesis(api_client: TestClient) -> None:
    """Durante o mapeamento o run fica marcado e é liberado ao final."""
    body = _upload(api_client)
    run_name = body["project_id"].split("/")[1]
    seen: list[bool] = []
    service = VerilogService(
        yosys_integration=MagicMock(), docker_integration=MagicMock()
    )

    def fake_map(project_id: str) -> dict:
        seen.append(run_registry.is_in_use(run_name))
        return {"success": True, "stdout": "", "stderr": "", "top_module": None,
                "netlist_content": None, "stat_report": None}

    service.mapear_processador = fake_map
    app.dependency_overrides[get_verilog_service] = lambda: service

    response = api_client.post(
        f"{BASE}/mapear-processador",
        json={"project_id": body["project_id"]},
        headers={"X-Session-Token": body["session_token"]},
    )

    assert response.status_code == 200
    assert seen == [True]
    assert not run_registry.is_in_use(run_name)


def test_status_reports_runs_usage_and_last_collection(
    api_client: TestClient, runs_dir: Path
) -> None:
    """O status expõe quantidade de runs, bytes e horário da última coleta."""
    _upload(api_client)
    state = CollectionState()
    collect_and_record(runs_dir, RetentionPolicy(), state=state)
    docker = MagicMock()
    docker.execute.return_value = DockerCommandResult(
        success=True, exit_code=0, stdout="v1", stderr=""
    )
    service = HealthService(
        HealthConfig(runs_dir=runs_dir, cache_ttl_seconds=0), docker, gc_state=state
    )
    app.dependency_overrides[get_health_service] = lambda: service

    runs = api_client.get("/api/v1/status/").json()["runs"]

    assert runs["count"] == 1
    assert runs["total_bytes"] > 0
    assert runs["last_collection_at"] is not None
    assert runs["last_collection_removed"] == 0


def test_lifespan_starts_periodic_collection(
    runs_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ao subir a API, a coleta periódica remove runs expirados."""
    run = runs_dir / ("run_" + "a" * 32)
    run.mkdir()
    (run / "top.v").write_text("x")
    for path in (run / "top.v", run):
        os.utime(path, (0, 0))
    monkeypatch.setattr(settings, "GC_INTERVAL_MINUTES", 60)

    with TestClient(app):
        deadline = time.monotonic() + 5
        while run.exists() and time.monotonic() < deadline:
            time.sleep(0.02)

    assert not run.exists()
