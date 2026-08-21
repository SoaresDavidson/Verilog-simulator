# Issues derivadas do protótipo de frontend

Origem: `Verilog-simulator.wiki/index (1).html` — protótipo estático (HTML/CSS/JS
vanilla, sem build) do fluxo completo "Verilog Simulator": upload, seleção de
módulo top e síntese, diagrama de caminho de dados e simulação com waveform.

Nenhuma chamada de API real existe no protótipo (tudo mockado com `setTimeout`
e dados fixos de um exemplo de CPU 8-bit). Ele serve como especificação visual
e de interação, não como código a ser reaproveitado diretamente.

As issues #19, #20, #21 e #22 já existentes no repositório cobrem upload,
contrato da netlist e síntese. As issues abaixo cobrem o que o protótipo
revela e ainda não está coberto: seleção de módulo top, seleção de sinais,
diagrama interativo de caminho de dados, motor de simulação (UC03) e
visualizador de formas de onda.

| # | Arquivo | Título | Relação com issues existentes |
|---|---------|--------|--------------------------------|
| 1 | `01-navegacao-em-etapas.md` | Navegação em etapas (wizard) com bloqueio condicional | Casca/layout comum a #19, #21, #22 |
| 2 | `02-selecao-modulo-top.md` | Seleção de módulo top para síntese | Complementa #22 |
| 3 | `03-selecao-sinais-simulacao.md` | Seleção de sinais para observar antes da simulação | Novo (RF06), pré-requisito da issue 5 |
| 4 | `04-diagrama-caminho-dados.md` | Diagrama interativo de caminho de dados | Complementa #21, alternativa visual à árvore/tabela |
| 5 | `05-motor-simulacao-frontend.md` | Motor de simulação e controles de timeline (UC03) | Novo, nenhuma issue de frontend cobre UC03 hoje |
| 6 | `06-visualizador-formas-onda.md` | Visualizador de formas de onda (waveform) | Novo, depende da issue 5 |

Sugestão de ordem de implementação: 1 → 2 → 3 → 4 → 5 → 6 (a navegação em
etapas é pré-requisito estrutural; o restante segue a ordem do fluxo do
usuário).
