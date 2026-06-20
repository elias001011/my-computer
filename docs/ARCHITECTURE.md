# Architecture

Atualizado em 20/06/2026.

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
- `src/server/scheduler.js` - timer interno que dispara tarefas agendadas.
- `src/server/email.js` - envio de email via API do Resend.
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

Seções são escopadas por requisição com `AsyncLocalStorage`. A UI envia a seção ativa via header, e `getActivePaths()` usa esse escopo durante toda a cadeia async da requisição. O perfil ativo global continua existindo como fallback para bootstrap inicial e CLI.

O export/import opera sobre esse runtime. O backup serializa a configuração normalizada completa, memória persistente global, arquivos adicionais de memória do usuário, chats, contexto, anexos e eventos; na importação, a UI permite escolher esses grupos separadamente. Antes de aplicar a importação, o backend cria um snapshot temporário do runtime ativo e restaura esse snapshot se qualquer etapa falhar. Quando o grupo de configuração é importado, ele substitui a configuração atual como snapshot completo, em vez de mesclar modelos customizados antigos. Chats importados não sobrescrevem chats existentes por id; colisões recebem novo id. Quando chats são importados sem anexos, o backend redige conteúdo de anexos antigos em mensagens, tool traces, estado pendente, memória e contexto.

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

O metadado legado `folder` pode existir em chats importados ou criados por versões anteriores, mas a UI atual não expõe organização por pastas. Ele não altera prompt, permissões, runtime, memória ou isolamento; isolamento real continua sendo feito por perfil/seção.

Quando uma resposta falha ou para no meio:

- a tentativa continua salva como uma mensagem do assistente
- o grupo da tentativa recebe um `continuationGroupId`
- o painel mostra `Tentar novamente` e `Continuar`
- o backend aceita apenas um envio/retry/continue em andamento por chat e bloqueia retry/continue em tentativa superseded
- `/api/chats/:id/stop` aborta a execução ativa do chat; provider calls, terminal e compactação recebem o sinal quando possível, e a tentativa fica incompleta com `finishReason: stopped_by_user`
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
- `persistent_memory_user`
- `edit_persistent_memory_user`
- `chat_document`
- `compact_context`
- `rename_chat`
- `send_email` - só existe dentro de tarefas agendadas que a permitirem explicitamente; nunca aparece em chat normal e não tem parâmetro de destinatário (ver "Tarefas agendadas" e "Email" abaixo).

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

## Tarefas agendadas

`src/server/scheduler.js` roda um `setInterval` dentro do próprio processo do servidor (sem dependência de cron externo ou de qualquer camada fora do MC). Cada tarefa agendada (`store.js`) guarda: prompt fixo, provider/modelo próprios, agendamento (`daily`/`weekly`/`monthly`/`interval`, com timezone IANA), uma allowlist própria de tools, e os toggles `reuseChat` e `skipMemoryInPrompt`.

Pontos importantes do design:

- Como não há humano presente pra aprovar nada, a allowlist da tarefa **substitui** o fluxo normal de aprovação: tool na lista executa direto, tool fora da lista é negada sem nunca pausar esperando aprovação.
- A lista de tools oferecida ao provider (`buildEnabledToolDefinitions`) e o texto narrativo do system prompt (`applyScheduledTaskToolMask`) são sempre mascarados pela mesma allowlist, pra evitar o modelo "ver" no prompt uma tool que não foi de fato oferecida.
- `skipMemoryInPrompt` pula só a memória persistente global e a memória de arquivos do usuário daquela chamada específica; memória do chat reusado e histórico continuam normais.
- Uma lease persistida (`runningSince` com expiração) evita reexecução duplicada se o processo reiniciar no meio de uma tarefa; uma guarda em memória evita reentrância dentro do mesmo processo.
- Esse design assume o modelo "self-hosted normal" (processo contínuo). Numa implantação multiusuário com processo por usuário que para no logout (como a VPS de referência deste projeto), tarefas de um usuário deslogado só disparam quando ele logar de novo — isso é uma consequência da implantação, não algo que o scheduler tente contornar.

