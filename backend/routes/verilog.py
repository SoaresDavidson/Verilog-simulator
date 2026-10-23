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
from services.project_upload import ProjectUploadError
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

@router.post(
    "/upload-projeto-zip",
    response_model=UploadZipResponse,
    responses={
        400: {
            "description": (
                "Arquivo rejeitado: não é ZIP, está vazio/corrompido ou não contém "
                "nenhum arquivo .v/.sv."
            )
        },
    },
)
async def upload_projeto_zip(
    file: ProjectUpload,
    service: ServiceDependency,
):
    """Recebe um projeto compactado e cria uma sessão isolada (UC01).

    Fontes podem estar na raiz do ZIP ou em subpastas; o `project_id` devolvido é
    sempre `runs/run_<32 hex>`.
    """
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Envie o projeto como um arquivo .zip.")
    try:
        zip_bytes = await file.read()
        project_id = service.upload_zip_project(zip_bytes)
    except ProjectUploadError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except OSError as e:
        raise HTTPException(
            status_code=500, detail="Falha ao gravar o projeto enviado."
        ) from e
    return UploadZipResponse(
        project_id=project_id,
        message=(
            "Projeto enviado com sucesso. Use o project_id para mapear e simular."
        ),
    )

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
