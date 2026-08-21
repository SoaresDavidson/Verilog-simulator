## Título

Implementar diagrama interativo de caminho de dados (datapath)

## Labels sugeridas

`frontend`, `feature`, `prioridade:alta`

## Contexto

O protótipo apresenta, em duas telas, um diagrama SVG do caminho de dados
(blocos como PC, ROM, banco de registradores, MUX, ALU, unidade de
controle, acumulador, ligados por barramentos rotulados):

- Na tela de Caminho de Dados (pós-síntese): diagrama grande, com
  zoom/pan por arraste e roda do mouse, botões de zoom in/out/centralizar,
  busca de sinal e minimapa mostrando a região visível.
- Na tela de Simulação: versão compacta do mesmo diagrama, sincronizada
  com o instante de tempo corrente — cada bloco/fio é clicável e abre um
  popover com referência hierárquica, largura, tipo e valor atual do sinal.

A #21 cobre um visualizador de estrutura em árvore/tabela (módulos, portas,
células, fios). Esta issue cobre uma representação visual complementar —
um diagrama de blocos interativo — que não é obrigatoriamente genérico para
qualquer netlist no primeiro incremento, mas deve ao menos refletir os
blocos e conexões reais da netlist sintetizada em vez de um layout fixo.

## Objetivo

Fornecer visualização gráfica navegável do caminho de dados sintetizado,
reutilizável tanto na revisão pós-síntese quanto, com dados ao vivo, durante
a simulação.

## Requisitos relacionados

- `RF05 - Consultar estrutura mapeada`
- `RN07 - Resultado do mapeamento`

## Etapas de implementação

- Definir a partir de que dados da netlist tipada (#20) o diagrama é
  montado (módulos/células viram blocos, fios viram conexões rotuladas).
- Implementar canvas SVG com pan (arraste) e zoom (roda do mouse e botões
  dedicados), com limites mínimo/máximo de zoom.
- Implementar minimapa mostrando a área total do diagrama e o retângulo da
  área atualmente visível, sincronizado com pan/zoom.
- Implementar busca de sinal que localiza e centraliza o bloco/fio
  correspondente no diagrama.
- Tornar blocos e fios clicáveis, abrindo um popover com referência
  hierárquica, largura em bits, tipo (`wire`/`reg`) e direção.
- Na variante usada durante a simulação, ligar o valor exibido no popover e
  nos rótulos do diagrama ao instante de tempo corrente da simulação
  (issue 5 deste conjunto).
- Tratar netlists sem correspondência a um layout conhecido (design
  arbitrário) com um layout genérico ou mensagem indicando visualização
  limitada, sem quebrar a tela.
- Adaptar toolbar e minimapa em telas estreitas (ocultar minimapa,
  reposicionar toolbar conforme necessário).

## Critérios de aceite

- [ ] Diagrama é montado a partir da netlist sintetizada, não de dados fixos.
- [ ] Pan e zoom funcionam por arraste, roda do mouse e botões dedicados.
- [ ] Minimapa reflete corretamente a área visível durante pan/zoom.
- [ ] Busca de sinal localiza e centraliza o elemento correspondente.
- [ ] Clique em bloco ou fio abre popover com referência, largura, tipo e
      valor (valor apenas na variante de simulação).
- [ ] Diagrama permanece utilizável (sem travar) para netlists maiores que o
      exemplo do protótipo.
- [ ] Design sem layout conhecido não quebra a tela.
- [ ] Testes cobrem: netlist simples, netlist com barramentos largos,
      netlist sem correspondência de layout.
- [ ] `npm run build` e `npm run lint` passam.

## Dependências

- #20 para o contrato tipado da netlist.
- #21 pode compartilhar utilitários de leitura da netlist com esta issue.
- Issue 5 deste conjunto para a variante com valores ao vivo durante a
  simulação.
