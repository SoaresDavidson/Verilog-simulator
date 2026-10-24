"""Testes de integração do sandbox efêmero (#7) contra o Docker real.

Exigem a imagem do Icarus construída (``docker compose build icarus``) e um
usuário local com o mesmo UID/GID da imagem (padrão 1000), pois o run é
montado direto do disco local.
"""

import os
from pathlib import Path

import docker
import pytest
from docker.errors import DockerException, ImageNotFound

from config import settings
from integrations.docker import (
    DockerConfig,
    DockerIntegration,
    DockerResourceLimitError,
    DockerTimeoutError,
    SandboxConfig,
)

pytestmark = pytest.mark.integration

IMAGE = settings.ICARUS_IMAGE
RUN_IN_CONTAINER = "/verilog_code/runs/run_sandbox"


@pytest.fixture(scope="module")
def require_image() -> None:
    try:
        docker.from_env().images.get(IMAGE)
    except ImageNotFound:
        pytest.skip(f"Imagem {IMAGE} não construída.")
    except DockerException as exc:
        pytest.skip(f"Docker indisponível: {exc}")
    if os.getuid() != settings.EXECUTION_UID:
        pytest.skip("UID local diferente do usuário da imagem.")


@pytest.fixture
def sandbox(require_image: None) -> DockerIntegration:
    return DockerIntegration(
        DockerConfig(
            timeout_seconds=20,
            kill_grace_seconds=5,
            sandbox=SandboxConfig(
                user=f"{settings.EXECUTION_UID}:{settings.EXECUTION_GID}",
                mem_limit="64m",
                cpus=0.5,
                pids_limit=32,
                tmpfs_size="16m",
            ),
        )
    )


@pytest.fixture
def runs(tmp_path: Path) -> tuple[Path, Path]:
    """Dois runs vizinhos: o executado e outro com um segredo."""
    mine = tmp_path / "runs" / "run_sandbox"
    other = tmp_path / "runs" / "run_outro"
    mine.mkdir(parents=True)
    other.mkdir(parents=True)
    (other / "segredo.txt").write_text("nao deveria vazar\n")
    return mine, other


def run(sandbox: DockerIntegration, run_dir: Path, command: list[str], timeout: float = 20):
    return sandbox.run_ephemeral(
        image=IMAGE,
        command=command,
        run_dir_host=str(run_dir),
        workdir=RUN_IN_CONTAINER,
        timeout_seconds=timeout,
    )


def test_valid_project_simulates_under_restrictions(sandbox, runs) -> None:
    mine, _ = runs
    (mine / "tb.v").write_text(
        "module tb; initial begin $dumpfile(\"o.vcd\"); $dumpvars; "
        "$display(\"ok\"); $finish; end endmodule\n"
    )

    result = run(sandbox, mine, ["sh", "-c", "iverilog -o /tmp/s.vvp tb.v && vvp /tmp/s.vvp"])

    assert result.success, result.stderr
    assert "ok" in result.stdout
    assert (mine / "o.vcd").exists()


def test_fopen_outside_run_fails(sandbox, runs) -> None:
    mine, other = runs
    (mine / "tb.v").write_text(
        "module tb; integer fd; initial begin "
        f"fd = $fopen(\"/verilog_code/runs/{other.name}/segredo.txt\", \"r\"); "
        "$display(\"fd=%0d\", fd); $finish; end endmodule\n"
    )

    result = run(sandbox, mine, ["sh", "-c", "iverilog -o /tmp/s.vvp tb.v && vvp /tmp/s.vvp"])

    assert "fd=0" in result.stdout
    assert "nao deveria vazar" not in result.stdout + result.stderr


def test_only_own_run_and_no_network_are_visible(sandbox, runs) -> None:
    mine, other = runs

    result = run(
        sandbox,
        mine,
        ["sh", "-c", "ls /verilog_code/runs; ls /sys/class/net; touch /etc/x || echo rootfs-ro"],
    )

    assert mine.name in result.stdout
    assert other.name not in result.stdout
    assert "eth0" not in result.stdout
    assert "rootfs-ro" in result.stdout


def test_memory_beyond_limit_is_reported(sandbox, runs) -> None:
    mine, _ = runs

    with pytest.raises(DockerResourceLimitError, match="limite de memória"):
        # Sem quebras de linha, tail -n 1 guarda a entrada inteira na memória.
        run(sandbox, mine, ["sh", "-c", "head -c 512m /dev/zero | tail -n 1 > /dev/null"])


def test_fork_bomb_is_contained(sandbox, runs) -> None:
    mine, _ = runs

    try:
        result = run(sandbox, mine, ["bash", "-c", "f(){ f | f & }; f; sleep 3"], timeout=8)
    except (DockerTimeoutError, DockerResourceLimitError):
        return
    # pids_limit faz o fork falhar; o processo termina sem derrubar o host.
    assert "fork" in result.stderr.lower() or not result.success
