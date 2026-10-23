"""Teste de contrato HTTP de POST /mapear-processador com netlist real."""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from integrations.yosys import YosysResult
from main import app
from routes.verilog import get_verilog_service
from services.verilog import VerilogService

pytestmark = pytest.mark.usefixtures("bypass_run_auth")

PROJECT = {"project_id": "runs/run_0123456789abcdef0123456789abcdef"}


@pytest.fixture
def client() -> TestClient:
    """Cliente HTTP com dependências restauradas ao final."""
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def use_netlist(netlist: dict | None, stderr: str = "") -> None:
    """Injeta um VerilogService real com integração Yosys falsa."""
    integration = MagicMock()
    integration.synthesize.return_value = YosysResult(
        success=True,
        exit_code=0,
        stdout="synth ok",
        stderr=stderr,
        netlist_content=netlist,
        stat_report="=== cpu ===",
    )
    service = VerilogService(yosys_integration=integration)
    app.dependency_overrides[get_verilog_service] = lambda: service


def test_success_response_serializes_typed_netlist(
    client: TestClient, fixtures_dir: Path
) -> None:
    """Resposta tem top_module, stat_report e netlist no formato do Yosys + width."""
    raw = json.loads((fixtures_dir / "netlist" / "estrutura.json").read_text())
    use_netlist(raw)

    response = client.post("/api/v1/verilog/mapear-processador", json=PROJECT)

    assert response.status_code == 200
    body = response.json()
    assert list(body) == [
        "success",
        "stdout",
        "stderr",
        "top_module",
        "netlist_content",
        "stat_report",
    ]
    assert body["success"] is True
    assert body["top_module"] == "cpu"
    assert body["stat_report"] == "=== cpu ==="
    cpu = body["netlist_content"]["modules"]["cpu"]
    assert cpu["ports"]["konst"] == {
        "direction": "output",
        "bits": ["0", "x", "0", "1"],
        "width": 4,
    }
    assert cpu["netnames"]["a"]["width"] == 4
    assert cpu["cells"]["u_inc"]["connections"]["d"] == [16, 17, 18, 19]
    assert body["netlist_content"]["creator"].startswith("Yosys")


def test_invalid_netlist_is_success_false(client: TestClient) -> None:
    """JSON incompatível responde success false, sem netlist parcial."""
    use_netlist({"creator": "Yosys", "modules": {"cpu": {"ports": "oops"}}})

    response = client.post("/api/v1/verilog/mapear-processador", json=PROJECT)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["netlist_content"] is None
    assert body["top_module"] is None
    assert "estrutura.json" in body["stderr"]


def test_openapi_describes_netlist_without_any(client: TestClient) -> None:
    """OpenAPI expõe o schema Netlist em vez de um campo genérico."""
    spec = client.get("/api/v1/openapi.json").json()
    schemas = spec["components"]["schemas"]

    netlist_field = schemas["MapearProcessadorResponse"]["properties"][
        "netlist_content"
    ]
    refs = [option.get("$ref") for option in netlist_field["anyOf"]]
    assert "#/components/schemas/Netlist" in refs
    for name in ("NetlistModule", "NetlistPort", "NetlistCell", "NetlistNet"):
        assert name in schemas
    port = schemas["NetlistPort"]["properties"]
    assert port["direction"]["$ref"] == "#/components/schemas/Direction"
    assert schemas["Direction"]["enum"] == ["input", "output", "inout"]
    assert schemas["ConstantBit"]["enum"] == ["0", "1", "x", "z"]
    assert "width" in schemas["NetlistPort"]["required"]
