# Glossario — prototipo Verilog Simulator

Termos e identificadores do `prototype/index (1).html`, pra time entender o codigo mock antes de portar pro stack real.

## Estado global

| Termo | O que e |
|---|---|
| `S` | Objeto unico de estado global do app (nao e lib, e objeto JS mutavel). Guarda tela atual, fase do fluxo, arquivos, modulo top, sinais, tempo de simulacao, zoom/pan etc. No produto real vira store real (Redux/Zustand/Context). |
| `PH` | Enum de fase do fluxo (maquina de estado): `IDLE, UPD, UPLOADED, SYN, SYNED, SIM, SIMED, ERR`. Guardado em `S.ph`. Controla o que esta liberado (ex: `SYNED` libera telas 3/4). |
| `S.scr` | Numero da tela atual (1 a 4). |
| `S.ssig` / `S.asig` | Sinais selecionados / sinais disponiveis pra visualizar na simulacao. |

## Navegacao / stepper

| Termo | O que e |
|---|---|
| `STEPS` | Array com nome dos 4 passos do wizard: `["Upload","Selecao","Caminho de Dados","Simulacao"]`. |
| `rStp()` | Renderiza o stepper do header. Monta um botao por `STEPS`, marca `active`/`done`/`locked` conforme `S.scr` e `updateStepperState()`. Prefixo `r` = "render" (padrao usado em toda a codebase: `rFT`, `rNS`, `rDP`, `rWF`, `rSL`...). |
| `go(n)` | Navega pra tela `n`. Valida se pode ir (bloqueia com toast se etapa anterior nao concluida), troca `S.scr`, alterna classe `.on` nas sections, redispara `rStp()` e o render especifico da tela destino. |
| `window._go` | Copia de `go()` exposta em `window` pra funcionar em `onclick="_go(n)"` inline no HTML gerado. |
| radio list | Grupo de `<input type="radio">` com mesmo `name` — so 1 pode ficar marcado por vez. Usado em `rTMS()` pra escolha exclusiva do modulo top. |

## Formatacao / helpers numericos

| Termo | O que e |
|---|---|
| `h8(v)` | Formata valor como hex 8-bit: `0xFF`. Usado em PC, ACC, resultado da ALU. |
| `b8(v)` | Formata valor como binario de 8 bits: `"00101010"`. |
| `b3(v)` | Igual, mas 3 bits — usado no campo `alu_op[2:0]`. |
| `clp(v,a,b)` | `clamp` — trava `v` entre `a` e `b`. Usado no timeline (nao deixar `S.st` passar de 0/`S.smax`) e no resize do split pane. |
| `sc(v)` | Retorna cor conforme bit (0 ou 1) — verde se 1, azul se 0. Usado pra colorir sinal binario. |

## Sintese / arquivos (tela 2)

| Termo | O que e |
|---|---|
| `MF` | Mock File list — lista fake de arquivos do projeto (`src/top.sv`, `tb/cpu_tb.sv` etc), simula o que viria do upload real. |
| `rFT()` | Render File Tree — agrupa `MF` por diretorio e desenha a arvore de arquivos. |
| `rTMS()` | Render Top Module Select — gera a radio list dos arquivos em `src/`, habilita botao de sintese ao escolher um. |
| `startSyn()` | Dispara a "sintese" mock (log fake linha a linha via `setTimeout`, sem Yosys real rodando). |
| `rNS()` | Render Netlist Stats — mostra cards com modulos/celulas/portas/fios apos sintese. |
| `rWireSel()` | Render Wire Selection — checklist de sinais pra escolher quais visualizar na simulacao. |

## Diagrama de datapath (telas 3 e 4)

| Termo | O que e |
|---|---|
| `rDP()` | Render DataPath — desenha o diagrama SVG estatico da tela 3 (Caminho de Dados). |
| `rDP4()` | Mesma ideia, versao menor/interativa pra tela 4 (durante simulacao), com elementos clicaveis. |
| `dp-click` | Classe CSS marcando elemento do SVG como clicavel (abre popover de detalhe do fio). |
| `showWP()` | Show Wire Popover — abre o popover com ref/largura/tipo/valor do fio clicado. |
| `gSV(t)` | Get Signal Values — gera valores fake de clk/rst/pc/acc/alu pro timestamp `t`. **So mock**, sera substituido por simulador real (Icarus/Verilator). |

## Waveform / simulacao (tela 4)

| Termo | O que e |
|---|---|
| `gWD()` | Get Waveform Data — pre-computa `gSV()` pra todos os timestamps de 0 a `S.smax`, guarda em `S.wd`. |
| `rWF()` | Render Waveform — desenha a forma de onda em `<canvas>` 2D (grid de tempo, cursor, ondas quadradas/hex). |
| `rSL()` | Render Signal List — lista lateral de sinais com valor atual. |
| `playLoop()` | Loop de reproducao automatica da simulacao (avanca `S.st` em intervalo, tipo play de video). |
| `syncTL()` | Sync Timeline — atualiza slider/label de tempo (`#tlr`, `#tlv`, `#tdisp`) conforme `S.st`. |
| `syncAll()` | Chama `rDP4()+rWF()+rSL()+syncTL()` juntos — re-renderiza tudo que depende do tempo atual. |

## Geral

| Termo | O que e |
|---|---|
| `toast(m,t,ms)` | Mostra notificacao temporaria (mensagem, tipo `o`=ok/`e`=erro, duracao). |
| prefixo `r...()` | Convencao do prototipo pra funcoes de render (recriam HTML/SVG/canvas a partir do estado). Nao mexe estado, so le e desenha. |
| prefixo `$` | Atalho pra `document.getElementById`, ex: `$('bsynth')` = `document.getElementById('bsynth')`. |
