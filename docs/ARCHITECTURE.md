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

O servidor escuta em `127.0.0.1` por padrão e tenta portas livres a partir de `8787`. Se `server.networkEnabled` estiver ativo e houver senha configurada, o próximo start escuta em `0.0.0.0` com autenticação básica.

## Project layout

- `src/panel/` - UI em HTML, CSS e JS puro.
- `src/server/server.js` - HTTP server, API JSON e static file serving.
- `src/server/store.js` - arquivos de config, chats, memória, contexto e eventos.
- `src/server/assistant.js` - orquestração do chat, contexto, tools e compactação.
- `src/server/provider-client.js` - chamadas para providers, rotação de API keys e Ollama.
- `src/server/models.js` - catálogo de providers e modelos sugeridos.
- `src/server/tools.js` - definições e execução das tools.
- `src/server/updater.js` - checagem/aplicação de update via Git e restart do processo.
- `src/cli/mc.js` - comando local para iniciar o painel.
- `install.sh` e `uninstall.sh` - entrypoints públicos.
- `scripts/bootstrap.sh` e `scripts/remove.sh` - implementação interna de install/uninstall.
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
      isolated-terminal/   # no runtime, usado quando terminalMode=isolated
      attachments.json
      attachments/
      context-snapshots/
```

`MY_COMPUTER_HOME` pode apontar para outro diretório.

`metadata.json` guarda provider, modelo, system prompt do chat e `modelSettings` técnicos daquele chat.

## Chat flow

1. O painel carrega `/api/bootstrap`.
2. Se ainda não existe setup, a UI mostra o formulário inicial.
3. O usuário cria ou abre um chat.
4. Chat novo usa provider e modelo padrão das configurações gerais.
5. Cada chat salva seu próprio `provider`, `model` e `modelSettings`; trocar durante a conversa é permitido e auditável.
6. Ao enviar mensagem, o servidor monta o system prompt com:
   - preferências globais
   - memória persistente
   - preferências do chat
   - memória do chat
   - contexto compactado
   - histórico recente
   - instrução opcional baseada no nível técnico do usuário
7. O provider selecionado pode responder direto ou chamar tools.
8. Se `alwaysAllow` estiver desligado, a resposta da IA fica pendente e a UI pede aprovação antes de executar tools.
9. Cada tool solicitada/executada é salva no histórico do chat e no event log.
10. A resposta final é salva em `messages.json`.
11. A janela atual de contexto é atualizada em `context-window.md`.

Eventos são gravados em um `events.jsonl` global, mas a UI mostra apenas os eventos do chat ativo.

## Tools

### `run_terminal_command`

Executa um comando shell na máquina do usuário. A execução usa timeout, limite de output e eventos `requested/completed`.
O stdin é fechado automaticamente para evitar prompts interativos travados, e o processo é encerrado por timeout.
O timeout aceito vai até 900 segundos. No modo `isolated`, o comando roda com `HOME` e `cwd` em `~/.my-computer/isolated-terminal`; é isolamento leve, não VM/container.

### `web_search`

Pesquisa a web quando informação atual ou fontes forem necessárias. O executor respeita `tools.searchMode`: `native` usa busca do provider quando implementada, `terminal` usa DuckDuckGo HTML via Python no terminal local, `both` tenta nativo primeiro e cai no terminal, e `off` bloqueia a tool. Antes de executar, o app normaliza `maxResults` mesmo quando o provider devolve string e recupera chamadas que vieram como texto (`<web_search>{...}</web_search>` ou `web_search {...}`) para evitar histórico/tool call inválido. O resultado inclui método, query, títulos, URLs e snippets para a IA citar na resposta final.

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
- pesquisa web por `tools.searchMode`: `off`, `native`, `terminal` ou `both`
- memória do chat
- memória persistente
- compactação automática por tool
- título do chat por tool
- sempre permitir tools sem aprovação
- método do terminal: `standard` ou `isolated`

Quando uma tool é desligada, ela não é enviada ao modelo.
Quando `alwaysAllow` está desligado, tools locais viram uma fila pendente. A UI exibe uma tool por vez; cada decisão é salva por `toolCallId`. Tools negadas retornam `denied_by_user` ao modelo, sem executar.

Busca nativa do provider não pede confirmação local. Busca via terminal usa a mesma permissão de tool local. No modo `both`, o app tenta nativo primeiro e cai no terminal quando configurado.

## Context compaction

Existem três caminhos de contexto:

- `Salvar snapshot`: salva uma fotografia em `context-snapshots/` e atualiza `context-window.md`.
- `Compactar contexto`: atualiza `context.md` manualmente via modelo.
- Compactação automática: após uma resposta, se `context.autoCompactEnabled` estiver ativo e a janela estimada passar de `autoCompactChars` respeitando `autoCompactMinMessages`, o app compacta e mostra um card `Compactação automática` no chat.

O botão de caneta no cabeçalho abre um editor manual de `context.md`.

## Technical level

`config.json` guarda:

- `technicalLevel`: `beginner`, `careful`, `balanced`, `advanced` ou `expert`.
- `technicalGuidanceEnabled`: quando `false`, o app não injeta instruções extras de nível técnico no system prompt.

O padrão é `balanced`. Níveis baixos instruem a IA a explicar mais, pedir mais confirmação em solicitações confusas ou arriscadas e ser mais explícita sobre comandos. Níveis altos instruem a IA a confiar mais em comandos claros e reduzir explicações básicas.

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

`routing.providerRotationEnabled` habilita fallback entre providers/modelos. `routing.fallbacks` guarda a ordem de fallback e `routing.maxProviderPasses` limita quantas voltas podem acontecer. Cada tentativa de provider/key, erro e sucesso é registrada nos eventos do chat sem gravar o valor completo de API key.

Ollama usa o endpoint local OpenAI-compatible por padrão (`http://127.0.0.1:11434/v1`). Antes de chamar um modelo, o backend verifica `/api/tags`; se o modelo não estiver instalado, chama `/api/pull` com `stream: false`.
Quando o daemon está offline, o backend tenta detectar modelos baixados lendo manifests locais em `~/.ollama/models/manifests` e `/usr/share/ollama/.ollama/models/manifests`.
O painel também expõe ações para verificar, instalar, puxar modelo, remover modelo e tentar desinstalar o Ollama.

