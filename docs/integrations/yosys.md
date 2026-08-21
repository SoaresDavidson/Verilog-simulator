# Integração com Yosys

## Finalidade

O módulo `backend/integrations/yosys.py` executa uma síntese Yosys previamente preparada e processa seus artefatos. Resolução de projetos, descoberta de fontes e montagem de comandos pertencem a componentes externos.

Responsabilidades:

- receber diretórios e comando já resolvidos;
- executar síntese com timeout;
- capturar código de saída, `stdout` e `stderr`;
- ler `estrutura.json` e `relatorio.txt`;
- retornar `YosysResult`.

## Configuração

Variáveis disponíveis:

```env
YOSYS_CONTAINER_NAME=yosys
YOSYS_TIMEOUT_SECONDS=30
DOCKER_HOST=unix:///var/run/docker.sock
```

## Exemplo de uso

```python
from pathlib import Path

from integrations.yosys import YosysConfig, YosysIntegration

integration = YosysIntegration(
    YosysConfig(
        container_name="yosys",
        timeout_seconds=30,
    )
)

result = integration.synthesize(
    output_dir=Path("/verilog_code/runs/run_0123456789abcdef"),
    container_workdir="/verilog_code/runs/run_0123456789abcdef",
    command=[
        "yosys",
        "-p",
        "read_verilog -sv cpu.v; hierarchy -auto-top; write_json estrutura.json",
    ],
)
print(result.netlist_content)
```

## Entradas

Chamador deve fornecer:

- `output_dir`: diretório local compartilhado onde artefatos serão lidos;
- `container_workdir`: diretório de trabalho correspondente no container;
- `command`: comando Yosys completo como lista de argumentos.

Integração não interpreta `project_id`, procura arquivos `.v`/`.sv` nem adiciona etapas ao comando.

## Estrutura de retorno

`YosysResult` contém:

| Campo | Tipo | Descrição |
|---|---|---|
| `success` | `bool` | Indica conclusão bem-sucedida. |
| `exit_code` | `int` | Código retornado pelo processo Yosys. |
| `stdout` | `str` | Saída padrão decodificada em UTF-8. |
| `stderr` | `str` | Erros e avisos decodificados em UTF-8. |
| `netlist_content` | `dict | None` | Conteúdo processado de `estrutura.json`. |
| `structure_file` | `Path | None` | Caminho local da netlist. |
| `stat_report_file` | `Path | None` | Caminho local do relatório estatístico. |

## Exceções

| Exceção | Situação |
|---|---|
| `YosysError` | Classe base para falhas da integração. |
| `YosysContainerNotFoundError` | Docker indisponível, container ausente ou parado. |
| `YosysTimeoutError` | Execução excedeu `YOSYS_TIMEOUT_SECONDS`. |
| `YosysSynthesisError` | Código de saída diferente de zero ou `estrutura.json` ausente/inválido. |
| `ValueError` | Configuração, comando ou diretório de trabalho inválido. |

`YosysSynthesisError.result` preserva código de saída e logs. `VerilogService` usa esse resultado para manter compatibilidade com endpoint `/api/v1/verilog/mapear-processador`, retornando `success: false` em falhas de síntese.

## Testes

Instale dependências do grupo de desenvolvimento:

```bash
uv sync --dev
```

Execute testes unitários sem Docker:

```bash
uv run pytest -m "not integration"
```

Execute teste de integração com container `yosys` em execução e volume `/verilog_code` disponível:

```bash
uv run pytest -m integration
```

Quando testes rodam fora do container backend, `VERILOG_TEST_BASE_DIR` pode apontar para diretório do host compartilhado como `/verilog_code` no container Yosys.
