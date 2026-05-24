# Docs

Estes documentos descrevem o MVP implementado. Quando o comportamento do código mudar, atualize os docs no mesmo PR/commit.

## Mapa

- [Architecture](./ARCHITECTURE.md) - estrutura local, fluxo de dados e storage.
- [Technology Stack](./TECH_STACK.md) - escolhas técnicas reais do MVP.
- [UI Spec](./UI_SPEC.md) - tela atual e comportamento esperado.
- [Providers](./PROVIDERS.md) - catálogo curado de providers/modelos e limites usados pela UI.
- [Security](./SECURITY.md) - riscos, proteções atuais e próximas travas.
- [Roadmap](./ROADMAP.md) - fases futuras.

## Decisões atuais

- Providers: Groq, OpenAI, OpenRouter, Hugging Face, Gemini, Anthropic, xAI, Ollama e OpenAI compatível custom.
- Provider/modelo padrão configurado no setup e nas configurações gerais.
- Chat novo usa provider/modelo padrão.
- Provider/modelo salvo por chat e editável durante a conversa.
- Múltiplas API keys por provider, com rotação em falhas recuperáveis.
- Setup inicial também aceita múltiplas API keys.
- Configurações técnicas de modelo são salvas por chat.
- Export/import de configurações, chats, memórias e contexto.
- Anexos por chat com extração simples de texto, preview, limite de 20 MB por arquivo, até 8 anexos por mensagem e bloqueio de imagem para modelos sem vision.
- Runtime central em `~/.my-computer` ou `MY_COMPUTER_HOME`.
- Painel vanilla: `index.html`, `styles.css`, `app.js`.
- Tools do MVP: `run_terminal_command`, `memory_chat`, `persistent_memory`, `compact_context` e `rename_chat`.
- Tools podem ser ligadas/desligadas nas configurações gerais.