## Model settings

Cada chat pode salvar ajustes técnicos de chamada em `metadata.json`:

- `temperature`
- `topP`
- `maxTokens`
- `stop`
- `seed`
- `presencePenalty`
- `frequencyPenalty`
- `reasoningEffort`

O frontend mostra apenas parâmetros que o provider provavelmente aceita. O backend também filtra parte desses campos por provider para reduzir erros em APIs incompatíveis.

## Import/export

`/api/export` gera um JSON com configurações, chats, mensagens, memórias, contexto salvo, anexos e eventos. `/api/import` aceita o JSON completo ou `{ data, options }`, permitindo importar seletivamente configurações, memória persistente, chats, anexos e eventos.

## Updates

O atualizador assume que o app está rodando a partir de um clone Git com upstream configurado.

Fluxo:

1. `GET /api/update/status` roda `git fetch --prune`, descobre branch/upstream e compara `HEAD` com o remote.
2. Se houver commits novos, a UI mostra resumo, ahead/behind, remote e estado do worktree.
3. Se o worktree estiver sujo, a UI bloqueia update automático.
4. `POST /api/update/apply` com confirmação roda `git pull --ff-only && npm install`.
5. Se o update for aplicado, o servidor inicia um novo processo na mesma porta e encerra o processo antigo.

Por enquanto, o caminho escolhido é atualizar direto do código fonte. Releases empacotadas ficam para uma fase posterior, caso o projeto precise distribuir binários ou instaladores versionados.

## Attachments

Anexos são salvos por chat em `attachments/`, com metadados em `attachments.json`.

Fluxo:

1. A UI lê o arquivo como base64 e envia para `/api/chats/:id/attachments`.
2. O servidor salva o arquivo no runtime do chat.
3. Texto, Markdown, JSON, CSV, HTML e código passam por extração de texto local.
4. HTML é reduzido para texto legível, sem scripts/styles.
5. Imagens ficam salvas e podem ser enviadas como `image_url` base64 para modelos marcados como vision.
6. Vídeos e áudios entram como referência com preview/player e caminho local.
7. PDF entra como referência com visualizador no painel.
8. DOCX e binários incertos são bloqueados até haver extração confiável.

Na chamada ao modelo:

- documentos com texto extraído entram em uma seção `<attachments>` no conteúdo da mensagem;
- imagens entram como conteúdo multimodal apenas se `modelSupportsImages` retornar verdadeiro;
- se o usuário tentar enviar imagem para um modelo sem suporte, o backend rejeita com erro claro e a UI também bloqueia antes do envio;
- o upload bruto tem limite de 20 MB por arquivo;
- cada mensagem aceita até 8 anexos no MVP;
- limites conhecidos de visão, como quantidade de imagens e tamanho máximo por imagem, são validados antes da chamada ao provider;
- a IA sempre recebe o caminho local do anexo, então pode usar `run_terminal_command` para inspecionar o arquivo quando a tool estiver habilitada.
- vídeos e áudios não são enviados nativamente para o provider no MVP. Para Gemini, vídeo nativo exige adapter Files API separado.

## Network mode

Configurações gerais permitem marcar `Abrir painel para a rede`. O app só ativa isso quando há senha, e o efeito vale no próximo restart. A autenticação atual é Basic Auth com senha única, sem usuários/permissões por pessoa.
Expor fora da rede local ainda é roadmap: precisa HTTPS, usuários, permissões e configuração de transporte seguro.

## Shutdown

O painel tem uma ação de encerrar o servidor local. Para iniciar novamente, rode `./install.sh` ou `npm run start:open` na raiz do projeto.

## Extension points

- Confirmação antes de comandos sensíveis.
- Variáveis de ambiente pelo painel.
- Skills com permissões.
- Navegação web e automação fora do terminal.
- Storage em SQLite quando arquivos JSON/Markdown deixarem de ser suficientes.
