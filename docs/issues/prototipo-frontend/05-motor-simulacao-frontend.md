## Título

Implementar motor de simulação e controles de timeline no frontend (UC03)

## Labels sugeridas

`frontend`, `feature`, `prioridade:alta`

## Contexto

Nenhuma issue de frontend hoje cobre `UC03 - Simular`. O protótipo mocka
localmente uma simulação de 0 a 100 ns e implementa toda a mecânica de
reprodução: play/pause, passo anterior/próximo, reset, slider de timeline,
seletor de velocidade (0.5x/1x/2x/5x) e intervalo entre amostras
(1/5/10 ns). O tempo corrente (`S.st`) é a fonte única de verdade que
sincroniza o diagrama de caminho de dados (issue 4) e o waveform
(issue 6).

Esta issue cobre a integração real com o backend de simulação (endpoint
ainda não identificado nas issues existentes — verificar se já existe ou se
precisa ser tratado junto com o backend) e a máquina de estados/controles de
reprodução no cliente. Não cobre a renderização do waveform em si (issue 6)
nem o diagrama de caminho de dados (issue 4), apenas os dados e o tempo que
os alimentam.

## Objetivo

Buscar dados reais de simulação para os sinais selecionados (issue 3) e
fornecer um relógio de simulação controlável (play/pause/step/reset/
velocidade) que outras visualizações possam consumir.

## Requisitos relacionados

- `RF07 - Simular projeto` (ou identificador equivalente na wiki de
  requisitos — conferir `Requisitos-e-Casos-de-Uso.md`).
- Estados `SYNTHESIZED`, `SIMULATING`, `SIMULATED`, `ERROR`.

## Etapas de implementação

- Criar feature de simulação em `src/features/simulation`.
- Implementar cliente para o endpoint de simulação (definir junto ao
  backend caso ainda não exista contrato), enviando `project_id` e os
  sinais selecionados (issue 3).
- Modelar os dados de simulação retornados (série temporal por sinal) de
  forma tipada, análoga ao contrato de netlist (#20).
- Implementar relógio de simulação: tempo corrente, intervalo de amostra e
  duração total, como estado compartilhado entre diagrama e waveform.
- Implementar controles: play/pause, passo anterior, passo seguinte, reset,
  seleção de velocidade de reprodução, seleção de intervalo entre amostras.
- Impedir múltiplas requisições de simulação simultâneas e invalidar
  resultado anterior ao iniciar nova simulação com sinais diferentes.
- Tratar falha de simulação, timeout e indisponibilidade da API sem travar
  a interface (reaproveitar padrão de erro de #22).
- Parar a reprodução automaticamente ao atingir o fim da simulação.

## Critérios de aceite

- [ ] Simulação é disparada apenas com sinais selecionados válidos (issue 3)
      e sessão sintetizada.
- [ ] Estado muda para `SIMULATING` durante a chamada e `SIMULATED` após
      sucesso.
- [ ] Play reproduz o tempo automaticamente respeitando velocidade e
      intervalo escolhidos; pause interrompe sem perder o tempo corrente.
- [ ] Passo anterior/seguinte movem exatamente um intervalo, respeitando
      limites 0 e duração total.
- [ ] Reset volta ao tempo 0 e interrompe reprodução automática em curso.
- [ ] Reprodução para sozinha ao alcançar o fim da simulação.
- [ ] Falha de simulação exibe mensagem acionável e não deixa a interface
      em estado inconsistente.
- [ ] Testes cobrem: sucesso, falha da API, timeout, play até o fim, reset
      durante reprodução.
- [ ] `npm run build` e `npm run lint` passam.

## Dependências

- Issue 3 deste conjunto para os sinais selecionados.
- #22 para o padrão de estados e tratamento de erro de operações longas.
- Contrato do endpoint de simulação no backend (a confirmar/abrir issue de
  backend se não existir).
