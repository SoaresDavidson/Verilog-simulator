from pydantic import BaseModel, Field
from typing import Any


class MapearProcessadorRequest(BaseModel):
    project_id: str = Field(..., description="The unique project ID/folder path returned from the ZIP upload endpoint")

class MapearProcessadorResponse(BaseModel):
    success: bool = Field(..., description="Whether the synthesis/mapping process succeeded")
    stdout: str = Field(..., description="Console standard output from Yosys")
    stderr: str = Field(..., description="Console standard error/warnings from Yosys")
    netlist_content: Any = Field(None, description="The structural netlist JSON object parsed directly from estrutura.json")

class SimularExecucaoRequest(BaseModel):
    project_id: str = Field(..., description="The unique project ID/folder path returned from the ZIP upload endpoint")

class SimularExecucaoResponse(BaseModel):
    success: bool = Field(..., description="Whether the simulation script succeeded")
    stdout: str = Field(..., description="Console standard output from the simulation run")
    stderr: str = Field(..., description="Console standard error/warnings from the simulation run")
    simulation_log: Any = Field(
        None, 
        description="The parsed VCD simulation log object containing:\n\n"
                    "- **metadata**: Details about the simulation run, including `timescale` (with timescale in seconds, magnitude, unit, factor), `begintime`, and `endtime`.\n"
                    "- **modules**: The design's hierarchical scopes tree. Each module contains `variables` (signals with size, type, and references in that scope) and `child_scopes` (nested child modules/scopes).\n"
                    "- **timeline**: A temporal log mapping each timestamp string to a dictionary of signal name/value changes at that instant."
    )

class UploadZipResponse(BaseModel):
    project_id: str = Field(..., description="The unique project ID/folder path created for this session's project")
    message: str = Field(..., description="Success message and instructions")
