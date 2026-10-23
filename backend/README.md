# Verilog Classroom - Backend

Este é o backend em FastAPI para o projeto Verilog Classroom. Ele fornece rotas para compilar e interagir com códigos Verilog.

## Estrutura do Projeto

```text
backend/
├── main.py            # Ponto de entrada da aplicação
├── config.py          # Configurações globais e de ambiente (CORS, etc.)
├── routes/            # Rotas / Endpoints do FastAPI
│   ├── api.py         # Combinador de roteadores
│   ├── status.py      # Verificação de status/saúde
│   └── verilog.py     # Rotas específicas para compilação/simulação Verilog
├── schemas/           # Modelos Pydantic para validação de requests/responses
│   └── verilog.py
└── services/          # Camada de negócios e execução de scripts de terceiros
    └── verilog.py     # Serviço responsável por interagir com compiladores
```

## Como Executar

### Pré-requisitos

- Python >= 3.13
- Gerenciador de pacotes `uv` (recomendado) ou `pip`

### Execução Local

1. Entre no diretório `back`:
   ```bash
   cd back
   ```

2. Crie o ambiente virtual e instale as dependências:
   * Com **uv** (rápido):
     ```bash
     uv sync
     ```
   * Com **pip**:
     ```bash
     python -m venv .venv
     .venv\Scripts\activate     # No Windows
     source .venv/bin/activate  # No Linux/macOS
     pip install -r requirements.txt
     ```

3. Execute a API:
   * Com **uv**:
     ```bash
     uv run uvicorn main:app --reload
     ```
   * Com **python/uvicorn**:
     ```bash
     uvicorn main:app --reload
     ```

4. Acesse a documentação interativa da API:
   - Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
   - ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Autenticação e sessão

Não há contas de usuário: cada upload cria uma **sessão** vinculada ao run.

1. `POST /api/v1/verilog/upload-projeto-zip` devolve `project_id` e `session_token`. O token
   é exibido só nessa resposta; o backend guarda apenas o hash SHA-256 dele em
   `runs/run_<uuid>/.session` (arquivo oculto, nunca lido como fonte nem extraído de ZIPs).
2. O cliente guarda o token e o envia no header `X-Session-Token` em toda rota que opera
   sobre o run.
3. `POST /api/v1/verilog/limpar` é administrativa e exige `X-Admin-Token` igual à variável
   `ADMIN_TOKEN`. Sem `ADMIN_TOKEN` configurado a rota fica desabilitada (`404`). Cada
   execução é registrada em log (`warning`) com a origem da requisição e a quantidade de runs
   removidos.

| Rota | Header obrigatório |
|---|---|
| `POST /verilog/upload-projeto-zip` | — |
| `POST /verilog/mapear-processador` | `X-Session-Token` |
| `POST /verilog/simular-execucao` | `X-Session-Token` |
| `DELETE /verilog/projeto/{project_id}` | `X-Session-Token` |
| `POST /verilog/limpar` | `X-Admin-Token` |

Respostas de autorização: `401` header ausente, `403` token que não pertence ao run (nada é
apagado nem devolvido), `404` run inexistente (ou `/limpar` desabilitada), `400` `project_id`
fora do formato `runs/run_<32 hex>`.

Exemplo:

```bash
resp=$(curl -s -F file=@projeto.zip http://localhost:8000/api/v1/verilog/upload-projeto-zip)
id=$(echo "$resp" | jq -r .project_id); token=$(echo "$resp" | jq -r .session_token)
curl -X POST http://localhost:8000/api/v1/verilog/mapear-processador \
  -H "X-Session-Token: $token" -H 'Content-Type: application/json' \
  -d "{\"project_id\": \"$id\"}"
curl -X DELETE "http://localhost:8000/api/v1/verilog/projeto/$id" -H "X-Session-Token: $token"
```

## Retenção dos projetos enviados

Os projetos enviados são **temporários**. Um coletor automático apaga os runs:

