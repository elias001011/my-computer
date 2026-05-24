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
- `fetch` nativo para providers OpenAI-compatible e Anthropic.
- `child_process.spawn` para a tool de terminal.
- Arquivos JSON, Markdown e JSONL para persistência local.

### AI provider

- Providers nomeados: Groq, OpenAI, OpenRouter, Hugging Face, Gemini, Anthropic, xAI e Ollama.
- Provider custom `OpenAI compatível` para qualquer endpoint com formato `/v1/chat/completions`.
- Modelo padrão inicial: `llama-3.3-70b-versatile` no Groq.
- O provider/modelo global é apenas default; cada chat salva seu próprio provider e modelo.
- A lista de providers e modelos fica em `src/server/models.js` e é enviada no bootstrap da UI.
- `src/server/provider-client.js` centraliza chamadas, rotação de API keys, adaptador Anthropic e pull automático do Ollama.

## Why not React/Fastify/SQLite yet

Essas opções continuam boas para uma fase maior, mas o MVP precisa ser fácil de entender, instalar e remover. Por isso a versão atual evita build, banco e dependências de framework.

Quando a UI ganhar fluxos mais complexos, streaming real, confirmações ricas e gerenciamento de skills, faz sentido reavaliar React/Vite ou outro framework.

## Runtime and uninstall

Dependências ficam no projeto (`node_modules`).
Dados do usuário ficam em `~/.my-computer` por padrão.

`./uninstall.sh` remove dependências.
`./uninstall.sh --remove-data` remove também o runtime.
