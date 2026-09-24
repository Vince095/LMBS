#!/usr/bin/env bash
# Starts one validator node: scripts/start-node.sh <1-4>
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(cat generated/mode 2>/dev/null)" = "docker" ]; then docker compose start "node$1"; exit $?; fi
BESU="${BESU_BIN:-besu}"
GEN=generated
n="$1"
p2p=$((30302 + n)); rpc=$((8544 + n))
boot=$(head -n 1 "$GEN/enodes.txt")
args=(
  --data-path="$GEN/node$n/data"
  --genesis-file="$GEN/genesis.json"
  --node-private-key-file="$GEN/node$n/key"
  --sync-mode=FULL
  --p2p-host=127.0.0.1 --p2p-port="$p2p"
  --rpc-http-enabled --rpc-http-host=127.0.0.1 --rpc-http-port="$rpc"
  --rpc-http-api=ETH,NET,QBFT,WEB3,TXPOOL,PERM
  --rpc-http-cors-origins="http://localhost:3000"
  --host-allowlist="localhost,127.0.0.1"
  --min-gas-price=0
  --revert-reason-enabled
  --permissions-nodes-config-file-enabled
  --permissions-accounts-config-file-enabled
  --permissions-nodes-config-file="$GEN/permissions_config.toml"
  --permissions-accounts-config-file="$GEN/permissions_config.toml"
  --logging=INFO
)
[ "$n" != "1" ] && args+=(--bootnodes="$boot")
nohup "$BESU" "${args[@]}" > "$GEN/logs/node$n.log" 2>&1 &
echo "$n $!" >> "$GEN/besu.pids"
echo "node$n started (pid $!, rpc :$rpc, p2p :$p2p)"
