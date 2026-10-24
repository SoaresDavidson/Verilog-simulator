"""Contrato da netlist com as netlists reais dos multiplicadores das aulas.

As fixtures em ``fixtures/netlist/multiplicadores`` foram geradas pela imagem
``verilog-classroom/yosys`` (Yosys 0.23) com o mesmo comando da integração.
"""

import json

import pytest
from conftest import FIXTURES_DIR, MULTIPLICADORES

from schemas.netlist import Netlist

NETLISTS = FIXTURES_DIR / "netlist" / "multiplicadores"
PORT_WIDTHS = {"clk": 1, "rst_n": 1, "start": 1, "a": 16, "b": 16, "produto": 32, "done": 1}
PORT_DIRECTIONS = {"produto": "output", "done": "output"}


def load(name: str) -> Netlist:
    return Netlist.model_validate(json.loads((NETLISTS / f"{name}.json").read_text()))


# shift_add_vetores sintetiza o mesmo mult_shift_add de shift_add.
@pytest.mark.parametrize("name", ["shift_add", "array", "array_pipe", "array_pipe32"])
def test_multiplier_netlist_matches_contract(name: str) -> None:
    """Top correto, interface 16x16 -> 32 e larguras calculadas a partir dos bits."""
    netlist = load(name)
    top = netlist.modules[netlist.top_module]

    assert netlist.top_module == MULTIPLICADORES[name]
    assert {port: info.width for port, info in top.ports.items()} == PORT_WIDTHS
    for port, info in top.ports.items():
        assert info.direction == PORT_DIRECTIONS.get(port, "input")
        assert info.width == len(info.bits)
    assert top.cells, "o multiplicador sintetizado precisa ter células"


def test_pipeline_has_more_cells_than_combinational_array() -> None:
    """Cortar a árvore em 4 estágios acrescenta registradores (aula 7)."""
    array = load("array").modules["mult_array"]
    pipe = load("array_pipe").modules["mult_array_pipe"]

    assert len(pipe.cells) > len(array.cells)
