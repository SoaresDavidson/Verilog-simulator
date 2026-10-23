from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

    PROJECT_NAME: str = "Verilog Classroom API"
    API_V1_STR: str = "/api/v1"

    # CORS Origins (comma-separated string or list)
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # Docker connection string
    # E.g. "npipe:////./pipe/docker_engine" on Windows, "unix://var/run/docker.sock" on Linux
    DOCKER_HOST: str | None = None
    DOCKER_TIMEOUT_SECONDS: int = 30
    YOSYS_CONTAINER_NAME: str = "yosys"
    YOSYS_TIMEOUT_SECONDS: int = 30
    ICARUS_CONTAINER_NAME: str = "icarus-verilog"
    ICARUS_TIMEOUT_SECONDS: int = 30
    # Simulation script path inside the Icarus container
    ICARUS_SCRIPT_PATH: str = "/scripts/simular.sh"

    # Upper bounds for the parsed VCD returned by /simular-execucao
    VCD_MAX_TIMESTAMPS: int = 50_000
    VCD_MAX_SIGNALS: int = 500
    VCD_MAX_FILE_BYTES: int = 100 * 1024 * 1024

    # Shared volume where every project run is extracted and executed
    VERILOG_RUNS_DIR: Path = Path("/verilog_code/runs")

    # Readiness checks (GET /api/v1/status/)
    HEALTH_TIMEOUT_SECONDS: float = 5
    HEALTH_CACHE_TTL_SECONDS: float = 5

    # Upload hardening (#9): limits applied while receiving and extracting the ZIP
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    MAX_UNCOMPRESSED_BYTES: int = 50 * 1024 * 1024
    MAX_ZIP_ENTRIES: int = 500
    MAX_ZIP_DEPTH: int = 8
    MAX_ZIP_PATH_LENGTH: int = 255
    MAX_COMPRESSION_RATIO: int = 200

    # Authorization (#8): token required by POST /verilog/limpar (header
    # X-Admin-Token). When unset, the route is disabled (404).
    ADMIN_TOKEN: str | None = None

    # Run retention (#10): runs idle longer than the TTL are removed; if the
    # total exceeds the cap (0 = no cap) the oldest go first. 0 disables TTL/loop.
    RUN_TTL_HOURS: float = 6
    RUNS_MAX_TOTAL_BYTES: int = 0
    GC_INTERVAL_MINUTES: float = 30


settings = Settings()
