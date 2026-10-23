"""Testes da integração do Icarus Verilog executada via Docker."""

import os
import shutil
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import docker
import pytest
from docker.errors import DockerException, NotFound

from integrations.docker import DockerConfig, DockerIntegration
from integrations.icarus import (
    COMPILATION_FAILED_EXIT_CODE,
    SIMULATION_FAILED_EXIT_CODE,
    IcarusCompilationError,
    IcarusConfig,
    IcarusContainerNotFoundError,
    IcarusError,
    IcarusIntegration,
    IcarusSimulationError,
    IcarusTimeoutError,
    VcdParseError,
)


@pytest.fixture
def project_dir(tmp_path: Path) -> Path:
    """Cria um projeto com módulo, testbench e fonte em subpasta."""
    project = tmp_path / "runs" / "run_test"
    (project / "rtl").mkdir(parents=True)
    (project / "tb_counter.v").write_text("module tb; endmodule\n", encoding="utf-8")
    (project / "rtl" / "counter.v").write_text("module counter; endmodule\n")
    (project / "notes.txt").write_text("ignore me\n")
    return project


@pytest.fixture
def docker_client() -> MagicMock:
    """Cliente Docker falso com container do Icarus em execução."""
    client = MagicMock()
    client.containers.get.return_value.status = "running"
    return client


def make_integration(
    tmp_path: Path, docker_client: MagicMock, timeout_seconds: float = 30
) -> IcarusIntegration:
    """Cria a integração apontando para o diretório temporário."""
    return IcarusIntegration(
        config=IcarusConfig(verilog_base_dir=tmp_path, timeout_seconds=timeout_seconds),
        docker_integration=DockerIntegration(
            config=DockerConfig(timeout_seconds=timeout_seconds),
            docker_client=docker_client,
        ),
    )


def test_build_command_from_files() -> None:
    """Comando usa o script configurado seguido dos fontes relativos."""
    integration = IcarusIntegration(IcarusConfig(script_path="/opt/sim.sh"))

    assert integration.build_command([Path("tb.v"), Path("rtl/alu file.sv")]) == [
        "bash",
        "/opt/sim.sh",
        "tb.v",
        "rtl/alu file.sv",
    ]


@pytest.mark.parametrize("source", [Path("/etc/passwd"), Path("../x.v")])
def test_build_command_rejects_unsafe_paths(source: Path) -> None:
    """Fontes fora do projeto são recusados."""
    with pytest.raises(ValueError, match="Invalid Verilog source"):
        IcarusIntegration().build_command([source])


def test_build_command_requires_sources() -> None:
    """Lista vazia de fontes é inválida."""
    with pytest.raises(ValueError, match="At least one"):
        IcarusIntegration().build_command([])


def test_successful_simulation_parses_vcd(
    tmp_path: Path,
    project_dir: Path,
    docker_client: MagicMock,
    fake_exec,
    fixtures_dir: Path,
) -> None:
    """Execução com sucesso devolve logs, VCD e simulation_log."""

    def produce_vcd(**_kwargs: object) -> None:
        shutil.copy(fixtures_dir / "counter.vcd", project_dir / "wave.vcd")

    execution = fake_exec(
        docker_client, stdout=b"VCD info: dumpfile", stderr=b"", side_effect=produce_vcd
    )

    result = make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert result.success is True
    assert result.exit_code == 0
    assert result.stdout == "VCD info: dumpfile"
    assert result.vcd_file == project_dir / "wave.vcd"
    assert result.simulation_log is not None
    assert set(result.simulation_log) == {"metadata", "modules", "timeline"}
    assert execution.command[-2:] == ["rtl/counter.v", "tb_counter.v"]
    assert "notes.txt" not in execution.command
    assert execution.workdir == "/verilog_code/runs/run_test"


def test_simulation_without_vcd_returns_no_log(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Testbench sem $dumpfile não é erro: vcd_file e simulation_log ficam None."""
    fake_exec(docker_client, stdout=b"done")

    result = make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert result.success is True
    assert result.vcd_file is None
    assert result.simulation_log is None


def test_missing_container_raises_specific_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Container ausente é falha de infraestrutura."""
    docker_client.containers.get.side_effect = NotFound("missing")

    with pytest.raises(IcarusContainerNotFoundError, match="was not found"):
        make_integration(tmp_path, docker_client).simulate("runs/run_test")


def test_docker_daemon_unavailable_is_container_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock
) -> None:
    """Daemon inacessível também é tratado como indisponibilidade."""
    docker_client.containers.get.side_effect = DockerException("daemon down")

    with pytest.raises(IcarusContainerNotFoundError, match="daemon down"):
        make_integration(tmp_path, docker_client).simulate("runs/run_test")


