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
1. A API cria uma pasta exclusiva dentro do diretório `/verilog_code/runs/run_<uuid>`.
2. Valida segurança contra Zip Bomb e Zip Slip.
3. Extrai os arquivos do ZIP.
4. Retorna o `project_id` correspondente para ser usado nas rotas de mapeamento e simulação.
5. Após concluir o uso, deve-se chamar o endpoint `DELETE /api/v1/verilog/projeto/{project_id}` para limpar os arquivos temporários.
