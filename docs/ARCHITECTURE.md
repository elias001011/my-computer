# Architecture

Atualizado em 05/07/2026.

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
- `/api/chats/:id/events` é a rota que o painel usa para acompanhar um run em andamento (polling ~1,5s). Devolve só a janela recente de eventos e `run: { active }` — de propósito **não** devolve o chat inteiro, porque a rota completa reparseia todas as mensagens mais o log de eventos a cada tick, o que num chat longo é lixo suficiente para levar o processo a um teto de memória e ser reiniciado no meio do run
- o `run.active` dessa rota é o que permite ao painel distinguir "o modelo ainda está trabalhando" de "o run sumiu". Se algumas checagens seguidas disserem que não existe run, o painel aborta a requisição pendente e explica; antes disso ele confiava só no POST longo e ficava esperando para sempre quando o processo do servidor morria ou reiniciava por baixo
- `/api/chats/:id/queue` enfileira uma mensagem escrita durante um run sem interrompê-lo. O loop drena a fila antes de cada chamada ao provider e a entrega como um turno de usuário ("Complementos do usuário"), registrando isso no `executionTrace` da tentativa; o que sobrar quando o run acabar volta para o cliente enviar como mensagem normal
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

- `run_terminal_command` - um comando por chamada, sem estado entre chamadas.
- `terminal_session` - sessão de terminal persistente via tmux (modo avançado, ver seção própria abaixo).
- `web_search`
- `memory_chat`
- `persistent_memory`
- `persistent_memory_user`
- `edit_persistent_memory_user`
- `chat_document`
- `compact_context`
- `rename_chat`
- `send_file` - cria um arquivo de texto novo (sem aprovação) ou anexa um já existente no disco (com aprovação).
- `edit_file` - lista/lê/edita arquivos reais da máquina (não só anexos); reads livres, escritas com aprovação. Diretório de projeto configurável.
- `browser` - Chromium headless via spawn (auto-detectado ou caminho configurável): `screenshot` (vira anexo + reenviado como imagem se o modelo tiver visão) e `read` (DOM/texto renderizado). Sempre pede aprovação. Sem console/sessão interativa ainda.
- `read_skill` - lê sob demanda o corpo de uma skill (ver seção própria abaixo).
- `get_env_var` - revela o valor literal de uma secret configurada; sempre pede aprovação, mesmo com `alwaysAllow` ligado. Normalmente desnecessário (ver seção "Secrets" abaixo).
- `send_email` - só existe dentro de tarefas agendadas/comandos personalizados que a permitirem explicitamente; nunca aparece em chat normal e não tem parâmetro de destinatário (ver "Tarefas agendadas" e "Email" abaixo).

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

O loop de tools por mensagem tem um teto configurável (`config.tools.maxToolRounds`, padrão 8, 1-200) via `getMaxToolRounds()` em `assistant.js`. Com `deepInvestigation` ligado, o teto dobra automaticamente. Ao esgotar o teto sem o modelo parar sozinho, o app faz uma chamada final forçada sem tools (`tools: []`) pra conseguir algum texto de fechamento em vez de simplesmente cortar a execução; a tentativa fica `incomplete` com `error: 'Limite de rodadas de tools atingido.'`.

## Sessões de terminal (modo avançado)

`src/server/terminal-sessions.js` gerencia sessões tmux persistentes por chat, opcionais (toggle `terminalSessions`, desligado por padrão). Diferente de `run_terminal_command`, uma sessão mantém cwd/env/processo vivos entre chamadas da tool `terminal_session` (`open`/`write`/`read`/`list`/`close`). Só `write` pede aprovação. Limites configuráveis: sessões por chat, sessões globais (somando todos os chats), timeout de inatividade (reap oportunista, sem timer próprio -- roda quando `list`/`open` são chamados). O usuário vê e digita na mesma sessão através de uma janela Terminal no painel; a entrada digitada por ele ali nunca é logada nem enviada à IA. Secrets configurados (ver "Secrets" abaixo) são injetados no ambiente da sessão via `tmux new-session -e NOME=valor` na criação, nunca digitados no pane (não vazam via captura de tela).

## Skills

`src/server/store.js` guarda skills como arquivos Markdown com frontmatter (`name`/`description`) + corpo, em `skills/` no runtime do perfil (`skills.json` é só o índice). Só nome+descrição entram sempre no prompt (mesmo padrão de disclosure progressiva de `persistent_memory_user`); o corpo completo é lido sob demanda pela tool `read_skill`. O botão "Melhorar com IA" no editor do painel roda uma completion avulsa contra o provider/modelo padrão atual (`POST /api/skills/improve-draft`) e só sugere -- nada é salvo até o usuário confirmar.

