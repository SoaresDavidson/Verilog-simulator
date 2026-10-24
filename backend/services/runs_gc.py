"""Automatic collection of expired run folders (#10).

The core is :func:`collect_runs`, a function that only depends on its arguments
(directory, policy, clock, registry and remover), so it can be tested in
isolation. :func:`collect_and_record` adds logging and keeps the last report for
the status endpoint; :func:`periodic_collection` is the loop started by the
FastAPI lifespan.
"""

import asyncio
import logging
import os
import shutil
import threading
import time
from collections import Counter
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

#: Only folders with this prefix are ever considered (same guard as ``/limpar``).
RUN_PREFIX = "run_"


@dataclass(frozen=True, slots=True)
class RetentionPolicy:
    """How long runs are kept and how much disk they may use."""

    ttl_seconds: float = 6 * 3600
    max_total_bytes: int = 0

    @classmethod
    def from_settings(cls, settings: object) -> "RetentionPolicy":
        """Build the policy from ``RUN_TTL_HOURS`` and ``RUNS_MAX_TOTAL_BYTES``."""
        return cls(
            ttl_seconds=settings.RUN_TTL_HOURS * 3600,
            max_total_bytes=settings.RUNS_MAX_TOTAL_BYTES,
        )

    def __post_init__(self) -> None:
        """Validate configuration values."""
        if self.ttl_seconds < 0:
            raise ValueError("Run TTL cannot be negative.")
        if self.max_total_bytes < 0:
            raise ValueError("Runs size cap cannot be negative.")


@dataclass(frozen=True, slots=True)
class RunInfo:
    """Snapshot of one run folder."""

    name: str
    path: Path
    last_used: float
    size_bytes: int


@dataclass(frozen=True, slots=True)
class RunsUsage:
    """Number of runs and the disk space they use."""

    count: int
    total_bytes: int


@dataclass(frozen=True, slots=True)
class CollectionReport:
    """Outcome of one collection."""

    finished_at: datetime
    removed: tuple[str, ...] = ()
    freed_bytes: int = 0
    skipped_in_use: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()
    remaining: RunsUsage = field(default_factory=lambda: RunsUsage(0, 0))

    @property
    def removed_count(self) -> int:
        """Number of runs removed."""
        return len(self.removed)


