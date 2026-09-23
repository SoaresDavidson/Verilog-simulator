"""Tests for Docker-based Yosys integration."""

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import docker
import pytest
from docker.errors import DockerException, NotFound

from integrations.docker import DockerConfig, DockerIntegration
from integrations.yosys import (
    YosysConfig,
    YosysContainerNotFoundError,
    YosysIntegration,
    YosysSynthesisError,
    YosysTimeoutError,
)


@pytest.fixture
def project_dir(tmp_path: Path) -> Path:
    """Create valid project directory and synthesizable source."""
    project = tmp_path / "runs" / "run_test"
    project.mkdir(parents=True)
    (project / "counter.v").write_text(
        "module counter(input clk, output reg q); always @(posedge clk) q <= ~q; endmodule\n",
        encoding="utf-8",
    )
    return project


@pytest.fixture
def docker_client() -> MagicMock:
    """Return Docker client mock with running Yosys container."""
    client = MagicMock()
    client.containers.get.return_value.status = "running"
    return client


def make_integration(
    tmp_path: Path, docker_client: MagicMock, timeout_seconds: float = 30
) -> YosysIntegration:
    """Create integration configured for temporary test storage."""
    return YosysIntegration(
        config=YosysConfig(
            verilog_base_dir=tmp_path,
            timeout_seconds=timeout_seconds,
        ),
        docker_integration=DockerIntegration(
            config=DockerConfig(timeout_seconds=timeout_seconds),
            docker_client=docker_client,
        ),
    )


def test_build_command_from_verilog_files() -> None:
    """Command includes each source and required Yosys stages."""
    command = YosysIntegration.build_command(
        [Path("alu.v"), Path("rtl/register file.sv")]
    )

    assert command[:2] == ["yosys", "-p"]
    assert "read_verilog -sv alu.v" in command[2]
    assert "read_verilog -sv 'rtl/register file.sv'" in command[2]
    assert "hierarchy -auto-top" in command[2]
    assert "tee -o relatorio.txt stat" in command[2]
    assert "write_json estrutura.json" in command[2]


def test_successful_synthesis_parses_generated_json(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Successful Docker execution returns logs and parsed netlist."""
    netlist = {"modules": {"counter": {}}}
    (project_dir / "estrutura.json").write_text(json.dumps(netlist), encoding="utf-8")
    (project_dir / "relatorio.txt").write_text("1 module\n", encoding="utf-8")
    container = docker_client.containers.get.return_value
    container.exec_run.return_value = SimpleNamespace(
        exit_code=0,
        output=(b"synthesis complete", b"warning"),
    )
    integration = make_integration(tmp_path, docker_client)

    result = integration.synthesize("runs/run_test")

    assert result.success is True
    assert result.exit_code == 0
    assert result.stdout == "synthesis complete"
    assert result.stderr == "warning"
    assert result.netlist_content == netlist
    assert result.structure_file == project_dir / "estrutura.json"
    assert result.stat_report_file == project_dir / "relatorio.txt"
    container.exec_run.assert_called_once()


def test_testbench_files_are_excluded_from_synthesis(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Yosys command excludes files identified as testbenches."""
    (project_dir / "tb_counter.v").write_text("module tb_counter; endmodule\n")
    (project_dir / "estrutura.json").write_text('{"modules": {}}')
    container = docker_client.containers.get.return_value
    container.exec_run.return_value = SimpleNamespace(exit_code=0, output=(b"", b""))

    make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    command = container.exec_run.call_args.kwargs["cmd"][2]
    assert "counter.v" in command
    assert "tb_counter.v" not in command


def test_missing_container_raises_specific_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Missing Docker container is reported as infrastructure failure."""
    docker_client.containers.get.side_effect = NotFound("missing")

    with pytest.raises(YosysContainerNotFoundError, match="was not found"):
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")


def test_execution_timeout_raises_specific_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Long-running Docker execution respects configured timeout."""
    container = docker_client.containers.get.return_value

    def slow_execution(**_kwargs: object) -> SimpleNamespace:
        time.sleep(0.05)
        return SimpleNamespace(exit_code=0, output=(b"", b""))

    container.exec_run.side_effect = slow_execution
    integration = make_integration(tmp_path, docker_client, timeout_seconds=0.01)

    with pytest.raises(YosysTimeoutError, match="exceeded"):
        integration.synthesize("runs/run_test")


def test_failed_synthesis_exposes_execution_result(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Nonzero Yosys exit code raises error carrying process details."""
    container = docker_client.containers.get.return_value
    container.exec_run.return_value = SimpleNamespace(
        exit_code=1,
        output=(b"", b"syntax error"),
    )

    with pytest.raises(YosysSynthesisError) as error:
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    assert error.value.result.success is False
    assert error.value.result.exit_code == 1
    assert error.value.result.stderr == "syntax error"


def test_missing_netlist_is_reported_as_failed_synthesis(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Successful process without expected artifact is treated as failure."""
    container = docker_client.containers.get.return_value
    container.exec_run.return_value = SimpleNamespace(
        exit_code=0, output=(b"done", b"")
    )

    with pytest.raises(YosysSynthesisError) as error:
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    assert error.value.result.success is False
    assert "estrutura.json" in error.value.result.stderr


@pytest.mark.integration
def test_real_yosys_synthesis() -> None:
    """Synthesize a minimal circuit using running Yosys container."""
    base_dir = Path(os.getenv("VERILOG_TEST_BASE_DIR", "/verilog_code"))
    if not base_dir.is_dir():
        pytest.skip(f"Shared Verilog directory not available: {base_dir}")

    try:
        client = docker.from_env()
        container = client.containers.get("yosys")
    except (DockerException, OSError) as exc:
        pytest.skip(f"Yosys container unavailable: {exc}")
        return
    if container.status != "running":
        pytest.skip(f"Yosys container is {container.status}")
        return

    project_id = f"runs/run_test_{uuid.uuid4().hex}"
    project = base_dir / project_id
    project.mkdir(parents=True)
    try:
        (project / "and_gate.v").write_text(
            "module and_gate(input a, input b, output y); assign y = a & b; endmodule\n",
            encoding="utf-8",
        )
        result = YosysIntegration(
            config=YosysConfig(verilog_base_dir=base_dir),
            docker_integration=DockerIntegration(docker_client=client),
        ).synthesize(project_id)

        assert result.success is True
        assert result.netlist_content is not None
        assert "modules" in result.netlist_content
        assert result.structure_file is not None
        assert result.structure_file.is_file()
    finally:
        shutil.rmtree(project, ignore_errors=True)
