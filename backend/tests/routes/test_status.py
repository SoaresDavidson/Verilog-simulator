"""Testes das rotas de liveness e readiness."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from main import app
from routes.status import get_health_service
from services.health import CheckResult, HealthReport, HealthStatus


@pytest.fixture
def client() -> TestClient:
    """Cliente HTTP da aplicação, com as dependências restauradas ao final."""
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _report(status: HealthStatus) -> HealthReport:
    """Monta um relatório mínimo com o status geral pedido."""
    return HealthReport(
        status=status,
        checks={
            "docker_daemon": CheckResult(status=status, detail="detalhe"),
            "yosys": CheckResult(status=status, detail="Yosys 0.9", container="yosys"),
        },
    )


def _override(report: HealthReport) -> MagicMock:
    """Injeta um serviço de health falso que devolve o relatório informado."""
    service = MagicMock()
    service.check.return_value = report
    app.dependency_overrides[get_health_service] = lambda: service
    return service


def test_liveness_does_not_touch_dependencies(client: TestClient) -> None:
    """A rota de liveness responde sem consultar Docker ou disco."""
    response = client.get("/api/v1/status/live")

    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_healthy_status_returns_200(client: TestClient) -> None:
    """Ambiente saudável responde 200 com o detalhamento por dependência."""
    _override(_report(HealthStatus.OK))

    response = client.get("/api/v1/status/")
    body = response.json()

    assert response.status_code == 200
    assert body["status"] == "ok"
    assert body["checks"]["yosys"] == {
        "status": "ok",
        "detail": "Yosys 0.9",
        "container": "yosys",
    }


def test_degraded_status_still_returns_200(client: TestClient) -> None:
    """Degradado ainda é utilizável, então o status HTTP continua 200."""
    _override(_report(HealthStatus.DEGRADED))

    response = client.get("/api/v1/status/")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"


def test_error_status_returns_503(client: TestClient) -> None:
    """Sem condições de executar, a rota responde 503 para o orquestrador."""
    _override(_report(HealthStatus.ERROR))

    response = client.get("/api/v1/status/")

    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_status_uses_the_shared_service(client: TestClient) -> None:
    """A rota delega ao serviço compartilhado, aproveitando o cache dele."""
    service = _override(_report(HealthStatus.OK))

    client.get("/api/v1/status/")

    service.check.assert_called_once_with()
