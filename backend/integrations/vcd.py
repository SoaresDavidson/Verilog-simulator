"""Parsing of Value Change Dump (VCD) files produced by Icarus Verilog.

The parse output is the ``simulation_log`` of ``POST /simular-execucao``::

    {"metadata": {...}, "modules": {...}, "timeline": {"<t>": {"<ref>": "<value>"}}}

Cost is bounded by :class:`VcdLimits`; whenever a limit cuts the result,
``metadata.truncated`` is ``True`` and ``metadata.truncation_reason`` says why.
Clients can request a smaller slice through :class:`VcdSelection`.
"""

import logging
import time
from bisect import bisect_right
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from vcdvcd import VCDVCD

logger = logging.getLogger(__name__)

TRUNCATED_BY_FILE_BYTES = "max_file_bytes"
TRUNCATED_BY_SIGNALS = "max_signals"
TRUNCATED_BY_TIMESTAMPS = "max_timestamps"


class VcdFormatError(ValueError):
    """Raised when a VCD file cannot be read or interpreted."""


@dataclass(frozen=True, slots=True)
class VcdLimits:
    """Upper bounds applied to every parse."""

    max_timestamps: int = 50_000
    max_signals: int = 500
    max_file_bytes: int = 100 * 1024 * 1024

    def __post_init__(self) -> None:
        if min(self.max_timestamps, self.max_signals, self.max_file_bytes) <= 0:
            raise ValueError("VCD limits must be greater than zero.")


@dataclass(frozen=True, slots=True)
class VcdSelection:
    """Optional slice of the waveform requested by the client.

    Attributes:
        begin_time: First timestamp to include. The value every selected signal
            holds at this instant is emitted under ``begin_time`` so the window
            starts from a known state.
        end_time: Last timestamp to include.
        signals: References (e.g. ``"tb.dut.clk"``) to include; ``None`` = all.
        decimation: Keep one of every ``decimation`` timestamps (plus the last
            one). Changes of skipped timestamps are folded into the next kept
            one, so the latest value of each signal is never lost.
    """

    begin_time: int | None = None
    end_time: int | None = None
    signals: tuple[str, ...] | None = None
    decimation: int = 1

    def __post_init__(self) -> None:
        if self.begin_time is not None and self.begin_time < 0:
            raise ValueError("begin_time must be zero or positive.")
        if self.end_time is not None and self.end_time < 0:
            raise ValueError("end_time must be zero or positive.")
        if self.begin_time is not None and self.end_time is not None and self.begin_time > self.end_time:
            raise ValueError("begin_time must not be greater than end_time.")
        if self.decimation < 1:
            raise ValueError("decimation must be at least 1.")


def parse_vcd(
    vcd_path: Path,
    selection: VcdSelection | None = None,
    limits: VcdLimits | None = None,
) -> dict[str, Any]:
    """Parse a VCD file into the ``simulation_log`` structure of the API.

    Args:
        vcd_path: Local path of the VCD file.
        selection: Optional time window, signal subset and decimation.
        limits: Size limits; defaults to :class:`VcdLimits`.

    Returns:
        Dictionary with ``metadata``, ``modules`` and ``timeline`` keys.

    Raises:
        VcdFormatError: If the file cannot be read or is malformed.
    """
    selection = selection or VcdSelection()
    limits = limits or VcdLimits()
    started = time.perf_counter()

    try:
        file_bytes = vcd_path.stat().st_size
    except OSError as exc:
        raise VcdFormatError(f"Could not read VCD file '{vcd_path.name}': {exc}") from exc

    header = _load(vcd_path, only_sigs=True, store_scopes=True)
    metadata: dict[str, Any] = {
        "timescale": {key: _plain(value) for key, value in header.timescale.items()},
        "begintime": 0,
        "endtime": 0,
    }
    modules = _modules(header)
    reasons: list[str] = []

    if file_bytes > limits.max_file_bytes:
        reasons.append(TRUNCATED_BY_FILE_BYTES)
        metadata["file_bytes"] = file_bytes
        _mark_truncated(metadata, reasons)
        _log_metrics(vcd_path, started, file_bytes, 0, 0, reasons)
        return {"metadata": metadata, "modules": modules, "timeline": {}}

    references = _unique(header.signals)
    if selection.signals is not None:
        requested = set(selection.signals)
        known = set(references)
        references = [ref for ref in references if ref in requested]
        ignored = sorted(requested - known)
        if ignored:
            metadata["ignored_signals"] = ignored
    if len(references) > limits.max_signals:
        reasons.append(TRUNCATED_BY_SIGNALS)
        metadata["total_signals"] = len(references)
        references = references[: limits.max_signals]

    # vcdvcd treats an empty signal list as "all signals": skip value storage then.
    vcd = _load(vcd_path, signals=references, store_tvs=bool(references))
    metadata["begintime"] = vcd.begintime
    metadata["endtime"] = vcd.endtime

    timestamps, timeline = _timeline(vcd, references, selection)
    if len(timestamps) > limits.max_timestamps:
        reasons.append(TRUNCATED_BY_TIMESTAMPS)
        metadata["total_timestamps"] = len(timestamps)
        timestamps = timestamps[: limits.max_timestamps]

    _mark_truncated(metadata, reasons)
    result = {
        "metadata": metadata,
        "modules": modules,
        "timeline": {str(stamp): timeline[stamp] for stamp in timestamps},
    }
    _log_metrics(vcd_path, started, file_bytes, len(references), len(timestamps), reasons)
    return result


