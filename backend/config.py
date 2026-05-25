from pydantic_settings import BaseSettings

class Settings(BaseSettings):
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

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()

