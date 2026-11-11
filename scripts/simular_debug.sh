#!/bin/bash
set -e

VVP=$(mktemp /tmp/sim.XXXXXXXX.vvp)
trap 'rm -f "$VVP"' EXIT

iverilog -g2012 -Wall -o "$VVP" "$@"
vvp "$VVP"
