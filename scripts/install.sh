#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME_DIR="${MY_COMPUTER_HOME:-$HOME/.my-computer}"
FRESH="no"
OPEN="yes"

for arg in "$@"; do
  case "$arg" in
    --fresh)
      FRESH="yes"
      ;;
    --no-open)
      OPEN="no"
      ;;
    --help|-h)
      cat <<'HELP'
Uso: ./install.sh [--fresh] [--no-open]

--fresh    move o runtime atual para um backup e mostra o setup inicial
--no-open  inicia sem tentar abrir o navegador
HELP
      exit 0
      ;;
  esac
done

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

if [ "$FRESH" = "yes" ] && [ -d "$RUNTIME_DIR" ]; then
  backup="${RUNTIME_DIR}.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$RUNTIME_DIR" "$backup"
  echo "Runtime anterior movido para: $backup"
fi

mkdir -p "$RUNTIME_DIR"

echo "Dependencias instaladas."
echo "Abrindo o painel local..."
if [ "$OPEN" = "yes" ]; then
  npm run start -- --open
else
  npm run start
fi
