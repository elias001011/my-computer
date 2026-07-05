#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME_DIR="${MY_COMPUTER_HOME:-$HOME/.my-computer}"
REMOVE_DATA="no"
SKIP_DEPS="no"

for arg in "$@"; do
  case "$arg" in
    --remove-data|--yes)
      REMOVE_DATA="yes"
      ;;
    --keep-data)
      REMOVE_DATA="no"
      ;;
    --no-deps)
      SKIP_DEPS="yes"
      ;;
    --help|-h)
      cat <<'HELP'
Uso: ./uninstall.sh [--keep-data|--remove-data] [--no-deps]

--keep-data     remove dependências e preserva ~/.my-computer (padrão)
--remove-data   remove dependências e apaga runtime, chats, config, anexos e memórias
--no-deps       pula a etapa interativa de dependências opcionais (tmux/ollama/chromium)

A etapa de dependências opcionais só roda em terminal interativo. O MC nunca instala
tmux/ollama/Chromium sozinho -- eles são detectados no sistema e a remoção é sempre
perguntada, nunca automática, porque o script não tem como saber se você instalou isso
só por causa do MC ou se já usa em outra coisa. python3 é deixado de fora de propósito
(dependência do próprio sistema operacional).
HELP
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $arg"
      echo "Use ./uninstall.sh --help"
      exit 1
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

# --- Dependências opcionais (tmux, ollama) ------------------------------
#
# O MC nunca instala essas ferramentas por conta própria (nem tmux nem ollama fazem
# parte de install.sh/bootstrap.sh) -- elas são o que o usuário já tinha ou instalou
# manualmente seguindo as instruções do app quando faltavam. Por isso este script só
# detecta o que está presente e pergunta, nunca remove sozinho: não há como saber se
# foi instalado só por causa do MC ou se outro programa também depende disso.

if [ "$SKIP_DEPS" = "yes" ]; then
  exit 0
fi

if [ ! -t 0 ]; then
  echo ""
  echo "Terminal não interativo: pulando a checagem de dependências opcionais (tmux/ollama)."
  echo "Rode ./uninstall.sh manualmente num terminal pra ser perguntado sobre elas."
  exit 0
fi

echo ""
echo "Checando dependências opcionais que o MC pode ter usado (tmux, ollama)..."

confirm() {
  local prompt="$1"
  local answer=""
  read -r -p "$prompt [s/N] " answer || true
  case "$answer" in
    s|S|sim|Sim|SIM|y|Y|yes|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  elif command -v pacman >/dev/null 2>&1; then
    echo "pacman"
  elif command -v brew >/dev/null 2>&1; then
    echo "brew"
  else
    echo "unknown"
  fi
}

remove_via_package_manager() {
  local package="$1"
  local manager
  manager="$(detect_package_manager)"
  case "$manager" in
    apt)
      dpkg -s "$package" >/dev/null 2>&1 || return 1
      sudo apt-get remove -y "$package"
      ;;
    dnf)
      rpm -q "$package" >/dev/null 2>&1 || return 1
      sudo dnf remove -y "$package"
      ;;
    yum)
      rpm -q "$package" >/dev/null 2>&1 || return 1
      sudo yum remove -y "$package"
      ;;
    pacman)
      pacman -Qi "$package" >/dev/null 2>&1 || return 1
      sudo pacman -R --noconfirm "$package"
      ;;
    brew)
      brew list --formula "$package" >/dev/null 2>&1 || return 1
      brew uninstall "$package"
      ;;
    *)
      return 1
      ;;
  esac
}

# tmux: usado só pelo modo avançado de sessões de terminal (seção Terminal das
# configurações). Sem ele, o resto do app funciona normal -- só o modo avançado
# fica indisponível.
if command -v tmux >/dev/null 2>&1; then
  echo ""
  echo "tmux encontrado no sistema. O MC usa tmux só no modo avançado de sessões de"
  echo "terminal (opcional, desligado por padrão). Se você não usa tmux em outra coisa,"
  echo "pode remover com segurança."
  if confirm "Remover tmux também?"; then
    if remove_via_package_manager tmux; then
      echo "tmux removido."
    else
      echo "Não consegui remover tmux automaticamente neste sistema (gerenciador de"
      echo "pacotes não reconhecido ou tmux não foi instalado por um). Remova manualmente"
      echo "se quiser, ex.: sudo apt-get remove tmux / brew uninstall tmux."
    fi
  fi
