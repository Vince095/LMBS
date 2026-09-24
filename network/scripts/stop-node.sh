#!/usr/bin/env bash
# Stops one validator node: scripts/stop-node.sh <1-4>
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(cat generated/mode 2>/dev/null)" = "docker" ]; then docker compose stop "node$1"; exit $?; fi
n="$1"
pid=$(awk -v n="$n" '$1==n {print $2}' generated/besu.pids | tail -n 1)
[ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "node$n (pid $pid) stopped" || echo "node$n not running"
awk -v n="$n" '$1!=n' generated/besu.pids > generated/besu.pids.tmp && mv generated/besu.pids.tmp generated/besu.pids
