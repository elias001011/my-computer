# Docs

Estes documentos descrevem o MVP implementado. Quando o comportamento do código mudar, atualize os docs no mesmo PR/commit.

## Mapa

- [Architecture](./ARCHITECTURE.md) - estrutura local, fluxo de dados e storage.
- [Technology Stack](./TECH_STACK.md) - escolhas técnicas reais do MVP.
- [UI Spec](./UI_SPEC.md) - tela atual e comportamento esperado.
- [Security](./SECURITY.md) - riscos, proteções atuais e próximas travas.
- [Roadmap](./ROADMAP.md) - fases futuras.

## Decisões atuais

- Provider único: Groq.
- Modelo padrão configurado no setup e nas configurações gerais.
- Chat novo usa o modelo padrão.
- Modelo salvo por chat e editável durante a conversa.
- Runtime central em `~/.my-computer` ou `MY_COMPUTER_HOME`.
- Painel vanilla: `index.html`, `styles.css`, `app.js`.
- Tools do MVP: `run_terminal_command`, `memory_chat`, `persistent_memory` e `compact_context`.
- Tools podem ser ligadas/desligadas nas configurações gerais.
