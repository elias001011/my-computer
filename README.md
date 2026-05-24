# My Computer

My Computer e um painel self-hosted para conversar com uma IA que pode usar tools locais.
O MVP atual usa Groq como provider unico, roda em um servidor Node local e salva tudo em uma pasta central do usuario.

## Rodar

```bash
./install.sh
```

O script instala dependencias com `npm install`, cria o runtime em `~/.my-computer` e abre o navegador com o painel local.
O servidor fica em primeiro plano no terminal; use `Ctrl+C` para parar.

Tambem da para iniciar manualmente:

```bash
npm run start:open
```

## Desinstalar

```bash
./uninstall.sh
```

Por padrao, o uninstall remove `node_modules` e preserva os dados em `~/.my-computer`.
Para remover chats, memoria, config e logs tambem:

```bash
./uninstall.sh --remove-data
```

## O que existe no MVP

- Setup inicial com Groq API key, modelo padrao, idioma e system prompt extra.
- Modelo selecionavel ao criar cada chat.
- Modelo do chat editavel durante a conversa, com evento registrado.
- Chat com historico persistente.
- Tool `run_terminal_command` para a IA usar o terminal local.
- Tool `memory_chat` para a IA ler, anexar ou reescrever a memoria Markdown do chat.
- Memoria por chat em `memory.md`.
- Contexto compactado em `context.md`.
- Janela de contexto atual em `context-window.md`.
- Snapshots manuais de contexto em `context-snapshots/`.

## Estrutura

- `docs/` - documentacao alinhada ao MVP.
- `src/panel/` - painel web em HTML, CSS e JS puro.
- `src/server/` - servidor local, storage, Groq adapter e tools.
- `src/cli/` - CLI minima para iniciar e diagnosticar.
- `scripts/` - instalacao e desinstalacao.
- `tests/` - testes do storage local.

## Docs

Comece por [docs/INDEX.md](./docs/INDEX.md).
