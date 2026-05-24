# UI Spec

## Shape

O MVP é uma single-page app branca, minimalista e funcional.

### Setup inicial

Campos:

- Provider.
- API key quando o provider exige.
- Endpoint/base URL quando o provider usa configuração local ou custom.
- Modelo padrão em um seletor, com opção de modelo personalizado.
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
- Cada mensagem da IA tem botão de copiar.
- Erros de request aparecem na conversa e no painel com botão de retry.
- Quando uma request falha, o prompt do usuário permanece salvo no histórico com estado `falhou`; retry reaproveita essa mesma mensagem.
- O modelo ativo aparece no cabeçalho do chat.
- O usuário pode trocar provider e modelo do chat durante a conversa.
- `Enter` envia a mensagem; `Alt+Enter` insere nova linha.

## Model selection

- O setup define provider e modelo padrão.
- Chat novo usa automaticamente provider e modelo padrão.
- O chat guarda provider e modelo em `metadata.json`.
- Trocar provider/modelo durante o chat é permitido e gera evento.
- Cada seletor de modelo tem opção `Modelo personalizado`.
- Em Ollama, modelos instalados aparecem marcados e modelos ainda não instalados acionam pull automático no primeiro uso.

Trocar no meio pode mudar estilo, qualidade de tool calling e limite efetivo de contexto, mas não corrompe o histórico. Para o MVP, a regra é permitir, deixando visível e auditável.

## General settings modal

Inclui:

- Apelido.
- Provider padrão.
- Modelo padrão.
- Idioma.
- System prompt geral.
- Menu de providers e APIs, com endpoint/base URL por provider.
- Múltiplas API keys por provider, usadas em rotação quando uma chamada falha por autenticação, rate limit ou erro temporário.
- Memória persistente.
- Toggles de tools.
- Explicação avançada sobre tools e contexto.
- Export/import de configurações, chats, memórias e contexto.
- Botão para encerrar o servidor local, com instrução de como iniciar novamente.

## Context and memory controls

- `Salvar snapshot` cria snapshot em `context-snapshots/` e atualiza `context-window.md`.
- `Compactar contexto` atualiza `context.md` usando o provider/modelo do chat.
- `Memória do chat` edita `memory.md` manualmente.
- A IA também pode editar a memória via tool `memory_chat`.
- A IA pode editar memória global via `persistent_memory`.
- A IA pode compactar contexto via `compact_context`, se a tool estiver ligada.
- A IA pode renomear o chat via `rename_chat`, se a tool estiver ligada.

## Chat events

O painel de eventos mostra apenas eventos do chat ativo. Eventos globais continuam no arquivo `events.jsonl`, mas não poluem a visão de cada conversa.
