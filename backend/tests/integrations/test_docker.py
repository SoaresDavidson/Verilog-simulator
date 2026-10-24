"""Testes unitários da integração reutilizável com Docker."""

import time
from unittest.mock import MagicMock

import pytest
from docker.errors import DockerException, NotFound

from integrations.docker import (
    KILLED_EXIT_CODE,
    TIMEOUT_EXIT_CODE,
    DockerConfig,
    DockerConnectionError,
    DockerContainerNotFoundError,
    DockerContainerUnavailableError,
    DockerExecutionError,
    DockerIntegration,
    DockerResourceLimitError,
    DockerTimeoutError,
    wrap_with_timeout,
)


@pytest.fixture
def docker_client() -> MagicMock:
    """Cria um cliente Docker falso cujo container está em execução."""
    client = MagicMock()
    client.containers.get.return_value.status = "running"
    return client


def test_injected_client_is_returned_without_recreation(
    docker_client: MagicMock,
) -> None:
    """Garante que o cliente injetado seja reutilizado sem acessar o daemon real."""
    integration = DockerIntegration(docker_client=docker_client)

    assert integration.get_client() is docker_client
    docker_client.ping.assert_not_called()


def test_connection_failure_raises_specific_error(mocker: MagicMock) -> None:
    """Simula daemon inacessível e espera o erro específico de conexão."""
    mocker.patch(
        "integrations.docker.docker_sdk.from_env",
        side_effect=DockerException("daemon unavailable"),
    )

    with pytest.raises(DockerConnectionError, match="daemon unavailable"):
        DockerIntegration().get_client()


def test_running_container_is_returned(docker_client: MagicMock) -> None:
    """Confirma que um container em execução seja localizado e retornado."""
    container = docker_client.containers.get.return_value

    assert DockerIntegration(docker_client=docker_client).get_container("yosys") is container
    docker_client.containers.get.assert_called_once_with("yosys")


def test_missing_container_raises_specific_error(docker_client: MagicMock) -> None:
    """Diferencia container inexistente de falha na conexão com o daemon."""
    docker_client.containers.get.side_effect = NotFound("missing")

    with pytest.raises(DockerContainerNotFoundError, match="was not found"):
        DockerIntegration(docker_client=docker_client).get_container("yosys")


def test_stopped_container_raises_unavailable_error(docker_client: MagicMock) -> None:
    """Impede execução quando o container existe, mas está parado."""
    docker_client.containers.get.return_value.status = "exited"

    with pytest.raises(DockerContainerUnavailableError, match="not running"):
        DockerIntegration(docker_client=docker_client).get_container("yosys")


def test_successful_execution_returns_typed_result(docker_client: MagicMock, fake_exec) -> None:
    """Valida resultado tipado, código de saída, logs e argumentos de execução."""
    execution = fake_exec(docker_client, stdout=b"compiled", stderr=b"warning")

    result = DockerIntegration(docker_client=docker_client).execute(
        container_name="yosys",
        command=["yosys", "-V"],
        workdir="/verilog_code",
    )

    assert result.success is True
    assert result.exit_code == 0
    assert result.stdout == "compiled"
    assert result.stderr == "warning"
    assert execution.workdir == "/verilog_code"
    docker_client.api.exec_start.assert_called_once_with("exec-1", stream=True, demux=True)
    docker_client.api.exec_inspect.assert_called_once_with("exec-1")


def test_command_is_wrapped_with_coreutils_timeout(docker_client: MagicMock, fake_exec) -> None:
    """Comando roda sob `timeout --signal=KILL` com o limite configurado."""
    execution = fake_exec(docker_client)

    DockerIntegration(docker_client=docker_client).execute("yosys", ["yosys", "-V"], "/verilog_code", timeout_seconds=7)

    assert execution.full_command == ["timeout", "--signal=KILL", "7s", "yosys", "-V"]


def test_wrap_with_timeout_formats_fractional_seconds() -> None:
    """Limites fracionários são repassados sem arredondamento."""
    assert wrap_with_timeout(["vvp", "a.vvp"], 0.5) == [
        "timeout",
        "--signal=KILL",
        "0.5s",
        "vvp",
        "a.vvp",
    ]


