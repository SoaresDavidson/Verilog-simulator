"""Testes da entrega do run ao usuário não-root das ferramentas (#7)."""

import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from integrations import projects
from integrations.projects import grant_run_access


@pytest.fixture
def run_dir(tmp_path: Path) -> Path:
    """Run com subpasta, fonte, sessão e um symlink apontando para fora."""
    run = tmp_path / "runs" / "run_x"
    (run / "rtl").mkdir(parents=True)
    (run / "rtl" / "alu.v").write_text("module alu; endmodule\n")
    (run / ".session").write_text("digest")
    (run / "escape").symlink_to("/etc/passwd")
    return run


def test_every_entry_except_session_is_chowned_without_following_links(
    run_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Diretórios e arquivos mudam de dono; .session fica com o backend; links não são seguidos."""
    chown = MagicMock()
    monkeypatch.setattr(projects.os, "chown", chown)

    grant_run_access(run_dir, 4242, 4343)

    changed = {Path(call.args[0]) for call in chown.call_args_list}
    assert changed == {run_dir, run_dir / "rtl", run_dir / "rtl" / "alu.v", run_dir / "escape"}
    for call in chown.call_args_list:
        assert call.args[1:] == (4242, 4343)
        assert call.kwargs == {"follow_symlinks": False}


def test_entries_already_owned_are_skipped(run_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Se o dono já é o usuário das ferramentas, nada é alterado."""
    chown = MagicMock()
    monkeypatch.setattr(projects.os, "chown", chown)

    grant_run_access(run_dir, os.getuid(), os.getgid())

    chown.assert_not_called()


def test_missing_permission_is_tolerated(run_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Backend sem privilégio (execução local) segue sem erro e para na primeira recusa."""
    chown = MagicMock(side_effect=PermissionError("not root"))
    monkeypatch.setattr(projects.os, "chown", chown)

    grant_run_access(run_dir, 4242, 4343)

    assert chown.call_count == 1


def test_integrations_hand_the_run_over_before_executing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Yosys e Icarus entregam o run ao dono configurado antes de chamar o Docker."""
    from integrations import icarus, yosys
    from integrations.docker import DockerCommandResult

    run = tmp_path / "runs" / "run_x"
    run.mkdir(parents=True)
    (run / "top.v").write_text("module top; endmodule\n")
    order: list[str] = []
    docker = MagicMock()
    docker.execute.side_effect = lambda **_: (
        order.append("execute") or DockerCommandResult(success=False, exit_code=1, stdout="", stderr="")
    )
    for module in (yosys, icarus):
        monkeypatch.setattr(module, "grant_run_access", lambda *args: order.append(f"grant{args[1:]}"))

    with pytest.raises(yosys.YosysSynthesisError):
        yosys.YosysIntegration(
            yosys.YosysConfig(verilog_base_dir=tmp_path, run_owner=(7, 8), execution_mode="exec"), docker
        ).synthesize("runs/run_x")
    with pytest.raises(icarus.IcarusSimulationError):
        icarus.IcarusIntegration(
            icarus.IcarusConfig(verilog_base_dir=tmp_path, run_owner=(7, 8), execution_mode="exec"), docker
        ).simulate("runs/run_x")

    assert order == ["grant(7, 8)", "execute", "grant(7, 8)", "execute"]
