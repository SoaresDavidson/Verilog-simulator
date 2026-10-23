"""Parsing of Value Change Dump (VCD) files produced by Icarus Verilog."""

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from vcdvcd import VCDVCD


class VcdFormatError(ValueError):
    """Raised when a VCD file cannot be read or interpreted."""


def parse_vcd(vcd_path: Path) -> dict[str, Any]:
    """Parse a VCD file into the ``simulation_log`` structure of the API.

    Args:
        vcd_path: Local path of the VCD file.

    Returns:
        Dictionary with ``metadata``, ``modules`` and ``timeline`` keys.

    Raises:
        VcdFormatError: If the file cannot be read or is malformed.
    """
    try:
        vcd = VCDVCD(str(vcd_path), store_scopes=True)
    except OSError as exc:
        raise VcdFormatError(
            f"Could not read VCD file '{vcd_path.name}': {exc}"
        ) from exc
    except (ValueError, LookupError, TypeError, ArithmeticError) as exc:
        raise VcdFormatError(f"Malformed VCD file '{vcd_path.name}': {exc}") from exc

    modules: dict[str, Any] = {}
    for scope_name, scope in vcd.scopes.items():
        scope_vars: dict[str, Any] = {}
        child_scopes: list[str] = []
        for name, value in scope.subElements.items():
            if isinstance(value, str):
                signal = vcd[value]
                scope_vars[name] = {
                    "size": signal.size,
                    "var_type": signal.var_type,
                    "references": signal.references,
                }
            else:
                child_scopes.append(value.name)
        modules[scope_name] = {
            "name": scope.name,
            "variables": scope_vars,
            "child_scopes": child_scopes,
        }

    timeline: dict[str, dict[str, str]] = {}
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

    class DecimalEncoder(json.JSONEncoder):
        def default(self, o: Any) -> Any:
            if isinstance(o, Decimal):
                return float(o)
            return super().default(o)

    return json.loads(json.dumps(data, cls=DecimalEncoder))
