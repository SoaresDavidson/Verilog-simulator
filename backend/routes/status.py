from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def get_status():
    return {
        "status": "online",
        "dependencies": {
            "icarus_verilog": "available",
            "yosys": "available"
        }
    }
