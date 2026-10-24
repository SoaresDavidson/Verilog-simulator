from datetime import datetime

from pydantic import BaseModel, Field


class CheckResponse(BaseModel):
    status: str = Field(..., description="Check severity: 'ok', 'degraded' or 'error'")
    detail: str | None = Field(None, description="Human readable outcome of the check")
    container: str | None = Field(None, description="Docker container inspected by the check, when applicable")


class RunsStatusResponse(BaseModel):
    count: int = Field(..., description="Number of run folders currently stored")
    total_bytes: int = Field(..., description="Disk space used by the runs, in bytes")
    last_collection_at: datetime | None = Field(None, description="When the automatic collection last finished (UTC)")
    last_collection_removed: int | None = Field(None, description="Runs removed by the last automatic collection")


class StatusResponse(BaseModel):
    status: str = Field(
        ...,
        description=(
            "Aggregated readiness: 'ok' (every dependency healthy), "
            "'degraded' (usable with limitations) or 'error' (cannot execute)"
        ),
    )
    checks: dict[str, CheckResponse] = Field(
        ...,
        description=("Result per dependency: `docker_daemon`, `yosys`, `icarus` and `storage`"),
    )
    runs: RunsStatusResponse | None = Field(None, description="Run storage usage and last automatic collection")


class LivenessResponse(BaseModel):
    status: str = Field(..., description="Always 'alive' when the process is running")
