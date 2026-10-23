"""Compatibility tests for Verilog service."""

from unittest.mock import MagicMock

from integrations.icarus import IcarusCompilationError, IcarusResult, VcdParseError
from integrations.yosys import YosysResult, YosysSynthesisError
from services.verilog import VerilogService


def test_mapear_processador_preserves_success_response() -> None:
    """Service maps structured integration result to existing API dictionary."""
    integration = MagicMock()
    integration.synthesize.return_value = YosysResult(
        success=True,
        exit_code=0,
        stdout="ok",
        stderr="",
        netlist_content={"modules": {}},
        stat_report="Number of cells: 1",
    )
    service = VerilogService(yosys_integration=integration)

    assert service.mapear_processador("runs/run_test") == {
        "success": True,
        "stdout": "ok",
        "stderr": "",
        "netlist_content": {"modules": {}},
        "stat_report": "Number of cells: 1",
    }
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
        "netlist_content": None,
        "stat_report": None,
    }


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
    icarus.simulate.assert_called_once_with("runs/run_test")


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
