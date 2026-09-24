#!/usr/bin/env bash
# Builds the clean source archive for submission (supervisor item 9.1).
# Uses `git archive`, so ONLY tracked files are included: no node_modules,
# .env files, keys (network/generated), deployments, logs, databases or builds.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit your changes first (the archive is built from HEAD)."; exit 1
fi
out="${1:-lmbs-source-$(git rev-parse --short HEAD).zip}"
git archive --format=zip -o "$out" HEAD
echo "Wrote $out ($(unzip -l "$out" | tail -n 1 | awk '{print $2}') files)"
if unzip -l "$out" | grep -E '(\.env$|accounts\.json|/key$|node_modules/|\.log$)' ; then
  echo "WARNING: unexpected files in archive"; exit 1
fi
