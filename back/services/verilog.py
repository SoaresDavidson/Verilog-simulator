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
        print(cmd)
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
                simulation_log = self._parse_vcd(vcd_path)
        except Exception as e:
            print(f"Error listing or parsing VCD: {e}")

        # 2. Fallback to standard JSON or NDJSON/JSON Lines
        if simulation_log is None:
            log_file = os.path.join(local_dir, "execucao_pipeline.json")
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r", encoding="utf-8") as f:
                        raw_content = f.read()
                    try:
                        # Attempt to parse as single complete JSON block first
                        simulation_log = json.loads(raw_content)
                    except json.JSONDecodeError:
                        # Fallback to line-by-line parsing (NDJSON)
                        simulation_log = []
                        for line in raw_content.splitlines():
                            if line.strip():
                                simulation_log.append(json.loads(line))
                except Exception:
                    pass

        # 3. Fallback to other log formats
        if simulation_log is None:
            for name in ["resultado.txt", "result.txt", "simulado.txt", "simulate.log"]:
                path_check = os.path.join(local_dir, name)
                if os.path.exists(path_check):
                    try:
                        with open(path_check, "r", encoding="utf-8") as f:
                            raw = f.read()
                            try:
                                simulation_log = json.loads(raw)
                            except ValueError:
                                simulation_log = [{"raw_text": raw}]
                        break
                    except Exception:
                        pass

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

    def _parse_vcd(self, vcd_path: str) -> list[dict] | None:
        """
        Parses a VCD file using vcdvcd and extracts cycle-by-cycle signals.
        """
        try:
            from vcdvcd import VCDVCD
        except ImportError:
            # If package is not installed, fail gracefully and return None
            return None

        if not os.path.exists(vcd_path):
            return None

        try:
            vcd = VCDVCD(vcd_path)
            
            # Resolve clock signal. Scope varies, search for suffix '.clk' or '.clock'
            all_signals = list(vcd.references_to_ids.keys())
            matching_clks = [s for s in all_signals if s.endswith((".clk", ".clock"))]
            if not matching_clks:
                return None
            
            clk_path = matching_clks[0]
            tb_scope = clk_path.rsplit('.', 1)[0]
            clk_var = vcd[clk_path]

            # 1. Identify all posedge clk timestamps
            posedge_times = []
            for i in range(1, len(clk_var.tv)):
                time, val = clk_var.tv[i]
                prev_time, prev_val = clk_var.tv[i-1]
                if val == '1' and prev_val == '0':
                    posedge_times.append(time)

            if not posedge_times:
                return None

            # Helper functions to convert VCD format values
            def parse_vcd_val(val):
                if val is None:
                    return 0
                if isinstance(val, str):
                    val = val.strip()
                    if val.startswith('b'):
                        bin_str = val[1:]
                        if 'x' in bin_str or 'z' in bin_str:
                            return 'x'
                        if not bin_str:
                            return 0
                        return int(bin_str, 2)
                    elif val.startswith('r'):
                        return float(val[1:])
                    elif val in ('0', '1'):
                        return int(val)
                return val

            def get_value_at_time(var, target_time):
                if not var or not hasattr(var, 'tv') or not var.tv:
                    return 'x'
                last_val = 'x'
                for time, val in var.tv:
                    if time <= target_time:
                        last_val = val
                    else:
                        break
                return parse_vcd_val(last_val)

            # 2. Identify DUT signals dynamically
            dut_prefix = f"{tb_scope}.dut."
            if not any(s.startswith(dut_prefix) for s in all_signals):
                # Fallback to locate the DUT or Processor instance name
                matching_duts = [s for s in all_signals if '.dut.' in s.lower() or '.cpu.' in s.lower()]
                if matching_duts:
                    if '.dut.' in matching_duts[0].lower():
                        dut_prefix = matching_duts[0].split('.dut.', 1)[0] + '.dut.'
                    else:
                        dut_prefix = matching_duts[0].split('.cpu.', 1)[0] + '.cpu.'
                else:
                    # Fallback to testbench scope itself
                    dut_prefix = f"{tb_scope}."

            tracked_signals = {}
            for ref_name in all_signals:
                if ref_name.startswith(dut_prefix):
                    short_name = ref_name[len(dut_prefix):]
                    if '.' not in short_name:
                        tracked_signals[short_name] = vcd[ref_name]

            # 3. Locate register bank signals dynamically
            reg_signals = {}
            reg_patterns = [".banco_reg.registers[", ".rf.registers[", ".register_bank.registers[", ".registers[", ".regs["]
            reg_prefix = None
            for pattern in reg_patterns:
                matching_regs = [s for s in all_signals if pattern in s]
                if matching_regs:
                    reg_prefix = matching_regs[0].split(pattern, 1)[0] + pattern
                    break

            if reg_prefix:
                for ref_name in all_signals:
                    if ref_name.startswith(reg_prefix) and ref_name.endswith(']'):
                        try:
                            idx_str = ref_name[len(reg_prefix):-1]
                            idx = int(idx_str)
                            reg_signals[idx] = vcd[ref_name]
                        except ValueError:
                            pass

            # 4. Reconstruct simulation cycles log
            simulation_log = []
            for cycle_num, time in enumerate(posedge_times, start=1):
                cycle_state = {
                    "ciclo": cycle_num,
                    "timestamp": time,
                    "pc_atual": get_value_at_time(tracked_signals.get("pc"), time),
                    "instrucao": get_value_at_time(tracked_signals.get("instrucao"), time),
                    "registradores": {}
                }
                
                # Format variables
                inst = cycle_state["instrucao"]
                if isinstance(inst, int):
                    cycle_state["instrucao"] = f"{inst:08x}"
                pc = cycle_state["pc_atual"]
                if isinstance(pc, int):
                    cycle_state["pc_atual"] = f"{pc:08x}"

                # Dynamic signals
                for sig_name, sig_var in tracked_signals.items():
                    if sig_name not in ("pc", "instrucao", "clk", "rst"):
                        cycle_state[sig_name] = get_value_at_time(sig_var, time)

                # Track register values
                for idx in range(32):
                    reg_name = f"x{idx}"
                    if idx in reg_signals:
                        cycle_state["registradores"][reg_name] = get_value_at_time(reg_signals[idx], time)
                    else:
                        cycle_state["registradores"][reg_name] = 0

                simulation_log.append(cycle_state)

            return simulation_log
        except Exception as e:
            print(f"Error parsing VCD in service: {e}")
            return None
