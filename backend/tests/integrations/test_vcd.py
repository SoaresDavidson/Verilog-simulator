"""Testes do parse de arquivos VCD."""

import json
from decimal import Decimal
from pathlib import Path

import pytest
from vcdvcd import VCDVCD

from integrations.vcd import VcdFormatError, VcdLimits, VcdSelection, parse_vcd


def legacy_parse(vcd_path: Path) -> dict:
    """Implementação anterior (#4) usada como referência de contrato."""
    vcd = VCDVCD(str(vcd_path), store_scopes=True)
    modules = {}
    for scope_name, scope in vcd.scopes.items():
        scope_vars, child_scopes = {}, []
        for name, val in scope.subElements.items():
            if isinstance(val, str):
                sig = vcd[val]
                scope_vars[name] = {
                    "size": sig.size,
                    "var_type": sig.var_type,
                    "references": sig.references,
                }
            else:
                child_scopes.append(val.name)
        modules[scope_name] = {
            "name": scope.name,
            "variables": scope_vars,
            "child_scopes": child_scopes,
        }
    timeline: dict = {}
    for signal_name in vcd.signals:
        for timestamp, value in vcd[signal_name].tv:
            timeline.setdefault(str(timestamp), {})[signal_name] = value
    data = {
        "metadata": {
            "timescale": vcd.timescale,
            "begintime": vcd.begintime,
            "endtime": vcd.endtime,
        },
        "modules": modules,
        "timeline": timeline,
    }
    return json.loads(json.dumps(data, default=lambda o: float(o) if isinstance(o, Decimal) else o))


def write_vcd(path: Path, changes: list[tuple[int, str, str]]) -> Path:
    """Escreve um VCD com dois sinais (a='!', b='"') e as mudanças dadas."""
    lines = [
        "$timescale 1ns $end",
        "$scope module tb $end",
        "$var wire 1 ! a $end",
        '$var wire 1 " b $end',
        "$upscope $end",
        "$enddefinitions $end",
    ]
    current = None
    for stamp, code, value in changes:
        if stamp != current:
            lines.append(f"#{stamp}")
            current = stamp
        lines.append(f"{value}{code}")
    path.write_text("\n".join(lines) + "\n")
    return path


@pytest.fixture
def two_signals(tmp_path: Path) -> Path:
    """a muda em todo instante 0..9; b muda em 0 e 5."""
    changes = []
    for stamp in range(10):
        changes.append((stamp, "!", str(stamp % 2)))
        if stamp in (0, 5):
            changes.append((stamp, '"', "1" if stamp else "0"))
    return write_vcd(tmp_path / "two.vcd", changes)


def test_small_vcd_matches_legacy_contract(fixtures_dir: Path) -> None:
    """Dentro dos limites, o resultado é idêntico ao formato anterior."""
    path = fixtures_dir / "counter.vcd"

    log = parse_vcd(path)

    assert log == legacy_parse(path)
    assert "truncated" not in log["metadata"]
    assert list(log["timeline"]) == sorted(log["timeline"], key=int)


def test_decimals_are_plain_json_numbers(fixtures_dir: Path) -> None:
    """Valores Decimal do timescale saem como float, serializáveis em JSON."""
    log = parse_vcd(fixtures_dir / "counter.vcd")

    timescale = log["metadata"]["timescale"]
    assert timescale == {
        "timescale": 1e-12,
        "magnitude": 1.0,
        "unit": "ps",
        "factor": 1e-12,
    }
    assert json.loads(json.dumps(log)) == log


def test_fixture_structure(fixtures_dir: Path) -> None:
    """Hierarquia e valores do VCD real do Icarus."""
    log = parse_vcd(fixtures_dir / "counter.vcd")

    assert log["metadata"]["begintime"] == 0
    assert log["metadata"]["endtime"] == 72000
    tb = log["modules"]["tb"]
    assert tb["child_scopes"] == ["tb.dut"]
    assert tb["variables"]["clk"] == {
        "size": "1",
        "var_type": "reg",
        "references": ["tb.clk", "tb.dut.clk"],
    }
    assert log["timeline"]["5000"]["tb.clk"] == "1"
    assert log["timeline"]["15000"]["tb.q[3:0]"] == "1"


