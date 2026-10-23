"""Testes da validação e extração de projetos enviados (UC01, #18)."""

import io
import re
import zipfile
from pathlib import Path

import pytest
from conftest import make_zip

from integrations.yosys import YosysConfig, YosysIntegration
from services.project_upload import ProjectUploadError
from services.verilog import VerilogService

CANONICAL_ID = re.compile(r"^runs/run_[0-9a-f]{32}$")


def _service() -> VerilogService:
    return VerilogService(yosys_integration=object(), docker_integration=object())


def _upload(runs_dir: Path, data: bytes) -> str:
    """Grava o ZIP fora do diretório de runs e envia ao serviço."""
    archive_path = runs_dir.parent.parent / "upload.zip"
    archive_path.write_bytes(data)
    return _service().upload_zip_project(archive_path)


def _run_dir(runs_dir: Path, project_id: str) -> Path:
    return runs_dir.parent / project_id


def test_sources_at_root_return_canonical_id(runs_dir: Path) -> None:
    """Fonte na raiz gera project_id canônico apontando para o run."""
    project_id = _upload(runs_dir, make_zip({"top.v": "module top; endmodule"}))

    assert CANONICAL_ID.fullmatch(project_id)
    assert (_run_dir(runs_dir, project_id) / "top.v").is_file()


def test_single_root_folder_is_not_appended_to_id(runs_dir: Path) -> None:
    """Pasta raiz única não vira parte do project_id e é achatada no run."""
    archive = make_zip(
        {
            "projeto/top.v": "module top; endmodule",
            "projeto/rtl/alu.sv": "module alu; endmodule",
        }
    )

    project_id = _upload(runs_dir, archive)

    assert CANONICAL_ID.fullmatch(project_id)
    run_dir = _run_dir(runs_dir, project_id)
    assert (run_dir / "top.v").is_file()
    assert (run_dir / "rtl" / "alu.sv").is_file()


def test_sources_only_in_subfolders_are_accepted(runs_dir: Path) -> None:
    """Fontes apenas em subpastas (sem pasta raiz única) também são aceitas."""
    archive = make_zip({"rtl/top.v": "module top; endmodule", "doc/leia.txt": "x"})

    project_id = _upload(runs_dir, archive)

    assert (_run_dir(runs_dir, project_id) / "rtl" / "top.v").is_file()


def test_uppercase_extension_counts_as_source(runs_dir: Path) -> None:
    """A extensão é comparada sem diferenciar maiúsculas."""
    assert _upload(runs_dir, make_zip({"TOP.V": "module top; endmodule"}))


@pytest.mark.parametrize(
    ("archive", "fragment"),
    [
        (make_zip({}), "vazio"),
        (make_zip({"leia.txt": "sem fontes"}), "Verilog"),
        (b"isto nao e um zip", "ZIP"),
        (make_zip({"top.v": "module top; endmodule"})[:-30], "ZIP"),
    ],
    ids=["vazio", "sem-fontes", "nao-zip", "truncado"],
)
def test_invalid_archives_are_rejected_without_residue(
    runs_dir: Path, archive: bytes, fragment: str
) -> None:
    """ZIP vazio, corrompido ou sem fontes gera erro 400 e nenhum resíduo."""
    with pytest.raises(ProjectUploadError) as excinfo:
        _upload(runs_dir, archive)

    assert excinfo.value.status_code == 400
    assert fragment in excinfo.value.message
    assert list(runs_dir.iterdir()) == []


def test_corrupted_member_is_rejected_without_residue(runs_dir: Path) -> None:
    """Erro de CRC durante a extração vira 400 e remove o run parcial."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("top.v", "module top; endmodule")
    data = bytearray(buffer.getvalue())
    offset = data.index(b"module top")
    data[offset] ^= 0xFF

    with pytest.raises(ProjectUploadError):
        _upload(runs_dir, bytes(data))

    assert list(runs_dir.iterdir()) == []


def test_yosys_finds_nested_sources_with_canonical_id(runs_dir: Path) -> None:
    """A síntese continua encontrando fontes em subpastas pelo id canônico."""
    archive = make_zip({"rtl/core/top.v": "module top; endmodule", "tb/tb_top.v": "x"})
    project_id = _upload(runs_dir, archive)
    integration = YosysIntegration(
        YosysConfig(verilog_base_dir=runs_dir.parent), docker_integration=object()
    )

    project_dir, container_dir = integration._resolve_project(project_id)
    sources = integration._find_verilog_sources(project_dir)

    assert container_dir == f"/verilog_code/{project_id}"
    assert [source.as_posix() for source in sources] == ["rtl/core/top.v"]


def test_simulation_path_resolution_accepts_canonical_id(runs_dir: Path) -> None:
    """A simulação resolve o id canônico para a raiz do run."""
    project_id = _upload(runs_dir, make_zip({"src/top.v": "x"}))

    local_dir, container_dir = _service()._resolve_paths(project_id)

    assert Path(local_dir) == _run_dir(runs_dir, project_id)
    assert container_dir == f"/verilog_code/{project_id}"
