# Identidade visual: Maleta Didática

O Verilog Classroom é desenhado como os **kits de treinamento de hardware** dos
laboratórios de engenharia: painel de alumínio, módulos serigrafados em preto,
bornes coloridos, teclas, chaves alavanca e displays de 7 segmentos. A interface
é uma ferramenta de aula: cada tela explica o que está acontecendo.

## Marca

`BrandMark` (`src/components/art.tsx`) e `public/favicon.svg`: um módulo do kit
com uma porta AND serigrafada e o borne vermelho na saída. Os três traços da
base marcam as etapas concluídas, e o LED acende quando a simulação roda.

## Material e cor (`src/styles/tokens.css`)

| Papel | Claro (alumínio) | Escuro (anodizado preto) |
|---|---|---|
| Painel | `#d6d9dc` | `#111315` |
| Módulo | `#eef0f2` | `#1c1f22` |
| Serigrafia | `#16181b` | `#eef0f2` |
| Ação (tecla) | borne vermelho `#d42a20` | `#e33a2f` |
| Destaque e foco | borne amarelo `#f2c200` | `#f2c200` |
| Bornes | vermelho, preto, amarelo, azul `#1767c7`, verde `#18904a` | os mesmos |
| Display de 7 segmentos | fundo `#142019`, dígito `#7dff8c` | o mesmo |
| Estados lógicos | 0 azul, 1 verde, X laranja, Z roxo (como no README) | versões claras |

## Tipografia

- **Sofia Sans Condensed** 800–900 em caixa alta: títulos, rótulos e teclas.
  É a voz da serigrafia.
- **Sofia Sans**: texto corrido e interface.
- **Fira Mono**: código, sinais, valores e displays.

## Componentes

- **Módulo** (`.module`, `.card`): placa com contorno serigrafado e parafusos
  Phillips nos quatro cantos.
- **Etapas**: bornes. Verde = concluída, vermelho = atual, amarelo = liberada,
  cinza = bloqueada. Entre eles, **cabos banana** que plugam com animação.
- **Teclas** (`.btn`): primária vermelha, secundária branca serigrafada; afundam
  3 px ao apertar.
- **Chave alavanca** (checkbox), **borne** (rádio), **knob** (range), select
  com menu próprio (`appearance: base-select`).
- **Displays de 7 segmentos** (`.figure`): os números de cada etapa. Na
  simulação mostram as saídas do módulo top no instante da timeline.
- **Barra de comando** (`ActionBar`): fixa no rodapé, com LED e o que falta
  para avançar.
- **Entenda esta etapa** (`Explainer`): módulo didático com mini-desenhos. Fica
  em faixa na Síntese e na Simulação e em coluna ao lado do diagrama no Caminho
  de Dados.
- **Maleta** (`KitCaseArt`) no upload: a tampa abre ao entrar, o chip desce ao
  arrastar o .zip e encaixa quando o arquivo é aceito.

## Diagrama do caminho de dados

- Layout pelo **ELK Layered** (`netlist/elk.ts`): algoritmo de Sugiyama com
  posições de pino fixas, camadas por network simplex, cruzamentos minimizados
  por varredura de camadas e fios ortogonais com espaçamento mínimo. O layout
  próprio (`netlist/layout.ts`) continua como fallback síncrono e nos testes.
- **Símbolos de livro-texto** (`render/GateSymbol.tsx`): AND, OR, XOR, NOT
  (com bolinha de inversão), MUX, flip-flop com triângulo de clock, somador e
  comparador.
- **Etiquetas de rede**: clock e reset que chegam a registradores, e as
  constantes, viram etiqueta no pino em vez de fio longo.
- Clicar num bloco abre as propriedades com uma explicação em linguagem de
  aula (`describeNode`).

## Movimento

Mecânico e curto: tampa da maleta, chip encaixando, cabos plugando, bornes
acendendo, teclas afundando, LEDs em sequência e dígitos dos displays piscando
ao mudar. Tudo é desligado em `prefers-reduced-motion`.

## Evitar

Cobre, laranja e terracota como cor de marca; gradientes e brilho decorativo;
fontes de interface genéricas (Inter, Space Grotesk); glifos Unicode como
ícone; diálogos nativos do navegador.
