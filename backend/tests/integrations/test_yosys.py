"""Tests for Docker-based Yosys integration."""

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import docker
import pytest
from docker.errors import DockerException, NotFound

from integrations.docker import DockerConfig, DockerIntegration, ExecutionMode
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
            execution_mode=ExecutionMode.EXEC,
            
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
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Successful Docker execution returns logs, parsed netlist and stat report."""
    netlist = {"modules": {"counter": {}}}

    def synthesize(**_kwargs: object) -> None:
        (project_dir / "estrutura.json").write_text(json.dumps(netlist))
        (project_dir / "relatorio.txt").write_text("1 module\n")

    execution = fake_exec(
        docker_client,
        stdout=b"synthesis complete",
        stderr=b"warning",
        side_effect=synthesize,
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
    assert result.stat_report == "1 module\n"
    assert execution.called


def test_testbench_files_are_excluded_from_synthesis(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Yosys command excludes files identified as testbenches."""
    (project_dir / "tb_counter.v").write_text("module tb_counter; endmodule\n")
    execution = fake_exec(
        docker_client,
        side_effect=lambda **_: (project_dir / "estrutura.json").write_text("{}"),
    )

    make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    command = execution.command[-1]
    assert "counter.v" in command
    assert "tb_counter.v" not in command


def test_stale_netlist_is_not_returned_when_synthesis_fails(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """estrutura.json from a previous run (or the ZIP) never becomes the result."""
    (project_dir / "estrutura.json").write_text('{"modules": {"old": {}}}')
    (project_dir / "relatorio.txt").write_text("old report")
    fake_exec(docker_client, exit_code=1, stderr=b"syntax error")

    with pytest.raises(YosysSynthesisError) as error:
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    assert error.value.result.netlist_content is None
    assert error.value.result.structure_file is None
    assert error.value.result.stat_report is None
    assert not (project_dir / "estrutura.json").exists()


def test_stale_netlist_rejected_by_mtime_when_cleanup_fails(
    tmp_path: Path,
    project_dir: Path,
    docker_client: MagicMock,
    fake_exec,
    mocker: MagicMock,
) -> None:
    """If cleanup cannot remove the old file, its mtime still disqualifies it."""
    stale = project_dir / "estrutura.json"
    stale.write_text('{"modules": {"old": {}}}')
    old = time.time() - 3600
    os.utime(stale, (old, old))
    mocker.patch("integrations.yosys.remove_artifacts")
    fake_exec(docker_client, stdout=b"done")

    with pytest.raises(YosysSynthesisError) as error:
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    assert error.value.result.netlist_content is None
    assert "estrutura.json" in error.value.result.stderr


def test_invalid_netlist_is_logged_and_reported(
    tmp_path: Path,
    project_dir: Path,
    docker_client: MagicMock,
    fake_exec,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Corrupted JSON is logged and turned into a failed synthesis result."""
    fake_exec(
        docker_client,
        side_effect=lambda **_: (project_dir / "estrutura.json").write_text("{oops"),
    )

    with (
        caplog.at_level("WARNING", logger="integrations.yosys"),
        pytest.raises(YosysSynthesisError) as error,
    ):
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    assert error.value.result.success is False
    assert error.value.result.netlist_content is None
    assert "invalid estrutura.json" in caplog.text


def test_missing_container_raises_specific_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Missing Docker container is reported as infrastructure failure."""
    docker_client.containers.get.side_effect = NotFound("missing")

    with pytest.raises(YosysContainerNotFoundError, match="was not found"):
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")


def test_execution_timeout_raises_specific_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Exit code 124 do `timeout` no container vira YosysTimeoutError."""
    fake_exec(docker_client, exit_code=124)
    integration = make_integration(tmp_path, docker_client, timeout_seconds=3)

    with pytest.raises(YosysTimeoutError, match="exceeded") as error:
        integration.synthesize("runs/run_test")

    assert error.value.timeout_seconds == 3


def test_failed_synthesis_exposes_execution_result(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Nonzero Yosys exit code raises error carrying process details."""
    fake_exec(docker_client, exit_code=1, stderr=b"syntax error")

    with pytest.raises(YosysSynthesisError) as error:
        make_integration(tmp_path, docker_client).synthesize("runs/run_test")

    assert error.value.result.success is False
    assert error.value.result.exit_code == 1
    assert error.value.result.stderr == "syntax error"


def test_missing_netlist_is_reported_as_failed_synthesis(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Successful process without expected artifact is treated as failure."""
    fake_exec(docker_client, stdout=b"done")

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
            config=YosysConfig(
            execution_mode=ExecutionMode.EXEC,
            verilog_base_dir=base_dir),
            docker_integration=DockerIntegration(docker_client=client),
        ).synthesize(project_id)

        assert result.success is True
        assert result.netlist_content is not None
        assert "modules" in result.netlist_content
        assert result.structure_file is not None
        assert result.structure_file.is_file()
    finally:
        shutil.rmtree(project, ignore_errors=True)
