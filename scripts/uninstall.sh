#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME_DIR="${MY_COMPUTER_HOME:-$HOME/.my-computer}"
REMOVE_DATA="no"

for arg in "$@"; do
  case "$arg" in
    --remove-data|--yes)
      REMOVE_DATA="yes"
      ;;
    --keep-data)
      REMOVE_DATA="no"
      ;;
  esac
done

rm -rf node_modules

if [ "$REMOVE_DATA" = "yes" ]; then
  rm -rf "$RUNTIME_DIR"
  echo "Runtime removido: $RUNTIME_DIR"
else
  echo "Dependencias removidas. Dados preservados em: $RUNTIME_DIR"
  echo "Use ./uninstall.sh --remove-data para apagar chats, config e memorias."
fi
