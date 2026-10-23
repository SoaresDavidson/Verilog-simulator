"""Testes do parse de arquivos VCD."""

from pathlib import Path

import pytest

from integrations.vcd import VcdFormatError, parse_vcd


def test_parse_fixture_preserves_contract(fixtures_dir: Path) -> None:
    """VCD real do Icarus gera metadata, modules e timeline no formato da API."""
    log = parse_vcd(fixtures_dir / "counter.vcd")

    assert set(log) == {"metadata", "modules", "timeline"}
    assert log["metadata"]["begintime"] == 0
    assert log["metadata"]["endtime"] == 72000
    assert log["metadata"]["timescale"]["unit"] == "ps"
    assert isinstance(log["metadata"]["timescale"]["factor"], float)

    tb = log["modules"]["tb"]
    assert tb["name"] == "tb"
    assert tb["child_scopes"] == ["tb.dut"]
    assert tb["variables"]["clk"]["size"] == "1"
    assert tb["variables"]["clk"]["var_type"] == "reg"
    assert "tb.dut.clk" in tb["variables"]["clk"]["references"]

    assert log["timeline"]["0"]["tb.clk"] == "0"
    assert log["timeline"]["5000"]["tb.clk"] == "1"
    assert log["timeline"]["15000"]["tb.q[3:0]"] == "1"


def test_malformed_vcd_raises_format_error(tmp_path: Path) -> None:
    """Conteúdo inválido vira VcdFormatError em vez de exceção genérica."""
    path = tmp_path / "bad.vcd"
    path.write_text("$timescale 1ns $end\n$enddefinitions $end\n#abc\n")

    with pytest.raises(VcdFormatError, match="Malformed"):
        parse_vcd(path)


def test_missing_vcd_raises_format_error(tmp_path: Path) -> None:
    """Arquivo inexistente é reportado como erro de leitura."""
    with pytest.raises(VcdFormatError, match="Could not read"):
        parse_vcd(tmp_path / "missing.vcd")
