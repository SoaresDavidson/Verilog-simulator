## Título

Implementar visualizador de formas de onda (waveform)

## Labels sugeridas

`frontend`, `feature`, `prioridade:alta`

## Contexto

O protótipo renderiza, em `<canvas>`, uma visão de waveform clássica de
ferramentas EDA: uma coluna fixa com o nome de cada sinal selecionado à
esquerda, uma régua de tempo no topo, um cursor vertical marcando o tempo
corrente, sinais de 1 bit desenhados como onda quadrada (alto/baixo) e
sinais multi-bit (barramentos) desenhados como trilha com transições e o
valor hexadecimal/binário rotulado em cada trecho estável. Inclui zoom
horizontal e um botão "Ajustar" para recalcular o zoom ideal.

Esta issue cobre exclusivamente a renderização do waveform a partir dos
dados e do tempo fornecidos pela issue 5. Não cobre o disparo da simulação
nem os controles de reprodução (timeline, play/pause), que pertencem à
issue 5 — o waveform apenas lê o tempo corrente e reage a ele.

## Objetivo

Exibir a evolução dos sinais selecionados ao longo do tempo de forma legível
e navegável, para tempos com um único bit e para barramentos.

## Requisitos relacionados

- `RF08 - Visualizar formas de onda` (ou identificador equivalente na wiki
  de requisitos — conferir `Requisitos-e-Casos-de-Uso.md`).

## Etapas de implementação

- Implementar componente de renderização em canvas, redimensionável e
  compatível com telas de alta densidade de pixels (`devicePixelRatio`).
- Desenhar régua de tempo com marcações adaptadas ao nível de zoom.
- Desenhar sinais de 1 bit como onda quadrada distinguindo visualmente
  nível alto e baixo.
- Desenhar sinais multi-bit como trilha única com transições nos pontos de
  mudança de valor e rótulo (hexadecimal ou binário conforme largura) nos
  trechos estáveis.
- Desenhar cursor vertical no tempo corrente, sincronizado com o relógio de
  simulação (issue 5).
- Implementar zoom horizontal e botão "Ajustar" que recalcula o zoom para
  caber toda a duração simulada na largura visível.
- Redesenhar corretamente ao redimensionar a janela ou o painel.
- Tratar lista de sinais vazia e simulação ainda não executada sem erro
  visual.
- Considerar acessibilidade mínima: alternativa textual (ex.: tabela oculta
  ou resumo) para leitores de tela, já que o conteúdo é um canvas.

## Critérios de aceite

- [ ] Sinais de 1 bit são renderizados como onda quadrada correta para os
      dados de simulação fornecidos.
- [ ] Sinais multi-bit mostram transições e valores legíveis nos trechos
      estáveis.
- [ ] Cursor de tempo acompanha o relógio de simulação em tempo real durante
      reprodução e ao mover manualmente o tempo.
- [ ] Zoom horizontal funciona sem distorcer o alinhamento entre régua,
      cursor e formas de onda.
- [ ] Botão "Ajustar" enquadra toda a duração simulada na largura visível.
- [ ] Redimensionar a janela mantém a renderização correta.
- [ ] Painel vazio ou sem simulação executada exibe estado vazio claro, sem
      canvas quebrado.
- [ ] Testes cobrem: sinal de 1 bit, sinal multi-bit, lista vazia, zoom
      mínimo e máximo.
- [ ] `npm run build` e `npm run lint` passam.

## Dependências

- Issue 5 deste conjunto para os dados de simulação e o relógio
  compartilhado.
- Issue 3 deste conjunto para a lista de sinais selecionados.
