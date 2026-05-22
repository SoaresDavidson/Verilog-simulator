import subprocess
import os
import docker
import zipfile
import io
import uuid
import shutil
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
        # 1. Resolve path locally in the backend container
        local_path = os.path.abspath(folder_path)
        if not os.path.exists(local_path):
            alt_path = os.path.abspath(os.path.join("/verilog_code", folder_path))
            if os.path.exists(alt_path):
                local_path = alt_path
            else:
                alt_path2 = os.path.abspath(os.path.join(os.getcwd(), folder_path))
                if os.path.exists(alt_path2):
                    local_path = alt_path2
                else:
                    raise FileNotFoundError(
                        f"Folder '{folder_path}' not found locally at: {folder_path}, "
                        f"/verilog_code/{folder_path}, or ./{folder_path}"
                    )

        if not os.path.isdir(local_path):
            raise NotADirectoryError(f"Path '{local_path}' is not a directory.")

        # 2. Get relative path from /verilog_code to map it to the container's /verilog_code
        base_dir = "/verilog_code"
        # Ensure we are operating inside the shared verilog_code directory
        if local_path == base_dir:
            return local_path, "/verilog_code"
        elif local_path.startswith(base_dir + os.sep) or local_path.startswith(base_dir + "/"):
            rel_path = os.path.relpath(local_path, base_dir)
            container_path = os.path.join("/verilog_code", rel_path).replace("\\", "/")
            return local_path, container_path
        else:
            raise ValueError(
                f"Path '{folder_path}' is not inside the shared 'verilog_code' directory. "
                f"Please ensure it is under {base_dir}"
            )

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

    def mapear_processador(self, folder_path: str) -> dict:
        """
        Executes the global Yosys mapping script `/workspace/scripts/mapear_hardware.ys`
        inside the 'yosys' container, using the student's folder as the working directory.
        """
        local_dir, container_dir = self._resolve_paths(folder_path)
        
        # Verify global script exists on the backend host mount
        global_script = "/scripts/mapear_hardware.ys"
        if not os.path.exists(global_script):
            raise FileNotFoundError("Global Yosys script not found at '/scripts/mapear_hardware.ys'")

        # Run Yosys inside the yosys container using the global script
        cmd = ["yosys", "-s", "/scripts/mapear_hardware.ys"]
        run_res = self._run_command_in_container(
            container_name="yosys",
            cmd=cmd,
            workdir=container_dir
        )

        # Search for generated output files (e.g. estrutura.json, relatorio.txt, netlist.v) in the project directory
        netlist_content = None
        for name in ["estrutura.json", "relatorio.txt", "netlist.v", "netlist.json", "mapped.v"]:
            path_check = os.path.join(local_dir, name)
            if os.path.exists(path_check):
                try:
                    with open(path_check, "r", encoding="utf-8") as f:
                        netlist_content = f.read()
                    break
                except Exception:
                    pass

        return {
            "success": run_res["success"],
            "stdout": run_res["stdout"],
            "stderr": run_res["stderr"],
            "netlist_content": netlist_content
        }

    def simular_execucao(self, folder_path: str) -> dict:
        """
        Executes the global simulation script `/workspace/scripts/simular.sh`
        inside the 'icarus-verilog' container, using the student's folder as the working directory.
        """
        local_dir, container_dir = self._resolve_paths(folder_path)

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

        # Search for generated simulation log/result file in the project directory
        simulation_log = None
        for name in ["execucao_pipeline.json", "resultado.txt", "result.txt", "simulado.txt", "simulate.log", "simulation.log", "simulacao.log"]:
            path_check = os.path.join(local_dir, name)
            if os.path.exists(path_check):
                try:
                    with open(path_check, "r", encoding="utf-8") as f:
                        simulation_log = f.read()
                    break
                except Exception:
                    pass

        return {
            "success": run_res["success"],
            "stdout": run_res["stdout"],
            "stderr": run_res["stderr"],
            "simulation_log": simulation_log
        }



    def process_zip_project(self, zip_bytes: bytes) -> dict:
        """
        Unzips a project archive into a run folder inside the shared verilog_code directory,
        executes both the mapping (Yosys) and simulation scripts, and keeps the generated files.
        """
        # Create a unique run directory name inside /verilog_code/runs
        temp_folder_name = f"run_{uuid.uuid4().hex}"
        temp_folder_path = os.path.join("/verilog_code", "runs", temp_folder_name)
        os.makedirs(temp_folder_path, exist_ok=True)
        
        try:
            # Extract the zip file in memory safely
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zip_ref:
                # 1. Zip Bomb Prevention: Limit decompressed size to 50MB
                total_uncompressed_size = sum(zinfo.file_size for zinfo in zip_ref.infolist())
                MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024 # 50 MB
                if total_uncompressed_size > MAX_UNCOMPRESSED_SIZE:
                    raise ValueError("Security limit exceeded: ZIP archive decompressed size is too large.")

                # 2. Zip Slip Prevention (Directory Traversal): Verify all paths resolve inside target_path
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

                        
            # Run synthesis and mapping
            mapping_result = self.mapear_processador(target_path)
            
            # Run simulation
            simulation_result = self.simular_execucao(target_path)
            print(target_path)
            return {
                "yosys": mapping_result,
                "simulation": simulation_result,
                "run_folder": temp_folder_name
            }
        except Exception as e:
            raise e
