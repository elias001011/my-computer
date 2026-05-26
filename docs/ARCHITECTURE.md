# Architecture

Atualizado em 26/05/2026.

## Visao geral

O app roda localmente com tres pecas principais:

```text
Browser
  -> src/panel/ (HTML/CSS/JS puro)
  -> Node HTTP server
  -> assistant + provider client
  -> tools locais
  -> runtime em ~/.my-computer
```

O objetivo e simples: abrir um painel local, conversar com um provider, usar tools locais quando precisar e guardar tudo num runtime proprio do usuario.

## Pecas principais

- `src/panel/` - interface local do painel.
- `src/server/server.js` - HTTP server, rotas JSON e arquivos estaticos.
- `src/server/assistant.js` - orquestra o chat, o contexto e o loop de tools.
- `src/server/provider-client.js` - conversa com providers e trata rotacao de API keys.
- `src/server/models.js` - catalogo de providers e modelos.
- `src/server/store.js` - persistencia local.
- `src/server/tools.js` - definicao e execucao das tools.
- `src/server/updater.js` - update via Git.
- `src/cli/mc.js` - CLI local para iniciar o app.

## Runtime local

Por padrao, os dados do usuario ficam em `~/.my-computer`:

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

`MY_COMPUTER_HOME` pode mudar esse caminho.

## Fluxo de uma mensagem

1. A UI envia a mensagem para `/api/chats/:id/messages`.
2. O servidor salva a mensagem do usuario.
3. O assistant monta o prompt com:
   - system prompt geral
   - preferencia do usuario
   - memoria persistente
   - memoria do chat
   - contexto compactado
   - historico recente
   - anexos
4. O provider escolhido recebe a chamada.
5. Se o modelo pedir tools, o assistant executa o loop de tools.
6. O resultado final volta para o chat e e salvo em `messages.json`.
7. Eventos relevantes tambem vao para `events.jsonl`.

Quando uma resposta falha ou para no meio:

- a tentativa continua salva como uma mensagem do assistente
- o grupo da tentativa recebe um `continuationGroupId`
- o painel mostra `Tentar novamente` e `Continuar`
- o modal de detalhes usa `messages.json` e a janela de eventos recentes de `events.jsonl` para reconstruir o processo

## Provider layer

O app usa tres estilos de catalogo:

- `curated` - modelos curados no codigo, com specs tecnicas fixas.
- `dynamic` - modelos descobertos em runtime via endpoint do provider.
- `local` - modelos locais descobertos na maquina do usuario.

### Descoberta dinamica

- OpenRouter: `GET /api/v1/models`
- Hugging Face: `https://huggingface.co/api/models?inference_provider=all`
- OpenAI compatible custom: `GET /models`
- Ollama: `GET /api/tags` e leitura de manifests locais

O bootstrap refaz essa descoberta para o painel nascer com a lista mais recente possivel.

## Rotacao

- `providerRotationEnabled` ativa fallback entre providers.
- `routing.fallbacks` guarda a ordem de tentativa.
- `routing.maxProviderPasses` limita quantas voltas a rotacao pode dar.
- Rotacao de modelos troca entre modelos do mesmo provider quando o usuario configurou fallback.

Cada tentativa, erro e sucesso gera evento para o chat ativo.
O painel carrega uma janela recente desses eventos para a UI e para o modal de detalhes.

## Tools

O app tem tools locais com aprovacao por UI:

- `run_terminal_command`
- `web_search`
- `memory_chat`
- `persistent_memory`
- `compact_context`
- `rename_chat`

Fluxo basico:

1. O provider responde com tool call.
2. O assistant valida se a tool esta habilitada.
3. Se a aprovacao for exigida, a UI pede permissao.
4. A tool roda.
5. O resultado volta como mensagem `tool`.
6. O provider recebe os resultados e continua a resposta.

Para saidas longas ou execucoes demoradas:

- a IA pode pedir `timeoutSeconds` na tool de terminal
- o backend espera o processo terminar antes de devolver `stdout`/`stderr`
- downloads e tarefas longas devem usar timeout maior, mas nao infinito

## Attachments

- Texto, markdown, json, csv, html e codigo podem passar por extracao local.
- Imagens so entram como multimodal quando o modelo suporta.
- Videos e audios ficam como referencia com preview local no MVP.
- PDFs e arquivos complexos ficam anexados com metadados e caminho local.
- O backend valida limites de tamanho e de quantidade antes de enviar.

## Contexto e memoria

- `memory.md` e memoria especifica do chat.
- `persistent-memory.md` vale para todos os chats.
- `context.md` guarda contexto compactado.
- `context-window.md` e a janela atual usada para explicar o estado do chat.
- `metadata.json` guarda provider, modelo e `modelSettings` do chat.

## Rede local

Por padrao, o painel fica em `127.0.0.1`.
Se o usuario ativar rede local com senha, o proximo restart pode escutar em `0.0.0.0` com Basic Auth simples.

## Update

O updater assume clone Git local.

Fluxo:

1. `git fetch --prune`
2. compara `HEAD` com o upstream
3. bloqueia se houver mudancas locais
4. quando o usuario confirma, roda `git pull --ff-only && npm install`
5. reinicia o servidor na mesma porta

## Model settings

Cada chat pode guardar ajustes como:

- temperatura
- top_p
- maxTokens
- stop
- seed
- penalties
- reasoningEffort

O frontend mostra so o que faz sentido para o provider/modelo atual.

## Resumo curto

Se voce precisar entender o app rapido, pense nele assim:

- UI local fala com Node local.
- Node local fala com provider ou tool local.
- O runtime salva estado e historico.
- O catalogo de modelos mistura curado + dinamico.
- A memoria e o contexto ficam no disco do usuario.
