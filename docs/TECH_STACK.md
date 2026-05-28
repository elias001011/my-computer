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

- Runtime do usuário em `~/.my-computer` por padrão.
- Configurações, chats, memória e eventos ficam separados do código do projeto.
- Export/import e update trabalham em cima desse runtime.

### Integracoes opcionais

- `ollama` para modelos locais, vision local e catálogo dinâmico via `/api/tags`.
- `python3` para a pesquisa web via terminal.
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
- `./uninstall.sh` remove o projeto local.
- `./uninstall.sh --remove-data` apaga também o runtime do usuário.

O split entre `install.sh`/`uninstall.sh` na raiz e `scripts/` por baixo existe para manter o entrypoint simples para o usuário final.
