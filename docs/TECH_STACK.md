# Technology Stack

## MVP stack

O MVP favorece simplicidade e facilidade de desinstalacao.

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
- Arquivos JSON, Markdown e JSONL para persistencia local.

### AI provider

- Groq via endpoint OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions`.
- Modelo padrao inicial: `llama-3.3-70b-versatile`.
- O modelo global e apenas default; cada chat salva seu proprio modelo.

## Why not React/Fastify/SQLite yet

Essas opcoes continuam boas para uma fase maior, mas o MVP precisa ser facil de entender, instalar e remover. Por isso a versao atual evita build, banco e dependencias de framework.

Quando a UI ganhar fluxos mais complexos, streaming real, confirmacoes ricas e gerenciamento de skills, faz sentido reavaliar React/Vite ou outro framework.

## Runtime and uninstall

Dependencias ficam no projeto (`node_modules`).
Dados do usuario ficam em `~/.my-computer` por padrao.

`./uninstall.sh` remove dependencias.
`./uninstall.sh --remove-data` remove tambem o runtime.
