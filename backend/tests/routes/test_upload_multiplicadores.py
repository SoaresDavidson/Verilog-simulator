"""Upload dos projetos reais dos multiplicadores das aulas."""

from pathlib import Path

import pytest
from conftest import MULTIPLICADORES, MULTIPLICADORES_DIR, zip_project
from fastapi.testclient import TestClient

UPLOAD_URL = "/api/v1/verilog/upload-projeto-zip"


@pytest.mark.parametrize("name", sorted(MULTIPLICADORES))
def test_multiplier_project_is_extracted_whole(api_client: TestClient, runs_dir: Path, name: str) -> None:
    """Todos os arquivos do projeto chegam ao run, inclusive o vetores_mult.txt do $readmemh."""
    response = api_client.post(UPLOAD_URL, files={"file": (f"{name}.zip", zip_project(name), "application/zip")})

    assert response.status_code == 200, response.text
    run_dir = runs_dir.parent / response.json()["project_id"]
    expected = {path.name for path in (MULTIPLICADORES_DIR / name).iterdir()}
    assert {path.name for path in run_dir.iterdir() if not path.name.startswith(".")} == expected