def test_timestamp_limit_truncates_and_flags(two_signals: Path) -> None:
    """Acima de max_timestamps o resultado é cortado e sinalizado."""
    log = parse_vcd(two_signals, limits=VcdLimits(max_timestamps=3))

    assert list(log["timeline"]) == ["0", "1", "2"]
    assert log["metadata"]["truncated"] is True
    assert log["metadata"]["truncation_reason"] == "max_timestamps"
    assert log["metadata"]["total_timestamps"] == 10


def test_signal_limit_truncates_and_flags(two_signals: Path) -> None:
    """Acima de max_signals só os primeiros sinais entram na timeline."""
    log = parse_vcd(two_signals, limits=VcdLimits(max_signals=1))

    assert all(set(values) == {"tb.a"} for values in log["timeline"].values())
    assert log["metadata"]["truncation_reason"] == "max_signals"
    assert log["metadata"]["total_signals"] == 2
    assert set(log["modules"]["tb"]["variables"]) == {"a", "b"}


def test_file_size_limit_returns_hierarchy_only(two_signals: Path) -> None:
    """Arquivo grande demais não é lido por inteiro; hierarquia é mantida."""
    log = parse_vcd(two_signals, limits=VcdLimits(max_file_bytes=10))

    assert log["timeline"] == {}
    assert log["metadata"]["truncated"] is True
    assert log["metadata"]["truncation_reason"] == "max_file_bytes"
    assert "tb" in log["modules"]


def test_combined_truncation_lists_every_reason(two_signals: Path) -> None:
    """Vários limites estourados aparecem juntos em truncation_reason."""
    log = parse_vcd(two_signals, limits=VcdLimits(max_signals=1, max_timestamps=2))

    assert log["metadata"]["truncation_reason"] == "max_signals,max_timestamps"


def test_time_window_seeds_state_at_begin(two_signals: Path) -> None:
    """Janela [3, 6] começa com o valor vigente em 3 e para em 6."""
    log = parse_vcd(two_signals, VcdSelection(begin_time=3, end_time=6))

    assert log["timeline"] == {
        "3": {"tb.a": "1", "tb.b": "0"},
        "4": {"tb.a": "0"},
        "5": {"tb.a": "1", "tb.b": "1"},
        "6": {"tb.a": "0"},
    }
    assert log["metadata"]["begintime"] == 0
    assert log["metadata"]["endtime"] == 9


def test_signal_subset(two_signals: Path) -> None:
    """Somente as referências pedidas entram; desconhecidas são reportadas."""
    log = parse_vcd(two_signals, VcdSelection(signals=("tb.b", "tb.missing")))

    assert log["timeline"] == {"0": {"tb.b": "0"}, "5": {"tb.b": "1"}}
    assert log["metadata"]["ignored_signals"] == ["tb.missing"]


def test_signal_subset_without_matches_is_empty(two_signals: Path) -> None:
    """Filtro sem nenhuma referência válida não cai no modo 'todos os sinais'."""
    log = parse_vcd(two_signals, VcdSelection(signals=("tb.nope",)))

    assert log["timeline"] == {}
    assert log["metadata"]["endtime"] == 9


def test_decimation_folds_skipped_changes(two_signals: Path) -> None:
    """Decimação 4 mantém 0, 4, 8 e o último instante, sem perder mudanças."""
    log = parse_vcd(two_signals, VcdSelection(decimation=4))

    assert log["timeline"] == {
        "0": {"tb.a": "0", "tb.b": "0"},
        "4": {"tb.a": "0"},
        "8": {"tb.a": "0", "tb.b": "1"},
        "9": {"tb.a": "1"},
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"begin_time": 5, "end_time": 2},
        {"begin_time": -1},
        {"decimation": 0},
    ],
)
def test_invalid_selection_is_rejected(kwargs: dict) -> None:
    """Parâmetros de recorte inconsistentes são recusados."""
    with pytest.raises(ValueError):
        VcdSelection(**kwargs)


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


def test_parse_metrics_are_logged(two_signals: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Duração e contagens do parse ficam registradas no log."""
    with caplog.at_level("INFO", logger="integrations.vcd"):
        parse_vcd(two_signals)

    assert "2 signals, 10 timestamps" in caplog.text
