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
    simulation_log: Any = Field(None, description="The list of cycle state objects parsed from the simulation log")

class UploadZipResponse(BaseModel):
    project_id: str = Field(..., description="The unique project ID/folder path created for this session's project")
    message: str = Field(..., description="Success message and instructions")
