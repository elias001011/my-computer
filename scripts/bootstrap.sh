#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME_DIR="${MY_COMPUTER_HOME:-$HOME/.my-computer}"
FRESH="no"
OPEN="yes"
START="yes"
PORT="${PORT:-8787}"
HOST="${HOST:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --fresh)
      FRESH="yes"
      shift
      ;;
    --no-open)
      OPEN="no"
      shift
      ;;
    --no-start)
      START="no"
      shift
      ;;
    --port)
      PORT="${2:-}"
      if [ -z "$PORT" ]; then
        echo "--port precisa de um valor."
        exit 1
      fi
      shift 2
      ;;
    --host)
      HOST="${2:-}"
      if [ -z "$HOST" ]; then
        echo "--host precisa de um valor."
        exit 1
      fi
      shift 2
      ;;
    --help|-h)
      cat <<'HELP'
Uso: ./install.sh [--fresh] [--no-open] [--no-start] [--port 8787] [--host 127.0.0.1]

--fresh    move o runtime atual para um backup e mostra o setup inicial
--no-open  inicia sem tentar abrir o navegador
--no-start instala dependências e prepara o runtime sem iniciar o servidor
--port     porta do painel local
--host     host de bind do servidor; por padrão o app decide pela config
HELP
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $1"
      echo "Use ./install.sh --help"
      exit 1
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
if [ "$START" = "no" ]; then
  echo "Runtime pronto em: $RUNTIME_DIR"
  echo "Para iniciar depois: npm run start:open"
  exit 0
fi

start_args=(--port "$PORT")
if [ -n "$HOST" ]; then
  start_args+=(--host "$HOST")
fi

echo "Abrindo o painel local..."
if [ "$OPEN" = "yes" ]; then
  npm run start -- --open "${start_args[@]}"
else
  npm run start -- "${start_args[@]}"
fi
