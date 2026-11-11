import logging
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from auth import (
    AuthorizedRun,
    request_origin,
    require_admin,
    require_run_in_use_from_body,
    require_run_session_from_path,
)
from body_limit import UPLOAD_TOO_LARGE_CODE, too_large_message
from config import settings
from errors import ApiError
from integrations.vcd import VcdSelection
from logging_config import bind_project_id
from schemas.verilog import (
    MapearProcessadorRequest,
    MapearProcessadorResponse,
    SimularExecucaoRequest,
    SimularExecucaoResponse,
    UploadZipResponse,
)
from services.verilog import VerilogService

logger = logging.getLogger(__name__)

router = APIRouter()

_UPLOAD_CHUNK_SIZE = 64 * 1024


def get_verilog_service() -> VerilogService:
    return VerilogService()


type ServiceDependency = Annotated[VerilogService, Depends(get_verilog_service)]
type ProjectUpload = Annotated[
    UploadFile,
    File(description="ZIP archive containing Verilog files and 'scripts' subfolder"),
]

_RUN_AUTH_RESPONSES = {
    401: {"description": "Header X-Session-Token ausente"},
    403: {"description": "Token de sessão não pertence ao run"},
    404: {"description": "Run inexistente"},
}
_TOOL_RESPONSES = {
    **_RUN_AUTH_RESPONSES,
    408: {"description": "A ferramenta excedeu o tempo limite (YOSYS_TIMEOUT / ICARUS_TIMEOUT)"},
    503: {"description": "Container da ferramenta ou Docker indisponível"},
}


@router.post(
    "/mapear-processador",
    response_model=MapearProcessadorResponse,
    dependencies=[Depends(require_run_in_use_from_body)],
    responses=_TOOL_RESPONSES,
)
def mapear_processador(
    payload: MapearProcessadorRequest,
    service: ServiceDependency,
):
    """Sintetiza o projeto com o Yosys. Erros seguem o formato `{"error": {"code", "message", "request_id"}}`."""
    bind_project_id(payload.project_id)
    result = service.mapear_processador(payload.project_id)
    return MapearProcessadorResponse(
        success=result["success"],
        stdout=result["stdout"],
        stderr=result["stderr"],
        top_module=result["top_module"],
        netlist_content=result["netlist_content"],
        stat_report=result["stat_report"],
    )


@router.post(
    "/simular-execucao",
    response_model=SimularExecucaoResponse,
    dependencies=[Depends(require_run_in_use_from_body)],
    responses=_TOOL_RESPONSES,
)
def simular_execucao(
    payload: SimularExecucaoRequest,
    service: ServiceDependency,
):
    """Simula o projeto com o Icarus Verilog. Erros seguem o formato `{"error": {"code", "message", "request_id"}}`."""
    bind_project_id(payload.project_id)
    selection = VcdSelection(
        begin_time=payload.begin_time,
        end_time=payload.end_time,
        signals=tuple(payload.signals) if payload.signals is not None else None,
        decimation=payload.decimation,
    )
    result = service.simular_execucao(payload.project_id, selection)
    return SimularExecucaoResponse(
        success=result["success"],
        stdout=result["stdout"],
        stderr=result["stderr"],
        simulation_log=result["simulation_log"],
    )


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
        413: {"description": ("Upload, total descompactado ou número de entradas acima do limite.")},
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
        raise ApiError(400, "INVALID_UPLOAD", "Envie o projeto como um arquivo .zip.")

    temp_path = await _stream_upload_to_temp_file(file, settings.MAX_UPLOAD_BYTES)
    try:
        uploaded = await run_in_threadpool(service.upload_zip_project, temp_path)
    except OSError as e:
        # ProjectUploadError (400/413) is translated by errors.py; this keeps the
        # specific message for storage failures (logged with the traceback).
        logger.exception("Falha ao gravar o projeto enviado.")
        raise ApiError(500, "UPLOAD_STORAGE_ERROR", "Falha ao gravar o projeto enviado.") from e
    finally:
        temp_path.unlink(missing_ok=True)
    bind_project_id(uploaded.project_id)
    logger.info("Projeto enviado e extraído.")
    return UploadZipResponse(
        project_id=uploaded.project_id,
        session_token=uploaded.session_token,
        message=(
            "Projeto enviado com sucesso. Use o project_id e o session_token "
            "(header X-Session-Token) para mapear, simular e excluir."
        ),
    )


async def _stream_upload_to_temp_file(file: UploadFile, limit_bytes: int) -> Path:
    """Copy the upload to a temporary file in chunks, aborting past ``limit_bytes``."""
    written = 0
    with tempfile.NamedTemporaryFile(prefix="upload_", suffix=".zip", delete=False) as temp_file:
        temp_path = Path(temp_file.name)
        try:
            while chunk := await file.read(_UPLOAD_CHUNK_SIZE):
                written += len(chunk)
                if written > limit_bytes:
                    raise ApiError(413, UPLOAD_TOO_LARGE_CODE, too_large_message(limit_bytes))
                temp_file.write(chunk)
        except BaseException:
            temp_file.close()
            temp_path.unlink(missing_ok=True)
            raise
    return temp_path


@router.delete(
    "/projeto/{project_id:path}",
    responses=_RUN_AUTH_RESPONSES,
)
def deletar_projeto(
    run: Annotated[AuthorizedRun, Depends(require_run_session_from_path)],
    service: ServiceDependency,
):
    """Apaga o run da sessão; exige o header `X-Session-Token` do dono."""
    bind_project_id(run.project_id)
    try:
        success = service.delete_project(run.project_id)
    except OSError as e:
        logger.exception("Falha ao excluir o projeto.")
        raise ApiError(500, "DELETE_FAILED", "Falha ao excluir o projeto.") from e
    if not success:
        raise ApiError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado.")
    logger.info("Projeto excluído.")
    return {"success": True, "message": "Projeto excluído com sucesso."}


@router.post(
    "/limpar",
    dependencies=[Depends(require_admin)],
    responses={
        401: {"description": "Header X-Admin-Token ausente"},
        403: {"description": "Token de administrador inválido"},
        404: {"description": "Rota desabilitada: ADMIN_TOKEN não configurado"},
    },
)
def limpar_todas_execucoes(
    request: Request,
    service: ServiceDependency,
):
    """Apaga todos os runs. Rota administrativa: exige `X-Admin-Token`."""
    try:
        result = service.clean_all_runs()
    except OSError as e:
        logger.exception("Falha ao executar a limpeza global.")
        raise ApiError(500, "CLEANUP_FAILED", "Falha ao executar a limpeza.") from e
    logger.warning(
        "Limpeza global executada por %s: %d run(s) removido(s), %d erro(s).",
        request_origin(request),
        result["deleted_count"],
        len(result["errors"]),
    )
    return {
        "success": True,
        "message": f"{result['deleted_count']} run(s) removido(s).",
        "details": result,
    }
