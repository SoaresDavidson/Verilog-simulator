# Verilog Simulator — quebra de features do protótipo

Fonte: `prototype/index (1).html` + `prototype/styles.css` (extraído).

Este documento descreve como conectar as quatro telas do protótipo ao backend FastAPI e aos fluxos previstos nas issues do projeto `SoaresDavidson/Verilog-simulator`.

## Contrato atual do backend

- `POST /api/v1/verilog/upload-projeto-zip`: recebe ZIP em `multipart/form-data` e retorna `project_id`.
- `POST /api/v1/verilog/mapear-processador`: recebe `{ "project_id": "runs/run_<uuid>" }` e retorna `success`, `stdout`, `stderr` e `netlist_content` gerado pelo Yosys.
- `POST /api/v1/verilog/simular-execucao`: recebe `project_id` e retorna `success`, `stdout`, `stderr` e `simulation_log` extraído do VCD pelo Icarus.
- `DELETE /api/v1/verilog/projeto/{project_id}`: remove artefatos da execução atual.
- `POST /api/v1/verilog/limpar`: remove todas as execuções elegíveis; uso administrativo ou interno.
- `simulation_log` contém `metadata`, árvore `modules` com variáveis e subescopos, e `timeline` indexada por timestamp.
- `netlist_content` contém a estrutura JSON do Yosys. Frontend deve consumir contrato tipado definido na issue #20, sem depender de formato fixo do exemplo.

Issues de segurança, desempenho e operação devem acompanhar integração: #5, #6, #7, #8, #9, #10, #11, #12 e #15.

## 0. Base / infraestrutura