def test_nonzero_exit_code_is_reported(docker_client: MagicMock, fake_exec) -> None:
    """Código de saída comum diferente de zero não é timeout."""
    fake_exec(docker_client, exit_code=1, stderr=b"error")

    result = DockerIntegration(docker_client=docker_client).execute("yosys", ["yosys"], "/verilog_code")

    assert result.success is False
    assert result.exit_code == 1
    assert result.stderr == "error"


def test_execution_failure_is_normalized(docker_client: MagicMock) -> None:
    """Converte uma falha do exec_create no erro público DockerExecutionError."""
    docker_client.api.exec_create.side_effect = DockerException("exec failed")

    with pytest.raises(DockerExecutionError, match="exec failed"):
        DockerIntegration(docker_client=docker_client).execute("yosys", ["yosys", "-V"], "/verilog_code")


def test_stream_failure_is_normalized(docker_client: MagicMock, fake_exec) -> None:
    """Erro durante a leitura do stream vira DockerExecutionError."""
    fake_exec(docker_client)

    def broken_stream(*_args: object, **_kwargs: object):
        yield (b"partial", None)
        raise OSError("connection reset")

    docker_client.api.exec_start.side_effect = broken_stream

    with pytest.raises(DockerExecutionError, match="connection reset"):
        DockerIntegration(docker_client=docker_client).execute("yosys", ["yosys"], "/verilog_code")


@pytest.mark.parametrize("exit_code", [TIMEOUT_EXIT_CODE, KILLED_EXIT_CODE])
def test_container_side_timeout_exit_code_raises(
    docker_client: MagicMock, fake_exec, exit_code: int, mocker: MagicMock
) -> None:
    """Exit 124 (ou 137 após o limite) do `timeout` vira DockerTimeoutError."""
    fake_exec(docker_client, exit_code=exit_code)
    clock = mocker.patch("integrations.docker.time.monotonic")
    clock.side_effect = [0.0, 31.0]

    with pytest.raises(DockerTimeoutError, match="exceeded 30 seconds"):
        DockerIntegration(docker_client=docker_client).execute(
            "icarus-verilog", ["vvp"], "/verilog_code", timeout_seconds=30
        )


def test_early_sigkill_is_reported_as_memory_limit(docker_client: MagicMock, fake_exec, mocker: MagicMock) -> None:
    """137 antes do limite (OOM killer do container) vira erro de recurso, não timeout."""
    fake_exec(docker_client, exit_code=KILLED_EXIT_CODE)
    clock = mocker.patch("integrations.docker.time.monotonic")
    clock.side_effect = [0.0, 2.0]

    with pytest.raises(DockerResourceLimitError, match="limite de memória") as error:
        DockerIntegration(docker_client=docker_client).execute(
            "icarus-verilog", ["vvp"], "/verilog_code", timeout_seconds=30
        )

    assert error.value.limit == "memory"


def test_backend_deadline_raises_timeout(docker_client: MagicMock, fake_exec) -> None:
    """Stream que não termina dentro do limite + carência é abandonado."""
    fake_exec(docker_client, delay=0.5)

    started = time.monotonic()
    with pytest.raises(DockerTimeoutError, match="exceeded"):
        DockerIntegration(
            config=DockerConfig(timeout_seconds=0.05, kill_grace_seconds=0),
            docker_client=docker_client,
        ).execute("yosys", ["yosys", "-V"], "/verilog_code")

    assert time.monotonic() - started < 0.4
    docker_client.api.exec_inspect.assert_not_called()


def test_large_output_is_truncated(docker_client: MagicMock, fake_exec) -> None:
    """Saída acima do limite é cortada e sinalizada."""
    fake_exec(docker_client, stdout=b"x" * 100)

    result = DockerIntegration(config=DockerConfig(max_output_bytes=10), docker_client=docker_client).execute(
        "icarus-verilog", ["vvp"], "/verilog_code"
    )

    assert result.stdout.startswith("x" * 10)
    assert result.stdout.endswith("[output truncated]\n")
