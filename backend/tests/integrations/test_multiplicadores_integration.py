"""Fluxo completo com os multiplicadores das aulas, contra o Docker real.

Upload -> síntese (Yosys) -> simulação (Icarus) pelo ``VerilogService``, no
modo de containers efêmeros. Os testbenches das aulas se autoverificam
comparando cada produto com ``a * b`` e imprimem "TODOS OS TESTES PASSARAM".

Exigem as imagens construídas (``docker compose build yosys icarus``) e um
usuário local com o mesmo UID/GID das imagens (padrão 1000).
"""

import os
from pathlib import Path

import docker
import pytest
from conftest import MULTIPLICADORES, zip_project
from docker.errors import DockerException, ImageNotFound

from config import settings
from services.verilog import VerilogService

pytestmark = pytest.mark.integration

PASSED = "TODOS OS TESTES PASSARAM"

#: tb_mult_fluxo só abre o VCD com o plusarg +vcd=, que o simulador não repassa.
WITHOUT_VCD = {"array_pipe", "array_pipe32"}


@pytest.fixture(scope="module")
def require_images() -> None:
    try:
        client = docker.from_env()
        for image in (settings.YOSYS_IMAGE, settings.ICARUS_IMAGE):
            client.images.get(image)
    except ImageNotFound as exc:
        pytest.skip(f"Imagem não construída: {exc}")
    except DockerException as exc:
        pytest.skip(f"Docker indisponível: {exc}")
    if os.getuid() != settings.EXECUTION_UID:
        pytest.skip("UID local diferente do usuário das imagens.")


@pytest.fixture
def service(require_images: None, runs_dir: Path, monkeypatch: pytest.MonkeyPatch) -> VerilogService:
    monkeypatch.setattr(settings, "EXECUTION_MODE", "ephemeral")
    monkeypatch.setattr(settings, "HOST_VERILOG_ROOT", None)
    monkeypatch.setattr(settings, "HOST_SCRIPTS_DIR", None)
    return VerilogService()


def upload(service: VerilogService, tmp_path: Path, name: str) -> str:
    archive = tmp_path / f"{name}.zip"
    archive.write_bytes(zip_project(name))
    return service.upload_zip_project(archive).project_id


@pytest.mark.parametrize("name", sorted(MULTIPLICADORES))
def test_synthesis_finds_multiplier_top(service: VerilogService, tmp_path: Path, name: str) -> None:
    result = service.mapear_processador(upload(service, tmp_path, name))

    assert result["success"], result["stderr"]
    assert result["top_module"] == MULTIPLICADORES[name]
    ports = result["netlist_content"].modules[result["top_module"]].ports
    assert (ports["a"].width, ports["b"].width, ports["produto"].width) == (16, 16, 32)
    assert result["stat_report"]


@pytest.mark.parametrize("name", sorted(MULTIPLICADORES))
def test_simulation_passes_lesson_testbench(service: VerilogService, tmp_path: Path, name: str) -> None:
    result = service.simular_execucao(upload(service, tmp_path, name))

    assert result["success"], result["stderr"]
    assert PASSED in result["stdout"]
    log = result["simulation_log"]
    if name in WITHOUT_VCD:
        assert log is None
        return
    assert log is not None
    references = {
        ref for module in log["modules"].values() for var in module["variables"].values() for ref in var["references"]
    }
    assert any(ref.endswith(".produto[31:0]") for ref in references), sorted(references)
    assert log["timeline"]


def test_synthesis_then_simulation_share_the_run(service: VerilogService, tmp_path: Path) -> None:
    """Sintetizar e depois simular o mesmo run: cada etapa lê só os seus artefatos."""
    project_id = upload(service, tmp_path, "shift_add")

    synthesis = service.mapear_processador(project_id)
    simulation = service.simular_execucao(project_id)
    again = service.mapear_processador(project_id)

    assert synthesis["success"] and simulation["success"] and again["success"]
    assert again["top_module"] == synthesis["top_module"] == "mult_shift_add"
    assert PASSED in simulation["stdout"]
