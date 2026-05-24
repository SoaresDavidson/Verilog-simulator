from decimal import Decimal
import subprocess
import os
import docker
import zipfile
import io
import uuid
import shutil
import json
from config import settings

class VerilogService:
    def __init__(self):
        try:
            # Connect to Docker daemon using configured host or fallback to environment variables
            if settings.DOCKER_HOST:
                self.docker_client = docker.DockerClient(base_url=settings.DOCKER_HOST)
            else:
                self.docker_client = docker.from_env()
        except Exception as e:
            self.docker_client = None
            self.docker_error = f"Could not connect to Docker daemon: {str(e)}"

    def _resolve_paths(self, folder_path: str) -> tuple[str, str]:
        """
        Resolves the local path for reading files, and the corresponding /verilog_code path
        inside the yosys and icarus-verilog containers.
        Returns: (local_dir_path, container_dir_path)
        """
        # Safety Check: The folder_path (which represents our project_id) must be a safe relative path
        # starting with "runs/run_" to prevent path traversal and restrict access to dedicated run folders.
        normalized_path = os.path.normpath(folder_path).replace("\\", "/")
        if ".." in normalized_path.split("/") or normalized_path.startswith("/") or normalized_path.startswith("./"):
            raise ValueError("Invalid project ID: directory traversal detected.")
            
        if not normalized_path.startswith("runs/run_"):
            raise ValueError("Unauthorized access: project ID must reside inside 'runs/run_'.")

        # 1. Resolve path locally in the backend container
        local_path = os.path.abspath(os.path.join("/verilog_code", normalized_path))
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Project path '{normalized_path}' not found at '{local_path}'.")

        if not os.path.isdir(local_path):
            raise NotADirectoryError(f"Path '{local_path}' is not a directory.")

        # 2. Get relative path from /verilog_code to map it to the container's /verilog_code
        base_dir = "/verilog_code"
        rel_path = os.path.relpath(local_path, base_dir)
        container_path = os.path.join("/verilog_code", rel_path).replace("\\", "/")
        return local_path, container_path

    def _run_command_in_container(self, container_name: str, cmd: list[str], workdir: str) -> dict:
        """
        Helper method to run commands in a specific Docker container.
        """
        if not self.docker_client:
            raise RuntimeError(f"Docker client is not available. Error: {getattr(self, 'docker_error', 'Unknown')}")

        try:
            container = self.docker_client.containers.get(container_name)
        except docker.errors.NotFound:
            raise RuntimeError(f"Target container '{container_name}' is not running/found. Check docker-compose.")
        except Exception as e:
            raise RuntimeError(f"Error accessing container '{container_name}': {str(e)}")

        if container.status != "running":
            raise RuntimeError(f"Target container '{container_name}' is in status '{container.status}', it must be running.")

        try:
            # Execute command inside container
            result = container.exec_run(cmd=cmd, workdir=workdir, demux=True)
            stdout = result.output[0].decode("utf-8", errors="replace") if result.output and result.output[0] else ""
            stderr = result.output[1].decode("utf-8", errors="replace") if result.output and result.output[1] else ""
            return {
                "success": (result.exit_code == 0),
                "exit_code": result.exit_code,
                "stdout": stdout,
                "stderr": stderr
            }
        except Exception as e:
            raise RuntimeError(f"Failed to execute command in container '{container_name}': {str(e)}")

    def mapear_processador(self, project_id: str) -> dict:
        """
        Executes Yosys synthesis/mapping dynamically inside the 'yosys' container,
        using the student's project folder as the working directory.
        """
        local_dir, container_dir = self._resolve_paths(project_id)
        
        # Find all .v and .sv files in the local student folder recursively
        v_files = []
        for root, dirs, files in os.walk(local_dir):
            for file in files:
                if file.endswith((".v", ".sv")):
                    rel_path = os.path.relpath(os.path.join(root, file), local_dir).replace("\\", "/")
                    v_files.append(rel_path)

        if not v_files:
            raise FileNotFoundError(f"No Verilog (.v or .sv) files found in '{local_dir}' for mapping.")

        # Construct dynamic commands for Yosys execution
        yosys_cmds = []
        for f in v_files:
            yosys_cmds.append(f"read_verilog -sv {f}")
        
        yosys_cmds.append("hierarchy -auto-top")
        yosys_cmds.append("tee -o relatorio.txt stat")
        yosys_cmds.append("write_json estrutura.json")
        
        # Run Yosys inside the yosys container using the compiled command list
        cmd = ["yosys", "-p", "; ".join(yosys_cmds)]
        run_res = self._run_command_in_container(
            container_name="yosys",
            cmd=cmd,
            workdir=container_dir
        )

        # Read the generated structure JSON or fall back to netlist files
        netlist_content = None
        structure_file = os.path.join(local_dir, "estrutura.json")
        if os.path.exists(structure_file):
            try:
                with open(structure_file, "r", encoding="utf-8") as f:
                    netlist_content = json.load(f)
            except Exception:
                pass
        
        # Fallback to other possible netlist files if structure.json is not found
        if netlist_content is None:
            for name in ["netlist.json", "netlist.v", "mapped.v", "relatorio.txt"]:
                path_check = os.path.join(local_dir, name)
                if os.path.exists(path_check):
                    try:
                        with open(path_check, "r", encoding="utf-8") as f:
                            raw = f.read()
                            try:
                                netlist_content = json.loads(raw)
                            except ValueError:
                                netlist_content = {"raw_text": raw}
                        break
                    except Exception:
                        pass

        return {
            "success": run_res["success"],
            "stdout": run_res["stdout"],
            "stderr": run_res["stderr"],
            "netlist_content": netlist_content
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
        run_res = self._run_command_in_container(
            container_name="icarus-verilog",
            cmd=cmd,
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
        except Exception as e:
            print(f"Error listing or parsing VCD: {e}")
        return {
            "success": run_res["success"],
            "stdout": run_res["stdout"],
            "stderr": run_res["stderr"],
            "simulation_log": simulation_log
        }

    def upload_zip_project(self, zip_bytes: bytes) -> str:
        """
        Unzips a project archive into a run folder inside the shared verilog_code directory,
        validates security limits, and returns a safe project ID (relative path) pointing to the
        extracted sources.
        """
        # Create a unique run directory name inside /verilog_code/runs
        temp_folder_name = f"run_{uuid.uuid4().hex}"
        temp_folder_path = os.path.join("/verilog_code", "runs", temp_folder_name)
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
            project_id = os.path.relpath(target_path, "/verilog_code").replace("\\", "/")
            return project_id
        except Exception as e:
            # In case of validation or extraction error, clean up the created run folder
            if os.path.exists(temp_folder_path):
                shutil.rmtree(temp_folder_path, ignore_errors=True)
            raise e

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
            root_folder_path = os.path.join("/verilog_code", "runs", root_folder_name)
            if os.path.exists(root_folder_path):
                shutil.rmtree(root_folder_path, ignore_errors=True)
                return True
        return False

    def clean_all_runs(self) -> dict:
        """
        Deletes all directories and files inside the shared /verilog_code/runs directory
        to clean up leftover session data.
        """
        runs_dir = "/verilog_code/runs"
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
                except Exception as e:
                    errors.append(f"Failed to delete {name}: {str(e)}")

        return {
            "deleted_count": len(deleted_folders),
            "deleted_folders": deleted_folders,
            "errors": errors
        }

    def _parse_vcd(self, vcd_path: str, output_path: str | None = "ciclos.json") -> list[dict] | None:
        from vcdvcd import VCDVCD
        import json
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
        if output_path:
            with open(output_path, "w") as f:
                f.write(json_str)
        return json.loads(json_str)
