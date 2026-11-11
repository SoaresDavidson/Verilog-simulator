# Integração com Docker

`backend/integrations/docker.py` executa comandos nos containers das ferramentas (`yosys`, `icarus-verilog`). As integrações `yosys.py` e `icarus.py` dependem só da interface pública abaixo.

```python
DockerIntegration.execute(container_name, command, workdir, timeout_seconds=None) -> DockerCommandResult
```

`DockerCommandResult` tem `success`, `exit_code`, `stdout` e `stderr`.

## Tempo limite

Nenhum comando roda sem limite. O limite é aplicado em dois lugares:

1. **No container**: o comando é prefixado com `timeout --signal=KILL <N>s` (coreutils, instalado nas imagens `icarus.dockerfile` e `yosys.dockerfile`). O processo e seus filhos morrem mesmo que o backend perca a conexão com o daemon. Exit code `124`, ou `137` depois de decorrido o limite, vira `DockerTimeoutError`. Um `137` antes do limite (por exemplo, OOM) é devolvido como falha comum.
2. **No backend**: a execução usa a API de baixo nível (`exec_create`, `exec_start(stream=True, demux=True)`, `exec_inspect`). O stream é consumido numa thread e o backend para de esperar após `N + kill_grace_seconds`, levantando `DockerTimeoutError`.

`N` vem de `timeout_seconds` ou, se omitido, de `DockerConfig.timeout_seconds` (`DOCKER_TIMEOUT_SECONDS`). Yosys e Icarus passam os próprios limites (`YOSYS_TIMEOUT_SECONDS`, `ICARUS_TIMEOUT_SECONDS`).

As rotas `/mapear-processador` e `/simular-execucao` respondem `408` com mensagem em português quando o limite estoura. Artefatos parciais não são lidos depois de um timeout, e a execução seguinte os apaga antes de rodar.

## Saída

`stdout` e `stderr` são limitados a `DockerConfig.max_output_bytes` (1 MiB por padrão) cada. Acima disso, a saída é cortada e termina com `[output truncated]`.

## Exceções

| Exceção | Situação |
|---|---|
| `DockerConnectionError` | Daemon inacessível. |
| `DockerContainerNotFoundError` | Container inexistente. |
| `DockerContainerUnavailableError` | Container existe, mas não está rodando. |
| `DockerTimeoutError` | Limite de tempo estourado (no container ou no backend). |
| `DockerExecutionError` | Falha do SDK ao criar, ler ou inspecionar a execução. |
