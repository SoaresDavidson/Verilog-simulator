## Título

Implementar navegação em etapas (wizard) com bloqueio condicional entre upload, síntese, caminho de dados e simulação

## Labels sugeridas

`frontend`, `feature`, `prioridade:alta`

## Contexto

O protótipo (`Verilog-simulator.wiki/index (1).html`) organiza todo o fluxo em
quatro telas — Upload, Seleção/Síntese, Caminho de Dados e Simulação —
navegáveis por um stepper no cabeçalho. Cada etapa só fica acessível quando a
anterior é concluída:

- Etapa 2 (Seleção/Síntese) exige upload concluído (`UPLOADED`).
- Etapa 3 (Caminho de Dados) exige síntese concluída (`SYNTHESIZED`).
- Etapa 4 (Simulação) exige síntese concluída **e** ao menos 1 sinal
  selecionado para observação.

Etapas concluídas ficam clicáveis para voltar; etapas bloqueadas ficam
visualmente desabilitadas (`opacity` reduzida, `aria-disabled`, tooltip
explicando o bloqueio) e não navegam ao clique. Tentativas de pular etapa via
código (ex.: `go(3)` sem síntese) disparam um toast de erro e não mudam de
tela.

Esta issue cobre apenas a casca de navegação (stepper, guardas de transição,
badge de sessão, sistema de toast). O conteúdo de cada tela é coberto pelas
issues #19, #22, #21 e pelas issues 2 a 6 deste conjunto.

## Objetivo

Fornecer um componente de navegação em etapas reutilizável que reflita o
estado real da sessão (upload, síntese, sinais selecionados) e impeça o
usuário de alcançar uma tela sem os pré-requisitos.

## Requisitos relacionados

- Estados de sessão `IDLE`, `UPLOADED`, `SYNTHESIZING`, `SYNTHESIZED`,
  `SIMULATING`, `SIMULATED`, `ERROR` (ver #19, #22).
- `RF12 - Apresentar logs e erros` (toasts de bloqueio/erro).

## Etapas de implementação

- Criar componente de stepper com 4 marcos: Upload, Seleção, Caminho de
  Dados, Simulação.
- Derivar estado visual de cada marco (`active`, `done`, `locked`) a partir
  do estado global da sessão, não de um índice fixo.
- Implementar guarda de navegação central: toda troca de tela passa por uma
  função que valida pré-condições antes de mudar a rota/tela.
- Exibir tooltip/`aria-label` explicando o motivo do bloqueio em marcos
  desabilitados.
- Permitir retornar a uma etapa concluída sem perder o estado já carregado
  (netlist, sinais selecionados, tempo de simulação).
- Implementar sistema de notificação toast (sucesso/erro) reutilizável pelas
  demais features.
- Exibir badge com identificador da sessão ativa (ex.: `project_id`) sempre
  que houver uma sessão criada.
- Garantir navegação e leitura do estado por teclado e leitor de tela
  (`aria-disabled`, `role="button"`, foco visível).
- Adaptar o stepper em telas estreitas (ocultar rótulos, manter apenas os
  indicadores numerados, conforme breakpoint do protótipo).

## Critérios de aceite

- [ ] Marco de etapa concluída é clicável e retorna à respectiva tela
      preservando dados carregados.
- [ ] Marco de etapa bloqueada não navega ao clique e comunica o motivo do
      bloqueio.
- [ ] Tentativa programática de pular etapa é bloqueada e gera toast de erro.
- [ ] Estado do stepper reflete corretamente upload, síntese e seleção de
      sinais em qualquer ordem de eventos.
- [ ] Badge de sessão aparece somente após sessão criada com sucesso.
- [ ] Toasts de sucesso e erro têm estilos distintos e desaparecem
      automaticamente sem exigir interação.
- [ ] Layout do stepper permanece utilizável em largura mobile.
- [ ] Testes cobrem: navegação livre entre etapas concluídas, bloqueio de
      etapas futuras, e liberação progressiva conforme estado avança.
- [ ] `npm run build` e `npm run lint` passam.

## Dependências

- Nenhuma (base estrutural para as demais telas).
