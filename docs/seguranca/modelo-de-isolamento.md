# Modelo de isolamento da execução

O código Verilog enviado é tratado como **não confiável**: qualquer pessoa que alcance a API pode
enviar um projeto, e Yosys e Icarus executam esse projeto (incluindo `$fopen`, `$readmemh` e
`$system` do Icarus). Este documento descreve o que a plataforma garante e o que não garante.

## Modo padrão: container efêmero por execução (`EXECUTION_MODE=ephemeral`)

Cada síntese ou simulação cria um container novo a partir de `YOSYS_IMAGE` ou `ICARUS_IMAGE`,
que é removido ao final. Esse container:

| Restrição | Configuração |
|---|---|
| Vê somente o próprio run | bind mount de `runs/run_<id>` (leitura e escrita) e de `scripts/` (somente leitura) |
| Sem rede | `network_mode: none` |
| Rootfs somente leitura | `read_only: true`, com `/tmp` em `tmpfs` (`noexec,nosuid,nodev`, `EXECUTION_TMPFS_SIZE`) |
| Memória | `EXECUTION_MEM_LIMIT`, sem swap extra |
| CPU | `EXECUTION_CPUS` |
| Processos | `EXECUTION_PIDS_LIMIT` (contém fork bombs) |
| Privilégios | usuário não-root (`EXECUTION_UID:EXECUTION_GID`), `cap_drop: ALL`, `no-new-privileges` |
| Tempo | `timeout --signal=KILL` dentro do container mais um prazo no backend, que mata o container (#5) |
| Zumbis | `init: true` recolhe processos órfãos |

Quando um limite estoura, a API responde com erro tratado e mensagem em português:

- **Tempo:** `408 YOSYS_TIMEOUT` ou `ICARUS_TIMEOUT`.
- **Memória (OOM):** `422 RESOURCE_LIMIT_EXCEEDED`.
- **Processos:** o `fork` falha e a ferramenta termina com erro, ou a execução cai no limite de tempo.

### Caminhos no host

O backend fala com o daemon Docker do host pelo `docker.sock`, e o daemon resolve os bind mounts
no host. Quando o backend roda em container, `HOST_VERILOG_ROOT` e `HOST_SCRIPTS_DIR` precisam
apontar para os caminhos de `./verilog_code` e `./scripts` no host. O `docker-compose.yml` usa
`${PWD}` como padrão, o que funciona quando o compose é chamado da raiz do repositório.

### Dono dos arquivos

O backend cria cada run e o entrega a `EXECUTION_UID:EXECUTION_GID` antes de executar, para que as
ferramentas consigam gravar os artefatos. O arquivo `.session` (hash do token de sessão, #8)
continua só do backend. Esses valores precisam coincidir com os build args `UID`/`GID` das imagens.

## Modo alternativo: `EXECUTION_MODE=exec`

Usa `docker exec` nos containers `yosys` e `icarus-verilog` de longa duração. Eles têm os mesmos
limites de CPU, memória, processos e privilégios (definidos no `docker-compose.yml`) e rodam sem
rede, mas **todos os runs compartilham o mesmo volume `/verilog_code`**. Nesse modo, um projeto
consegue ler ou apagar arquivos de outros runs. Use-o só em ambiente de desenvolvimento.

## O que não é garantido

- **O backend tem acesso ao `docker.sock`**, o que equivale a root no host. Quem comprometer o
  backend controla o host. Remover esse acesso é assunto de outra issue.
- **O isolamento depende do kernel do host** (namespaces e cgroups). Uma falha de escape de
  container no kernel ou no runtime não é coberta.
- **Disco:** não há cota por run. O tamanho do upload é limitado (#9) e runs antigos são coletados
  (#10), mas uma simulação pode gerar um VCD grande dentro do próprio run até o limite de tempo.
- **Autenticação:** o token de sessão protege runs entre usuários (#8), mas não existe login. Quem
  alcança a API consegue criar sessões novas.
- **Negação de serviço:** não há fila nem limite global de execuções simultâneas. Muitas execuções
  ao mesmo tempo disputam a CPU e a memória do host.

## Verificação

Os testes `backend/tests/integrations/test_sandbox_integration.py` rodam contra o Docker real
(`uv run pytest -m integration`, com a imagem do Icarus construída) e cobrem:

- projeto válido sob todas as restrições;
- `$fopen` em outro run falhando;
- apenas o próprio run visível, sem interface de rede e com rootfs somente leitura;
- estouro de memória reportado como erro tratado;
- fork bomb contida.
