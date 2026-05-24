# Architecture

## Overview

My Computer roda como um app local simples:

```text
Browser
  -> src/panel static files
  -> local Node HTTP API
  -> provider client
  -> local tools
  -> ~/.my-computer runtime
```

O servidor escuta em `127.0.0.1` e tenta portas livres a partir de `8787`.

## Project layout

- `src/panel/` - UI em HTML, CSS e JS puro.
- `src/server/server.js` - HTTP server, API JSON e static file serving.
- `src/server/store.js` - arquivos de config, chats, memória, contexto e eventos.
- `src/server/assistant.js` - orquestração do chat, contexto, tools e compactação.
- `src/server/provider-client.js` - chamadas para providers, rotação de API keys e Ollama.
- `src/server/models.js` - catálogo de providers e modelos sugeridos.
- `src/server/tools.js` - definições e execução das tools.
- `src/cli/mc.js` - comando local para iniciar o painel.
- `scripts/` - install/uninstall.
- `docs/` - documentação do produto e da arquitetura.

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
      attachments.json
      attachments/
      context-snapshots/
```

`MY_COMPUTER_HOME` pode apontar para outro diretório.

## Chat flow

1. O painel carrega `/api/bootstrap`.
2. Se ainda não existe setup, a UI mostra o formulário inicial.
3. O usuário cria ou abre um chat.
4. Chat novo usa provider e modelo padrão das configurações gerais.
5. Cada chat salva seu próprio `provider` e `model`; trocar durante a conversa é permitido e auditável.
6. Ao enviar mensagem, o servidor monta o system prompt com:
   - preferências globais
   - memória persistente
   - preferências do chat
   - memória do chat
   - contexto compactado
   - histórico recente
7. O provider selecionado pode responder direto ou chamar tools.
8. Cada tool executada é salva no histórico do chat e no event log.
9. A resposta final é salva em `messages.json`.
10. A janela atual de contexto é atualizada em `context-window.md`.

Eventos são gravados em um `events.jsonl` global, mas a UI mostra apenas os eventos do chat ativo.

## Tools

### `run_terminal_command`

Executa um comando shell na máquina do usuário. A execução usa timeout e limite de output, mas no MVP não tem confirmação manual antes de rodar.
O stdin é fechado automaticamente para evitar prompts interativos travados, e o processo é encerrado por timeout.

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

### `rename_chat`

Permite que a IA renomeie o chat atual com um título curto e descritivo, normalmente depois da primeira mensagem.

## Tool permissions

As configurações gerais guardam toggles para:

- terminal local
- memória do chat
- memória persistente
- compactação automática por tool
- título do chat por tool

Quando uma tool é desligada, ela não é enviada ao modelo.

## Providers

O app suporta providers OpenAI-compatible por uma camada comum de `baseUrl + /chat/completions`, incluindo:

- Groq
- OpenAI
- OpenRouter
- Hugging Face Router
- Gemini OpenAI compatibility
- xAI
- Ollama
- OpenAI compatível customizado

Anthropic usa um adaptador próprio para a Messages API e converte tool calls para o formato interno do app.

As configurações guardam `providerSettings` por provider, com endpoint e múltiplas API keys. Quando há várias keys, o client tenta a próxima em erros de autenticação, rate limit ou falhas temporárias. O provider `openai-compatible` cobre APIs como Minimax, Together, Fireworks e servidores próprios que aceitam o formato OpenAI.

Ollama usa o endpoint local OpenAI-compatible por padrão (`http://127.0.0.1:11434/v1`). Antes de chamar um modelo, o backend verifica `/api/tags`; se o modelo não estiver instalado, chama `/api/pull` com `stream: false`.

## Import/export

`/api/export` gera um JSON com configurações, chats, mensagens, memórias, contexto salvo e anexos. `/api/import` importa esse JSON e pode sobrescrever chats com o mesmo id.

## Attachments

Anexos são salvos por chat em `attachments/`, com metadados em `attachments.json`.

Fluxo:

1. A UI lê o arquivo como base64 e envia para `/api/chats/:id/attachments`.
2. O servidor salva o arquivo no runtime do chat.
3. Texto, Markdown, JSON, CSV, HTML e código passam por extração de texto local.
4. HTML é reduzido para texto legível, sem scripts/styles.
5. Imagens ficam salvas e podem ser enviadas como `image_url` base64 para modelos marcados como vision.
6. Formatos sem extração nativa, como PDF/DOCX, entram como referência com caminho local.

Na chamada ao modelo:

- documentos com texto extraído entram em uma seção `<attachments>` no conteúdo da mensagem;
- imagens entram como conteúdo multimodal apenas se `modelSupportsImages` retornar verdadeiro;
- se o usuário tentar enviar imagem para um modelo sem suporte, o backend rejeita com erro claro e a UI também bloqueia antes do envio;
- a IA sempre recebe o caminho local do anexo, então pode usar `run_terminal_command` para inspecionar o arquivo quando a tool estiver habilitada.

## Shutdown

O painel tem uma ação de encerrar o servidor local. Para iniciar novamente, rode `./install.sh` ou `npm run start:open` na raiz do projeto.

## Extension points

- Confirmação antes de comandos sensíveis.
- Variáveis de ambiente pelo painel.
- Skills com permissões.
- Navegação web e automação fora do terminal.
- Storage em SQLite quando arquivos JSON/Markdown deixarem de ser suficientes.