- **por inatividade:** runs sem nenhuma modificação há mais de `RUN_TTL_HOURS` horas (padrão
  6 h). O "último uso" é o `mtime` mais recente de qualquer arquivo dentro do run, então
  sintetizar ou simular renova o prazo;
- **por espaço:** se `RUNS_MAX_TOTAL_BYTES` > 0 e o total ultrapassar o teto, os runs mais antigos
  são removidos primeiro até voltar abaixo dele.

Regras de segurança do coletor:

- só considera diretórios `run_*` dentro de `VERILOG_RUNS_DIR`;
- nunca remove um run em uso (upload, mapeamento ou simulação em andamento), seja qual for a idade;
- falha ao remover um run entra no relatório e não interrompe a coleta dos demais.

A coleta roda ao subir a API e depois a cada `GC_INTERVAL_MINUTES` minutos (task no `lifespan`
do FastAPI); como reforço, cada upload dispara uma coleta oportunista (no máximo uma a cada 5
minutos). Cada coleta é registrada em log com runs removidos, bytes liberados e erros. O
`GET /api/v1/status/` mostra a quantidade de runs, o espaço ocupado e o horário da última coleta.

## Endpoints Principais

### POST `/api/v1/verilog/mapear-processador`

Dispara o mapeamento de hardware no container `yosys`.

**Request Payload:**
```json
{
  "project_id": "runs/run_<uuid>"
}
```
* O `project_id` é o identificador único da pasta do projeto retornado pelo endpoint de upload. Ele deve residir sob `/verilog_code/runs/`.
* **Funcionamento:** Executa comandos do Yosys no container `yosys` para ler os arquivos `.v` e `.sv`, gerando e retornando o netlist estrutural (`estrutura.json`).

### POST `/api/v1/verilog/simular-execucao`

Dispara a simulação de hardware no container `icarus-verilog` e analisa o arquivo de sinais VCD resultante utilizando a biblioteca `vcdvcd` (com suporte a módulos/escopos).

**Request Payload:**
```json
{
  "project_id": "runs/run_<uuid>"
}
```

**Response Payload (`simulation_log`):**
Retorna um objeto JSON estruturado contendo a simulação completa:
```json
{
  "success": true,
  "stdout": "...logs de compilação...",
  "stderr": "",
  "simulation_log": {
    "metadata": {
      "timescale": {
        "timescale": 1e-12,
        "magnitude": 1,
        "unit": "ps",
        "factor": 1e-12
      },
      "begintime": 0,
      "endtime": 1040000
    },
    "variables": {
      "tb_processador.clk": {
        "size": "1",
        "var_type": "reg",
        "references": [
          "tb_processador.clk",
          "tb_processador.processador.clk"
        ]
      }
    },
    "modules": {
      "tb_processador": {
        "variables": {
          "clk": {
            "size": "1",
            "var_type": "reg",
            "references": [
              "tb_processador.clk",
              "tb_processador.processador.clk"
            ]
          }
        },
        "subscopes": [
          "processador"
        ]
      }
    },
    "timeline": {
      "0": {
        "tb_processador.clk": "0"
      },
      "10000": {
        "tb_processador.clk": "1"
      }
    }
  }
}
```

* **metadata**: Informações da simulação extraídas do cabeçalho do VCD.
* **variables**: Mapeamento de caminhos de sinais únicos para seus metadados (`size`, `var_type`, etc.).
* **modules**: Árvore de escopo estrutural do hardware. Mapeia cada escopo (módulo/submódulo) para suas variáveis locais e sub-escopos filhos (`subscopes`).
* **timeline**: Histórico de mudanças de estado ciclo a ciclo. Mapeia cada carimbo de tempo (*timestamp*) para os sinais que mudaram de valor naquele instante.

---

### POST `/api/v1/verilog/upload-projeto-zip`

Recebe um arquivo compactado `.zip` contendo os arquivos fonte Verilog.

**Request Payload:**
- Enviar como `multipart/form-data`.
- Campo `file`: arquivo `.zip`.

