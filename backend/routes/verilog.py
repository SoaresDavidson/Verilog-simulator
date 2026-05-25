from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from schemas.verilog import (
    MapearProcessadorRequest,
    MapearProcessadorResponse,
    SimularExecucaoRequest,
    SimularExecucaoResponse,
    UploadZipResponse
)
from services.verilog import VerilogService
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/mapear-processador", response_model=MapearProcessadorResponse)
def mapear_processador(
    payload: MapearProcessadorRequest,
    service: VerilogService = Depends(VerilogService)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simular-execucao", response_model=SimularExecucaoResponse)
def simular_execucao(
    payload: SimularExecucaoRequest,
    service: VerilogService = Depends(VerilogService)
):
    """
    Executa a simulação Verilog com Icarus e, em seguida, tenta gerar
    automaticamente a netlist estrutural (mesmo processo de /mapear-processador).

    A netlist é retornada no campo `netlist_content` junto com o resultado
    da simulação, eliminando a necessidade de uma chamada separada.
    Se a geração da netlist falhar, o campo retorna null mas a simulação
    permanece válida.
    """
    try:
        # 1. Executa a simulação principal (Icarus Verilog → VCD → parse)
        result = service.simular_execucao(payload.project_id)

        # 2. Tenta gerar a netlist estrutural automaticamente.
        #    Usa o mesmo service que /mapear-processador.
        #    Erros aqui são não-fatais: a simulação já rodou com sucesso.
        netlist_content = None
        if result.get("success"):
            try:
                map_result = service.mapear_processador(payload.project_id)
                if map_result.get("success"):
                    netlist_content = map_result.get("netlist_content")
                    logger.info(
                        "[simular-execucao] Netlist gerada com sucesso para project_id=%s",
                        payload.project_id
                    )
                else:
                    logger.warning(
                        "[simular-execucao] Mapeamento não teve sucesso para project_id=%s. "
                        "stderr: %s",
                        payload.project_id,
                        map_result.get("stderr", "")[:300]
                    )
            except Exception as map_exc:
                # Netlist é opcional — não deixa a simulação falhar por isso
                logger.warning(
                    "[simular-execucao] Erro ao gerar netlist (não-fatal): %s",
                    str(map_exc)
                )

        return SimularExecucaoResponse(
            success=result["success"],
            stdout=result["stdout"],
            stderr=result["stderr"],
            simulation_log=result["simulation_log"],
            netlist_content=netlist_content
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-projeto-zip", response_model=UploadZipResponse)
async def upload_projeto_zip(
    file: UploadFile = File(..., description="ZIP archive containing Verilog files and 'scripts' subfolder"),
    service: VerilogService = Depends(VerilogService)
):
    if not file.filename.endswith(".zip"):
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process and upload project ZIP: {str(e)}")


@router.delete("/projeto/{project_id:path}")
def deletar_projeto(
    project_id: str,
    service: VerilogService = Depends(VerilogService)
):
    try:
        success = service.delete_project(project_id)
        if not success:
            raise HTTPException(status_code=404, detail="Project run directory not found or invalid project ID.")
        return {"success": True, "message": "Project run directory successfully deleted."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project directory: {str(e)}")


@router.post("/limpar")
def limpar_todas_execucoes(
    service: VerilogService = Depends(VerilogService)
):
    try:
        result = service.clean_all_runs()
        return {
            "success": True,
            "message": f"Successfully deleted {result['deleted_count']} run folder(s).",
            "details": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to perform cleanup: {str(e)}")