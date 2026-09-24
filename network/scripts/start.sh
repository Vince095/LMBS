#!/usr/bin/env bash
# Starts the four Besu QBFT validator nodes as local processes.
#   node1 RPC http://127.0.0.1:8545 (used by Hardhat, backend and frontend)
#   node2..node4 RPC 8546..8548
set -euo pipefail
cd "$(dirname "$0")/.."
GEN=generated
[ -f "$GEN/genesis.json" ] || { echo "Run scripts/setup.sh first."; exit 1; }
: > "$GEN/besu.pids"
mkdir -p "$GEN/logs"
for n in 1 2 3 4; do scripts/start-node.sh "$n"; done
echo "Waiting for blocks..."
for _ in $(seq 1 60); do
  bn=$(curl -s -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 2>/dev/null | sed -n 's/.*"result":"\(0x[0-9a-f]*\)".*/\1/p')
  if [ -n "${bn:-}" ] && [ "$((bn))" -gt 1 ]; then echo "Producing blocks (block $((bn)))."; exit 0; fi
  sleep 2
done
echo "Nodes started but no blocks yet; check $GEN/logs/"; exit 1
