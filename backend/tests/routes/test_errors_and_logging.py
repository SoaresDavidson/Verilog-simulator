"""Schema único de erro, request id e logging estruturado (#12)."""

import json
import logging
import sys
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from integrations.yosys import YosysError, YosysTimeoutError
from logging_config import JsonFormatter, TextFormatter, truncate_for_log
from main import app
from routes.verilog import get_verilog_service

pytestmark = pytest.mark.usefixtures("bypass_run_auth")

PROJECT_ID = "runs/run_0123456789abcdef0123456789abcdef"
PROJECT = {"project_id": PROJECT_ID}
MAPEAR = "/api/v1/verilog/mapear-processador"
SECRET_PATH = "/verilog_code/runs/run_0123456789abcdef0123456789abcdef/top.v"


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


def _assert_error_schema(response, status_code: int, code: str) -> dict:
    assert response.status_code == status_code
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "request_id"}
    assert error["code"] == code
    assert error["request_id"] == response.headers["X-Request-ID"]
    return error


def test_unexpected_exception_returns_generic_500_and_logs_traceback(
    client: TestClient, service: MagicMock, caplog: pytest.LogCaptureFixture
) -> None:
    """Exceção inesperada: 500 genérico sem detalhes internos; traceback só no log."""
    service.mapear_processador.side_effect = RuntimeError(f"falhou ao abrir {SECRET_PATH}")

    with caplog.at_level(logging.ERROR):
        response = client.post(MAPEAR, json=PROJECT)

    error = _assert_error_schema(response, 500, "INTERNAL_ERROR")
    assert "/verilog_code" not in response.text
    assert "RuntimeError" not in response.text
    assert "Traceback" not in response.text

    failures = [record for record in caplog.records if record.exc_info]
    assert failures, "o traceback deve ser logado"
    assert failures[0].request_id == error["request_id"]
    assert "Traceback" in caplog.text
    assert SECRET_PATH in caplog.text


