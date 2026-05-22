from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from schemas.verilog import (
    MapearProcessadorRequest,
    MapearProcessadorResponse,
    SimularExecucaoRequest,
    SimularExecucaoResponse,
    ExecutarZipResponse
)
from services.verilog import VerilogService

router = APIRouter()

@router.post("/mapear-processador", response_model=MapearProcessadorResponse)
def mapear_processador(
    payload: MapearProcessadorRequest,
    service: VerilogService = Depends(VerilogService)
):
    try:
        result = service.mapear_processador(payload.folder_path)
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
    try:
        result = service.simular_execucao(payload.folder_path)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/executar-projeto-zip", response_model=ExecutarZipResponse)
async def executar_projeto_zip(
    file: UploadFile = File(..., description="ZIP archive containing the verilog project files and a 'scripts' subfolder"),
    service: VerilogService = Depends(VerilogService)
):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP archive files (.zip) are supported.")
    try:
        zip_bytes = await file.read()
        result = service.process_zip_project(zip_bytes)
        
        yosys_res = MapearProcessadorResponse(
            success=result["yosys"]["success"],
            stdout=result["yosys"]["stdout"],
            stderr=result["yosys"]["stderr"],
            netlist_content=result["yosys"]["netlist_content"]
        )
        
        sim_res = SimularExecucaoResponse(
            success=result["simulation"]["success"],
            stdout=result["simulation"]["stdout"],
            stderr=result["simulation"]["stderr"],
            simulation_log=result["simulation"]["simulation_log"]
        )
        
        return ExecutarZipResponse(
            yosys=yosys_res,
            simulation=sim_res,
            run_folder=result.get("run_folder")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process and execute project ZIP: {str(e)}")
