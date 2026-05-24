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
- `src/server/store.js` - arquivos de config, chats, memória, contexto e eventos.
- `src/server/assistant.js` - orquestração do chat, contexto, tools e compactação.
- `src/server/groq.js` - chamada OpenAI-compatible para Groq.
- `src/server/tools.js` - definicoes e execucao das tools.
- `src/cli/mc.js` - comando local para iniciar o painel.
- `scripts/` - install/uninstall.
- `docs/` - documentacao do produto e da arquitetura.

## Runtime layout

Por padrão, tudo que é dado do usuário fica em `~/.my-computer`:

```text
~/.my-computer/
  config.json
  events.jsonl
  persistent-memory.md
  chats/
    <chat-id>/
      metadata.json
      messages.json
      memory.md
      context.md
      context-window.md
      context-snapshots/
```

`MY_COMPUTER_HOME` pode apontar para outro diretório.

## Chat flow

1. O painel carrega `/api/bootstrap`.
2. Se ainda não existe setup, a UI mostra o formulário inicial.
3. O usuário cria ou abre um chat.
4. Chat novo usa o modelo padrão das configurações gerais.
5. Cada chat salva seu próprio `model`; trocar durante a conversa é permitido e auditável.
6. Ao enviar mensagem, o servidor monta o system prompt com:
   - preferências globais
   - memória persistente
   - preferências do chat
   - memória do chat
   - contexto compactado
   - histórico recente
7. Groq pode responder direto ou chamar tools.
8. Cada tool executada é salva no histórico do chat e no event log.
9. A resposta final é salva em `messages.json`.
10. A janela atual de contexto é atualizada em `context-window.md`.

## Tools

### `run_terminal_command`

Executa um comando shell na máquina do usuário. A execução usa timeout e limite de output, mas no MVP não tem confirmação manual antes de rodar.

### `memory_chat`

Gerencia `memory.md` do chat atual:

- `read` retorna a memória atual.
- `append` adiciona notas Markdown.
- `write` substitui o arquivo pelo Markdown completo editado.

A memória atual também é injetada no prompt, então a IA consegue editar a versão existente quando decide usar `write`.

### `persistent_memory`

Gerencia `persistent-memory.md`, memória global compartilhada por todos os chats.

- `read` retorna a memória persistente atual.
- `append` adiciona notas Markdown.
- `write` substitui o arquivo pelo Markdown completo editado.

### `compact_context`

Permite que a IA compacte o histórico do chat para `context.md` quando a conversa estiver longa ou quando decisões importantes precisarem virar contexto durável.

## Tool permissions

As configurações gerais guardam toggles para:

- terminal local
- memória do chat
- memória persistente
- compactação automática por tool

Quando uma tool é desligada, ela não é enviada ao modelo.

## Extension points

- Mais providers além de Groq.
- Confirmação antes de comandos sensíveis.
- Variaveis de ambiente pelo painel.
- Skills com permissões.
- Navegação web e automação fora do terminal.
- Storage em SQLite quando arquivos JSON/Markdown deixarem de ser suficientes.
