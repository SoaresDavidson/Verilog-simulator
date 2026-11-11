# Identidade visual — Bancada no Campus

O Verilog Classroom mistura dois mundos que o aluno conhece de cor: a **bancada de
eletrônica** (protoboard, placa de circuito, cobre, pinos dourados) e o **campus
modernista** (blocos grandes de cor, números de placa de edifício, azulejo modular,
carimbo de prancha técnica). É uma ferramenta de trabalho (modo *Operate*): a marca
aparece nos detalhes precisos, e a leitura e o fluxo vêm primeiro.

## Marca

`public/favicon.svg` e `BrandMark` (`src/components/art.tsx`) desenham um chip DIP
como fachada de universidade: frontão de cobre, corpo verde de placa, chanfro do
pino 1 virando arco, trilhas de cobre como colunas e pinos dourados como base.
As três colunas e o ponto do frontão **energizam** (ficam douradas) conforme as
etapas são concluídas: projeto enviado, síntese, caminho de dados e simulação.

## Cor (`src/styles/tokens.css`)

| Papel | Claro | Uso |
|---|---|---|
| Chão (protoboard) | `#eceee8` | fundo com malha de furos |
| Placa | `#fbfbf8` | cartões |
| Verde de máscara de solda | `#0f4d3a` | placa da etapa, seleção, foco, etapa ativa |
| Cobre | `#b0561d` | ação principal, trilhas, foco do teclado |
| Pino dourado | `#e3b25a` | destaque, etapa atual, seleção de texto |
| Estados lógicos | 0 `#2b62c4` · 1 `#23873f` · X `#b9630a` · Z `#6a51a8` | fios e formas de onda |

O tema claro é o padrão (laboratório de dia, projetor em sala). O escuro ("bancada
à noite") é ativado por `<html data-theme="dark">`.

## Tipografia

- **Big Shoulders Display**: títulos de etapa e números de placa. É o tipo
  municipal de sinalização de Chicago, com voz arquitetônica.
- **Atkinson Hyperlegible Next**: interface e texto. Foi criada pelo Braille
  Institute para máxima legibilidade.
- **Atkinson Hyperlegible Mono**: código, sinais, valores e caminhos.

Escala: display `clamp(40–60px)`, placa `clamp(34–46px)`, título de cartão 17px,
corpo 15px, dados 13px.

## Forma e componentes

- Cantos: 6 / 10 / 12 / 16 / 22 / 28px e pílula. Nada tem canto vivo.
- **Placa da etapa** (`Screen`): bloco verde com título, números da etapa,
  azulejo de portas lógicas (`GateTiles`, gerado por etapa) e carimbo de prancha
  (folha, projeto e top).
- **Barra de avanço** (`ActionBar`): fixa no rodapé, sempre diz o que falta para
  avançar e oferece o próximo passo.
- **Stepper**: pads de solda ligados por uma trilha de cobre que se preenche,
  com um pulso de sinal correndo por ela.
- Controles nativos redesenhados (checkbox, rádio, select com `base-select`,
  range, busca, details, scrollbar, seleção de texto). A semântica continua
  nativa e acessível.
- Ícones: grade 20×20, traço 1.8, pontas redondas (`src/components/icons.tsx`).
  Glifos de hardware em duas cores para as estatísticas e os arquivos.

## Movimento

Curva de saída exponencial (`--ease-out`) e mola (`--ease-spring`) só em
encaixes. Os momentos são estes: entrada da tela, azulejo em cascata (cada peça
gira ao passar o mouse), trilha que energiza, colunas da marca acendendo, chip
que encaixa na protoboard ao arrastar o .zip, estatísticas em sequência e onda
desenhando durante a simulação. Tudo é desligado em `prefers-reduced-motion`.

## Evitar

Cinza neutro sem tinta, fontes de interface genéricas (Inter, Space Grotesk),
glifos Unicode como ícone, `confirm()` e outros diálogos do navegador, e acento
neon com brilho.
