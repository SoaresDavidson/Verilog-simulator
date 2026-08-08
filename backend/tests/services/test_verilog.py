"""Compatibility tests for Verilog service."""

from unittest.mock import MagicMock

from integrations.docker import DockerCommandResult
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
    )
    service = VerilogService(yosys_integration=integration)

    assert service.mapear_processador("runs/run_test") == {
        "success": True,
        "stdout": "ok",
        "stderr": "",
        "netlist_content": {"modules": {}},
    }


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
    }


def test_simulation_uses_reusable_docker_integration(mocker: MagicMock) -> None:
    """Icarus execution delegates generic container access to integration."""
    yosys = MagicMock()
    docker = MagicMock()
    docker.execute.return_value = DockerCommandResult(
        success=True,
        exit_code=0,
        stdout="simulation complete",
        stderr="",
    )
    service = VerilogService(
        yosys_integration=yosys,
        docker_integration=docker,
    )
    mocker.patch.object(
        service,
        "_resolve_paths",
        return_value=("/verilog_code/runs/run_test", "/verilog_code/runs/run_test"),
    )
    mocker.patch("services.verilog.os.path.exists", return_value=True)
    mocker.patch(
        "services.verilog.os.walk",
        return_value=[("/verilog_code/runs/run_test", [], ["top.v"])],
    )
    mocker.patch("services.verilog.os.listdir", return_value=[])

    result = service.simular_execucao("runs/run_test")

    docker.execute.assert_called_once_with(
        container_name="icarus-verilog",
        command=["bash", "/scripts/simular.sh", "top.v"],
        workdir="/verilog_code/runs/run_test",
    )
    assert result["success"] is True
    assert result["stdout"] == "simulation complete"