**Funcionamento:**
1. O upload é gravado em disco em blocos (nunca inteiro em memória). Requisições cujo
   `Content-Length` ou volume recebido passem de `MAX_UPLOAD_BYTES` são abortadas com `413`.
2. Cada nome de entrada é validado antes de qualquer escrita: caminhos absolutos, com `..`,
   com caracteres inválidos, mais longos que `MAX_ZIP_PATH_LENGTH` ou mais profundos que
   `MAX_ZIP_DEPTH` são rejeitados; ZIPs com mais de `MAX_ZIP_ENTRIES` entradas também.
3. Os arquivos são extraídos um a um em `runs/run_<uuid>` (dentro de `VERILOG_RUNS_DIR`),
   contando os bytes realmente escritos (`MAX_UNCOMPRESSED_BYTES`) e a razão de compressão de
   cada entrada (`MAX_COMPRESSION_RATIO`, avaliada a partir de 1 MB) para barrar zip bombs. O
   destino é verificado com `Path.resolve().is_relative_to(...)`.
4. Só são extraídas as extensões usadas no fluxo; o restante é ignorado em silêncio:

   | Extensão | Motivo |
   |---|---|
   | `.v`, `.sv` | Fontes Verilog/SystemVerilog |
   | `.vh`, `.svh` | Headers incluídos com `` `include `` |
   | `.mem`, `.hex`, `.txt` | Imagens de memória e estímulos lidos por `$readmemh`/`$readmemb`/`$fopen` |

   Saídas das ferramentas (`estrutura.json`, `relatorio.txt`, `*.vcd`), arquivos ocultos e
   pastas `__MACOSX` nunca são extraídos, para que um ZIP não traga resultados pré-fabricados.
5. Se todos os arquivos estiverem dentro de uma única pasta raiz (ZIP criado compactando a
   própria pasta do projeto), essa pasta é removida na extração: a raiz do run é a raiz do projeto.
   Demais subpastas são preservadas e as fontes são procuradas recursivamente.
6. O projeto precisa conter ao menos um arquivo `.v` ou `.sv` (em qualquer subpasta).
7. Após concluir o uso, deve-se chamar `DELETE /api/v1/verilog/projeto/{project_id}` para limpar os arquivos temporários.

**Resposta `200`:**
```json
{
  "project_id": "runs/run_0123456789abcdef0123456789abcdef",
  "session_token": "<token opaco>",
  "message": "Projeto enviado com sucesso. ..."
}
```
O `project_id` segue sempre o formato `^runs/run_[0-9a-f]{32}$`, nunca inclui o nome de
pastas internas do ZIP.

**Erros:**

| Código | Quando |
|---|---|
| `400` | Arquivo não é `.zip`; ZIP vazio, corrompido ou protegido por senha; sem nenhum `.v`/`.sv`; caminho inseguro, longo ou profundo demais; entradas duplicadas; razão de compressão suspeita |
| `413` | Upload acima de `MAX_UPLOAD_BYTES`, extração acima de `MAX_UNCOMPRESSED_BYTES` ou mais de `MAX_ZIP_ENTRIES` entradas |

Em qualquer rejeição nenhuma pasta residual permanece em `VERILOG_RUNS_DIR` e o arquivo
temporário do upload é apagado.

### GET `/api/v1/status/live`

Liveness. Responde `200` com `{"status": "alive"}` enquanto o processo estiver de
pé, sem consultar nenhuma dependência externa. É o endpoint usado pelo
`healthcheck` do `docker-compose.yml`.

### GET `/api/v1/status/`

Readiness. Verifica de fato cada dependência antes de responder:

| Check | O que é verificado |
|---|---|
| `docker_daemon` | Conexão e `ping` no daemon Docker |
| `yosys` | Container em execução e `yosys -V` respondendo |
| `icarus` | Container em execução e `iverilog -V` respondendo |
| `storage` | Diretório de runs existe e é gravável |

Além dos checks, a resposta traz o bloco `runs` (informativo, não altera o status):

```json
"runs": {
  "count": 12,
  "total_bytes": 3456789,
  "last_collection_at": "2026-10-23T12:00:00Z",
  "last_collection_removed": 3
}
```

**Status agregado e código HTTP:**

- `ok` → `200`: todas as dependências saudáveis.
- `degraded` → `200`: container de pé, mas o binário da ferramenta não respondeu.
  A API continua utilizável.
- `error` → `503`: daemon inacessível, container ausente/parado ou storage
  indisponível. A API não consegue executar síntese nem simulação.

**Exemplo de resposta (`503`):**
```json
{
  "status": "error",
  "checks": {
    "docker_daemon": { "status": "error", "detail": "Could not connect to Docker daemon: ...", "container": null },
    "yosys":         { "status": "error", "detail": "Docker daemon unreachable, container not verified.", "container": "yosys" },
    "icarus":        { "status": "error", "detail": "Docker daemon unreachable, container not verified.", "container": "icarus-verilog" },
    "storage":       { "status": "ok", "detail": "Runs directory '/verilog_code/runs' is writable.", "container": null }
  }
}
```

O resultado fica em cache por `HEALTH_CACHE_TTL_SECONDS` para que chamadas
frequentes do orquestrador não conversem com o daemon a cada requisição, e cada
comando de versão respeita `HEALTH_TIMEOUT_SECONDS`.

## Variáveis de Ambiente

Todas são lidas por `config.py` e podem vir de um arquivo `.env` (modelo em `.env.example`).

| Variável | Padrão | Descrição |
|---|---|---|
| `DOCKER_HOST` | `None` | Endereço do daemon Docker (`unix:///var/run/docker.sock`) |
| `DOCKER_TIMEOUT_SECONDS` | `30` | Timeout padrão de comandos em container |
| `YOSYS_CONTAINER_NAME` | `yosys` | Nome do container de síntese |
| `YOSYS_TIMEOUT_SECONDS` | `30` | Timeout da execução do Yosys |
| `ICARUS_CONTAINER_NAME` | `icarus-verilog` | Nome do container de simulação |
| `VERILOG_RUNS_DIR` | `/verilog_code/runs` | Diretório onde cada run é extraído |
| `HEALTH_TIMEOUT_SECONDS` | `5` | Timeout dos comandos de verificação de readiness |
| `HEALTH_CACHE_TTL_SECONDS` | `5` | Validade do cache do `GET /api/v1/status/` |
| `MAX_UPLOAD_BYTES` | `10485760` | Tamanho máximo do ZIP enviado (10 MB) |
| `MAX_UNCOMPRESSED_BYTES` | `52428800` | Total de bytes escritos na extração (50 MB) |
| `MAX_ZIP_ENTRIES` | `500` | Número máximo de entradas no ZIP |
| `MAX_ZIP_DEPTH` | `8` | Profundidade máxima de pastas |
| `MAX_ZIP_PATH_LENGTH` | `255` | Comprimento máximo de um caminho no ZIP |
| `MAX_COMPRESSION_RATIO` | `200` | Razão máxima descompactado/compactado por entrada (acima de 1 MB) |
| `ADMIN_TOKEN` | `None` | Token exigido em `POST /verilog/limpar` (`X-Admin-Token`); sem ele a rota fica desabilitada |
| `RUN_TTL_HOURS` | `6` | Horas sem uso até um run ser coletado (`0` desliga a expiração por idade) |
| `RUNS_MAX_TOTAL_BYTES` | `0` | Teto de espaço dos runs; acima dele os mais antigos saem primeiro (`0` = sem teto) |
| `GC_INTERVAL_MINUTES` | `30` | Intervalo da coleta periódica (`0` desliga a task; a coleta no upload continua) |
| `ALLOWED_ORIGINS` | localhost:3000/5173 | Origens liberadas no CORS (lista JSON) |

## Testes

Testes unitários (não exigem Docker):

```bash
uv run pytest
```

Testes de integração (exigem os containers `yosys` e `icarus-verilog` de pé):

```bash
uv run pytest -m integration
```

Lint e formatação:

```bash
uv run ruff check .
```