- Portar variáveis CSS, botões, cards e estados visuais de `styles.css` para o stack real.
- Implementar stepper/nav (`STEPS`, `rStp()`, `go(n)`) com bloqueio conforme estado confirmado pela API.
- Implementar toast para erros HTTP, falhas de validação, timeout e mensagens de `stderr` sem expor detalhes internos.
- Manter estado da sessão no frontend: `project_id`, arquivos identificados, módulo selecionado, resultado de síntese, sinais escolhidos e resultado de simulação.
- Centralizar cliente HTTP, tratamento de respostas e cancelamento de requisições. Aplicar contratos tipados de upload, netlist e simulação.
- Preservar resultados somente durante sessão válida; limpar estado quando `DELETE /projeto/{project_id}` concluir.
- Depender da integração Docker reutilizável (#16), tratamento de erros/logging (#12) e healthcheck real (#11) antes de declarar backend pronto.

## 1. Tela 1 — Upload e sessão (`#s1`)

- Dropzone com drag-and-drop e seleção por clique (`.uz`, eventos `dragover/drop/change`).
- Validar extensão `.zip`, tamanho e conteúdo antes do envio; backend também aplica limites, Zip Slip e Zip Bomb (#9, #18).
- Enviar arquivo para `POST /api/v1/verilog/upload-projeto-zip`.
- Guardar `project_id` retornado e exibir estado de envio, sucesso e erro.
- Exibir preview dos arquivos disponíveis após a sessão ser criada. Se backend ainda não fornecer endpoint de listagem, derivar preview do ZIP no cliente sem usar essa derivação como fonte para síntese.
- Botão “Criar Sessão e Continuar” só habilitado após resposta válida com `project_id`.
- Permitir descarte da sessão chamando `DELETE /api/v1/verilog/projeto/{project_id}`.
- Cobrir acessibilidade, erros de arquivo inválido, upload interrompido e retomada de estado conforme #19.

## 2. Tela 2 — Seleção e síntese (`#s2`)

Dividir em quatro subfeatures. Todas dependem de `project_id` válido.

### 2a. Árvore de arquivos

- `rFT()` agrupa arquivos por diretório e renderiza a árvore local do projeto.
- Marcar fontes `.v` e `.sv`; distinguir testbenches dos arquivos sintetizáveis conforme regra do backend.
- Exibir erros de projeto sem fontes compatíveis retornados pelo fluxo de síntese/simulação.

### 2b. Seleção do módulo top

- `rTMS()` lista módulos candidatos encontrados no netlist após `mapear-processador`.
- Enquanto backend usar `hierarchy -auto-top`, tratar top como resultado da síntese e não como valor inventado pelo cliente.
- Se issue #20 introduzir seleção explícita de top, enviar esse campo pelo contrato atualizado e validar módulo antes da síntese.
- Habilitar avanço somente quando top e resultado de síntese estiverem confirmados.

### 2c. Síntese Yosys

- `startSyn()` chama `POST /api/v1/verilog/mapear-processador` com `project_id`.
- Mostrar estado `idle`, `running`, `success` e `error`; usar `stdout` e `stderr` como log da operação concluída.
- Não fabricar progresso percentual: endpoint atual é síncrono e não fornece streaming. Usar indicador indeterminado até existir contrato de progresso.
- `rNS()` extrai estatísticas da netlist tipada: módulos, células, portas, fios e demais campos disponíveis.
- Armazenar `netlist_content` para alimentar diagrama e seleção de sinais.
- Tratar timeout, container indisponível, erro de síntese e resposta sem `estrutura.json` conforme #3, #5, #12 e #22.

### 2d. Seleção de fios e sinais

- `rWireSel()` percorre sinais/portas do `netlist_content` e renderiza checklist.
- Implementar selecionar todos, limpar e busca por nome.
- Validar pelo menos um sinal antes de avançar.
- Persistir seleção para filtrar diagrama, lista de sinais e waveform após simulação.
- Não assumir que nomes, larguras ou hierarquia correspondem ao exemplo CPU 8-bit.

## 3. Tela 3 — Caminho de dados (`#s3`)

- `rDP()` gera SVG a partir do netlist Yosys recebido, incluindo módulos, células, portas, conexões e larguras disponíveis.
- Separar parser de netlist, layout e renderização para permitir evolução do contrato da issue #20.
- Destacar módulo top, sinais selecionados e conexões pesquisadas.
- Toolbar (`#ctbar`, `#bzi`, `#bzo`, `#bct`, `#bsr`) implementa zoom, pan, centralização e busca de sinal sobre SVG real.
- Minimapa (`#mmap`, `#mcan`, `#mvp`) reflete viewport e conteúdo renderizado; remover placeholder quando houver diagrama carregado.
- Painel de propriedades (`#ppan`) exibe dados do nó ou fio selecionado: referência, largura, tipo, módulo e conexões.
- Legenda exibe estados lógicos `0`, `1`, `X` e `Z`; valores dinâmicos vêm do `simulation_log` quando disponível.
- Atender desktop e mobile conforme issue #21, com navegação por teclado e fallback para estruturas grandes.

## 4. Tela 4 — Simulação (`#s4`)

### 4a. Lista de sinais e seleção

- `rSL()` constrói lista usando `simulation_log.modules` e `simulation_log.timeline`.
- `_tsg()` alterna sinais exibidos e sincroniza seleção com waveform e diagrama.
- Mostrar largura, tipo, caminho hierárquico, valor no timestamp atual e estados `0/1/X/Z`.
- Filtrar por módulo, nome e sinais escolhidos na tela 2.

### 4b. Diagrama de datapath ao vivo

- `rDP4()` reutiliza parser/layout do diagrama estático e aplica valores do timestamp atual.
- Elementos clicáveis (`dp-click`) selecionam módulo, célula ou fio correspondente ao netlist.
- `showWP()` exibe propriedades estruturais e valor atual obtido da timeline.
- Barra de buses mostra estado dos sinais selecionados e indica sinais sem amostra no timestamp.

### 4c. Waveform

- `rWF()` transforma `simulation_log.timeline` em séries por sinal, respeitando `metadata.begintime`, `endtime` e `timescale`.
- Renderizar barramentos com valor hexadecimal quando largura permitir e sinais escalares como onda digital.
- Desenhar grade de tempo, cursor atual e marcadores de transição.
- Implementar zoom (`#wz`) e ajuste (`#bfit`) sem alterar dados recebidos.
- Isolar renderer Canvas em módulo próprio para futura troca por biblioteca de visualização.
- Aplicar limites de sinais, timestamps e payload previstos na issue #15.

### 4d. Controles de timeline e playback

- `playLoop()` percorre timestamps presentes em `simulation_log`, sem gerar amostras inexistentes.
- Play/pause, anterior/próximo, reset, slider (`#tlr`), velocidade (`#sspd`) e intervalo (`#sint`) controlam somente cursor local.
- `startSimulation()` chama `POST /api/v1/verilog/simular-execucao` com `project_id` e atualiza estados de execução, sucesso e erro.
- Exibir `stdout`/`stderr` da compilação e execução para diagnóstico do usuário.
- Desabilitar playback quando resposta não contiver `simulation_log` utilizável.
- Tratar concorrência, cancelamento, timeout e artefatos isolados conforme #4, #5 e #6.

### 4e. Layout redimensionável

- Divisor `#sim-div` ajusta proporção entre diagrama e waveform.
- Encapsular como componente de split pane reutilizável, com limites mínimos, teclado e comportamento responsivo.

## 5. Encerramento e operação da sessão

- Ao sair do fluxo, chamar `DELETE /api/v1/verilog/projeto/{project_id}` e limpar referências locais.
- Não chamar `POST /limpar` em ações normais do usuário; esse endpoint remove múltiplas execuções e fica reservado à operação autorizada.
- Exibir indisponibilidade de Yosys, Icarus, Docker ou API usando o healthcheck `/status` quando contrato estiver implementado (#11).
- Validar fluxos sem Docker usando a suíte de testes e CI (#14).

## Ordem de implementação

1. Contratos tipados, cliente HTTP, estados de tela e design system.
2. Upload, ciclo de vida de `project_id` e tratamento de erros (#18, #19).
3. Síntese Yosys, netlist e estatísticas (#20, #22).
4. Parser/layout/renderizador compartilhado do datapath (#21).
5. Simulação Icarus, parsing VCD e limites de payload (#4, #15).
6. Lista de sinais, waveform e playback baseados em `simulation_log`.
7. Segurança, isolamento, retenção, logging e healthcheck (#5 a #12).
8. Testes de integração frontend-backend e CI (#14).
