# Design

Identidade "Do código ao sinal" (2026-11-12). Substitui a "Maleta Didática".

## Ideia

O próprio Verilog é o protagonista. O aluno vê o caminho inteiro (código, portas, circuito, sinais) e
o mesmo sinal aparece com a mesma cor no código, no fio e na onda. Tudo que conduz, se move.

## Cor

Tokens em `frontend/src/styles/tokens.css`. Os nomes antigos foram mantidos porque as features leem.

| Papel | Claro | Uso |
|---|---|---|
| Papel | `--bg` #F1EEFB | fundo lavanda |
| Tinta | `--fg` / `--pcb` #1A1238 | texto, cabeçalho, blocos de código |
| Porta | `--gate` #FFD23F | portas lógicas, etapa atual, destaques didáticos |
| Ação | `--copper` #E11D5B | botão principal, cursor de tempo |
| Sinal 1 | `--s1` texto, `--w1` traço | verde, só para valor 1 |
| Sinal 0 | `--s0` texto, `--w0` traço | azul, só para valor 0 |
| X / Z | `--sx` laranja, `--sz` roxo | indefinido e alta impedância |

Regra: verde, azul, laranja e roxo são dado. Não usar como decoração.
Tema escuro em `:root[data-theme="dark"]`, com o amarelo virando a cor de seleção.

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
- Encaixe de ilustração com reserva em SVG (`Art` em `components/art.tsx`); briefs em
  `docs/design/imagens.md`.
