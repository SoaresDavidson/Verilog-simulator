## Título

Selecionar sinais para observar antes da simulação

## Labels sugeridas

`frontend`, `feature`, `prioridade:alta`

## Contexto

Depois que a síntese termina, o protótipo exibe um painel "Fios para
Visualizar" com todos os sinais disponíveis na netlist (nome, tipo — `wire`
ou `reg`, largura em bits, direção). O usuário marca quais sinais quer
acompanhar na simulação, com atalhos "Selecionar Todos" e "Limpar". Avançar
para a etapa de simulação é bloqueado enquanto nenhum sinal estiver marcado.

Essa seleção não existe em nenhuma issue hoje. É pré-requisito direto da
simulação (issue 5 deste conjunto) e do diagrama de caminho de dados
(issue 4), já que ambos usam a lista de sinais selecionados para decidir o
que renderizar e o que simular.

## Objetivo

Permitir que o usuário escolha, a partir da netlist sintetizada, quais
sinais serão simulados e exibidos no waveform, evitando sobrecarregar a
interface com centenas de sinais irrelevantes em designs grandes.

## Requisitos relacionados

- `RF06 - Selecionar sinais para simulação`
- `RN07 - Resultado do mapeamento` (fonte da lista de sinais é a netlist).

## Etapas de implementação

- Derivar a lista de sinais selecionáveis da netlist tipada (issue #20),
  não de um mock estático.
- Exibir nome, tipo (`wire`/`reg`), largura e direção de cada sinal.
- Implementar seleção múltipla via checkbox, com contador de sinais
  selecionados.
- Implementar ações "Selecionar Todos" e "Limpar Seleção".
- Bloquear avanço para a simulação enquanto a seleção estiver vazia, com
  mensagem explicando o motivo (reutilizar toast da issue 1).
- Persistir a seleção ao navegar entre etapas (voltar e avançar não deve
  resetar a seleção).
- Paginar ou virtualizar a lista para netlists com muitos sinais.

## Critérios de aceite

- [ ] Lista de sinais reflete exatamente os sinais da netlist sintetizada.
- [ ] Selecionar/desmarcar sinal atualiza contador e habilita/desabilita o
      avanço para simulação.
- [ ] "Selecionar Todos" marca todos os sinais disponíveis; "Limpar"
      desmarca todos.
- [ ] Tentar avançar sem seleção exibe mensagem de erro e não muda de tela.
- [ ] Seleção sobrevive à navegação de volta para uma etapa anterior e ao
      retorno para a simulação.
- [ ] Lista permanece utilizável (sem travar) com netlist grande.
- [ ] Testes cobrem: netlist vazia, seleção parcial, seleção total, limpeza.
- [ ] `npm run build` e `npm run lint` passam.

## Dependências

- #20 para o contrato tipado da netlist.
- #22 para o estado `SYNTHESIZED` que disponibiliza a netlist.
