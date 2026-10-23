import io
import logging
import os
import shutil
import uuid
import zipfile

from config import settings
from integrations.docker import DockerConfig, DockerIntegration
from integrations.icarus import (
    IcarusCompilationError,
    IcarusConfig,
    IcarusIntegration,
    IcarusSimulationError,
    VcdParseError,
)
from integrations.yosys import (
    YosysConfig,
    YosysIntegration,
    YosysSynthesisError,
)

logger = logging.getLogger(__name__)


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
            ),
            docker_integration=self.docker_integration,
        )

    def mapear_processador(self, project_id: str) -> dict:
        """
        Delegates Yosys synthesis and preserves the API response contract.
        """
        try:
            result = self.yosys_integration.synthesize(project_id)
        except YosysSynthesisError as exc:
            result = exc.result
        return {
            "success": result.success,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "netlist_content": result.netlist_content,
        }

    def simular_execucao(self, project_id: str) -> dict:
        """
        Delegates Icarus simulation and preserves the API response contract.

        Compilation and simulation failures are reported as ``success: false``.
        An unparsable VCD is non-fatal: the run result is kept, ``simulation_log``
        is ``None`` and the parse failure is appended to ``stderr``.
        """
        try:
            result = self.icarus_integration.simulate(project_id)
        except (IcarusCompilationError, IcarusSimulationError) as exc:
            result = exc.result
        except VcdParseError as exc:
            logger.warning("Simulation of %s produced an unparsable VCD: %s", project_id, exc)
            result = exc.result
            message = "Aviso: o arquivo VCD gerado pela simulação não pôde ser interpretado."
            return {
                "success": result.success,
                "stdout": result.stdout,
                "stderr": "\n".join(part for part in (result.stderr, message) if part),
                "simulation_log": None,
            }
        return {
            "success": result.success,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "simulation_log": result.simulation_log,
        }

    def upload_zip_project(self, zip_bytes: bytes) -> str:
        """
        Unzips a project archive into a run folder inside the shared verilog_code directory,
        validates security limits, and returns a safe project ID (relative path) pointing to the
        extracted sources.
        """
        # Create a unique run directory name inside /verilog_code/runs
        temp_folder_name = f"run_{uuid.uuid4().hex}"
        temp_folder_path = os.path.join(str(settings.VERILOG_RUNS_DIR), temp_folder_name)
        os.makedirs(temp_folder_path, exist_ok=True)
        
        try:
            # Extract the zip file safely
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zip_ref:
                # 1. Zip Bomb Prevention: Limit decompressed size to 50MB
                total_uncompressed_size = sum(zinfo.file_size for zinfo in zip_ref.infolist())
                MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024  # 50 MB
                if total_uncompressed_size > MAX_UNCOMPRESSED_SIZE:
                    raise ValueError("Security limit exceeded: ZIP archive decompressed size is too large.")

                # 2. Zip Slip Prevention: Verify all paths resolve inside the target directory
                temp_folder_abs = os.path.abspath(temp_folder_path)
                for member in zip_ref.namelist():
                    member_abs = os.path.abspath(os.path.join(temp_folder_abs, member))
                    if not member_abs.startswith(temp_folder_abs):
                        raise ValueError(f"Security violation: ZIP entry '{member}' attempts directory traversal.")
                
                # Perform safe extraction
                zip_ref.extractall(temp_folder_path)
                
            # Handle possible nested directories (if zip was created by archiving the root folder itself)
            target_path = temp_folder_path
            v_files_root = [f for f in os.listdir(target_path) if f.endswith((".v", ".sv"))]
            if not v_files_root:
                subdirs = [d for d in os.listdir(target_path) if os.path.isdir(os.path.join(target_path, d))]
                subdirs = [d for d in subdirs if not d.startswith(".")]
                if len(subdirs) == 1:
                    target_path = os.path.join(target_path, subdirs[0])

            # Return the safe project ID (relative path from /verilog_code)
            project_id = os.path.relpath(target_path, str(settings.VERILOG_RUNS_DIR.parent)).replace("\\", "/")
            return project_id
        except Exception:
            # In case of validation or extraction error, clean up the created run folder
            if os.path.exists(temp_folder_path):
                shutil.rmtree(temp_folder_path, ignore_errors=True)
            raise

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
                    errors.append(f"Failed to delete {name}: {e!s}")

        return {
            "deleted_count": len(deleted_folders),
            "deleted_folders": deleted_folders,
            "errors": errors
        }
