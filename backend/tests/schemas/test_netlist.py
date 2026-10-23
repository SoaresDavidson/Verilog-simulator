"""Testes do contrato tipado da netlist do Yosys."""

import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from schemas.netlist import Netlist

ALU = "$paramod\\alu\\WIDTH=s32'00000000000000000000000000000100"


@pytest.fixture
def raw(fixtures_dir: Path) -> dict:
    """estrutura.json real (Yosys) de cpu -> alu parametrizada + inc4."""
    return json.loads((fixtures_dir / "netlist" / "estrutura.json").read_text())


def without_width(value: object) -> object:
    """Remove o campo width acrescentado pelo backend."""
    if isinstance(value, dict):
        return {k: without_width(v) for k, v in value.items() if k != "width"}
    if isinstance(value, list):
        return [without_width(item) for item in value]
    return value


def test_realistic_netlist_is_preserved_without_loss(raw: dict) -> None:
    """Serializar a netlist validada devolve o JSON do Yosys + width."""
    netlist = Netlist.model_validate(raw)

    assert without_width(netlist.model_dump(mode="json")) == raw
    assert set(netlist.modules) == {"cpu", "inc4", ALU}


def test_top_module_comes_from_top_attribute(raw: dict) -> None:
    """Topo é o módulo marcado por hierarchy -auto-top."""
    assert Netlist.model_validate(raw).top_module == "cpu"


def test_ports_expose_direction_bits_and_width(raw: dict) -> None:
    """Portas têm direção, bits e largura (barramentos e inout)."""
    cpu = Netlist.model_validate(raw).modules["cpu"]

    assert cpu.ports["a"].direction == "input"
    assert cpu.ports["a"].width == 4
    assert cpu.ports["result"].direction == "output"
    assert cpu.ports["bus_z"].direction == "inout"
    assert cpu.ports["bus_z"].bits == ["z"]


def test_constants_are_kept_as_strings(raw: dict) -> None:
    """Constantes 0/1/x/z não são convertidas em identificadores inteiros."""
    netlist = Netlist.model_validate(raw)

    assert netlist.modules["cpu"].ports["konst"].bits == ["0", "x", "0", "1"]
    add = next(
        cell for cell in netlist.modules["inc4"].cells.values() if cell.type == "$add"
    )
    assert add.connections["B"] == ["1", "0", "0", "0"]


def test_cells_and_nets_correlate_by_bit_ids(raw: dict) -> None:
    """Bits das conexões de uma célula aparecem nos netnames do módulo."""
    module = Netlist.model_validate(raw).modules[ALU]
    net_bits = {
        bit
        for net in module.netnames.values()
        for bit in net.bits
        if isinstance(bit, int)
    }

    for cell in module.cells.values():
        assert cell.type.startswith("$")
        assert set(cell.port_directions) == set(cell.connections)
        for bits in cell.connections.values():
            assert {bit for bit in bits if isinstance(bit, int)} <= net_bits


def test_submodule_instances_are_cells(raw: dict) -> None:
    """Instâncias de submódulos aparecem como células do tipo do módulo."""
    cells = Netlist.model_validate(raw).modules["cpu"].cells

    assert cells["u_alu"].type == ALU
    assert cells["u_inc"].type == "inc4"


def test_extra_yosys_fields_are_preserved(raw: dict) -> None:
    """Campos novos de outras versões do Yosys não quebram a serialização."""
    raw["modules"]["cpu"]["memories"] = {}
    raw["modules"]["cpu"]["netnames"]["a"]["upto"] = 1

    dumped = Netlist.model_validate(raw).model_dump(mode="json")

    assert dumped["modules"]["cpu"]["memories"] == {}
    assert dumped["modules"]["cpu"]["netnames"]["a"]["upto"] == 1


def test_optional_parameter_defaults_are_not_invented(raw: dict) -> None:
    """parameter_default_values só aparece quando o Yosys o gerou."""
    dumped = Netlist.model_validate(raw).model_dump(mode="json")

    assert "parameter_default_values" not in dumped["modules"]["cpu"]
    assert dumped["modules"][ALU]["parameter_default_values"] == {
        "WIDTH": "00000000000000000000000000000100"
    }


def test_integer_top_attribute_is_accepted(raw: dict) -> None:
    """Atributo top inteiro (modo -compat-int) também identifica o topo."""
    raw["modules"]["cpu"]["attributes"]["top"] = 1

    assert Netlist.model_validate(raw).top_module == "cpu"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda n: n.update(modules={}),
        lambda n: n["modules"]["inc4"]["attributes"].update(top="1"),
        lambda n: n["modules"]["cpu"]["ports"]["a"].update(bits=["2"]),
        lambda n: n["modules"]["cpu"]["ports"]["a"].update(width=3),
        lambda n: n["modules"]["cpu"]["cells"]["u_alu"].pop("connections"),
        lambda n: n.pop("creator"),
    ],
    ids=[
        "no-modules",
        "two-tops",
        "numeric-string-bit",
        "wrong-width",
        "cell-without-connections",
        "no-creator",
    ],
)
def test_incompatible_netlists_are_rejected(raw: dict, mutate) -> None:
    """Estruturas fora do contrato falham na validação."""
    broken = copy.deepcopy(raw)
    mutate(broken)

    with pytest.raises(ValidationError):
        Netlist.model_validate(broken)
