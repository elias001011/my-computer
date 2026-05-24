# UI Spec

## Shape

O MVP é uma single-page app branca, minimalista e funcional.

### Setup inicial

Campos:

- Provider: Groq.
- Groq API key.
- Modelo padrão em um seletor.
- Idioma da IA, com `Automático` como padrão.
- Apelido do usuário.
- System prompt geral.

### Layout principal

Desktop usa três áreas fixas:

- Esquerda: marca, botão de novo chat, configurações gerais e lista de chats.
- Centro: cabeçalho do chat, mensagens, tool groups e composer.
- Direita: configurações do chat, memória Markdown, status e eventos.

A página não cresce conforme o chat: a área de mensagens rola internamente.

## Chat behavior

- O histórico é persistido por chat.
- Cada tool aparece agrupada como `Tool usada` e começa recolhida.
- `run_terminal_command` mostra comando, stdout e stderr.
- `memory_chat` mostra input e resultado em JSON.
- O modelo ativo aparece no cabeçalho do chat.
- O usuário pode trocar o modelo do chat durante a conversa.

## Model selection

- O setup define o modelo padrão.
- Chat novo usa automaticamente o modelo padrão.
- O chat guarda o modelo em `metadata.json`.
- Trocar o modelo durante o chat é permitido e gera evento.

Trocar no meio pode mudar estilo, qualidade de tool calling e limite efetivo de contexto, mas não corrompe o histórico. Para o MVP, a regra é permitir, deixando visível e auditável.

## General settings modal

Inclui:

- Apelido.
- API key da Groq.
- Modelo padrão.
- Idioma.
- System prompt geral.
- Memória persistente.
- Toggles de tools.
- Explicação avançada sobre tools e contexto.

## Context and memory controls

- `Salvar snapshot` cria snapshot em `context-snapshots/` e atualiza `context-window.md`.
- `Compactar contexto` atualiza `context.md` usando Groq.
- `Memória do chat` edita `memory.md` manualmente.
- A IA também pode editar a memória via tool `memory_chat`.
- A IA pode editar memória global via `persistent_memory`.
- A IA pode compactar contexto via `compact_context`, se a tool estiver ligada.