fi

# Ollama: usado como provider opcional pra modelos locais. Tratamos binário/serviço
# separado dos modelos baixados porque os modelos podem somar vários GB e o usuário
# pode querer manter mesmo desinstalando o serviço (ou usá-los com outro app).
if command -v ollama >/dev/null 2>&1; then
  echo ""
  echo "ollama encontrado no sistema. O MC usa ele como provider opcional pra rodar"
  echo "modelos localmente. Se você só instalou o ollama por causa do MC e não usa em"
  echo "outro app, pode remover o serviço e, se quiser, os modelos baixados também."
  if confirm "Remover o serviço/binário do ollama?"; then
    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^ollama\.service'; then
      sudo systemctl stop ollama 2>/dev/null || true
      sudo systemctl disable ollama 2>/dev/null || true
      sudo rm -f /etc/systemd/system/ollama.service
      sudo systemctl daemon-reload 2>/dev/null || true
    fi
    ollama_bin="$(command -v ollama || true)"
    if [ -n "$ollama_bin" ]; then
      sudo rm -f "$ollama_bin"
      echo "Binário do ollama removido: $ollama_bin"
    fi
    if id ollama >/dev/null 2>&1; then
      echo "Usuário de sistema \"ollama\" ainda existe (não removido automaticamente por segurança)."
    fi
  fi
  ollama_models_dirs=("$HOME/.ollama" "/usr/share/ollama/.ollama")
  for models_dir in "${ollama_models_dirs[@]}"; do
    if [ -d "$models_dir" ]; then
      size="$(du -sh "$models_dir" 2>/dev/null | cut -f1 || echo '?')"
      echo ""
      echo "Modelos baixados do ollama encontrados em: $models_dir (uso em disco: $size)"
      if confirm "Apagar essa pasta de modelos também?"; then
        sudo rm -rf "$models_dir"
        echo "Removido: $models_dir"
      fi
    fi
  done
fi

# Chromium/Chrome: usado só pela tool de navegador (seção Tools, desligada por padrão).
# Mesmo tratamento do tmux -- o MC nunca instala isso sozinho, só detecta e pergunta.
chromium_bin=""
for candidate in google-chrome-stable google-chrome chromium chromium-browser chrome; do
  if command -v "$candidate" >/dev/null 2>&1; then
    chromium_bin="$candidate"
    break
  fi
done
if [ -n "$chromium_bin" ]; then
  echo ""
  echo "$chromium_bin encontrado no sistema. O MC usa Chromium/Chrome só na tool de"
  echo "navegador (opcional, desligada por padrão, screenshot/leitura de páginas). Se"
  echo "você não usa esse navegador pra mais nada, pode remover com segurança."
  if confirm "Remover $chromium_bin também?"; then
    if remove_via_package_manager "$chromium_bin"; then
      echo "$chromium_bin removido."
    else
      echo "Não consegui remover $chromium_bin automaticamente neste sistema (gerenciador"
      echo "de pacotes não reconhecido, ou foi instalado de outra forma, ex.: .deb baixado"
      echo "à parte). Remova manualmente se quiser, ex.: sudo apt-get remove $chromium_bin"
      echo "/ brew uninstall --cask google-chrome."
    fi
  fi
fi

echo ""
echo "python3 não entra nesta checagem de propósito: é uma dependência do próprio"
echo "sistema operacional em praticamente todo Linux/macOS, e removê-lo pode quebrar"
echo "outras partes do sistema. Se você tiver certeza que só instalou python3 por"
echo "causa do MC, remova manualmente pelo gerenciador de pacotes do seu sistema."
