from pydantic import BaseModel, Field


class MapearProcessadorRequest(BaseModel):
    folder_path: str = Field(..., description="Relative or absolute folder path inside the shared verilog_code directory")

class MapearProcessadorResponse(BaseModel):
    success: bool = Field(..., description="Whether the synthesis/mapping process succeeded")
    stdout: str = Field(..., description="Console standard output from Yosys")
    stderr: str = Field(..., description="Console standard error/warnings from Yosys")
    netlist_content: str | None = Field(None, description="Content of the generated netlist file (e.g. netlist.v), if any")

class SimularExecucaoRequest(BaseModel):
    folder_path: str = Field(..., description="Relative or absolute folder path inside the shared verilog_code directory")

class SimularExecucaoResponse(BaseModel):
    success: bool = Field(..., description="Whether the simulation script succeeded")
    stdout: str = Field(..., description="Console standard output from the simulation run")
    stderr: str = Field(..., description="Console standard error/warnings from the simulation run")
    simulation_log: str | None = Field(None, description="Content of the simulation log/results file (e.g. resultado.txt), if any")

class ExecutarZipResponse(BaseModel):
    yosys: MapearProcessadorResponse = Field(..., description="Results from mapping script run inside yosys container")
    simulation: SimularExecucaoResponse = Field(..., description="Results from simulation script run inside icarus-verilog container")
    run_folder: str | None = Field(None, description="Name of the persisted run folder under /verilog_code/runs")
