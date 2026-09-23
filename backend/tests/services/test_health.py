"""Testes unitários das verificações de readiness das dependências."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from integrations.docker import (
    DockerConnectionError,
    DockerContainerNotFoundError,
    DockerContainerUnavailableError,
)
from services.health import HealthConfig, HealthService, HealthStatus


@pytest.fixture
def runs_dir(tmp_path: Path) -> Path:
    """Cria um diretório de runs gravável para o check de armazenamento."""
    path = tmp_path / "runs"
    path.mkdir()
    return path


@pytest.fixture
def config(runs_dir: Path) -> HealthConfig:
    """Configuração sem cache, para cada teste medir uma execução isolada."""
    return HealthConfig(runs_dir=runs_dir, cache_ttl_seconds=0)


@pytest.fixture
def docker_integration() -> MagicMock:
    """Integração Docker falsa em que tudo responde com sucesso."""
    integration = MagicMock()
    integration.execute.return_value = SimpleNamespace(
        success=True,
        exit_code=0,
        stdout="Yosys 0.9 (git sha1 1979e0b)\n",
        stderr="",
    )
    return integration


def test_healthy_environment_reports_ok(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """Com daemon, containers e storage saudáveis, o status geral é 'ok'."""
    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.OK
    assert report.is_ready is True
    assert set(report.checks) == {"docker_daemon", "yosys", "icarus", "storage"}
    assert all(check.status is HealthStatus.OK for check in report.checks.values())


def test_tool_version_is_reported_as_detail(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """A primeira linha da saída da ferramenta vira o detalhe do check."""
    report = HealthService(config, docker_integration).check()

    assert report.checks["yosys"].detail == "Yosys 0.9 (git sha1 1979e0b)"
    assert report.checks["yosys"].container == "yosys"
    assert report.checks["icarus"].container == "icarus-verilog"


def test_unreachable_daemon_marks_everything_as_error(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """Sem daemon não há como inspecionar containers: relatório vira 'error'."""
    docker_integration.get_client.side_effect = DockerConnectionError(
        "daemon unavailable"
    )

    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.ERROR
    assert report.is_ready is False
    assert "daemon unavailable" in report.checks["docker_daemon"].detail
    assert report.checks["yosys"].status is HealthStatus.ERROR
    assert report.checks["icarus"].status is HealthStatus.ERROR
    docker_integration.execute.assert_not_called()


def test_ping_failure_is_detected(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """Cliente existente mas daemon sem resposta também resulta em 'error'."""
    docker_integration.get_client.return_value.ping.side_effect = OSError(
        "connection refused"
    )

    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.ERROR
    assert "connection refused" in report.checks["docker_daemon"].detail


def test_missing_container_marks_only_that_tool(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """Container ausente derruba apenas o seu check, mas o geral vira 'error'."""

    def execute(container_name: str, **_kwargs: object) -> SimpleNamespace:
        if container_name == "yosys":
            raise DockerContainerNotFoundError("Container 'yosys' was not found.")
        return SimpleNamespace(success=True, exit_code=0, stdout="Icarus", stderr="")

    docker_integration.execute.side_effect = execute

    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.ERROR
    assert report.checks["yosys"].status is HealthStatus.ERROR
    assert report.checks["icarus"].status is HealthStatus.OK


def test_stopped_container_is_reported_as_error(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """Container parado é falha de infraestrutura, não degradação."""
    docker_integration.execute.side_effect = DockerContainerUnavailableError(
        "Container 'yosys' is 'exited', not running."
    )

    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.ERROR
    assert "not running" in report.checks["yosys"].detail


def test_tool_binary_failure_degrades_instead_of_failing(
    config: HealthConfig, docker_integration: MagicMock
) -> None:
    """Container de pé com binário que não responde deixa a API degradada."""
    docker_integration.execute.return_value = SimpleNamespace(
        success=False,
        exit_code=127,
        stdout="",
        stderr="yosys: command not found",
    )

    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.DEGRADED
    assert report.is_ready is True
    assert "command not found" in report.checks["yosys"].detail


def test_missing_runs_directory_is_an_error(
    runs_dir: Path, docker_integration: MagicMock
) -> None:
    """Diretório de runs inexistente impede qualquer execução."""
    config = HealthConfig(runs_dir=runs_dir / "inexistente", cache_ttl_seconds=0)

    report = HealthService(config, docker_integration).check()

    assert report.status is HealthStatus.ERROR
    assert report.checks["storage"].status is HealthStatus.ERROR
    assert "does not exist" in report.checks["storage"].detail


def test_non_writable_runs_directory_is_an_error(
    config: HealthConfig, docker_integration: MagicMock, mocker: MagicMock
) -> None:
    """Diretório de runs somente leitura também bloqueia a execução."""
    mocker.patch("services.health.os.access", return_value=False)

    report = HealthService(config, docker_integration).check()

    assert report.checks["storage"].status is HealthStatus.ERROR
    assert "not writable" in report.checks["storage"].detail


def test_result_is_cached_within_the_ttl(
    runs_dir: Path, docker_integration: MagicMock
) -> None:
    """O TTL evita que cada requisição converse com o daemon novamente."""
    service = HealthService(
        HealthConfig(runs_dir=runs_dir, cache_ttl_seconds=60), docker_integration
    )

    first = service.check()
    second = service.check()

    assert first is second
    assert docker_integration.get_client.call_count == 1


def test_cache_can_be_bypassed(runs_dir: Path, docker_integration: MagicMock) -> None:
    """A verificação pode ser forçada, ignorando o resultado em cache."""
    service = HealthService(
        HealthConfig(runs_dir=runs_dir, cache_ttl_seconds=60), docker_integration
    )

    service.check()
    service.check(use_cache=False)

    assert docker_integration.get_client.call_count == 2


def test_version_command_uses_configured_timeout(
    runs_dir: Path, docker_integration: MagicMock
) -> None:
    """O timeout curto do healthcheck é repassado à integração Docker."""
    config = HealthConfig(runs_dir=runs_dir, cache_ttl_seconds=0, timeout_seconds=2)

    HealthService(config, docker_integration).check()

    for call in docker_integration.execute.call_args_list:
        assert call.kwargs["timeout_seconds"] == 2


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("yosys_container_name", "  "),
        ("icarus_container_name", ""),
        ("timeout_seconds", 0),
        ("cache_ttl_seconds", -1),
    ],
)
def test_invalid_configuration_is_rejected(field: str, value: object) -> None:
    """Configuração inválida falha na criação, não durante a requisição."""
    with pytest.raises(ValueError):
        HealthConfig(**{field: value})
