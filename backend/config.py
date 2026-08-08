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


settings = Settings()