def test_timeout_raises_specific_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, mocker: MagicMock
) -> None:
    """Estouro do tempo limite vira IcarusTimeoutError."""
    from integrations.docker import DockerTimeoutError

    integration = make_integration(tmp_path, docker_client, timeout_seconds=1)
    mocker.patch.object(
        integration.docker, "execute", side_effect=DockerTimeoutError("exceeded")
    )

    with pytest.raises(IcarusTimeoutError, match="exceeded 1"):
        integration.simulate("runs/run_test")


def test_compilation_failure_exposes_result(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Falha do iverilog preserva stderr com a mensagem do compilador."""
    fake_exec(
        docker_client,
        exit_code=COMPILATION_FAILED_EXIT_CODE,
        stderr=b"counter.v:1: syntax error",
    )

    with pytest.raises(IcarusCompilationError) as error:
        make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert error.value.result.success is False
    assert error.value.result.exit_code == COMPILATION_FAILED_EXIT_CODE
    assert "syntax error" in error.value.result.stderr


def test_simulation_failure_exposes_result(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Falha do vvp é distinguida de erro de compilação."""
    fake_exec(docker_client, exit_code=SIMULATION_FAILED_EXIT_CODE, stderr=b"$fatal")

    with pytest.raises(IcarusSimulationError) as error:
        make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert error.value.result.exit_code == SIMULATION_FAILED_EXIT_CODE


def test_missing_script_is_integration_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Script ausente no container é erro de infraestrutura, não do aluno."""
    fake_exec(docker_client, exit_code=127, stderr=b"No such file")

    with pytest.raises(IcarusError, match="could not be executed") as error:
        make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert not isinstance(error.value, (IcarusCompilationError, IcarusSimulationError))


def test_corrupted_vcd_raises_parse_error(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """VCD corrompido vira VcdParseError carregando o resultado da execução."""

    def produce_bad_vcd(**_kwargs: object) -> None:
        (project_dir / "wave.vcd").write_text(
            "$timescale 1ns $end\n$enddefinitions $end\n#abc\n"
        )

    fake_exec(docker_client, stdout=b"ok", side_effect=produce_bad_vcd)

    with pytest.raises(VcdParseError) as error:
        make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert error.value.result.success is True
    assert error.value.result.vcd_file == project_dir / "wave.vcd"


def test_project_without_sources_is_rejected(
    tmp_path: Path, docker_client: MagicMock
) -> None:
    """Projeto sem .v/.sv não chega a executar no container."""
    (tmp_path / "runs" / "run_empty").mkdir(parents=True)

    with pytest.raises(FileNotFoundError, match="No Verilog"):
        make_integration(tmp_path, docker_client).simulate("runs/run_empty")
    docker_client.containers.get.assert_not_called()


@pytest.mark.parametrize("project_id", ["../etc", "/runs/run_x", "runs/other"])
def test_unsafe_project_id_is_rejected(
    tmp_path: Path, docker_client: MagicMock, project_id: str
) -> None:
    """Project IDs fora de runs/run_ são recusados."""
    with pytest.raises(ValueError):
        make_integration(tmp_path, docker_client).simulate(project_id)


@pytest.mark.integration
def test_real_icarus_simulation() -> None:
    """Simula um contador mínimo no container icarus-verilog real."""
    base_dir = Path(os.getenv("VERILOG_TEST_BASE_DIR", "/verilog_code"))
    if not base_dir.is_dir():
        pytest.skip(f"Shared Verilog directory not available: {base_dir}")

    try:
        client = docker.from_env()
        container = client.containers.get("icarus-verilog")
    except (DockerException, OSError) as exc:
        pytest.skip(f"Icarus container unavailable: {exc}")
        return
    if container.status != "running":
        pytest.skip(f"Icarus container is {container.status}")
        return

    project_id = f"runs/run_test_{uuid.uuid4().hex}"
    project = base_dir / project_id
    project.mkdir(parents=True)
    try:
        (project / "and_gate.v").write_text(
            "module and_gate(input a, input b, output y); assign y = a & b; endmodule\n",
            encoding="utf-8",
        )
        (project / "tb_and_gate.v").write_text(
            "module tb_and_gate; reg a = 0, b = 0; wire y;\n"
            "and_gate dut(.a(a), .b(b), .y(y));\n"
            'initial begin $dumpfile("wave.vcd"); $dumpvars(0, tb_and_gate);\n'
            "#1 a = 1; #1 b = 1; #1 $finish; end\nendmodule\n",
            encoding="utf-8",
        )
        result = IcarusIntegration(
            config=IcarusConfig(verilog_base_dir=base_dir),
            docker_integration=DockerIntegration(docker_client=client),
        ).simulate(project_id)

        assert result.success is True
        assert result.vcd_file is not None and result.vcd_file.is_file()
        assert result.simulation_log is not None
        assert {"metadata", "modules", "timeline"} <= set(result.simulation_log)
    finally:
        shutil.rmtree(project, ignore_errors=True)
