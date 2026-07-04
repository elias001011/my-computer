# Technology Stack

Atualizado em 26/05/2026.

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
- O backend usa escopo async por requisição para resolver qual seção atende cada chamada.
- Export/import trabalha sobre a seção ativa e cobre configuração, memória persistente, arquivos adicionais, chats, anexos e eventos selecionados.

### Integracoes opcionais

- `ollama` para modelos locais, vision local e catálogo dinâmico via `/api/tags`.
- `python3` para a pesquisa web via terminal.
- `tmux` para sessões de terminal persistentes (modo avançado da seção Terminal). Sem tmux instalado, o modo avançado apenas retorna um erro explicando como instalar; o resto do app não muda.
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
  opcionais presentes no sistema (tmux, ollama) e pergunta se quer remover também --
  nunca remove sozinho, já que o MC nunca instala essas ferramentas por conta própria e
  não há como saber se foram instaladas só por causa do MC. `--no-deps` pula essa etapa.
- `./uninstall.sh --remove-data` apaga também o runtime do usuário.

Use os scripts da raiz como entrypoint do usuário final. `install.sh` chama `scripts/bootstrap.sh` por baixo; o arquivo em `scripts/` é implementação interna para manutenção/desenvolvimento, não um comando que o usuário precisa decorar.