def _load(vcd_path: Path, **kwargs: Any) -> VCDVCD:
    try:
        return VCDVCD(str(vcd_path), **kwargs)
    except OSError as exc:
        raise VcdFormatError(f"Could not read VCD file '{vcd_path.name}': {exc}") from exc
    except Exception as exc:  # vcdvcd raises bare Exception for some syntax errors
        raise VcdFormatError(f"Malformed VCD file '{vcd_path.name}': {exc}") from exc


def _modules(vcd: VCDVCD) -> dict[str, Any]:
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
                    "references": list(signal.references),
                }
            else:
                child_scopes.append(value.name)
        modules[scope_name] = {
            "name": scope.name,
            "variables": scope_vars,
            "child_scopes": child_scopes,
        }
    return modules


def _timeline(
    vcd: VCDVCD, references: list[str], selection: VcdSelection
) -> tuple[list[int], dict[int, dict[str, str]]]:
    """Build the selected timeline as sorted timestamps plus changes per instant."""
    begin, end = selection.begin_time, selection.end_time
    changes: dict[int, dict[str, str]] = {}
    for reference in references:
        tv = vcd[reference].tv
        start = 0
        if begin is not None:
            # Seed the window with the value held at ``begin``.
            start = bisect_right(tv, begin, key=lambda item: item[0])
            if start:
                changes.setdefault(begin, {})[reference] = tv[start - 1][1]
        for stamp, value in tv[start:]:
            if end is not None and stamp > end:
                break
            changes.setdefault(stamp, {})[reference] = value

    timestamps = sorted(changes)
    if selection.decimation == 1 or len(timestamps) <= 1:
        return timestamps, changes

    kept: list[int] = []
    decimated: dict[int, dict[str, str]] = {}
    pending: dict[str, str] = {}
    last_index = len(timestamps) - 1
    for index, stamp in enumerate(timestamps):
        pending.update(changes[stamp])
        if index % selection.decimation == 0 or index == last_index:
            kept.append(stamp)
            decimated[stamp] = pending
            pending = {}
    return kept, decimated


def _unique(references: list[str]) -> list[str]:
    return list(dict.fromkeys(references))


def _plain(value: Any) -> Any:
    return float(value) if isinstance(value, Decimal) else value


def _mark_truncated(metadata: dict[str, Any], reasons: list[str]) -> None:
    if reasons:
        metadata["truncated"] = True
        metadata["truncation_reason"] = ",".join(reasons)


def _log_metrics(
    vcd_path: Path,
    started: float,
    file_bytes: int,
    signals: int,
    timestamps: int,
    reasons: list[str],
) -> None:
    logger.info(
        "Parsed VCD %s: %.1f ms, %d bytes, %d signals, %d timestamps%s",
        vcd_path.name,
        (time.perf_counter() - started) * 1000,
        file_bytes,
        signals,
        timestamps,
        f", truncated by {','.join(reasons)}" if reasons else "",
    )
