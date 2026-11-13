# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primário: alunos de graduação (Sistemas Digitais, Arquitetura de Computadores) que querem ver o próprio
Verilog funcionar, muitas vezes pela primeira vez. Usam em laboratório/sala (PCs da universidade,
projetor, luz acesa) e em casa no notebook, inclusive à noite.

Secundários: professores que demonstram o circuito para a turma; profissionais testando uma simulação
pela web.

## Product Purpose

Receber um projeto Verilog/SystemVerilog em `.zip`, sintetizar com o Yosys, simular o testbench com o
Icarus Verilog e mostrar o resultado no navegador. Existe porque ler formas de onda cruas é
trabalhoso, sujeito a erro e intimidador para estudantes. Sucesso: o aluno entende o que o código
virou e como os sinais mudam, sem instalar nada.

## Positioning

Os valores da simulação aparecem no próprio desenho do circuito sintetizado, passo a passo, além das
formas de onda. O aluno vê o circuito que o código virou, não só ondas.

## Operating Context

Fluxo de quatro etapas, cada uma libera a seguinte:

1. Upload do `.zip` (módulos + testbench; lista de arquivos antes do envio).
2. Seleção e síntese (Yosys, módulo top automático, contagens, log, escolha dos fios a acompanhar).
3. Caminho de dados (diagrama do netlist com zoom, minimapa, painel de propriedades, aba Estrutura).
4. Simulação (Icarus, VCD aplicado ao diagrama, formas de onda, stdout/stderr).

## Capabilities and Constraints

- Frontend React 19 + Vite + CSS puro com tokens; diagrama com elkjs; forma de onda em canvas.
- Features e o renderizador de onda leem os nomes de token existentes (`--bg`, `--surface`,
  `--accent`, `--copper`, `--s0/--s1/--sx/--sz`...).
- Estados lógicos têm cor com significado: 0, 1, X (indefinido), Z (alta impedância).
- Interface em português do Brasil.
- Testes (vitest + testing-library) dependem de rótulos e papéis acessíveis atuais.

## Brand Commitments

- Nome: Verilog Classroom (mantido).
- Logo e identidade visual: novos (a identidade "Maleta Didática" foi descartada pelo usuário em
  2026-11-12).
- Pedido do usuário: visual único, sem cara de IA, com imagens personalizadas (geradas por ele no
  ChatGPT a partir de briefs), ícones, SVGs, animações interativas, fluxo fácil e intuitivo.

## Evidence on Hand

- Capturas reais das telas em `docs/img/`.
- Sem depoimentos, números de uso ou clientes: não inventar.

## Product Principles

1. O circuito é o protagonista: tudo aponta para o desenho e para os sinais.
2. Não intimidar: linguagem de aluno, um passo de cada vez.
3. Cor de sinal é dado, não decoração.
4. Funciona em sala clara e em quarto escuro.

## Accessibility & Inclusion

Navegação por teclado, foco visível e rótulos para leitor de tela já existem e não podem regredir.
Tema claro e escuro. `prefers-reduced-motion` respeitado.