def test_unexpected_exception_response_keeps_cors_headers(client: TestClient, service: MagicMock) -> None:
    """O 500 genérico passa pelo CORS, senão o navegador esconderia o corpo."""
    service.mapear_processador.side_effect = RuntimeError("boom")

    response = client.post(MAPEAR, json=PROJECT, headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_timeout_returns_408_with_code(client: TestClient, service: MagicMock) -> None:
    """Timeout de ferramenta vira 408 com code específico."""
    service.mapear_processador.side_effect = YosysTimeoutError("exceeded 30", 30)

    error = _assert_error_schema(client.post(MAPEAR, json=PROJECT), 408, "YOSYS_TIMEOUT")

    assert "30 segundos" in error["message"]


def test_tool_error_does_not_leak_exception_text(client: TestClient, service: MagicMock) -> None:
    """Falha interna da ferramenta: 500 com code próprio e mensagem genérica."""
    service.mapear_processador.side_effect = YosysError(
        "Yosys Docker execution failed: 500 Server Error for http+docker://localhost/exec"
    )

    error = _assert_error_schema(client.post(MAPEAR, json=PROJECT), 500, "YOSYS_ERROR")

    assert "docker" not in error["message"].lower()


@pytest.mark.parametrize(
    ("exception", "status_code", "code"),
    [
        (FileNotFoundError(f"Project path '{SECRET_PATH}' was not found."), 404, "PROJECT_NOT_FOUND"),
        (NotADirectoryError(f"Project path '{SECRET_PATH}' is not a directory."), 400, "INVALID_PROJECT_ID"),
        (ValueError("Invalid project ID: directory traversal detected."), 400, "INVALID_REQUEST"),
    ],
)
def test_domain_exceptions_map_to_status_without_paths(
    client: TestClient,
    service: MagicMock,
    exception: Exception,
    status_code: int,
    code: str,
) -> None:
    """Exceções de domínio viram o status certo, sem caminho interno na mensagem."""
    service.mapear_processador.side_effect = exception

    error = _assert_error_schema(client.post(MAPEAR, json=PROJECT), status_code, code)

    assert "/verilog_code" not in error["message"]


def test_validation_error_uses_schema(client: TestClient) -> None:
    """Corpo inválido: 422 VALIDATION_ERROR no formato único."""
    error = _assert_error_schema(client.post(MAPEAR, json={}), 422, "VALIDATION_ERROR")

    assert "project_id" in error["message"]


def test_unknown_route_uses_schema(client: TestClient) -> None:
    """Até o 404 do roteador segue o schema."""
    _assert_error_schema(client.get("/api/v1/nao-existe"), 404, "NOT_FOUND")


def test_request_id_is_generated_and_logged(
    client: TestClient, service: MagicMock, caplog: pytest.LogCaptureFixture
) -> None:
    """Sem header do cliente, um id é gerado, devolvido e usado nas linhas de log."""
    service.mapear_processador.side_effect = YosysTimeoutError("exceeded", 1)

    with caplog.at_level(logging.INFO):
        response = client.post(MAPEAR, json=PROJECT)

    request_id = response.headers["X-Request-ID"]
    assert len(request_id) == 32
    request_lines = [r for r in caplog.records if r.name == "app.request"]
    assert request_lines
    assert {r.request_id for r in request_lines} == {request_id}
    assert "408" in request_lines[-1].getMessage()


def test_request_id_is_propagated(client: TestClient, service: MagicMock, caplog: pytest.LogCaptureFixture) -> None:
    """X-Request-ID do cliente é reaproveitado na resposta, no corpo e no log."""
    service.mapear_processador.side_effect = YosysTimeoutError("exceeded", 1)

    with caplog.at_level(logging.INFO):
        response = client.post(MAPEAR, json=PROJECT, headers={"X-Request-ID": "front-abc.123"})

    assert response.headers["X-Request-ID"] == "front-abc.123"
    assert response.json()["error"]["request_id"] == "front-abc.123"
    assert any(r.request_id == "front-abc.123" for r in caplog.records)


def test_unsafe_incoming_request_id_is_replaced(client: TestClient) -> None:
    """Ids com caracteres fora do padrão não vão parar no log nem no header."""
    response = client.get("/api/v1/status/live", headers={"X-Request-ID": "x y<script>"})

    assert response.headers["X-Request-ID"] != "x y<script>"
    assert len(response.headers["X-Request-ID"]) == 32


def test_success_response_has_request_id(client: TestClient) -> None:
    """Respostas de sucesso também levam X-Request-ID."""
    response = client.get("/api/v1/status/live")

    assert response.status_code == 200
    assert response.headers["X-Request-ID"]


def test_execution_logs_carry_project_id(
    client: TestClient, service: MagicMock, caplog: pytest.LogCaptureFixture
) -> None:
    """Linhas de log emitidas durante a execução trazem project_id e request_id."""

    def fake_mapear(project_id: str) -> dict:
        logging.getLogger("services.verilog").info("executando")
        return {
            "success": False,
            "stdout": "",
            "stderr": "",
            "top_module": None,
            "netlist_content": None,
            "stat_report": None,
        }

    service.mapear_processador.side_effect = fake_mapear

    with caplog.at_level(logging.INFO):
        response = client.post(MAPEAR, json=PROJECT)

    assert response.status_code == 200
    record = next(r for r in caplog.records if r.getMessage() == "executando")
    assert record.project_id == PROJECT_ID
    assert record.request_id == response.headers["X-Request-ID"]


def test_json_formatter_emits_context_and_traceback() -> None:
    """LOG_FORMAT=json: uma linha JSON com request_id, project_id e exceção."""
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = logging.getLogger("x").makeRecord(
            "x", logging.ERROR, __file__, 1, "falhou %s", ("aqui",), exc_info=sys.exc_info()
        )
    record.request_id = "req-1"
    record.project_id = PROJECT_ID

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "falhou aqui"
    assert payload["request_id"] == "req-1"
    assert payload["project_id"] == PROJECT_ID
    assert "RuntimeError: boom" in payload["exception"]


def test_text_formatter_includes_request_and_project() -> None:
    """LOG_FORMAT=text: id da requisição e do run na linha."""
    record = logging.getLogger("x").makeRecord("x", logging.INFO, __file__, 1, "ok", (), None)
    record.request_id = "req-2"
    record.project_id = PROJECT_ID

    line = TextFormatter().format(record)

    assert "[req-2]" in line
    assert f"[{PROJECT_ID}]" in line


def test_truncate_for_log_keeps_tail() -> None:
    """Saídas longas são cortadas mantendo o final, onde ficam os erros."""
    text = "a" * 5000 + "ERRO FINAL"

    truncated = truncate_for_log(text, limit=100)

    assert len(truncated) < 200
    assert truncated.endswith("ERRO FINAL")
    assert truncate_for_log("curto") == "curto"
