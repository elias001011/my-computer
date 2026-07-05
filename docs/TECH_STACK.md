# Technology Stack

Atualizado em 05/07/2026.

## Stack do MVP

O projeto favorece simplicidade, instalação fácil e desinstalação limpa.

### Frontend

- HTML puro em `src/panel/index.html`.
- CSS puro em `src/panel/styles.css`.
- JavaScript puro em `src/panel/app.js`.
- Sem build step.

### Backend

- Node.js 20+.
- `fetch` nativo para providers e descoberta dinâmica.
- `child_process.spawn` para a tool de terminal.
- `tmux` (binário de sistema) para as sessões de terminal persistentes do modo avançado — mesma filosofia do `python3`: ferramenta externa via spawn, zero pacote npm.
- `python3` para a busca web via terminal quando necessário.
- `chromium`/`google-chrome` (binário de sistema, opcional) para a tool de navegador — mesma filosofia: `--headless` via spawn (screenshot e dump-dom), sem Playwright/Puppeteer nem pacote npm. Console ao vivo e navegação interativa multi-step não estão nesta versão (exigiriam uma camada CDP/WebSocket).
- `edit_file`: leitura/edição de arquivos reais da máquina via `node:fs` (não só anexos), com aprovação nas escritas — mesma disciplina de match exato do `chat_document`.
- Git local para update.
- JSON, JSONL e Markdown para persistência.
- Extração simples de texto para anexos sem parser pesado no MVP.

### Providers

- Groq, OpenAI, OpenRouter, Hugging Face, Gemini, Anthropic, xAI e Ollama.
- Provider custom `OpenAI compatível` para endpoints próprios.
- `src/server/models.js` centraliza o catálogo de providers, modelos e specs.
- `src/server/provider-client.js` centraliza chamadas, rotação de keys, fallback e adaptadores.

### Storage

- Runtime do usuário em `~/.my-computer` por padrão, com seções novas em `~/.my-computer/profiles/<id>`.
- Configurações, chats, memória, arquivos adicionais de memória, skills e eventos ficam separados do código do projeto.
- Skills: arquivos Markdown curtos com frontmatter (`name`/`description`) + corpo, em `skills/`. Só nome+descrição entram no prompt; o corpo completo é lido sob demanda pela tool `read_skill` (mesmo padrão de disclosure progressiva da memória de arquivos do usuário).
- Comandos personalizados (`customCommands.json`): gatilho `/nome`, prompt fixo, tools pré-aprovadas -- mesmo mecanismo (`scheduledTaskContext`) de tarefa agendada, mas disparado ao vivo dentro do chat atual em vez de por cron.
- Segredos/variáveis de ambiente (`secrets.json`, 0600, texto puro -- mesmo modelo das chaves de API em `config.json`): só nome+descrição entram no prompt; o valor nunca é enviado ao modelo por padrão -- é injetado direto no ambiente do processo/sessão de terminal (`spawn`/`tmux -e`), então um comando referenciando `$NOME` funciona sem o valor nunca aparecer num prompt ou resultado de tool. A tool `get_env_var` é a única via deliberada de expor o valor literal (ex.: escrever num arquivo), sempre com aprovação.
- O backend usa escopo async por requisição para resolver qual seção atende cada chamada.
- Export/import trabalha sobre a seção ativa e cobre configuração, memória persistente, arquivos adicionais, chats, anexos e eventos selecionados.

### Integracoes opcionais

- `ollama` para modelos locais, vision local e catálogo dinâmico via `/api/tags`.
- `python3` para a pesquisa web via terminal.
- `tmux` para sessões de terminal persistentes (modo avançado da seção Terminal). Sem tmux instalado, o modo avançado apenas retorna um erro explicando como instalar; o resto do app não muda.
- `chromium`/`google-chrome` para a tool de navegador (seção Tools). Sem ele instalado, a tool retorna um erro explicando como instalar; o resto do app não muda. Auto-detectado no PATH ou apontado por um caminho configurável.
- `sudo` apenas quando o usuário quiser liberar tarefas administrativas do Ollama.

## Por que ainda não tem React, Fastify ou SQLite

O MVP quer ser fácil de entender e de remover. Por isso ele evita:

- build de frontend
- banco de dados pesado
- framework extra no servidor
- runtime externo desnecessario

Quando a UI e o fluxo de tools ficarem mais complexos, essas escolhas podem ser revisitadas.

## Runtime e desinstalação

- `./install.sh` instala dependências, prepara o runtime e pode abrir o painel.
- `./uninstall.sh` remove o projeto local e, em terminal interativo, detecta dependências
  opcionais presentes no sistema (tmux, ollama, Chromium/Chrome) e pergunta se quer remover
  também -- nunca remove sozinho, já que o MC nunca instala essas ferramentas por conta
  própria e não há como saber se foram instaladas só por causa do MC. Trata separadamente
  o binário/serviço do ollama e os modelos baixados (podem somar vários GB). `--no-deps`
  pula essa etapa toda.
- `./uninstall.sh --remove-data` apaga também o runtime do usuário.

Use os scripts da raiz como entrypoint do usuário final. `install.sh` chama `scripts/bootstrap.sh` por baixo; o arquivo em `scripts/` é implementação interna para manutenção/desenvolvimento, não um comando que o usuário precisa decorar.
