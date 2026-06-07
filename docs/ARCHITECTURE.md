# Architecture

Atualizado em 26/05/2026.

## Visão geral

O app roda localmente com três peças principais:

```text
Browser
  -> src/panel/ (HTML/CSS/JS puro)
  -> Node HTTP server
  -> assistant + provider client
  -> tools locais
  -> runtime em ~/.my-computer
```

O objetivo é simples: abrir um painel local, conversar com um provider, usar tools locais quando precisar e guardar tudo num runtime próprio do usuário.

## Pecas principais

- `src/panel/` - interface local do painel.
- `src/server/server.js` - HTTP server, rotas JSON e arquivos estáticos.
- `src/server/assistant.js` - orquestra o chat, o contexto e o loop de tools.
- `src/server/provider-client.js` - conversa com providers e trata rotação de API keys.
- `src/server/models.js` - catálogo de providers e modelos.
- `src/server/store.js` - persistência local.
- `src/server/tools.js` - definição e execução das tools.
- `src/server/updater.js` - update via Git.
- `src/cli/mc.js` - CLI local para iniciar o app.

## Runtime local

Por padrão, os dados do usuário ficam em `~/.my-computer`:

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

Gravações que dependem de ler, mesclar e escrever estado são serializadas por arquivo dentro do processo Node. Isso cobre JSON de config/mensagens/metadados/anexos e appends de memória Markdown usados pelas tools. O objetivo é evitar colisão entre envios simultâneos, aprovações de tool, updates de metadados, anexos e memória no mesmo runtime.

O export/import opera sobre esse runtime. O backup serializa a configuração normalizada completa, memória persistente global, arquivos adicionais de memória do usuário, chats, contexto, anexos e eventos; na importação, a UI permite escolher esses grupos separadamente. Quando o grupo de configuração é importado, ele substitui a configuração atual como snapshot completo, em vez de mesclar modelos customizados antigos.

## Fluxo de uma mensagem

1. A UI envia a mensagem para `/api/chats/:id/messages`.
2. O servidor salva a mensagem do usuário.
3. O assistant monta o prompt com:
   - system prompt geral
   - preferência do usuário
   - memória persistente
   - memória do chat
   - contexto compactado
   - histórico recente
   - anexos
4. O provider escolhido recebe a chamada.
5. Se o modelo pedir tools, o assistant executa o loop de tools.
6. O resultado final volta para o chat e é salvo em `messages.json`.
7. Eventos relevantes também vão para `events.jsonl`.

Quando uma resposta falha ou para no meio:

- a tentativa continua salva como uma mensagem do assistente
- o grupo da tentativa recebe um `continuationGroupId`
- o painel mostra `Tentar novamente` e `Continuar`
- o backend aceita apenas um envio/retry/continue em andamento por chat e bloqueia retry/continue em tentativa superseded
- o modal de detalhes usa `messages.json` e a janela de eventos recentes de `events.jsonl` para reconstruir o processo
- falhas reais de tool, timeout e signal mantêm a tentativa como incompleta ou falha; exit code de terminal diferente de zero só interrompe automaticamente quando a IA não pediu `returnOutput: true`

## Provider layer

O app usa três estilos de catálogo:

- `curated` - modelos curados no código, com specs técnicas fixas.
- `dynamic` - modelos descobertos em runtime via endpoint do provider.
- `local` - modelos locais descobertos na máquina do usuário.

### Descoberta dinâmica

- OpenRouter: `GET /api/v1/models`
- Hugging Face: `https://huggingface.co/api/models?inference_provider=all`
- OpenAI compatível: `GET /models`
- Ollama: `GET /api/tags` e leitura de manifests locais

O bootstrap refaz essa descoberta para o painel nascer com a lista mais recente possível.

## Rotação

- `providerRotationEnabled` ativa fallback entre providers.
- `routing.fallbacks` guarda a ordem de tentativa.
- `routing.maxProviderPasses` limita quantas voltas a rotação pode dar.
- Rotação de modelos troca entre modelos do mesmo provider quando o usuário configurou fallback.

Cada tentativa, erro e sucesso gera evento para o chat ativo.
O painel carrega uma janela recente desses eventos para a UI e para o modal de detalhes.

## Tools

O app tem tools locais com aprovação por UI:

- `run_terminal_command`
- `web_search`
- `memory_chat`
- `persistent_memory`
- `compact_context`
- `rename_chat`

Fluxo básico:

1. O provider responde com tool call.
2. O assistant valida se a tool está habilitada.
3. Se a aprovação for exigida, a UI pede permissão.
4. A tool roda.
5. Se a tool falhar por erro, timeout ou signal, a tentativa fica incompleta e o provider não transforma isso em sucesso.
6. Se terminal retornar exit code diferente de zero com `returnOutput: true`, o resultado volta como mensagem `tool` para o provider decidir o próximo passo.
7. O provider recebe os resultados e continua a resposta.

O assistant também reconhece tool calls emitidas como texto compatível, como tags `<function=...>` ou chamadas `run_terminal_command({...})`. Quando isso acontece, ele transforma o texto em tool call real e continua o loop antes de entregar a resposta final.

Para saídas longas ou execuções demoradas:

- a IA pode pedir `timeoutSeconds` na tool de terminal
- o backend espera o processo terminar antes de devolver `stdout`/`stderr`
- downloads e tarefas longas devem usar timeout maior, mas não infinito

## Attachments

- Texto, markdown, json, csv, html e código podem passar por extração local.
- Imagens só entram como multimodal quando o modelo suporta.
- Vídeos e áudios ficam como referência com preview local no MVP.
- PDFs e arquivos complexos ficam anexados com metadados e caminho local.
- O backend valida limites de tamanho e de quantidade antes de enviar.

## Contexto e memória

- `memory.md` e memória específica do chat.
- `persistent-memory.md` vale para todos os chats.
- `context.md` guarda contexto compactado.
- `context-window.md` é a janela atual usada para explicar o estado do chat.
- `metadata.json` guarda provider, modelo e `modelSettings` do chat.

## Rede local

Por padrão, o painel fica em `127.0.0.1`.
Se o usuário ativar rede local com senha, o próximo restart pode escutar em `0.0.0.0` com Basic Auth simples.

## Update

O updater assume clone Git local.

Fluxo:

1. `git fetch --prune`
2. compara `HEAD` com o upstream
3. bloqueia se houver mudanças locais
4. quando o usuário confirma, roda `git pull --ff-only && npm install`
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

O frontend mostra só o que faz sentido para o provider/modelo atual.

## Resumo curto

Se você precisar entender o app rápido, pense nele assim:

- UI local fala com Node local.
- Node local fala com provider ou tool local.
- O runtime salva estado e histórico.
- O catálogo de modelos mistura curado + dinâmico.
- A memória e o contexto ficam no disco do usuário.
