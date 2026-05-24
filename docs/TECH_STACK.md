# Technology Stack

## MVP stack

O MVP favorece simplicidade e facilidade de desinstalação.

### Frontend

- HTML puro em `src/panel/index.html`.
- CSS puro em `src/panel/styles.css`.
- JavaScript puro em `src/panel/app.js`.
- Sem build step.

### Backend

- Node.js 20+.
- HTTP server nativo de Node.
- `fetch` nativo para Groq.
- `child_process.spawn` para a tool de terminal.
- Arquivos JSON, Markdown e JSONL para persistência local.

### AI provider

- Groq via endpoint OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions`.
- Modelo padrão inicial: `llama-3.3-70b-versatile`.
- O modelo global é apenas default; cada chat salva seu próprio modelo.
- A lista de modelos fica em `src/server/models.js` e é enviada no bootstrap da UI.

## Why not React/Fastify/SQLite yet

Essas opções continuam boas para uma fase maior, mas o MVP precisa ser fácil de entender, instalar e remover. Por isso a versão atual evita build, banco e dependências de framework.

Quando a UI ganhar fluxos mais complexos, streaming real, confirmações ricas e gerenciamento de skills, faz sentido reavaliar React/Vite ou outro framework.

## Runtime and uninstall

Dependências ficam no projeto (`node_modules`).
Dados do usuário ficam em `~/.my-computer` por padrão.

`./uninstall.sh` remove dependências.
`./uninstall.sh --remove-data` remove também o runtime.
