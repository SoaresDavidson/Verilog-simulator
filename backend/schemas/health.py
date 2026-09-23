from pydantic import BaseModel, Field


class CheckResponse(BaseModel):
    status: str = Field(..., description="Check severity: 'ok', 'degraded' or 'error'")
    detail: str | None = Field(None, description="Human readable outcome of the check")
    container: str | None = Field(
        None, description="Docker container inspected by the check, when applicable"
    )


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
        description=(
            "Result per dependency: `docker_daemon`, `yosys`, `icarus` and `storage`"
        ),
    )


class LivenessResponse(BaseModel):
    status: str = Field(..., description="Always 'alive' when the process is running")
