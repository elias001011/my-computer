# Docs

Estes documentos descrevem o MVP implementado. Quando o comportamento do codigo mudar, atualize os docs no mesmo PR/commit.

## Mapa

- [Architecture](./ARCHITECTURE.md) - estrutura local, fluxo de dados e storage.
- [Technology Stack](./TECH_STACK.md) - escolhas tecnicas reais do MVP.
- [UI Spec](./UI_SPEC.md) - tela atual e comportamento esperado.
- [Security](./SECURITY.md) - riscos, protecoes atuais e proximas travas.
- [Roadmap](./ROADMAP.md) - fases futuras.

## Decisoes atuais

- Provider unico: Groq.
- Modelo padrao configurado no setup.
- Modelo salvo por chat e editavel durante a conversa.
- Runtime central em `~/.my-computer` ou `MY_COMPUTER_HOME`.
- Painel vanilla: `index.html`, `styles.css`, `app.js`.
- Tools do MVP: `run_terminal_command` e `memory_chat`.
