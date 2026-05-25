from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
import os
from schemas.verilog import (
    MapearProcessadorRequest,
    MapearProcessadorResponse,
    SimularExecucaoRequest,
    SimularExecucaoResponse,
    UploadZipResponse
)
from services.verilog import VerilogService

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

@router.post(
    "/simular-execucao",
    responses={
        200: {
            "description": "Simulation succeeded. Returns the simulation results (metadata, module scopes, and timeline dict) directly as a JSON file stream.",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "metadata": {
                                "type": "object",
                                "description": "Simulation run details"
                            },
                            "modules": {
                                "type": "object",
                                "description": "Design module structure and variables hierarchy"
                            },
                            "timeline": {
                                "type": "object",
                                "description": "A temporal log mapping each timestamp string to a dictionary of signal name/value changes at that instant."
                            }
                        }
                    }
                }
            }
        },
        400: {
            "model": SimularExecucaoResponse,
            "description": "Simulation or compilation failed. Returns standard output logs and error logs."
        }
    }
)
def simular_execucao(
    payload: SimularExecucaoRequest,
    service: VerilogService = Depends(VerilogService)
):
    try:
        result = service.simular_execucao(payload.project_id)
        if result["success"]:
            json_path = result["json_path"]
            if not json_path or not os.path.exists(json_path):
                raise HTTPException(status_code=500, detail="Simulation succeeded but output JSON file could not be found.")
            return FileResponse(
                path=json_path,
                media_type="application/json",
                filename="ciclos.json"
            )
        else:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "stdout": result["stdout"],
                    "stderr": result["stderr"],
                    "simulation_log": None
                }
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

