"""Testes de resolve_project_dir, delete_project e clean_all_runs."""

from pathlib import Path

import pytest

from config import settings
from integrations.projects import resolve_project_dir
from services.verilog import VerilogService


def _resolve(project_id: str) -> tuple[Path, str]:
    return resolve_project_dir(settings.VERILOG_RUNS_DIR.parent, project_id)


def test_resolve_paths_returns_local_and_container_paths(service: VerilogService, verilog_project: Path) -> None:
    local, container = _resolve("runs/run_test")

    assert local == verilog_project.resolve()
    assert container == "/verilog_code/runs/run_test"


@pytest.mark.parametrize("project_id", ["runs/../etc", "../runs/run_x", "/runs/run_x", "runs/run_a/../../x"])
def test_resolve_paths_rejects_traversal(service: VerilogService, project_id: str) -> None:
    with pytest.raises(ValueError):
        _resolve(project_id)


def test_resolve_paths_rejects_outside_runs(service: VerilogService) -> None:
    with pytest.raises(ValueError):
        _resolve("other/run_x")


def test_resolve_paths_missing_project(service: VerilogService) -> None:
    with pytest.raises(FileNotFoundError):
        _resolve("runs/run_missing")


def test_resolve_paths_file_is_not_directory(service: VerilogService, runs_dir: Path) -> None:
    (runs_dir / "run_file").write_text("x")

    with pytest.raises(NotADirectoryError):
        _resolve("runs/run_file")


def test_delete_project_removes_run(service: VerilogService, verilog_project: Path) -> None:
    assert service.delete_project("runs/run_test/sub") is True
    assert not verilog_project.exists()


def test_delete_project_unknown_or_invalid_returns_false(service: VerilogService, runs_dir: Path) -> None:
    assert service.delete_project("runs/run_missing") is False
    assert service.delete_project("outside/run_x") is False


def test_clean_all_runs_only_removes_run_folders(service: VerilogService, runs_dir: Path) -> None:
    (runs_dir / "run_a").mkdir()
    (runs_dir / "run_b").mkdir()
    (runs_dir / "keep").mkdir()

    result = service.clean_all_runs()

    assert result["deleted_count"] == 2
    assert sorted(result["deleted_folders"]) == ["run_a", "run_b"]
    assert (runs_dir / "keep").exists()


def test_clean_all_runs_missing_dir(service: VerilogService, runs_dir: Path) -> None:
    runs_dir.rmdir()

    assert service.clean_all_runs()["deleted_count"] == 0