## Email

`src/server/email.js` manda email via a API REST do Resend (`fetch` simples, sem SDK). Por design, hoje é **só envio**:

- O destino é sempre o endereço fixo configurado em `config.email.destinationEmail` — a tool `send_email` não tem parâmetro de destinatário, então o modelo nunca pode escolher pra onde mandar.
- Sem verificar um domínio próprio no Resend, o remetente fica travado no endereço sandbox deles (`onboarding@resend.dev`); isso é limitação da plataforma, não do app.
- Enviar é sempre uma chamada de saída (igual qualquer chamada de provider de IA), então não expõe nada à rede nem em modo self-hosted local.
- Uma notificação de falha de tarefa agendada (`config.email.notifyOnScheduledTaskFailure`) usa o mesmo evento que o scheduler já registra (`scheduledTask.run.failed`); o envio dessa notificação roda no seu próprio try/catch, então uma falha no Resend nunca mascara o status real da tarefa.
- Recebimento de email (responder por email, "Inbound" do Resend ou polling IMAP) ainda não existe.

## Attachments

- Texto, markdown, json, csv, html e código podem passar por extração local.
- Anexos texto também podem ser lidos/editados pela tool `chat_document`, sempre na cópia salva dentro do runtime do chat.
- `chat_document read` retorna conteúdo cru paginado; `replace` troca um trecho exato; `write` substitui o documento inteiro.
- Todas as ações de `chat_document` exigem aprovação quando tools automáticas estão desligadas, porque até `list/read` podem revelar conteúdo de anexos ao provider.
- Edições por `chat_document` atualizam o arquivo, `attachments.json`, previews extraídos e referências do anexo nas mensagens.
- Ao remover um anexo, o backend apaga a cópia salva e redige snapshots antigos em mensagens, estado pendente de tools, data URLs de imagem, arquivos de contexto e previews de eventos; backups e prompts futuros não carregam o conteúdo removido.
- Imagens só entram como multimodal quando o modelo suporta.
- Vídeos e áudios ficam como referência com preview local no MVP.
- PDFs e arquivos complexos ficam anexados com metadados e caminho local.
- O backend valida limites de tamanho e de quantidade antes de enviar.
- Tool calls vindas do provider recebem IDs únicos antes de entrar no fluxo de aprovação. Estados antigos com IDs duplicados são interrompidos como inseguros em vez de executar comandos ambíguos.

## Modo offline

- `privacy.offlineMode` força provider/model efetivos para Ollama e desliga rotatórias para providers externos.
- O endpoint do Ollama precisa ser local (`localhost`, `127.0.0.1`, `::1` ou socket local); configs/imports com endpoint remoto são rejeitados.
- Bootstrap/config em offline não faz descoberta dinâmica de modelos em OpenRouter, Hugging Face ou endpoints OpenAI-compatible.
- `web_search` em modo terminal continua exigindo aprovação explícita quando offline, mesmo se `alwaysAllow` estiver ligado.

## Contexto e memória

- `memory.md` e memória específica do chat.
- `persistent-memory.md` vale para todos os chats.
- Arquivos adicionais de memória de usuário podem ser buscados por palavra-chave pela tool `persistent_memory_user` (ação `search`), sem precisar ler o arquivo inteiro.
- `context.md` guarda contexto compactado.
- `context-window.md` é a janela atual usada para explicar o estado do chat.
- `metadata.json` guarda provider, modelo e `modelSettings` do chat.
- O histórico bruto de mensagens enviado a cada chamada é limitado por `config.context.historyBudgetChars` (aproximação por caracteres, não um tokenizer real) e pode ser desligado por completo via `config.context.historyBudgetEnabled` — desligado, só a mensagem atual e as memórias acima são enviadas, sem nenhuma mensagem anterior do chat.

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
