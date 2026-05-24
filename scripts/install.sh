#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ e necessario."
  exit 1
fi

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  echo "Node.js 20+ e necessario."
  exit 1
fi

npm install
mkdir -p "${MY_COMPUTER_HOME:-$HOME/.my-computer}"

echo "Dependencias instaladas."
echo "Abrindo o painel local..."
npm run start -- --open
