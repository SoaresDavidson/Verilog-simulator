import io
import json
import os
import shutil
import zipfile
from decimal import Decimal

from config import settings
from integrations.docker import DockerConfig, DockerIntegration
from integrations.yosys import (
    YosysConfig,
    YosysIntegration,
    YosysSynthesisError,
)
from services.project_upload import ProjectUploadError, extract_project_zip


class VerilogService:
    def __init__(
        self,
        yosys_integration: YosysIntegration | None = None,
        docker_integration: DockerIntegration | None = None,
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

    def _resolve_paths(self, folder_path: str) -> tuple[str, str]:
        """
        Resolves the local path for reading files, and the corresponding /verilog_code path
        inside the yosys and icarus-verilog containers.
        Returns: (local_dir_path, container_dir_path)
        """
        # Safety Check: The folder_path (which represents our project_id) must be a safe relative path
        # starting with "runs/run_" to prevent path traversal and restrict access to dedicated run folders.
        normalized_path = os.path.normpath(folder_path).replace("\\", "/")
        if ".." in normalized_path.split("/") or normalized_path.startswith(("/", "./")):
            raise ValueError("Invalid project ID: directory traversal detected.")
            
        if not normalized_path.startswith("runs/run_"):
            raise ValueError("Unauthorized access: project ID must reside inside 'runs/run_'.")

        # 1. Resolve path locally in the backend container
        base_dir = str(settings.VERILOG_RUNS_DIR.parent)
        local_path = os.path.abspath(os.path.join(base_dir, normalized_path))
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Project path '{normalized_path}' not found at '{local_path}'.")

        if not os.path.isdir(local_path):
            raise NotADirectoryError(f"Path '{local_path}' is not a directory.")

        # 2. Get relative path from /verilog_code to map it to the container's /verilog_code
        rel_path = os.path.relpath(local_path, base_dir)
        container_path = os.path.join("/verilog_code", rel_path).replace("\\", "/")
        return local_path, container_path

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
        Executes the global simulation script `/scripts/simular.sh`
        inside the 'icarus-verilog' container, using the student's project folder as the working directory.
        """
        local_dir, container_dir = self._resolve_paths(project_id)

        # Verify global script exists on the backend host mount
        global_script = "/scripts/simular.sh"
        if not os.path.exists(global_script):
            raise FileNotFoundError("Global simulation script not found at '/scripts/simular.sh'")

        # Find all .v and .sv files in the local student folder recursively to pass as arguments
        v_files = []
        for root, dirs, files in os.walk(local_dir):
            for file in files:
                if file.endswith((".v", ".sv")):
                    rel_path = os.path.relpath(os.path.join(root, file), local_dir).replace("\\", "/")
                    v_files.append(rel_path)

        if not v_files:
            raise FileNotFoundError(f"No Verilog (.v or .sv) files found in '{local_dir}' for simulation.")

        # Run simulation using the global script with Verilog files as arguments
        cmd = ["bash", "/scripts/simular.sh"] + v_files
        run_res = self.docker_integration.execute(
            container_name="icarus-verilog",
            command=cmd,
            workdir=container_dir
        )

        # Read the simulation log (either standard JSON or NDJSON/JSON Lines)
        simulation_log = None
        
        # 1. Try to find and parse VCD files first
        try:
            vcd_files = [f for f in os.listdir(local_dir) if f.endswith(".vcd")]
            if vcd_files:
                vcd_path = os.path.join(local_dir, vcd_files[0])
                # print(f"Found VCD file for parsing: {vcd_path}")
                simulation_log = self._parse_vcd(vcd_path)
        except (OSError, ValueError, KeyError, IndexError, TypeError) as e:
            print(f"Error listing or parsing VCD: {e}")
        return {
            "success": run_res.success,
            "stdout": run_res.stdout,
            "stderr": run_res.stderr,
            "simulation_log": simulation_log
        }

    def upload_zip_project(self, zip_bytes: bytes) -> str:
        """
        Validates and extracts a project archive into a new run folder and returns its
        canonical project ID (``runs/run_<32hex>``).

        Raises:
            ProjectUploadError: If the archive is corrupted, empty or has no Verilog sources.
        """
        try:
            archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except (zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
            raise ProjectUploadError(
                "O arquivo enviado não é um ZIP válido ou está corrompido."
            ) from exc
        with archive:
            return extract_project_zip(archive, settings.VERILOG_RUNS_DIR)

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

    def _parse_vcd(self, vcd_path: str, output_path: str | None = None, debug: bool = False) -> dict | None:
        from vcdvcd import VCDVCD
        vcd = VCDVCD(vcd_path, store_scopes=True)
        
        modules = {}
        for scope_name, scope in vcd.scopes.items():
            scope_vars = {}
            child_scopes = []
            for name, val in scope.subElements.items():
                if isinstance(val, str):
                    sig = vcd[val]
                    scope_vars[name] = {
                        "size": sig.size,
                        "var_type": sig.var_type,
                        "references": sig.references
                    }
                else:
                    child_scopes.append(val.name)
            
            modules[scope_name] = {
                "name": scope.name,
                "variables": scope_vars,
                "child_scopes": child_scopes
            }

        timeline = {}
        for signal_name in vcd.signals:
            signal = vcd[signal_name]
            for timestamp, value in signal.tv:
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
                def default(self, obj):
                    if isinstance(obj, Decimal):
                        return float(obj)
                    return super().default(obj)

        json_str = json.dumps(data, indent=2, cls=DecimalEncoder)
        if debug:
            output_path = output_path or "ciclos.json"
            with open(output_path, "w") as f:
                f.write(json_str)
        return json.loads(json_str)
