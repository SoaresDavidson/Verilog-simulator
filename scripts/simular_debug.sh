#!/bin/bash
set -e

# Mostra o que recebeu para debug
echo "Arquivos recebidos:"
for f in "$@"; do echo "  $f"; done
echo ""

if [ $# -eq 0 ]; then
  echo "Uso: simular.sh arquivo1.v arquivo2.v ..."
  exit 1
fi

iverilog -g2012 -Wall -o /tmp/sim.vvp "$@"
vvp /tmp/sim.vvp