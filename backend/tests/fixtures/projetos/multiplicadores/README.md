# Projetos de teste: multiplicadores 16x16 das aulas

Projetos reais da série de aulas em `librelane/multiplicador-aulas`, usados nos testes
`test_upload_multiplicadores.py`, `test_netlist_multiplicadores.py` e
`test_multiplicadores_integration.py`. Os testbenches se autoverificam contra `a * b` e imprimem
`TODOS OS TESTES PASSARAM`.

| Projeto | Origem | Top | VCD |
|---|---|---|---|
| `shift_add` | aula 2 (`mult_shift_add.v`) + aula 7 (`tb_mult_shift_add.v`) | `mult_shift_add` | sim |
| `shift_add_vetores` | aula 2 + aula 1 (`tb_mult_vetores.v`, `vetores_mult.txt` via `$readmemh`) | `mult_shift_add` | sim |
| `array` | aula 6 (`mult_array.v`) + `tb_mult_shift_add.v` com `DUT_MODULE=mult_array` | `mult_array` | sim |
| `array_pipe` | aula 7 (`mult_array_pipe.v`, `tb_mult_fluxo.v`) | `mult_array_pipe` | não |
| `array_pipe32` | aula 7 (`mult_array_pipe32.v`) + `tb_mult_fluxo.v` com `DUT_MODULE=mult_array_pipe32` | `mult_array_pipe32` | não |

Os arquivos são cópias sem alteração, com uma exceção: os testbenches com `DUT_MODULE` fixado
ganharam um cabeçalho com `` `define DUT_MODULE ...``, porque o simulador não repassa `-D` ao
`iverilog`.

`tb_mult_fluxo.v` só abre o VCD quando recebe o plusarg `+vcd=`, que o simulador também não
repassa. Por isso os dois projetos de pipeline simulam com sucesso, mas sem `simulation_log`.

As netlists em `../../netlist/multiplicadores/` saíram da imagem `verilog-classroom/yosys`
(Yosys 0.23), com o mesmo comando da integração.
