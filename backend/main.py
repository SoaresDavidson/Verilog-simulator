import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from body_limit import BodySizeLimitMiddleware
from config import settings
from routes.api import api_router
from services.runs_gc import RetentionPolicy, periodic_collection


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run the periodic collection of expired runs while the API is up (#10)."""
    task: asyncio.Task[None] | None = None
    if settings.GC_INTERVAL_MINUTES > 0:
        task = asyncio.create_task(
            periodic_collection(
                lambda: settings.VERILOG_RUNS_DIR,
                lambda: RetentionPolicy.from_settings(settings),
                settings.GC_INTERVAL_MINUTES * 60,
            )
        )
    yield
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    swagger_ui_parameters={"syntaxHighlight": False}
)

# Cap request bodies while they stream in (#9). Registered before CORS so that
# 413 responses still carry the CORS headers.
app.add_middleware(BodySizeLimitMiddleware, limit_bytes=lambda: settings.MAX_UPLOAD_BYTES)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Session-Token", "X-Admin-Token", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

# Include all API routes
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "message": f"Welcome to the {settings.PROJECT_NAME}!",
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
