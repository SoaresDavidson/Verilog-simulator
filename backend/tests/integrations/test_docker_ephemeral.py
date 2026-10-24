"""Testes unitários dos containers efêmeros por execução (#7), com o SDK mockado."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
import requests
from docker.errors import ImageNotFound

from integrations.docker import (
    EPHEMERAL_LABEL,
    KILLED_EXIT_CODE,
    TIMEOUT_EXIT_CODE,
    DockerCommandResult,
    DockerConfig,
    DockerContainerNotFoundError,
    DockerIntegration,
    DockerResourceLimitError,
    DockerTimeoutError,
    ExecutionMode,
    SandboxConfig,
)
from integrations.icarus import IcarusConfig, IcarusIntegration, IcarusResourceLimitError
from integrations.projects import run_mount
from integrations.yosys import YosysConfig, YosysIntegration, YosysResourceLimitError

RUN_HOST = "/srv/vc/verilog_code/runs/run_x"
RUN_CONTAINER = "/verilog_code/runs/run_x"


def make_client(
    exit_code: int = 0,
    stdout: bytes = b"",
    stderr: bytes = b"",
    oom_killed: bool = False,
) -> MagicMock:
    """Cliente Docker falso cujo ``containers.run`` devolve um container já encerrado."""
    client = MagicMock()
    container = client.containers.run.return_value
    container.wait.return_value = {"StatusCode": exit_code}
    container.attrs = {"State": {"OOMKilled": oom_killed}}
    container.logs.side_effect = lambda **kw: stdout if kw["stdout"] else stderr
    return client


def run(client: MagicMock, config: DockerConfig | None = None, **kwargs: object) -> DockerCommandResult:
    """Executa ``run_ephemeral`` com argumentos padrão de teste."""
    params: dict[str, object] = {
        "image": "verilog-classroom/icarus:latest",
        "command": ["bash", "/scripts/simular.sh", "tb.v"],
        "run_dir_host": RUN_HOST,
        "workdir": RUN_CONTAINER,
        "timeout_seconds": 30,
    }
    params.update(kwargs)
    return DockerIntegration(config=config, docker_client=client).run_ephemeral(**params)


def test_security_options_are_passed_to_containers_run() -> None:
    """Só o run (rw) e os scripts (ro) são montados, sem rede, rootfs ro, sem caps, não-root."""
    client = make_client()
    config = DockerConfig(
        sandbox=SandboxConfig(
            user="2000:3000", mem_limit="256m", cpus=0.5, pids_limit=64, tmpfs_size="16m"
        )
    )

    run(client, config, read_only_mounts={"/srv/vc/scripts": "/scripts"})

    args, kwargs = client.containers.run.call_args
    assert args == ("verilog-classroom/icarus:latest",)
    assert kwargs["command"][:3] == ["timeout", "--signal=KILL", "30s"]
    assert kwargs["detach"] is True
    assert kwargs["working_dir"] == RUN_CONTAINER
    assert kwargs["volumes"] == {
        RUN_HOST: {"bind": RUN_CONTAINER, "mode": "rw"},
        "/srv/vc/scripts": {"bind": "/scripts", "mode": "ro"},
    }
    assert kwargs["network_disabled"] is True
    assert kwargs["network_mode"] == "none"
    assert kwargs["user"] == "2000:3000"
    assert kwargs["mem_limit"] == kwargs["memswap_limit"] == "256m"
    assert kwargs["nano_cpus"] == 500_000_000
    assert kwargs["pids_limit"] == 64
    assert kwargs["read_only"] is True
    assert kwargs["tmpfs"] == {"/tmp": "rw,noexec,nosuid,nodev,size=16m"}
    assert kwargs["cap_drop"] == ["ALL"]
    assert kwargs["security_opt"] == ["no-new-privileges:true"]
    assert kwargs["init"] is True
    assert kwargs["labels"] == {EPHEMERAL_LABEL: "true"}
    assert "privileged" not in kwargs and "cap_add" not in kwargs


def test_run_dir_can_be_mounted_above_the_workdir() -> None:
    """Projeto em subpasta: monta o run inteiro e trabalha na subpasta."""
    client = make_client()

    run(client, workdir=f"{RUN_CONTAINER}/rtl", run_dir_container=RUN_CONTAINER)

    kwargs = client.containers.run.call_args.kwargs
    assert kwargs["volumes"] == {RUN_HOST: {"bind": RUN_CONTAINER, "mode": "rw"}}
    assert kwargs["working_dir"] == f"{RUN_CONTAINER}/rtl"


def test_successful_run_returns_output_and_removes_container() -> None:
    """Saída vem dos logs separados e o container é sempre removido."""
    client = make_client(exit_code=0, stdout=b"ok", stderr=b"warn")

    result = run(client)

    assert result == DockerCommandResult(success=True, exit_code=0, stdout="ok", stderr="warn")
    client.containers.run.return_value.remove.assert_called_once_with(force=True)


def test_output_is_truncated_to_configured_limit() -> None:
    """Saída maior que ``max_output_bytes`` é cortada com aviso."""
    client = make_client(stdout=b"x" * 50)

    result = run(client, DockerConfig(max_output_bytes=10))

    assert result.stdout == "x" * 10 + "\n[output truncated]\n"


def test_oom_killed_container_raises_resource_limit_in_portuguese() -> None:
    """OOMKilled vira DockerResourceLimitError com mensagem compreensível."""
    client = make_client(exit_code=KILLED_EXIT_CODE, oom_killed=True)

    with pytest.raises(DockerResourceLimitError, match="limite de memória \\(512m\\)") as error:
        run(client)

    assert error.value.limit == "memory"
    client.containers.run.return_value.remove.assert_called_once_with(force=True)


def test_early_sigkill_without_oom_flag_is_memory_limit(mocker: MagicMock) -> None:
    """137 antes do prazo, mesmo sem a flag OOMKilled, é tratado como estouro de memória."""
    client = make_client(exit_code=KILLED_EXIT_CODE)
    mocker.patch("integrations.docker.time.monotonic", side_effect=[0.0, 1.0])

    with pytest.raises(DockerResourceLimitError):
        run(client)


@pytest.mark.parametrize("exit_code", [TIMEOUT_EXIT_CODE, KILLED_EXIT_CODE])
def test_in_container_timeout_raises_timeout(exit_code: int, mocker: MagicMock) -> None:
    """124, ou 137 depois do prazo, mantém a semântica de timeout do modo exec."""
    client = make_client(exit_code=exit_code)
    mocker.patch("integrations.docker.time.monotonic", side_effect=[0.0, 31.0])

    with pytest.raises(DockerTimeoutError, match="exceeded 30 seconds"):
        run(client)


def test_backend_deadline_kills_and_removes_container(mocker: MagicMock) -> None:
    """Se o daemon não devolve o fim no prazo + carência, o container é morto e removido."""
    client = make_client()
    container = client.containers.run.return_value
    container.wait.side_effect = requests.exceptions.ReadTimeout("slow")
    mocker.patch("integrations.docker.time.monotonic", side_effect=[0.0, 40.0])

    with pytest.raises(DockerTimeoutError):
        run(client)

    container.wait.assert_called_once_with(timeout=30 + 5)
    container.kill.assert_called_once_with()
    container.remove.assert_called_once_with(force=True)


def test_missing_image_is_reported_as_unavailable() -> None:
    """Imagem não construída é indisponibilidade de infraestrutura."""
    client = MagicMock()
    client.containers.run.side_effect = ImageNotFound("nope")

    with pytest.raises(DockerContainerNotFoundError, match="docker compose build"):
        run(client)


@pytest.mark.parametrize("user", ["0", "root:root", "0:0"])
def test_sandbox_rejects_root_user(user: str) -> None:
    """O container efêmero nunca roda como root."""
    with pytest.raises(ValueError, match="root"):
        SandboxConfig(user=user)


def test_run_mount_maps_run_root_to_host_path(tmp_path: Path) -> None:
    """Monta só ``runs/run_<id>``, traduzido para o caminho no host do daemon."""
    project = tmp_path / "runs" / "run_x" / "rtl"
    project.mkdir(parents=True)

    assert run_mount(tmp_path, project, "/srv/vc/verilog_code") == (RUN_HOST, RUN_CONTAINER)
    assert run_mount(tmp_path, project) == (
        (tmp_path.resolve() / "runs" / "run_x").as_posix(),
        RUN_CONTAINER,
    )


@pytest.fixture
def run_dir(tmp_path: Path) -> Path:
    """Run com um testbench mínimo."""
    project = tmp_path / "runs" / "run_x"
    project.mkdir(parents=True)
    (project / "top.v").write_text("module top; endmodule\n")
    return project


def failed_run() -> DockerCommandResult:
    """Resultado de execução com falha (evita depender de artefatos)."""
    return DockerCommandResult(success=False, exit_code=1, stdout="", stderr="erro")


def test_yosys_ephemeral_mode_mounts_only_the_run(tmp_path: Path, run_dir: Path) -> None:
    """Modo efêmero: Yosys usa a imagem configurada e o caminho do run no host."""
    docker = MagicMock()
    docker.run_ephemeral.return_value = failed_run()
    integration = YosysIntegration(
        YosysConfig(
            verilog_base_dir=tmp_path,
            image="img/yosys:1",
            host_verilog_root="/srv/vc/verilog_code",
            timeout_seconds=7,
        ),
        docker,
    )

    with pytest.raises(Exception, match="exit code 1"):
        integration.synthesize("runs/run_x")

    docker.execute.assert_not_called()
    kwargs = docker.run_ephemeral.call_args.kwargs
    assert kwargs["image"] == "img/yosys:1"
    assert kwargs["run_dir_host"] == RUN_HOST
    assert kwargs["run_dir_container"] == kwargs["workdir"] == RUN_CONTAINER
    assert kwargs["timeout_seconds"] == 7
    assert kwargs["command"][0] == "yosys"


def test_icarus_ephemeral_mode_mounts_scripts_read_only(tmp_path: Path, run_dir: Path) -> None:
    """Modo efêmero: Icarus monta a pasta do script como somente leitura."""
    docker = MagicMock()
    docker.run_ephemeral.return_value = failed_run()
    integration = IcarusIntegration(
        IcarusConfig(
            verilog_base_dir=tmp_path,
            image="img/icarus:1",
            host_verilog_root="/srv/vc/verilog_code",
            host_scripts_dir="/srv/vc/scripts",
        ),
        docker,
    )

    with pytest.raises(Exception, match="exit code 1"):
        integration.simulate("runs/run_x")

    docker.execute.assert_not_called()
    kwargs = docker.run_ephemeral.call_args.kwargs
    assert kwargs["image"] == "img/icarus:1"
    assert kwargs["run_dir_host"] == RUN_HOST
    assert kwargs["read_only_mounts"] == {"/srv/vc/scripts": "/scripts"}
    assert kwargs["command"][:2] == ["bash", "/scripts/simular.sh"]


@pytest.mark.parametrize("mode", ["exec", ExecutionMode.EXEC])
def test_exec_mode_uses_long_lived_container(tmp_path: Path, run_dir: Path, mode: str) -> None:
    """Modo exec (string ou enum) continua usando ``docker exec`` no container nomeado."""
    docker = MagicMock()
    docker.execute.return_value = failed_run()
    integration = YosysIntegration(
        YosysConfig(verilog_base_dir=tmp_path, execution_mode=mode, container_name="yosys"),
        docker,
    )

    with pytest.raises(Exception, match="exit code 1"):
        integration.synthesize("runs/run_x")

    docker.run_ephemeral.assert_not_called()
    assert docker.execute.call_args.kwargs["container_name"] == "yosys"
    assert docker.execute.call_args.kwargs["workdir"] == RUN_CONTAINER


def test_default_mode_is_ephemeral() -> None:
    """O padrão das integrações é o container efêmero."""
    assert YosysConfig().execution_mode is ExecutionMode.EPHEMERAL
    assert IcarusConfig().execution_mode is ExecutionMode.EPHEMERAL


def test_invalid_mode_is_rejected() -> None:
    """Modo desconhecido falha na configuração, não na execução."""
    with pytest.raises(ValueError):
        YosysConfig(execution_mode="pool")


@pytest.mark.parametrize("mode", ["exec", "ephemeral"])
def test_resource_limit_becomes_typed_tool_errors(tmp_path: Path, run_dir: Path, mode: str) -> None:
    """Estouro de memória vira erro tipado de cada ferramenta, preservando a mensagem."""
    docker = MagicMock()
    error = DockerResourceLimitError("A execução foi interrompida por exceder o limite de memória.")
    docker.execute.side_effect = error
    docker.run_ephemeral.side_effect = error

    with pytest.raises(YosysResourceLimitError, match="limite de memória") as yosys_error:
        YosysIntegration(YosysConfig(verilog_base_dir=tmp_path, execution_mode=mode), docker).synthesize(
            "runs/run_x"
        )
    with pytest.raises(IcarusResourceLimitError, match="limite de memória") as icarus_error:
        IcarusIntegration(IcarusConfig(verilog_base_dir=tmp_path, execution_mode=mode), docker).simulate(
            "runs/run_x"
        )

    assert yosys_error.value.limit == icarus_error.value.limit == "memory"
