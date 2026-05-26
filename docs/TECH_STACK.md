# Technology Stack

Atualizado em 26/05/2026.

## Stack do MVP

O projeto favorece simplicidade, instalacao facil e desinstalacao limpa.

### Frontend

- HTML puro em `src/panel/index.html`.
- CSS puro em `src/panel/styles.css`.
- JavaScript puro em `src/panel/app.js`.
- Sem build step.

### Backend

- Node.js 20+.
- `fetch` nativo para providers e descoberta dinamica.
- `child_process.spawn` para a tool de terminal.
- `python3` para a busca web via terminal quando necessario.
- Git local para update.
- JSON, JSONL e Markdown para persistencia.
- Extracao simples de texto para anexos sem parser pesado no MVP.

### Providers

- Groq, OpenAI, OpenRouter, Hugging Face, Gemini, Anthropic, xAI e Ollama.
- Provider custom `OpenAI compatible` para endpoints proprios.
- `src/server/models.js` centraliza o catalogo de providers, modelos e specs.
- `src/server/provider-client.js` centraliza chamadas, rotacao de keys, fallback e adaptadores.

### Storage

- Runtime do usuario em `~/.my-computer` por padrao.
- Configuracoes, chats, memoria e eventos ficam separados do codigo do projeto.
- Export/import e update trabalham em cima desse runtime.

### Integracoes opcionais

- `ollama` para modelos locais, vision local e catalogo dinamico via `/api/tags`.
- `python3` para a pesquisa web via terminal.
- `sudo` apenas quando o usuario quiser liberar tarefas administrativas do Ollama.

## Por que ainda nao tem React, Fastify ou SQLite

O MVP quer ser facil de entender e de remover. Por isso ele evita:

- build de frontend
- banco de dados pesado
- framework extra no servidor
- runtime externo desnecessario

Quando a UI e o fluxo de tools ficarem mais complexos, essas escolhas podem ser revisitadas.

## Runtime e desinstalacao

- `./install.sh` instala dependencias, prepara o runtime e pode abrir o painel.
- `./uninstall.sh` remove o projeto local.
- `./uninstall.sh --remove-data` apaga tambem o runtime do usuario.

O split entre `install.sh`/`uninstall.sh` na raiz e `scripts/` por baixo existe para manter o entrypoint simples para o usuario final.
