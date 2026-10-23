"""Testes da integração do Icarus Verilog executada via Docker."""

import os
import shutil
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
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


def test_old_vcd_is_removed_and_not_returned(
    tmp_path: Path,
    project_dir: Path,
    docker_client: MagicMock,
    fake_exec,
    fixtures_dir: Path,
) -> None:
    """VCD de execução anterior é apagado antes e nunca vira resultado."""
    shutil.copy(fixtures_dir / "counter.vcd", project_dir / "old.vcd")
    fake_exec(docker_client, stdout=b"no dump")

    result = make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert result.simulation_log is None
    assert result.vcd_file is None
    assert not (project_dir / "old.vcd").exists()


def test_old_vcd_rejected_by_mtime_when_cleanup_fails(
    tmp_path: Path,
    project_dir: Path,
    docker_client: MagicMock,
    fake_exec,
    fixtures_dir: Path,
    mocker: MagicMock,
) -> None:
    """Se a limpeza falhar, o mtime antigo ainda desqualifica o arquivo."""
    old_vcd = project_dir / "old.vcd"
    shutil.copy(fixtures_dir / "counter.vcd", old_vcd)
    old = time.time() - 3600
    os.utime(old_vcd, (old, old))
    mocker.patch("integrations.icarus.remove_artifacts")

    def produce_vcd(**_kwargs: object) -> None:
        shutil.copy(fixtures_dir / "counter.vcd", project_dir / "zz_new.vcd")

    fake_exec(docker_client, side_effect=produce_vcd)

    result = make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert result.vcd_file == project_dir / "zz_new.vcd"


def test_most_recent_generated_vcd_is_chosen(
    tmp_path: Path,
    project_dir: Path,
    docker_client: MagicMock,
    fake_exec,
    fixtures_dir: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Com dois VCDs gerados, o mais recente é escolhido e um aviso é logado."""

    def produce_two(**_kwargs: object) -> None:
        now = time.time()
        first = project_dir / "b_first.vcd"
        second = project_dir / "rtl" / "a_second.vcd"
        shutil.copy(fixtures_dir / "counter.vcd", first)
        shutil.copy(fixtures_dir / "counter.vcd", second)
        os.utime(first, (now, now))
        os.utime(second, (now + 0.5, now + 0.5))

    fake_exec(docker_client, side_effect=produce_two)

    with caplog.at_level("WARNING", logger="integrations.icarus"):
        result = make_integration(tmp_path, docker_client).simulate("runs/run_test")

    assert result.vcd_file == project_dir / "rtl" / "a_second.vcd"
    assert "2 VCD files" in caplog.text


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


def test_container_timeout_exit_code_raises_timeout(
    tmp_path: Path, project_dir: Path, docker_client: MagicMock, fake_exec
) -> None:
    """Exit 124 do `timeout` no container vira IcarusTimeoutError sem ler artefatos."""
    execution = fake_exec(
        docker_client,
        exit_code=124,
        side_effect=lambda **_: (project_dir / "partial.vcd").write_text("$var"),
    )

    with pytest.raises(IcarusTimeoutError) as error:
        make_integration(tmp_path, docker_client, timeout_seconds=3).simulate(
            "runs/run_test"
        )

    assert error.value.timeout_seconds == 3
    assert execution.full_command[:3] == ["timeout", "--signal=KILL", "3s"]


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


@pytest.mark.integration
def test_concurrent_simulations_do_not_interfere() -> None:
    """Duas simulações simultâneas devolvem cada uma o seu próprio resultado."""
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

    projects: dict[str, str] = {}
    for marker in ("alpha", "beta"):
        project_id = f"runs/run_test_{uuid.uuid4().hex}"
        project = base_dir / project_id
        project.mkdir(parents=True)
        (project / "tb.v").write_text(
            "module tb; reg [7:0] v;\n"
            f'initial begin $dumpfile("{marker}.vcd"); $dumpvars(0, tb);\n'
            f'$display("{marker}"); v = 0; repeat (200) #1 v = v + 1;\n'
            "$finish; end\nendmodule\n",
            encoding="utf-8",
        )
        projects[marker] = project_id

    integration = IcarusIntegration(
        config=IcarusConfig(verilog_base_dir=base_dir),
        docker_integration=DockerIntegration(docker_client=client),
    )
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {
                marker: pool.submit(integration.simulate, project_id)
                for marker, project_id in projects.items()
            }
            results = {marker: future.result() for marker, future in futures.items()}

        for marker, result in results.items():
            other = "beta" if marker == "alpha" else "alpha"
            assert result.success is True
            assert marker in result.stdout
            assert other not in result.stdout
            assert result.vcd_file is not None
            assert result.vcd_file.name == f"{marker}.vcd"
    finally:
        for project_id in projects.values():
            shutil.rmtree(base_dir / project_id, ignore_errors=True)


@pytest.mark.integration
def test_infinite_testbench_is_killed_within_timeout() -> None:
    """Testbench sem $finish é interrompido no limite e o vvp não sobrevive."""
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
        (project / "tb_forever.v").write_text(
            "module tb_forever; reg clk = 0; always #1 clk = ~clk; endmodule\n",
            encoding="utf-8",
        )
        integration = IcarusIntegration(
            config=IcarusConfig(verilog_base_dir=base_dir, timeout_seconds=3),
            docker_integration=DockerIntegration(
                config=DockerConfig(timeout_seconds=3, kill_grace_seconds=2),
                docker_client=client,
            ),
        )
        started = time.monotonic()
        with pytest.raises(IcarusTimeoutError):
            integration.simulate(project_id)
        assert time.monotonic() - started < 3 + 2 + 1

        # Zombies (state Z) are already dead; they linger only when PID 1
        # does not reap orphans.
        survivors = container.exec_run(
            [
                "bash",
                "-c",
                (
                    "for p in /proc/[0-9]*; do "
                    '[ "$(cat $p/comm 2>/dev/null)" = vvp ] && '
                    "[ \"$(cut -d' ' -f3 $p/stat 2>/dev/null)\" != Z ] && echo $p; "
                    "done; true"
                ),
            ]
        )
        assert survivors.output.decode().strip() == ""
    finally:
        shutil.rmtree(project, ignore_errors=True)
