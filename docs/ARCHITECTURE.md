# Architecture

## Overview

My Computer roda como um app local simples:

```text
Browser
  -> src/panel static files
  -> local Node HTTP API
  -> Groq chat completions
  -> local tools
  -> ~/.my-computer runtime
```

O servidor escuta em `127.0.0.1` e tenta portas livres a partir de `8787`.

## Project layout

- `src/panel/` - UI em HTML, CSS e JS puro.
- `src/server/server.js` - HTTP server, API JSON e static file serving.
- `src/server/store.js` - arquivos de config, chats, memoria, contexto e eventos.
- `src/server/assistant.js` - orquestracao do chat, contexto, tools e compactacao.
- `src/server/groq.js` - chamada OpenAI-compatible para Groq.
- `src/server/tools.js` - definicoes e execucao das tools.
- `src/cli/mc.js` - comando local para iniciar o painel.
- `scripts/` - install/uninstall.
- `docs/` - documentacao do produto e da arquitetura.

## Runtime layout

Por padrao, tudo que e dado do usuario fica em `~/.my-computer`:

```text
~/.my-computer/
  config.json
  events.jsonl
  chats/
    <chat-id>/
      metadata.json
      messages.json
      memory.md
      context.md
      context-window.md
      context-snapshots/
```

`MY_COMPUTER_HOME` pode apontar para outro diretorio.

## Chat flow

1. O painel carrega `/api/bootstrap`.
2. Se ainda nao existe setup, a UI mostra o formulario inicial.
3. O usuario cria ou abre um chat.
4. Cada chat tem seu proprio `model`; o modelo global e apenas o padrao para chats novos.
5. Ao enviar mensagem, o servidor monta o system prompt com:
   - preferencias globais
   - memoria do chat
   - contexto compactado
   - historico recente
6. Groq pode responder direto ou chamar tools.
7. Cada tool executada e salva no historico do chat e no event log.
8. A resposta final e salva em `messages.json`.
9. A janela atual de contexto e atualizada em `context-window.md`.

## Tools

### `run_terminal_command`

Executa um comando shell na maquina do usuario. A execucao usa timeout e limite de output, mas no MVP nao tem confirmacao manual antes de rodar.

### `memory_chat`

Gerencia `memory.md` do chat atual:

- `read` retorna a memoria atual.
- `append` adiciona notas Markdown.
- `write` substitui o arquivo pelo Markdown completo editado.

A memoria atual tambem e injetada no prompt, entao a IA consegue editar a versao existente quando decide usar `write`.

## Extension points

- Mais providers alem de Groq.
- Confirmacao antes de comandos sensiveis.
- Variaveis de ambiente pelo painel.
- Skills com permissoes.
- Navegacao web e automacao fora do terminal.
- Storage em SQLite quando arquivos JSON/Markdown deixarem de ser suficientes.
