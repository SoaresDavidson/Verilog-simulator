"""Testes do coletor de runs expirados (#10)."""

import logging
import os
from pathlib import Path

import pytest

from services.runs_gc import (
    CollectionState,
    RetentionPolicy,
    RunRegistry,
    collect_and_record,
    collect_if_due,
    collect_runs,
    measure_runs,
)

NOW = 1_700_000_000.0
HOUR = 3600.0


def _make_run(runs_dir: Path, name: str, age_hours: float, size: int = 10) -> Path:
    """Cria um run com um arquivo e define o mtime de tudo para ``age_hours`` atrás."""
    run = runs_dir / name
    (run / "src").mkdir(parents=True)
    (run / "src" / "top.v").write_bytes(b"x" * size)
    stamp = NOW - age_hours * HOUR
    for path in (run / "src" / "top.v", run / "src", run):
        os.utime(path, (stamp, stamp))
    return run


def test_expired_run_is_removed_and_recent_is_kept(tmp_path: Path) -> None:
    """Run além do TTL é removido; run recente é preservado."""
    old = _make_run(tmp_path, "run_old", age_hours=7)
    recent = _make_run(tmp_path, "run_new", age_hours=1)

    report = collect_runs(tmp_path, RetentionPolicy(ttl_seconds=6 * HOUR), now=NOW)

    assert report.removed == ("run_old",)
    assert report.freed_bytes == 10
    assert not old.exists()
    assert recent.exists()
    assert report.remaining.count == 1


def test_newest_mtime_inside_the_run_is_used(tmp_path: Path) -> None:
    """Arquivo interno reescrito mantém o run vivo mesmo com a pasta antiga."""
    run = _make_run(tmp_path, "run_active", age_hours=10)
    recent = NOW - 0.5 * HOUR
    os.utime(run / "src" / "top.v", (recent, recent))

    report = collect_runs(tmp_path, RetentionPolicy(ttl_seconds=6 * HOUR), now=NOW)

    assert report.removed == ()
    assert run.exists()


def test_folders_without_run_prefix_are_never_removed(tmp_path: Path) -> None:
    """Somente diretórios `run_*` são considerados, mesmo muito antigos."""
    other = _make_run(tmp_path, "importante", age_hours=100)
    (tmp_path / "run_arquivo_solto").write_text("x")

    report = collect_runs(tmp_path, RetentionPolicy(ttl_seconds=HOUR, max_total_bytes=1), now=NOW)

    assert report.removed == ()
    assert other.exists()
    assert (tmp_path / "run_arquivo_solto").exists()


def test_run_in_use_is_kept_beyond_ttl(tmp_path: Path) -> None:
    """Run marcado como em uso nunca é coletado."""
    run = _make_run(tmp_path, "run_busy", age_hours=50)
    registry = RunRegistry()

    with registry.in_use("run_busy"):
        report = collect_runs(tmp_path, RetentionPolicy(ttl_seconds=HOUR), now=NOW, registry=registry)

    assert run.exists()
    assert report.skipped_in_use == ("run_busy",)
    assert not registry.is_in_use("run_busy")


def test_removal_failure_is_reported_and_does_not_stop(tmp_path: Path) -> None:
    """Falha ao remover um run entra no relatório e os demais são coletados."""
    _make_run(tmp_path, "run_a", age_hours=10)
    _make_run(tmp_path, "run_b", age_hours=9)
    removed: list[str] = []

    def remover(path: Path) -> None:
        if path.name == "run_a":
            raise PermissionError(13, "Permission denied")
        removed.append(path.name)

    report = collect_runs(tmp_path, RetentionPolicy(ttl_seconds=HOUR), now=NOW, remover=remover)

    assert removed == ["run_b"]
    assert report.removed == ("run_b",)
    assert len(report.errors) == 1
    assert report.errors[0].startswith("run_a")


def test_size_cap_removes_oldest_first(tmp_path: Path) -> None:
    """Com teto de bytes, remove do mais antigo para o mais novo até caber."""
    _make_run(tmp_path, "run_1", age_hours=3, size=100)
    _make_run(tmp_path, "run_2", age_hours=2, size=100)
    _make_run(tmp_path, "run_3", age_hours=1, size=100)

    report = collect_runs(tmp_path, RetentionPolicy(ttl_seconds=0, max_total_bytes=150), now=NOW)

    assert report.removed == ("run_1", "run_2")
    assert report.remaining.total_bytes == 100
    assert (tmp_path / "run_3").exists()


