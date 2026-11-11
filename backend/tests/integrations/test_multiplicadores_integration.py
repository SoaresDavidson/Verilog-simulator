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
from conftest import MULTIPLICADORES, make_zip, zip_project
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


HIERARCHY = """module inv(input a, output y); assign y = ~a; endmodule
module cpu(input a, output y); inv u(.a(a), .y(y)); endmodule
"""


def test_explicit_top_synthesizes_submodule(service: VerilogService, tmp_path: Path) -> None:
    """``hierarchy -top`` troca o top; módulo inexistente vira ``success: false``."""
    archive = tmp_path / "hierarquia.zip"
    archive.write_bytes(make_zip({"cpu.v": HIERARCHY}))
    project_id = service.upload_zip_project(archive).project_id

    auto = service.mapear_processador(project_id)
    explicit = service.mapear_processador(project_id, "inv")
    missing = service.mapear_processador(project_id, "nao_existe")

    assert auto["top_module"] == "cpu"
    assert set(auto["netlist_content"].modules) == {"cpu", "inv"}
    assert explicit["success"] and explicit["top_module"] == "inv"
    assert set(explicit["netlist_content"].modules) == {"inv"}
    assert missing["success"] is False
    assert "nao_existe" in missing["stderr"]


def test_undefined_module_fails_synthesis(service: VerilogService, tmp_path: Path) -> None:
    """Módulo instanciado sem definição é erro de síntese, não caixa-preta."""
    archive = tmp_path / "modulo_inexistente.zip"
    archive.write_bytes(
        make_zip({"top.v": "module top(input a, output y);\n  nao_existe u0(.a(a), .y(y));\nendmodule\n"})
    )
    project_id = service.upload_zip_project(archive).project_id

    result = service.mapear_processador(project_id)

    assert result["success"] is False
    assert result["netlist_content"] is None
    assert "nao_existe" in result["stderr"]
