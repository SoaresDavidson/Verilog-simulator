import logging
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from auth import create_session
from config import settings
from integrations.docker import DockerConfig, DockerIntegration
from integrations.icarus import (
    IcarusCompilationError,
    IcarusConfig,
    IcarusIntegration,
    IcarusSimulationError,
    VcdParseError,
)
from integrations.vcd import VcdLimits, VcdSelection
from integrations.yosys import (
    YosysConfig,
    YosysIntegration,
    YosysSynthesisError,
)
from logging_config import truncate_for_log
from schemas.netlist import Netlist
from services.project_upload import (
    UploadLimits,
    extract_project_zip,
    new_run_name,
    open_project_zip,
)
from services.runs_gc import RetentionPolicy, collect_if_due, run_registry

#: Minimum spacing between the collections triggered by uploads.
_OPPORTUNISTIC_GC_INTERVAL_SECONDS = 5 * 60


@dataclass(frozen=True, slots=True)
class UploadedProject:
    """Run created by an accepted upload."""

    project_id: str
    session_token: str


logger = logging.getLogger(__name__)

_MAX_REPORTED_NETLIST_ERRORS = 5


def _describe_netlist_error(exc: ValidationError) -> str:
    """Build an actionable pt-BR message from netlist validation errors."""
    errors = exc.errors(include_url=False, include_input=False)
    details = [
        f"- {'.'.join(str(part) for part in error['loc']) or 'netlist'}: {error['msg']}"
        for error in errors[:_MAX_REPORTED_NETLIST_ERRORS]
    ]
    if len(errors) > _MAX_REPORTED_NETLIST_ERRORS:
        details.append(f"- ... e mais {len(errors) - _MAX_REPORTED_NETLIST_ERRORS} erro(s)")
    return (
        "A netlist gerada pelo Yosys (estrutura.json) não segue o formato esperado "
        "e foi descartada. Isso costuma indicar uma versão incompatível do Yosys "
        "no servidor; avise o professor. Detalhes:\n" + "\n".join(details)
    )


def _log_tool_finished(
    tool: str, project_id: str, started: float, success: bool, stderr: str
) -> None:
    """Log the end of a tool run with its duration; stderr only at DEBUG, truncated."""
    elapsed = time.perf_counter() - started
    if success:
        logger.info("%s de %s concluída em %.2f s.", tool, project_id, elapsed)
    else:
        logger.info("%s de %s terminou com falha em %.2f s.", tool, project_id, elapsed)
    if stderr:
        logger.debug("stderr da %s de %s: %s", tool.lower(), project_id, truncate_for_log(stderr))


