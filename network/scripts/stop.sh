#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f generated/besu.pids ] || { echo "No running network."; exit 0; }
while read -r n pid; do kill "$pid" 2>/dev/null && echo "node$n stopped"; done < generated/besu.pids
rm -f generated/besu.pids
