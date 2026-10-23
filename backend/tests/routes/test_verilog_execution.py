"""Testes HTTP das rotas de execução (mapear-processador e simular-execucao)."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from integrations.icarus import IcarusContainerNotFoundError, IcarusTimeoutError
from integrations.vcd import VcdSelection
from integrations.yosys import YosysContainerNotFoundError, YosysTimeoutError
from main import app
from routes.verilog import get_verilog_service

PROJECT = {"project_id": "runs/run_0123456789abcdef0123456789abcdef"}


@pytest.fixture
def service() -> MagicMock:
    """Serviço Verilog falso injetado nas rotas."""
    fake = MagicMock()
    app.dependency_overrides[get_verilog_service] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client(service: MagicMock) -> TestClient:
    """Cliente HTTP da aplicação."""
    with TestClient(app) as test_client:
        yield test_client


def test_simulation_timeout_returns_408_with_guidance(
    client: TestClient, service: MagicMock
) -> None:
    """Timeout do Icarus responde 408 com orientação em português."""
    service.simular_execucao.side_effect = IcarusTimeoutError("exceeded", 30)

    response = client.post("/api/v1/verilog/simular-execucao", json=PROJECT)

    assert response.status_code == 408
    detail = response.json()["detail"]
    assert "30 segundos" in detail
    assert "$finish" in detail


def test_synthesis_timeout_returns_408(client: TestClient, service: MagicMock) -> None:
    """Timeout do Yosys responde 408 com mensagem em português."""
    service.mapear_processador.side_effect = YosysTimeoutError("exceeded", 12.5)

    response = client.post("/api/v1/verilog/mapear-processador", json=PROJECT)

    assert response.status_code == 408
    assert "12.5 segundos" in response.json()["detail"]


@pytest.mark.parametrize(
    ("route", "method", "error"),
    [
        ("simular-execucao", "simular_execucao", IcarusContainerNotFoundError("x")),
        ("mapear-processador", "mapear_processador", YosysContainerNotFoundError("x")),
    ],
)
def test_unavailable_container_returns_503(
    client: TestClient,
    service: MagicMock,
    route: str,
    method: str,
    error: Exception,
) -> None:
    """Container indisponível é 503, não 500."""
    getattr(service, method).side_effect = error

    response = client.post(f"/api/v1/verilog/{route}", json=PROJECT)

    assert response.status_code == 503


def test_simulation_forwards_waveform_selection(
    client: TestClient, service: MagicMock
) -> None:
    """Campos opcionais de recorte chegam ao serviço como VcdSelection."""
    service.simular_execucao.return_value = {
        "success": True,
        "stdout": "",
        "stderr": "",
        "simulation_log": None,
    }

    response = client.post(
        "/api/v1/verilog/simular-execucao",
        json={
            **PROJECT,
            "begin_time": 10,
            "end_time": 20,
            "signals": ["tb.clk"],
            "decimation": 2,
        },
    )

    assert response.status_code == 200
    service.simular_execucao.assert_called_once_with(
        PROJECT["project_id"],
        VcdSelection(begin_time=10, end_time=20, signals=("tb.clk",), decimation=2),
    )


def test_simulation_without_selection_keeps_old_contract(
    client: TestClient, service: MagicMock
) -> None:
    """Body só com project_id continua válido e sem recorte."""
    service.simular_execucao.return_value = {
        "success": True,
        "stdout": "",
        "stderr": "",
        "simulation_log": None,
    }

    response = client.post("/api/v1/verilog/simular-execucao", json=PROJECT)

    assert response.status_code == 200
    service.simular_execucao.assert_called_once_with(
        PROJECT["project_id"], VcdSelection()
    )


@pytest.mark.parametrize(
    "extra",
    [{"begin_time": 5, "end_time": 1}, {"decimation": 0}, {"begin_time": -1}],
)
def test_invalid_selection_is_rejected(
    client: TestClient, service: MagicMock, extra: dict
) -> None:
    """Recorte inconsistente é recusado antes de executar a simulação."""
    response = client.post(
        "/api/v1/verilog/simular-execucao", json={**PROJECT, **extra}
    )

    assert response.status_code == 422
    service.simular_execucao.assert_not_called()
