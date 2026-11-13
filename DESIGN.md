# Design

Identidade "Do código ao sinal" (2026-11-12, paleta Verilog fechada em 2026-11-13). Substitui a "Maleta Didática".

## Ideia

O próprio Verilog é o protagonista. O aluno vê o caminho inteiro (código, portas, circuito, sinais) e
o mesmo sinal aparece com a mesma cor no código, no fio e na onda. Tudo que conduz, se move.

## Cor

Tokens em `frontend/src/styles/tokens.css`. Cada paleta define só quatro cores-semente (`--p-ink`,
`--p-paper`, `--p-gate`, `--p-action`); o resto deriva delas com `color-mix`, no claro e no escuro.
Os nomes antigos de token foram mantidos porque as features leem.

Paleta padrão: **Verilog**, tirada do símbolo da linguagem (a elipse verde-lima).

| Papel | Claro | Uso |
|---|---|---|
| Papel | `--bg` #EEF6EC | fundo branco-esverdeado |
| Tinta | `--fg` / `--pcb` #0C2018 | texto, cabeçalho, blocos de código |
| Destaque | `--gate` #8FD645 | logo, etapa atual, narração, mascote |
| Corpo das portas | `--gate-fill` | verde-lima clareado, com contorno de tinta |
| Ação | `--copper` #0E6B3A | botão principal (no escuro vira o verde-lima) |
| Sinal 1 | `--s1` texto, `--w1` traço | verde-esmeralda, só para valor 1 |
| Sinal 0 | `--s0` texto, `--w0` traço | azul, só para valor 0 |
| X / Z | `--sx` laranja, `--sz` roxo | indefinido e alta impedância |

Regras:

- Esmeralda, azul, laranja e roxo são dado. Não usar como decoração.
- Sem amarelo na paleta padrão.
- Tema escuro (`data-theme="dark"`): fundo quase preto e cinzas neutros em todas as paletas; a tinta
  só tempera os cinzas.
- Outras paletas (`data-palette`): `grafite`, `placa`, `tinta`. Escolha do aluno pelo seletor do
  cabeçalho (`components/PaletteSwitch.tsx`), salva no navegador.

## Tipo

- Interface e títulos: Bricolage Grotesque (títulos 800, tracking -0.04em, caixa normal).
- Código, nomes de sinal e valores: JetBrains Mono.

## Forma

Raios grandes (12 a 26 px), botões em pílula, cartões brancos com sombra suave e sem borda. Portas e
ilustrações têm contorno grosso de tinta.

## Movimento

- Fio que conduz tem traços correndo (`trace-flow`, `dp-flow`).
- Mudança de valor faz a porta ou o LED "pular" uma vez (`ld-pop`).
- Botões encolhem ao apertar; a etapa atual gira de leve.
- `prefers-reduced-motion` desliga tudo.

## Peças

- Cabeçalho de tinta com a trilha de etapas (`app/Stepper.tsx`).
- Demonstração viva da entrada (`components/LiveDemo.tsx`), conteúdo de exemplo.
- Ilustrações em SVG animadas com Motion (`components/illustrations.tsx`): o mascote Bit em seis poses
  e as cenas do caminho. Briefs de referência em `docs/design/imagens.md`.
- Motion (`motion/react`) cuida do selo da etapa que desliza, da troca de tela e das entradas em
  lista; `MotionConfig reducedMotion="user"` fica em `app/AppProviders.tsx`.