## Comandos personalizados

`customCommands.json` guarda: nome, gatilho `/trigger`, prompt fixo, `systemPrompt` opcional, allowlist de tools, `skipMemoryInPrompt` -- o mesmo formato de uma tarefa agendada, menos tudo que é específico de cron (agendamento, chat próprio, histórico de execução). Digitar `/trigger` no início de uma mensagem (âncora só na posição 0) roda o comando **dentro do chat atual**, reusando o exato mecanismo `scheduledTaskContext`/`applyScheduledTaskToolMask` de tarefa agendada -- as tools do comando ficam pré-aprovadas (sem pausa interativa), e o allowlist só restringe tools já ligadas globalmente na seção, nunca concede uma nova.

## Secrets

`secrets.json` (0600, texto puro -- mesmo modelo das API keys em `config.json`) guarda nome+descrição+valor de cada variável de ambiente. Só nome+descrição entram no prompt; o valor nunca é enviado ao modelo por padrão. Em vez disso, todo `run_terminal_command` spawnado e toda `terminal_session` aberta recebem os secrets configurados injetados diretamente no ambiente do processo/sessão -- um comando que a IA escreve referenciando `$NOME` funciona sem o valor literal nunca entrar num prompt ou resultado de tool. `get_env_var` é o escape hatch deliberado (desligado por padrão via `secretDisclosure`) pra quando o valor literal é mesmo necessário (ex.: escrever num arquivo); sempre pede aprovação, inclusive com `alwaysAllow` ligado, e usar essa tool manda o valor pro provider de nuvem se ele não for Ollama local.

## Auto continue

Toggle `autoContinueOnError` (desligado por padrão). Quando uma tentativa para incompleta por erro recuperável ou limite de rodadas, o cliente dispara "Continuar" sozinho, sem esperar o usuário clicar -- é uma decisão inteiramente client-side (reusa o caminho de continue já existente) pra evitar mexer no loop do servidor. Nunca dispara durante uma pausa de aprovação de tool, nem depois de um stop explícito do usuário, e é limitado a um número máximo de continuações automáticas por turno.

## Editar mensagens

`editUserMessage` em `store.js` forka a conversa no ponto editado: o conteúdo antigo e tudo que veio depois (respostas, tool uses) vão pro `editHistory` da mensagem (arquivado, nunca apagado), o transcript ao vivo trunca ali, o status volta pra `pending` e a UI reusa o caminho de retry pra rodar de novo -- o contexto que a IA vê depois de uma edição é sempre coerente com o texto novo. Só mensagens do usuário são editáveis; mensagens do assistente já têm retry/continue.

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
- O total de saída de tools carregado **dentro de um mesmo turno** é limitado por `config.context.toolOutputBudgetChars` (0 desliga). Cada resultado já tinha teto individual, mas nada limitava a soma: um turno com 20+ comandos de terminal empilhava centenas de milhares de caracteres numa requisição só — o maior gasto de token do app e a causa recorrente de tentativa terminando em `finish_reason: length`. Ao passar do teto, os resultados mais antigos do turno viram um head curto mais uma nota; os recentes ficam inteiros.

## Cache de prompt

Providers OpenAI-compatible (OpenAI, DeepSeek, Zhipu/GLM, Moonshot, Groq...) fazem cache de prefixo automaticamente, e a única exigência é que o começo da requisição não mude entre chamadas. Por isso o relógio injetado no system prompt é arredondado para um bucket de 10 minutos (`CLOCK_BUCKET_MINUTES` em `assistant.js`) em vez de carregar timestamp exato: com precisão de milissegundo, o prefixo mudava em **toda** requisição e o cache nunca acertava — nem o do prompt, nem o do histórico atrás dele.

Anthropic não faz cache automático: a requisição precisa marcar onde o prefixo termina. O adapter marca dois breakpoints (`cache_control: ephemeral`), no bloco de system e no último schema de tool, que é o que a precificação recompensa. Prompts de sistema curtos não são marcados, porque ficam abaixo do mínimo cacheável e a marcação seria cobrada à toa.

Nada disso exige configuração do usuário nem suporte do provider: onde o cache não existe, a requisição é cobrada normalmente.

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
