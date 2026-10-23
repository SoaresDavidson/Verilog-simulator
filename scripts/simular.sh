#!/bin/bash
# Compila e simula um projeto Verilog com Icarus.
# Códigos de saída (consumidos por backend/integrations/icarus.py):
#   0  sucesso
#   1  uso incorreto
#   10 falha de compilação (iverilog)
#   11 falha de simulação (vvp)
set -e

# Mostra o que recebeu para debug
echo "Arquivos recebidos:"
for f in "$@"; do echo "  $f"; done
echo ""

if [ $# -eq 0 ]; then
  echo "Uso: simular.sh arquivo1.v arquivo2.v ..."
  exit 1
fi

# Binário único por execução: simulações concorrentes no mesmo container
# não podem compartilhar o mesmo arquivo .vvp.
VVP=$(mktemp /tmp/sim.XXXXXXXX.vvp)
trap 'rm -f "$VVP"' EXIT

iverilog -g2012 -Wall -o "$VVP" "$@" || exit 10
vvp "$VVP" || exit 11