class VerilogService:
    def __init__(
        self,
        yosys_integration: YosysIntegration | None = None,
        docker_integration: DockerIntegration | None = None,
        icarus_integration: IcarusIntegration | None = None,
    ):
        self.docker_integration = docker_integration or DockerIntegration(
            DockerConfig(
                docker_host=settings.DOCKER_HOST,
                timeout_seconds=settings.DOCKER_TIMEOUT_SECONDS,
            )
        )
        self.yosys_integration = yosys_integration or YosysIntegration(
            YosysConfig(
                container_name=settings.YOSYS_CONTAINER_NAME,
                timeout_seconds=settings.YOSYS_TIMEOUT_SECONDS,
                verilog_base_dir=settings.VERILOG_RUNS_DIR.parent,
                docker_host=settings.DOCKER_HOST,
            ),
            docker_integration=self.docker_integration,
        )
        self.icarus_integration = icarus_integration or IcarusIntegration(
            IcarusConfig(
                container_name=settings.ICARUS_CONTAINER_NAME,
                timeout_seconds=settings.ICARUS_TIMEOUT_SECONDS,
                verilog_base_dir=settings.VERILOG_RUNS_DIR.parent,
                script_path=settings.ICARUS_SCRIPT_PATH,
                docker_host=settings.DOCKER_HOST,
                vcd_limits=VcdLimits(
                    max_timestamps=settings.VCD_MAX_TIMESTAMPS,
                    max_signals=settings.VCD_MAX_SIGNALS,
                    max_file_bytes=settings.VCD_MAX_FILE_BYTES,
                ),
            ),
            docker_integration=self.docker_integration,
        )

    def mapear_processador(self, project_id: str) -> dict:
        """
        Delegates Yosys synthesis and validates the netlist contract.

        A netlist that does not match ``schemas.netlist.Netlist`` is never
        returned as success: the response becomes ``success: false`` with an
        explanation appended to ``stderr``.
        """
        logger.info("Síntese iniciada para %s.", project_id)
        started = time.perf_counter()
        try:
            result = self.yosys_integration.synthesize(project_id)
        except YosysSynthesisError as exc:
            result = exc.result
        _log_tool_finished("Síntese", project_id, started, result.success, result.stderr)
        response = {
            "success": result.success,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "top_module": None,
            "netlist_content": None,
            "stat_report": result.stat_report,
        }
        if not result.success or result.netlist_content is None:
            response["success"] = False
            return response

        try:
            netlist = Netlist.model_validate(result.netlist_content)
        except ValidationError as exc:
            logger.warning(
                "Netlist de %s fora do contrato (%d erro(s)); primeiros campos: %s",
                project_id,
                exc.error_count(),
                ", ".join(
                    ".".join(str(part) for part in error["loc"])
                    for error in exc.errors(include_input=False)[:_MAX_REPORTED_NETLIST_ERRORS]
                ),
            )
            response["success"] = False
            response["stderr"] = "\n".join(
                part for part in (result.stderr, _describe_netlist_error(exc)) if part
            )
            return response

        response["netlist_content"] = netlist
        response["top_module"] = netlist.top_module
        return response

    def simular_execucao(
        self, project_id: str, selection: VcdSelection | None = None
    ) -> dict:
        """
        Delegates Icarus simulation and preserves the API response contract.

        Compilation and simulation failures are reported as ``success: false``.
        An unparsable VCD is non-fatal: the run result is kept, ``simulation_log``
        is ``None`` and the parse failure is appended to ``stderr``.
        """
        logger.info("Simulação iniciada para %s.", project_id)
        started = time.perf_counter()
        try:
            result = self.icarus_integration.simulate(project_id, selection)
        except (IcarusCompilationError, IcarusSimulationError) as exc:
            result = exc.result
        except VcdParseError as exc:
            result = exc.result
            _log_tool_finished("Simulação", project_id, started, result.success, result.stderr)
            logger.warning("Simulação de %s gerou um VCD ilegível: %s", project_id, exc)
            message = "Aviso: o arquivo VCD gerado pela simulação não pôde ser interpretado."
            return {
                "success": result.success,
                "stdout": result.stdout,
                "stderr": "\n".join(part for part in (result.stderr, message) if part),
                "simulation_log": None,
            }
        _log_tool_finished("Simulação", project_id, started, result.success, result.stderr)
        if result.success and result.simulation_log is None:
            logger.warning("Simulação de %s terminou sem gerar arquivo VCD.", project_id)
        return {
            "success": result.success,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "simulation_log": result.simulation_log,
        }

    def upload_zip_project(self, archive_path: Path) -> UploadedProject:
        """
        Validates and extracts the uploaded archive (already streamed to disk) into a new
        run folder, creates its session and returns the canonical project ID
        (``runs/run_<32hex>``) together with the session token.

        Raises:
            ProjectUploadError: If the archive is invalid, unsafe, too large or has no
                Verilog sources (400/413). Nothing is left in the runs folder.
        """
        limits = UploadLimits(
            max_uncompressed_bytes=settings.MAX_UNCOMPRESSED_BYTES,
            max_entries=settings.MAX_ZIP_ENTRIES,
            max_depth=settings.MAX_ZIP_DEPTH,
            max_path_length=settings.MAX_ZIP_PATH_LENGTH,
            max_compression_ratio=settings.MAX_COMPRESSION_RATIO,
        )
        # Best-effort housekeeping, in case the periodic task is not running (#10).
        collect_if_due(
            settings.VERILOG_RUNS_DIR,
            RetentionPolicy.from_settings(settings),
            min_interval_seconds=_OPPORTUNISTIC_GC_INTERVAL_SECONDS,
        )

        run_name = new_run_name()
        with run_registry.in_use(run_name), open_project_zip(archive_path) as archive:
            project_id = extract_project_zip(
                archive, settings.VERILOG_RUNS_DIR, limits, run_name=run_name
            )
            run_dir = settings.VERILOG_RUNS_DIR / run_name
            try:
                session_token = create_session(run_dir)
            except BaseException:
                shutil.rmtree(run_dir, ignore_errors=True)
                raise
        return UploadedProject(project_id=project_id, session_token=session_token)

    def delete_project(self, project_id: str) -> bool:
        """
        Safely deletes the entire run directory associated with the project ID to clean up session files.
        """
        # Safely resolve the paths to ensure the project resides in our runs directory
        normalized_path = os.path.normpath(project_id).replace("\\", "/")
        parts = normalized_path.split("/")
        
        # Verify it starts with runs/run_
        if len(parts) >= 2 and parts[0] == "runs" and parts[1].startswith("run_"):
            root_folder_name = parts[1]
            root_folder_path = os.path.join(str(settings.VERILOG_RUNS_DIR), root_folder_name)
            if os.path.exists(root_folder_path):
                shutil.rmtree(root_folder_path, ignore_errors=True)
                return True
        return False

    def clean_all_runs(self) -> dict:
        """
        Deletes all directories and files inside the shared /verilog_code/runs directory
        to clean up leftover session data.
        """
        runs_dir = str(settings.VERILOG_RUNS_DIR)
        if not os.path.exists(runs_dir):
            return {"deleted_count": 0, "status": "Directory does not exist", "deleted_folders": [], "errors": []}

        deleted_folders = []
        errors = []
        for name in os.listdir(runs_dir):
            path = os.path.join(runs_dir, name)
            # Only remove subfolders starting with "run_" for safety
            if os.path.isdir(path) and name.startswith("run_"):
                try:
                    shutil.rmtree(path)
                    deleted_folders.append(name)
                except OSError as e:
                    # Reported to the admin without the OS message (it carries paths).
                    logger.warning("Falha ao remover o run %s: %s", name, e)
                    errors.append(f"Falha ao remover {name}.")

        return {
            "deleted_count": len(deleted_folders),
            "deleted_folders": deleted_folders,
            "errors": errors
        }
