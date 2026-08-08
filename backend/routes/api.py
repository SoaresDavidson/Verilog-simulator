from fastapi import APIRouter

from routes import status, verilog

api_router = APIRouter()
api_router.include_router(status.router, prefix="/status", tags=["status"])
api_router.include_router(verilog.router, prefix="/verilog", tags=["verilog"])
