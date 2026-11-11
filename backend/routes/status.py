from typing import Annotated

from fastapi import APIRouter, Depends, Response
from fastapi import status as http_status

from config import settings
from schemas.health import LivenessResponse, StatusResponse
from services.health import HealthConfig, HealthService

router = APIRouter()

_health_service = HealthService(
    HealthConfig(
        yosys_container_name=settings.YOSYS_CONTAINER_NAME,
        icarus_container_name=settings.ICARUS_CONTAINER_NAME,
        runs_dir=settings.VERILOG_RUNS_DIR,
        timeout_seconds=settings.HEALTH_TIMEOUT_SECONDS,
        cache_ttl_seconds=settings.HEALTH_CACHE_TTL_SECONDS,
        execution_mode=settings.EXECUTION_MODE,
        yosys_image=settings.YOSYS_IMAGE,
        icarus_image=settings.ICARUS_IMAGE,
    )
)


def get_health_service() -> HealthService:
    """Return the shared health service so its result cache is reused."""
    return _health_service


type HealthDependency = Annotated[HealthService, Depends(get_health_service)]


@router.get("/live", response_model=LivenessResponse)
def get_liveness() -> LivenessResponse:
    """Report that the process is up, without touching external dependencies."""
    return LivenessResponse(status="alive")


@router.get("/", response_model=StatusResponse)
def get_status(response: Response, service: HealthDependency) -> StatusResponse:
    """Report readiness after checking Docker, both containers and the storage."""
    report = service.check()
    if not report.is_ready:
        response.status_code = http_status.HTTP_503_SERVICE_UNAVAILABLE

    return StatusResponse(
        status=report.status.value,
        checks={
            name: {
                "status": check.status.value,
                "detail": check.detail,
                "container": check.container,
            }
            for name, check in report.checks.items()
        },
        runs=(
            {
                "count": report.runs.count,
                "total_bytes": report.runs.total_bytes,
                "last_collection_at": report.runs.last_collection_at,
                "last_collection_removed": report.runs.last_collection_removed,
            }
            if report.runs is not None
            else None
        ),
    )
