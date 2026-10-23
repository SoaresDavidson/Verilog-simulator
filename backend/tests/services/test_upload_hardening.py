"""Testes do endurecimento da extração de ZIP (#9)."""

import io
import os
import zipfile
from pathlib import Path

import pytest
from conftest import make_zip

from services.project_upload import (
    ProjectUploadError,
    UploadLimits,
    extract_project_zip,
)

TOP = "module top; endmodule"


def _extract(runs_dir: Path, data: bytes, **limits: int) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return extract_project_zip(archive, runs_dir, UploadLimits(**limits))


def _zip_with_raw_names(names: list[str]) -> bytes:
    """Monta um ZIP com nomes exatamente como informados (sem normalização)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("top.v", TOP)
        for name in names:
            info = zipfile.ZipInfo("placeholder")
            info.filename = name
            archive.writestr(info, TOP)
    return buffer.getvalue()


def _assert_rejected(
    runs_dir: Path, data: bytes, status: int = 400, **limits: int
) -> str:
    with pytest.raises(ProjectUploadError) as excinfo:
        _extract(runs_dir, data, **limits)
    assert excinfo.value.status_code == status
    assert list(runs_dir.iterdir()) == []
    return excinfo.value.message


def test_zip_bomb_is_rejected_during_extraction(runs_dir: Path) -> None:
    """Entrada com taxa de compressão absurda é abortada durante a escrita."""
    data = make_zip({"top.v": TOP, "bomba.mem": b"\0" * (5 * 1024 * 1024)})

    message = _assert_rejected(runs_dir, data)

    assert "compressão" in message


def test_highly_compressible_small_file_is_accepted(runs_dir: Path) -> None:
    """Arquivo pequeno muito compressível (memória zerada) não é falso positivo."""
    data = make_zip({"top.v": TOP, "rom.mem": b"0" * (512 * 1024)})

    assert _extract(runs_dir, data)


@pytest.mark.parametrize(
    "name",
    ["../../etc/passwd.v", "/etc/passwd.v", "src/../../fora.v", "..\\\\fora.v"],
)
def test_path_traversal_is_rejected(runs_dir: Path, name: str) -> None:
    """Nomes absolutos ou com `..` são rejeitados sem gravar nada."""
    message = _assert_rejected(runs_dir, _zip_with_raw_names([name]))

    assert "fora da pasta" in message
    assert not (runs_dir.parent.parent / "fora.v").exists()


def test_invalid_characters_are_rejected(runs_dir: Path) -> None:
    """Caracteres inválidos no sistema de arquivos alvo são rejeitados."""
    _assert_rejected(runs_dir, _zip_with_raw_names(["a:b.v"]))


def test_too_many_entries_returns_413(runs_dir: Path) -> None:
    """Número de entradas acima do teto é rejeitado com 413."""
    data = make_zip({f"m{i}.v": TOP for i in range(5)})

    message = _assert_rejected(runs_dir, data, status=413, max_entries=4)

    assert "4 arquivos" in message


def test_depth_limit(runs_dir: Path) -> None:
    """Profundidade de pastas acima do limite é rejeitada."""
    data = make_zip({"top.v": TOP, "a/b/c/d.v": TOP})

    _assert_rejected(runs_dir, data, max_depth=2)
    assert _extract(runs_dir, data, max_depth=3)


def test_path_length_limit(runs_dir: Path) -> None:
    """Caminho acima do comprimento máximo é rejeitado."""
    _assert_rejected(runs_dir, make_zip({"x" * 40 + ".v": TOP}), max_path_length=20)


def test_uncompressed_total_counts_written_bytes(runs_dir: Path) -> None:
    """O total descompactado é medido nos bytes escritos e gera 413."""
    data = make_zip({"top.v": TOP, "dados.hex": os.urandom(4000)})

    message = _assert_rejected(runs_dir, data, status=413, max_uncompressed_bytes=2000)

    assert "descompactado" in message


def test_only_expected_extensions_are_extracted(runs_dir: Path) -> None:
    """Artefatos pré-fabricados e extensões desconhecidas não são extraídos."""
    data = make_zip(
        {
            "proj/top.v": TOP,
            "proj/defs.vh": "`define X 1",
            "proj/rom.mem": "00",
            "proj/estrutura.json": "{}",
            "proj/relatorio.txt": "falso",
            "proj/ondas.vcd": "$end",
            "proj/run.sh": "rm -rf /",
            "proj/.session": "token-forjado",
        }
    )

    project_id = _extract(runs_dir, data)

    run_dir = runs_dir.parent / project_id
    extracted = sorted(p.relative_to(run_dir).as_posix() for p in run_dir.rglob("*"))
    assert extracted == ["defs.vh", "rom.mem", "top.v"]


@pytest.mark.filterwarnings("ignore:Duplicate name")
def test_duplicate_entries_are_rejected(runs_dir: Path) -> None:
    """Entradas duplicadas não sobrescrevem arquivos e geram 400."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("top.v", TOP)
        archive.writestr("top.v", "module outro; endmodule")

    _assert_rejected(runs_dir, buffer.getvalue())


def test_upload_limits_must_be_positive() -> None:
    """Limites zerados ou negativos são erro de configuração."""
    with pytest.raises(ValueError):
        UploadLimits(max_entries=0)
