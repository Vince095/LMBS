#!/usr/bin/env bash
# Fault-tolerance demonstration for the 4-validator QBFT network.
#
# QBFT needs a quorum of ceil(2N/3) = 3 of N = 4 validators, so it tolerates
# f = floor((N-1)/3) = 1 faulty or stopped validator.
#   Step 1  all 4 running             -> blocks are produced
#   Step 2  node4 stopped (3 of 4)    -> blocks are STILL produced
#   Step 3  node3 also stopped (2/4)  -> block production HALTS (liveness limit)
#   Step 4  node3 and node4 restarted -> the network recovers and catches up
# Output is also written to network/generated/fault-tolerance-<timestamp>.log
set -euo pipefail
cd "$(dirname "$0")/.."
WAIT="${WAIT:-16}"
LOG="generated/fault-tolerance-$(date +%Y%m%dT%H%M%S).log"
rpc() { curl -s -X POST -H 'Content-Type: application/json' --data "{\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":[${3:-}],\"id\":1}" "http://127.0.0.1:$1"; }
block() { printf "%d" "$(rpc "$1" eth_blockNumber | sed -n 's/.*"result":"\(0x[0-9a-f]*\)".*/\1/p')"; }
say() { echo "$*" | tee -a "$LOG" >&2; }
measure() { local a b; a=$(block 8545); sleep "$WAIT"; b=$(block 8545); say "   node1 block $a -> $b over ${WAIT}s (+$((b - a)))"; echo $((b - a)); }

say "QBFT fault-tolerance demo  $(date -u +%FT%TZ)"
say "Validators: $(rpc 8545 qbft_getValidatorsByBlockNumber '"latest"' | sed 's/.*"result":\[\(.*\)\].*/\1/' 2>/dev/null || true)"
say "Step 1: all four validators running"; d1=$(measure | tail -n 1)
scripts/stop-node.sh 4 | tee -a "$LOG"
say "Step 2: node4 stopped (3 of 4 running, quorum = 3)"; d2=$(measure | tail -n 1)
scripts/stop-node.sh 3 | tee -a "$LOG"
say "Step 3: node3 also stopped (2 of 4 running, below quorum)"; d3=$(measure | tail -n 1)
scripts/start-node.sh 3 | tee -a "$LOG"; scripts/start-node.sh 4 | tee -a "$LOG"
say "Step 4: node3 and node4 restarted (waiting for JVM start-up and QBFT round change)"
start=$(date +%s); base=$(block 8545); d4=0
while [ $(( $(date +%s) - start )) -lt "${RECOVERY_TIMEOUT:-240}" ]; do
  sleep 5; now=$(block 8545 2>/dev/null || echo "$base")
  if [ "${now:-0}" -gt "$base" ]; then d4=$((now - base)); break; fi
done
say "   block production resumed after $(( $(date +%s) - start ))s (node1 at block $(block 8545))"
n4=$(block 8548)
say "   node4 has re-synced to block $n4"
say ""
say "RESULT  4/4: +$d1 blocks | 3/4: +$d2 blocks | 2/4: +$d3 blocks | recovered: +$d4 blocks"
if [ "$d1" -gt 0 ] && [ "$d2" -gt 0 ] && [ "$d3" -eq 0 ] && [ "$d4" -gt 0 ]; then
  say "PASS: tolerates one stopped validator; halts safely below quorum; recovers when quorum returns."
else
  say "CHECK: unexpected result, inspect generated/logs/"
fi
say "Log: $LOG"
