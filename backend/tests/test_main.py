"""Startup of the API."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from config import settings
from main import app, ensure_runs_dir


def test_startup_creates_missing_runs_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A fresh clone has no verilog_code/runs; the API creates it on startup."""
    runs_dir = tmp_path / "verilog_code" / "runs"
    monkeypatch.setattr(settings, "VERILOG_RUNS_DIR", runs_dir)
    monkeypatch.setattr(settings, "GC_INTERVAL_MINUTES", 0)

    with TestClient(app):
        assert runs_dir.is_dir()


def test_ensure_runs_dir_failure_is_not_fatal(tmp_path: Path) -> None:
    """A path that cannot be created is logged, not raised."""
    blocker = tmp_path / "file"
    blocker.write_text("")

    ensure_runs_dir(blocker / "runs")

    assert not (blocker / "runs").exists()
