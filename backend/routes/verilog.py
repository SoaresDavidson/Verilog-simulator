import zipfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from integrations.docker import DockerIntegrationError
from integrations.yosys import YosysError
from schemas.verilog import (
    MapearProcessadorRequest,
    MapearProcessadorResponse,
    SimularExecucaoRequest,
    SimularExecucaoResponse,
    UploadZipResponse,
)
from services.verilog import VerilogService

router = APIRouter()


def get_verilog_service() -> VerilogService:
    return VerilogService()


type ServiceDependency = Annotated[VerilogService, Depends(get_verilog_service)]
type ProjectUpload = Annotated[
    UploadFile,
    File(description="ZIP archive containing Verilog files and 'scripts' subfolder"),
]

@router.post("/mapear-processador", response_model=MapearProcessadorResponse)
def mapear_processador(
    payload: MapearProcessadorRequest,
    service: ServiceDependency,
):
    try:
        result = service.mapear_processador(payload.project_id)
        return MapearProcessadorResponse(
            success=result["success"],
            stdout=result["stdout"],
            stderr=result["stderr"],
            netlist_content=result["netlist_content"]
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except YosysError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@router.post("/simular-execucao", response_model=SimularExecucaoResponse)
def simular_execucao(
    payload: SimularExecucaoRequest,
    service: ServiceDependency,
):
    try:
        result = service.simular_execucao(payload.project_id)
        return SimularExecucaoResponse(
            success=result["success"],
            stdout=result["stdout"],
            stderr=result["stderr"],
            simulation_log=result["simulation_log"]
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DockerIntegrationError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@router.post("/upload-projeto-zip", response_model=UploadZipResponse)
async def upload_projeto_zip(
    file: ProjectUpload,
    service: ServiceDependency,
):
    if not (file.filename or "").endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP archive files (.zip) are supported.")
    try:
        zip_bytes = await file.read()
        project_id = service.upload_zip_project(zip_bytes)
        return UploadZipResponse(
            project_id=project_id,
            message="ZIP project uploaded and extracted successfully. Use the project_id to run mapping and simulation."
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (OSError, zipfile.BadZipFile, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to process and upload project ZIP: {e!s}")

@router.delete("/projeto/{project_id:path}")
def deletar_projeto(
    project_id: str,
    service: ServiceDependency,
):
    try:
        success = service.delete_project(project_id)
        if not success:
            raise HTTPException(status_code=404, detail="Project run directory not found or invalid project ID.")
        return {"success": True, "message": "Project run directory successfully deleted."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project directory: {e!s}")

@router.post("/limpar")
def limpar_todas_execucoes(
    service: ServiceDependency,
):
    try:
        result = service.clean_all_runs()
        return {
            "success": True,
            "message": f"Successfully deleted {result['deleted_count']} run folder(s).",
            "details": result
        }
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to perform cleanup: {e!s}")
