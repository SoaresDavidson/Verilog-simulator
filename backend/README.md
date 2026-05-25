# Verilog Classroom - Backend

Este é o backend em FastAPI para o projeto Verilog Classroom. Ele fornece rotas para compilar e interagir com códigos Verilog.

## Estrutura do Projeto

```text
back/
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
  "folder_path": "nome_da_pasta_ou_caminho_relativo"
}
```
* O `folder_path` deve estar contido dentro do diretório `/verilog_code` para que os containers de compiladores consigam acessá-lo.
* **Funcionamento:** Executa `yosys -s scripts/mapear_hardware.ys` dentro do container `yosys` e lê o arquivo netlist gerado (`netlist.v`, etc.).

### POST `/api/v1/verilog/simular-execucao`

Dispara a simulação de hardware no container `icarus-verilog`.

**Request Payload:**
```json
{
  "folder_path": "nome_da_pasta_ou_caminho_relativo"
}
```
* **Funcionamento:** Dá permissão de execução e executa o script `bash scripts/simular.sh` dentro do container `icarus-verilog`, retornando os logs e o conteúdo do arquivo de resultado (ex: `resultado.txt`).

### POST `/api/v1/verilog/executar-projeto-zip`

Recebe um arquivo compactado `.zip` contendo os fontes Verilog e a pasta `scripts/` correspondente.

**Request Payload:**
- Enviar como `multipart/form-data`.
- Campo `file`: arquivo `.zip`.

**Funcionamento:**
1. A API cria uma pasta temporária exclusiva dentro da pasta de códigos compartilhada (`/verilog_code/temp_proj_<uuid>`).
2. Extrai os arquivos do ZIP nessa pasta (tratando inclusive casos em que o zip tem uma subpasta raiz redundante).
3. Dispara sequencialmente o mapeamento (no container `yosys`) e a simulação (no container `icarus-verilog`) sobre essa pasta temporária.
4. Coleta os logs e os arquivos resultantes gerados.
5. Exclui permanentemente a pasta temporária do servidor.
6. Retorna a resposta combinada com os resultados dos dois processos.
