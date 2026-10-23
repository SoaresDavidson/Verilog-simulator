# Integração com Icarus Verilog

## Finalidade

O módulo `backend/integrations/icarus.py` compila (`iverilog`) e simula (`vvp`) um projeto dentro do container `icarus-verilog` e devolve o resultado estruturado. O parse do VCD gerado vive em `backend/integrations/vcd.py`.

Responsabilidades:

- resolver o `project_id` (`runs/run_<id>`) para o diretório local e o caminho no container (`integrations/projects.py`);
- localizar os fontes `.v`/`.sv` do projeto (recursivo, ordem alfabética, incluindo testbenches);
- montar o comando `bash <ICARUS_SCRIPT_PATH> <fontes...>` e executá-lo via `DockerIntegration`;
- distinguir erro de compilação, erro de simulação, timeout e indisponibilidade do container;
- localizar o VCD gerado e convertê-lo no `simulation_log` da API.

O restante da aplicação (`services/verilog.py`) não conhece comandos, scripts, volumes nem o Docker SDK.

## Configuração

```env
ICARUS_CONTAINER_NAME=icarus-verilog
ICARUS_TIMEOUT_SECONDS=30
ICARUS_SCRIPT_PATH=/scripts/simular.sh
DOCKER_HOST=unix:///var/run/docker.sock
VERILOG_RUNS_DIR=/verilog_code/runs
```

`ICARUS_SCRIPT_PATH` é um caminho **dentro do container** do Icarus. O diretório local usado como base é `VERILOG_RUNS_DIR.parent`, montado como `/verilog_code` nos containers.

## Script de simulação

`scripts/simular.sh` recebe os fontes como argumentos e usa códigos de saída que a integração interpreta:

| Código | Significado | Tratamento |
|---|---|---|
| `0` | sucesso | `IcarusResult(success=True)` |
| `10` | `iverilog` rejeitou os fontes | `IcarusCompilationError` |
| `11` | `vvp` terminou com erro | `IcarusSimulationError` |
| `126`/`127` | script ausente ou sem permissão | `IcarusError` |
| outro ≠ 0 | falha genérica da simulação | `IcarusSimulationError` |

`simular.sh` compila para um binário temporário único (`mktemp /tmp/sim.XXXXXXXX.vvp`), removido ao sair. Simulações concorrentes no mesmo container não compartilham o `.vvp`.

## Seleção do VCD

O nome do VCD é escolhido pelo testbench (`$dumpfile`), então a integração segue esta regra:

1. antes de executar, todos os `*.vcd` do diretório do run (recursivo) são apagados;
2. depois, só são candidatos arquivos `*.vcd` com `mtime` posterior ao início da execução (tolerância de 1 s), o que cobre falha na limpeza;
3. com mais de um candidato, vence o de `mtime` mais recente (empate decidido pelo caminho) e um aviso é registrado no log.

Sem candidatos, `vcd_file` e `simulation_log` ficam `None`, mesmo que exista um VCD antigo na pasta.

## Limites e recorte do VCD

O parse (`integrations/vcd.py`) converte `Decimal` direto para `float`, sem passar por `json.dumps`/`json.loads`, e registra no log duração, bytes, sinais e timestamps de cada VCD.

Limites (`VcdLimits`, configuráveis por ambiente):

| Variável | Padrão | Ao exceder |
|---|---|---|
| `VCD_MAX_FILE_BYTES` | `104857600` | só a hierarquia (`modules`) é devolvida; `timeline` vazia |
| `VCD_MAX_SIGNALS` | `500` | só as primeiras referências entram na `timeline` |
| `VCD_MAX_TIMESTAMPS` | `50000` | só os primeiros instantes entram na `timeline` |

A truncagem é sempre sinalizada em `metadata`: `truncated: true`, `truncation_reason` (motivos separados por vírgula: `max_file_bytes`, `max_signals`, `max_timestamps`) e o total original (`file_bytes`, `total_signals`, `total_timestamps`). Dentro dos limites, a resposta é idêntica à anterior; a `timeline` sai ordenada por tempo.

Recorte pedido pelo cliente (`VcdSelection`, campos opcionais do body de `/simular-execucao`):

- `begin_time` / `end_time`: janela temporal inclusiva. Em `begin_time` sai o valor vigente de cada sinal, para a janela começar de um estado conhecido;
- `signals`: lista de referências (`"tb.dut.clk"`). Referências desconhecidas aparecem em `metadata.ignored_signals`;
- `decimation`: mantém um a cada N instantes, mais o último. Mudanças dos instantes pulados são incorporadas ao próximo instante mantido.

O recorte é aplicado antes de `VCD_MAX_TIMESTAMPS`. `modules` sempre traz a hierarquia completa.

## Exemplo de uso

```python
from pathlib import Path

from integrations.icarus import IcarusConfig, IcarusIntegration
from integrations.vcd import VcdSelection

integration = IcarusIntegration(
    IcarusConfig(
        container_name="icarus-verilog",
        timeout_seconds=30,
        verilog_base_dir=Path("/verilog_code"),
    )
)

result = integration.simulate(
    "runs/run_0123456789abcdef0123456789abcdef",
    VcdSelection(begin_time=0, end_time=1000, signals=("tb.clk",)),
)
print(result.exit_code, result.vcd_file)
print(result.simulation_log["metadata"])
```

## Estrutura de retorno

`IcarusResult`:

| Campo | Tipo | Descrição |
|---|---|---|
| `success` | `bool` | `True` quando o script terminou com código `0`. |
| `exit_code` | `int` | Código de saída do script. |
| `stdout` | `str` | Saída padrão (UTF-8). |
| `stderr` | `str` | Erros e avisos (UTF-8). |
| `vcd_file` | `Path \| None` | VCD lido, ou `None` se o testbench não gerou dump. |
| `simulation_log` | `dict \| None` | `metadata`, `modules` e `timeline` extraídos do VCD. |

Um testbench sem `$dumpfile` não é erro: `vcd_file` e `simulation_log` ficam `None`.

## Exceções

| Exceção | Situação |
|---|---|
| `IcarusError` | Classe base; também usada para script ausente e falha do Docker SDK. |
| `IcarusContainerNotFoundError` | Docker indisponível, container ausente ou parado. |
| `IcarusTimeoutError` | Execução excedeu `ICARUS_TIMEOUT_SECONDS`. |
| `IcarusCompilationError` | Erro de compilação no código do aluno. Carrega `.result`. |
| `IcarusSimulationError` | Erro durante a simulação. Carrega `.result`. |
| `VcdParseError` | VCD gerado não pôde ser interpretado. Carrega `.result`. |
| `ValueError` / `FileNotFoundError` / `NotADirectoryError` | `project_id` inválido, inexistente ou sem fontes. |

`VerilogService.simular_execucao` mantém o contrato de `/api/v1/verilog/simular-execucao`: erros de compilação e de simulação viram `success: false` (HTTP 200) com `stdout`/`stderr`; VCD inválido não é fatal (`simulation_log: null` e aviso no `stderr`). Container indisponível responde `503`.

## Testes

```bash
cd backend
uv sync --dev
uv run pytest -m "not integration"   # unitários, com mocks do Docker SDK
uv run pytest -m integration         # requer o container icarus-verilog e /verilog_code
```

Fora do container backend, `VERILOG_TEST_BASE_DIR` aponta para o diretório do host montado como `/verilog_code` no container Icarus.
