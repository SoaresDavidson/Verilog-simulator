#!/bin/bash
set -e
iverilog -g2012 -Wall -o /tmp/sim.vvp "$@"
vvp /tmp/sim.vvp