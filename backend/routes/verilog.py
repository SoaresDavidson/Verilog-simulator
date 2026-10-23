import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from body_limit import too_large_message
from config import settings
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

_UPLOAD_CHUNK_SIZE = 64 * 1024


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
                "Arquivo rejeitado: não é ZIP, está vazio/corrompido, contém caminhos "
                "inseguros, profundidade excessiva, compressão suspeita ou nenhum .v/.sv."
            )
        },
        413: {
            "description": (
                "Upload, total descompactado ou número de entradas acima do limite."
            )
        },
    },
)
async def upload_projeto_zip(
    file: ProjectUpload,
    service: ServiceDependency,
):
    """Recebe um projeto compactado e cria uma sessão isolada (UC01).

    O upload é gravado em disco em blocos, sem nunca ser carregado inteiro em
    memória. Fontes podem estar na raiz do ZIP ou em subpastas; o `project_id`
    devolvido é sempre `runs/run_<32 hex>`.
    """
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Envie o projeto como um arquivo .zip.")

    temp_path = await _stream_upload_to_temp_file(file, settings.MAX_UPLOAD_BYTES)
    try:
        project_id = await run_in_threadpool(service.upload_zip_project, temp_path)
    except ProjectUploadError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e
    except OSError as e:
        raise HTTPException(
            status_code=500, detail="Falha ao gravar o projeto enviado."
        ) from e
    finally:
        temp_path.unlink(missing_ok=True)
    return UploadZipResponse(
        project_id=project_id,
        message=(
            "Projeto enviado com sucesso. Use o project_id para mapear e simular."
        ),
    )


async def _stream_upload_to_temp_file(file: UploadFile, limit_bytes: int) -> Path:
    """Copy the upload to a temporary file in chunks, aborting past ``limit_bytes``."""
    written = 0
    with tempfile.NamedTemporaryFile(
        prefix="upload_", suffix=".zip", delete=False
    ) as temp_file:
        temp_path = Path(temp_file.name)
        try:
            while chunk := await file.read(_UPLOAD_CHUNK_SIZE):
                written += len(chunk)
                if written > limit_bytes:
                    raise HTTPException(
                        status_code=413, detail=too_large_message(limit_bytes)
                    )
                temp_file.write(chunk)
        except BaseException:
            temp_file.close()
            temp_path.unlink(missing_ok=True)
            raise
    return temp_path


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