def test_size_cap_skips_runs_in_use(tmp_path: Path) -> None:
    """O teto pula runs em uso e segue para o próximo mais antigo."""
    _make_run(tmp_path, "run_1", age_hours=3, size=100)
    _make_run(tmp_path, "run_2", age_hours=2, size=100)
    registry = RunRegistry()

    with registry.in_use("run_1"):
        report = collect_runs(
            tmp_path,
            RetentionPolicy(ttl_seconds=0, max_total_bytes=150),
            now=NOW,
            registry=registry,
        )

    assert report.removed == ("run_2",)
    assert (tmp_path / "run_1").exists()


def test_zero_ttl_disables_expiration(tmp_path: Path) -> None:
    """TTL zero desliga a expiração por idade."""
    run = _make_run(tmp_path, "run_old", age_hours=1000)

    collect_runs(tmp_path, RetentionPolicy(ttl_seconds=0), now=NOW)

    assert run.exists()


def test_missing_runs_dir_is_an_empty_collection(tmp_path: Path) -> None:
    """Diretório de runs inexistente não é erro."""
    report = collect_runs(tmp_path / "nada", RetentionPolicy(), now=NOW)

    assert report.removed == () and report.errors == ()
    assert measure_runs(tmp_path / "nada").count == 0


def test_collect_and_record_logs_and_stores_report(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Cada coleta é registrada em log e guardada para o status."""
    run = _make_run(tmp_path, "run_old", age_hours=1)
    os.utime(run, (0, 0))
    os.utime(run / "src", (0, 0))
    os.utime(run / "src" / "top.v", (0, 0))
    state = CollectionState()

    with caplog.at_level(logging.INFO, logger="services.runs_gc"):
        report = collect_and_record(
            tmp_path,
            RetentionPolicy(ttl_seconds=HOUR),
            registry=RunRegistry(),
            state=state,
        )

    assert report is not None and report.removed == ("run_old",)
    assert state.last_report is report
    assert any("1 removido(s)" in record.getMessage() for record in caplog.records)


def test_collect_if_due_is_throttled(tmp_path: Path) -> None:
    """A coleta oportunista não roda de novo dentro do intervalo mínimo."""
    state = CollectionState()
    registry = RunRegistry()
    policy = RetentionPolicy()

    first = collect_if_due(tmp_path, policy, 60, registry=registry, state=state)
    second = collect_if_due(tmp_path, policy, 60, registry=registry, state=state)

    assert first is not None
    assert second is None


def test_concurrent_collection_is_skipped(tmp_path: Path) -> None:
    """Se outra coleta está em andamento, a nova não roda."""
    state = CollectionState()
    assert state.try_begin()
    try:
        assert collect_and_record(tmp_path, RetentionPolicy(), state=state) is None
    finally:
        state.end()


def test_policy_from_settings_and_validation() -> None:
    """Política vem das variáveis de ambiente e rejeita valores negativos."""

    class FakeSettings:
        RUN_TTL_HOURS = 2
        RUNS_MAX_TOTAL_BYTES = 10

    policy = RetentionPolicy.from_settings(FakeSettings())

    assert policy == RetentionPolicy(ttl_seconds=7200, max_total_bytes=10)
    with pytest.raises(ValueError):
        RetentionPolicy(ttl_seconds=-1)


def test_measure_runs_counts_bytes(tmp_path: Path) -> None:
    """A medição soma o tamanho dos arquivos de todos os runs."""
    _make_run(tmp_path, "run_a", age_hours=0, size=7)
    _make_run(tmp_path, "run_b", age_hours=0, size=5)

    usage = measure_runs(tmp_path)

    assert (usage.count, usage.total_bytes) == (2, 12)


def test_registry_counts_nested_marks() -> None:
    """Marcações aninhadas só liberam o run quando todas terminam."""
    registry = RunRegistry()
    with registry.in_use("run_x"):
        with registry.in_use("run_x"):
            pass
        assert registry.is_in_use("run_x")
    assert not registry.is_in_use("run_x")
