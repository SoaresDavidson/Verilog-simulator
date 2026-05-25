# Verilog de Forma Didática

📚 Material de aprendizado colaborativo e plataforma interativa de compilação, síntese e simulação didática de circuitos em Verilog.

Para acessar o material teórico completo, visite o Notion:
👉 [Verilog de forma didática - Notion](https://www.notion.so/Verilog-de-forma-did-tica-366d963772a9806f8ff2e23d69fc1ad3?source=copy_link)

---

## 🛠️ Arquitetura do Sistema

A plataforma é composta por três camadas principais integradas via Docker:

1. **Frontend (React + Vite):** Interface web interativa para carregar códigos Verilog, configurar sinais e visualizar o pipeline e barramento do processador passo a passo graficamente.
2. **Backend (FastAPI + Python):** Gerencia as requisições web, orquestra arquivos de sessões e executa ferramentas de hardware de forma isolada dentro dos containers através da API do Docker.
3. **Containers de Compilação (Docker):**
   * **Yosys (Sintetizador):** Responsável por analisar o código do processador e gerar a netlist estrutural (`estrutura.json`).
   * **Icarus Verilog (Simulador):** Compila o testbench e gera o log temporal do comportamento lógico do hardware (`execucao_pipeline.json`).

---

## 💾 Estrutura de Volumes Docker

Para manter os caminhos de montagem limpos e impedir a geração automática de pastas fantasmas/vazias no diretório de desenvolvimento do host, a infraestrutura mapeia volumes de forma plana diretamente na raiz dos containers:

* `./verilog_code` ➔ `/verilog_code` (compartilhado entre o backend e os compiladores)
* `./scripts` ➔ `/scripts` (contém os scripts globais de controle)

---

## 🚀 Rotas Principais da API (v1)

A API do backend fornece endpoints dedicados para gerenciar o upload de códigos e a execução dos simuladores em tempo de execução:

| Método | Endpoint | Parâmetros | Descrição |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/verilog/upload-projeto-zip` | `file` (Multipart ZIP) | Valida segurança (*Zip Bomb/Slip*), extrai os arquivos sob `/verilog_code/runs/run_<uuid>` e retorna um `project_id`. |
| **POST** | `/api/v1/verilog/mapear-processador` | `project_id` (JSON) | Roda o sintetizador **Yosys** dinamicamente para o projeto e retorna o JSON estruturado do netlist. |
| **POST** | `/api/v1/verilog/simular-execucao` | `project_id` (JSON) | Compila e roda o simulador **Icarus Verilog**, retornando os resultados (metadados, escopos e timeline) como stream de arquivo JSON. |
| **DELETE** | `/api/v1/verilog/projeto/{project_id:path}` | `project_id` (Path) | Exclui permanentemente todos os arquivos temporários criados para a sessão do projeto no host. |
| **POST** | `/api/v1/verilog/limpar` | Ninguém | Varre a pasta `/verilog_code/runs/` e limpa todas as pastas residuais de execuções antigas. |

---

## 👥 Colaboradores

* [@SoaresDavidson](https://github.com/SoaresDavidson)
* [@victor-kauan-coder](https://github.com/victor-kauan-coder)
