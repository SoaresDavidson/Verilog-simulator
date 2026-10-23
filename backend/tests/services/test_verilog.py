"""Compatibility tests for Verilog service."""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from integrations.icarus import IcarusCompilationError, IcarusResult, VcdParseError
from integrations.yosys import YosysResult, YosysSynthesisError
from schemas.netlist import Netlist
from services.verilog import VerilogService


@pytest.fixture
def yosys_netlist(fixtures_dir: Path) -> dict:
    """Netlist real do Yosys com múltiplos módulos, barramentos e constantes."""
    return json.loads((fixtures_dir / "netlist" / "estrutura.json").read_text())


def test_mapear_processador_returns_typed_netlist(yosys_netlist: dict) -> None:
    """Netlist válida vira modelo tipado com módulo de topo identificado."""
    integration = MagicMock()
    integration.synthesize.return_value = YosysResult(
        success=True,
        exit_code=0,
        stdout="ok",
        stderr="",
        netlist_content=yosys_netlist,
        stat_report="Number of cells: 1",
    )
    service = VerilogService(yosys_integration=integration)

    result = service.mapear_processador("runs/run_test")

    assert result["success"] is True
    assert result["top_module"] == "cpu"
    assert isinstance(result["netlist_content"], Netlist)
    assert result["stat_report"] == "Number of cells: 1"
    integration.synthesize.assert_called_once_with("runs/run_test")


def test_mapear_processador_preserves_failed_response() -> None:
    """Synthesis errors remain success-false responses for API compatibility."""
    integration = MagicMock()
    failed_result = YosysResult(
        success=False,
        exit_code=1,
        stdout="",
        stderr="syntax error",
    )
    integration.synthesize.side_effect = YosysSynthesisError("failed", failed_result)
    service = VerilogService(yosys_integration=integration)

    assert service.mapear_processador("runs/run_test") == {
        "success": False,
        "stdout": "",
        "stderr": "syntax error",
        "top_module": None,
        "netlist_content": None,
        "stat_report": None,
    }


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda n: n.pop("modules"), "modules"),
        (
            lambda n: n["modules"]["cpu"]["ports"]["a"].update(direction="sideways"),
            "modules.cpu.ports.a.direction",
        ),
        (
            lambda n: n["modules"]["cpu"]["attributes"].pop("top"),
            "exactly one module",
        ),
        (
            lambda n: n["modules"]["inc4"]["netnames"]["q"].update(bits=[2, "w"]),
            "modules.inc4.netnames.q.bits",
        ),
    ],
)
def test_mapear_processador_rejects_incompatible_netlist(
    yosys_netlist: dict, mutate, expected: str, caplog: pytest.LogCaptureFixture
) -> None:
    """JSON fora do contrato nunca é sucesso parcial: success false e erro claro."""
    mutate(yosys_netlist)
    integration = MagicMock()
    integration.synthesize.return_value = YosysResult(
        success=True,
        exit_code=0,
        stdout="ok",
        stderr="warning",
        netlist_content=yosys_netlist,
    )
    service = VerilogService(yosys_integration=integration)

    with caplog.at_level("WARNING", logger="services.verilog"):
        result = service.mapear_processador("runs/run_test")

    assert result["success"] is False
    assert result["netlist_content"] is None
    assert result["top_module"] is None
    assert result["stderr"].startswith("warning\n")
    assert "não segue o formato esperado" in result["stderr"]
    assert expected in result["stderr"]
    assert "fora do contrato" in caplog.text


def test_simular_execucao_preserves_success_response() -> None:
    """Service maps Icarus result to existing API dictionary."""
    icarus = MagicMock()
    icarus.simulate.return_value = IcarusResult(
        success=True,
        exit_code=0,
        stdout="simulation complete",
        stderr="",
        simulation_log={"metadata": {}, "modules": {}, "timeline": {}},
    )
    service = VerilogService(yosys_integration=MagicMock(), icarus_integration=icarus)

    assert service.simular_execucao("runs/run_test") == {
        "success": True,
        "stdout": "simulation complete",
        "stderr": "",
        "simulation_log": {"metadata": {}, "modules": {}, "timeline": {}},
    }
    icarus.simulate.assert_called_once_with("runs/run_test", None)


def test_simular_execucao_compilation_error_is_success_false() -> None:
    """Compilation errors remain success-false responses for API compatibility."""
    icarus = MagicMock()
    failed = IcarusResult(success=False, exit_code=10, stdout="", stderr="syntax error")
    icarus.simulate.side_effect = IcarusCompilationError("failed", failed)
    service = VerilogService(yosys_integration=MagicMock(), icarus_integration=icarus)

    assert service.simular_execucao("runs/run_test") == {
        "success": False,
        "stdout": "",
        "stderr": "syntax error",
        "simulation_log": None,
    }


def test_simular_execucao_unparsable_vcd_is_non_fatal() -> None:
    """Invalid VCD keeps run success, drops log and explains it in stderr."""
    icarus = MagicMock()
    run = IcarusResult(success=True, exit_code=0, stdout="ok", stderr="")
    icarus.simulate.side_effect = VcdParseError("bad vcd", run)
    service = VerilogService(yosys_integration=MagicMock(), icarus_integration=icarus)

    result = service.simular_execucao("runs/run_test")

    assert result["success"] is True
    assert result["simulation_log"] is None
    assert "VCD" in result["stderr"]
