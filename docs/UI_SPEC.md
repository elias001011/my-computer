# UI Spec

## Shape

O MVP e uma single-page app branca, minimalista e funcional.

### Setup inicial

Campos:

- Provider: Groq.
- Groq API key.
- Modelo padrao.
- Idioma da IA, com `Automatico` como padrao.
- System prompt extra / preferencias do usuario.

### Layout principal

Desktop usa tres areas:

- Esquerda: marca, modelo para novo chat, botao de novo chat e lista de chats.
- Centro: cabecalho do chat, mensagens, tool groups e composer.
- Direita: configuracao, modelo do chat, memoria Markdown, status e eventos.

Em telas menores, as areas empilham.

## Chat behavior

- O historico e persistido por chat.
- Cada tool aparece agrupada como `Tool usada`.
- `run_terminal_command` mostra comando, stdout e stderr.
- `memory_chat` mostra input e resultado em JSON.
- O modelo ativo aparece no cabecalho do chat.
- O usuario pode trocar o modelo do chat durante a conversa.

## Model selection

- O setup define o modelo padrao.
- Ao criar novo chat, a UI mostra um campo `Modelo do novo chat`.
- O chat guarda o modelo em `metadata.json`.
- Trocar o modelo durante o chat e permitido e gera evento.

Trocar no meio pode mudar estilo e qualidade da resposta, mas nao corrompe o historico. Para o MVP, a melhor regra e permitir, deixando visivel e auditavel.

## Context and memory controls

- `Salvar contexto` cria snapshot em `context-snapshots/`.
- `Compactar` atualiza `context.md` usando Groq.
- `Memoria do chat` edita `memory.md` manualmente.
- A IA tambem pode editar a memoria via tool `memory_chat`.