class RunRegistry:
    """In-memory registry of runs being used by a request.

    The collector removes a run only while holding the registry lock and only
    when nobody marked it, so a run cannot be removed in the middle of an
    upload, a synthesis or a simulation.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: Counter[str] = Counter()

    @contextmanager
    def in_use(self, run_name: str) -> Iterator[None]:
        """Mark ``run_name`` as in use for the duration of the block."""
        with self._lock:
            self._active[run_name] += 1
        try:
            yield
        finally:
            with self._lock:
                self._active[run_name] -= 1
                if self._active[run_name] <= 0:
                    del self._active[run_name]

    def is_in_use(self, run_name: str) -> bool:
        """Tell whether a request currently uses ``run_name``."""
        with self._lock:
            return self._active[run_name] > 0

    def remove_if_idle(self, run_name: str, remover: Callable[[], None]) -> bool:
        """Call ``remover`` unless the run is in use; return whether it ran."""
        with self._lock:
            if self._active[run_name] > 0:
                return False
            remover()
            return True


def _walk_run(path: Path) -> tuple[float, int]:
    """Return the newest mtime and total size of everything below ``path``.

    The run folder's own mtime does not change when files inside it are
    rewritten, so every entry is inspected. Entries that vanish meanwhile are
    ignored.
    """
    newest = path.lstat().st_mtime
    total = 0
    for root, dirs, files in os.walk(path, onerror=lambda _error: None):
        for name in (*dirs, *files):
            try:
                stat = os.lstat(os.path.join(root, name))
            except OSError:
                continue
            newest = max(newest, stat.st_mtime)
            if name in files:
                total += stat.st_size
    return newest, total


def scan_runs(runs_dir: Path) -> list[RunInfo]:
    """List the ``run_*`` folders of ``runs_dir`` (symlinks are ignored)."""
    try:
        entries = list(os.scandir(runs_dir))
    except FileNotFoundError:
        return []
    runs: list[RunInfo] = []
    for entry in entries:
        if not entry.name.startswith(RUN_PREFIX):
            continue
        try:
            if not entry.is_dir(follow_symlinks=False):
                continue
            last_used, size = _walk_run(Path(entry.path))
        except OSError:
            continue
        runs.append(RunInfo(entry.name, Path(entry.path), last_used, size))
    return runs


def measure_runs(runs_dir: Path) -> RunsUsage:
    """Count the runs of ``runs_dir`` and the bytes they use."""
    runs = scan_runs(runs_dir)
    return RunsUsage(len(runs), sum(run.size_bytes for run in runs))


def collect_runs(
    runs_dir: Path,
    policy: RetentionPolicy,
    *,
    now: float | None = None,
    registry: RunRegistry | None = None,
    remover: Callable[[Path], None] = shutil.rmtree,
) -> CollectionReport:
    """Remove expired runs, then the oldest ones while above the size cap.

    Args:
        runs_dir: Folder holding the ``run_*`` directories.
        policy: TTL (``0`` disables it) and total size cap (``0`` disables it).
        now: Current epoch time; defaults to :func:`time.time`.
        registry: Runs in use; they are never removed, whatever their age.
        remover: Function deleting one run folder.

    Returns:
        What was removed, skipped and what failed. A failure to remove one run
        is recorded and does not stop the collection of the others.
    """
    now = time.time() if now is None else now
    registry = registry or RunRegistry()
    runs = sorted(scan_runs(runs_dir), key=lambda run: run.last_used)

    removed: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []
    freed = 0
    kept: list[RunInfo] = []

    def try_remove(run: RunInfo) -> bool:
        nonlocal freed
        try:
            done = registry.remove_if_idle(run.name, lambda: remover(run.path))
        except OSError as exc:
            errors.append(f"{run.name}: {exc.strerror or exc}")
            return False
        if not done:
            skipped.append(run.name)
            return False
        removed.append(run.name)
        freed += run.size_bytes
        return True

    for run in runs:
        expired = policy.ttl_seconds > 0 and now - run.last_used > policy.ttl_seconds
        if not (expired and try_remove(run)):
            kept.append(run)

    total = sum(run.size_bytes for run in kept)
    if policy.max_total_bytes > 0 and total > policy.max_total_bytes:
        survivors: list[RunInfo] = []
        for run in kept:  # oldest first
            if total > policy.max_total_bytes and run.name not in skipped and try_remove(run):
                total -= run.size_bytes
            else:
                survivors.append(run)
        kept = survivors

    return CollectionReport(
        finished_at=datetime.now(UTC),
        removed=tuple(removed),
        freed_bytes=freed,
        skipped_in_use=tuple(dict.fromkeys(skipped)),
        errors=tuple(errors),
        remaining=RunsUsage(len(kept), sum(run.size_bytes for run in kept)),
    )


class CollectionState:
    """Last collection report, shared with the status endpoint."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._running = threading.Lock()
        self._last_report: CollectionReport | None = None
        self._last_monotonic: float | None = None

    @property
    def last_report(self) -> CollectionReport | None:
        """Report of the most recent collection, if any ran."""
        with self._lock:
            return self._last_report

    def seconds_since_last(self) -> float | None:
        """Seconds elapsed since the last collection finished."""
        with self._lock:
            if self._last_monotonic is None:
                return None
            return time.monotonic() - self._last_monotonic

    def try_begin(self) -> bool:
        """Claim the right to collect; ``False`` if a collection is running."""
        return self._running.acquire(blocking=False)

    def end(self) -> None:
        """Release the claim taken by :meth:`try_begin`."""
        self._running.release()

    def record(self, report: CollectionReport) -> None:
        """Store the report of a finished collection."""
        with self._lock:
            self._last_report = report
            self._last_monotonic = time.monotonic()


#: Process-wide registry and state used by the API.
run_registry = RunRegistry()
collection_state = CollectionState()


def collect_and_record(
    runs_dir: Path,
    policy: RetentionPolicy,
    *,
    registry: RunRegistry = run_registry,
    state: CollectionState = collection_state,
) -> CollectionReport | None:
    """Run one collection, log it and store its report.

    Returns ``None`` without doing anything when another collection is already
    running in this process.
    """
    if not state.try_begin():
        return None
    try:
        report = collect_runs(runs_dir, policy, registry=registry)
        state.record(report)
    finally:
        state.end()

    log = logger.warning if report.errors else logger.info
    log(
        "Coleta de runs: %d removido(s), %d byte(s) liberado(s), %d em uso "
        "preservado(s), %d erro(s); restam %d run(s) com %d byte(s).%s",
        report.removed_count,
        report.freed_bytes,
        len(report.skipped_in_use),
        len(report.errors),
        report.remaining.count,
        report.remaining.total_bytes,
        f" Erros: {'; '.join(report.errors)}" if report.errors else "",
    )
    return report


def collect_if_due(
    runs_dir: Path,
    policy: RetentionPolicy,
    min_interval_seconds: float,
    *,
    registry: RunRegistry = run_registry,
    state: CollectionState = collection_state,
) -> CollectionReport | None:
    """Best-effort collection (e.g. on upload) unless one ran recently."""
    elapsed = state.seconds_since_last()
    if elapsed is not None and elapsed < min_interval_seconds:
        return None
    try:
        return collect_and_record(runs_dir, policy, registry=registry, state=state)
    except Exception:  # never break the caller over housekeeping
        logger.exception("Falha na coleta oportunista de runs.")
        return None


async def periodic_collection(
    runs_dir: Callable[[], Path],
    policy: Callable[[], RetentionPolicy],
    interval_seconds: float,
) -> None:
    """Collect runs forever, every ``interval_seconds`` (first run immediately)."""
    while True:
        try:
            await asyncio.to_thread(collect_and_record, runs_dir(), policy())
        except Exception:  # keep the loop alive
            logger.exception("Falha na coleta periódica de runs.")
        await asyncio.sleep(interval_seconds)
