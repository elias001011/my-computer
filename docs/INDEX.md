# Docs

Este diretório documenta o MVP real do projeto em 26/05/2026.

Se você só quiser colocar o sistema para rodar, leia primeiro o [README](../README.md).

## Ordem recomendada

1. [README](../README.md) - instalação, setup, providers, Ollama, rede local e atualizações.
2. [Providers](./PROVIDERS.md) - catálogo de modelos, rotatórias e o que é selecionável ou apenas índice.
3. [UI Spec](./UI_SPEC.md) - como o painel se comporta e quais telas existem.
4. [Architecture](./ARCHITECTURE.md) - fluxo de dados, runtime e tools.
5. [Security](./SECURITY.md) - riscos, sudo, rede e limites de segurança.
6. [Technology Stack](./TECH_STACK.md) - dependências reais e porque o MVP continua simples.
7. [Infraestrutura explicada](./INFRAESTRUTURA_EXPLICADA.md) - explicação mais didática do fluxo interno.

## O que está aqui

- `ARCHITECTURE.md` explica como Browser, servidor, providers e runtime conversam.
- `PROVIDERS.md` explica o índice de modelos e como lidar com providers dinâmicos.
- `UI_SPEC.md` descreve as telas, o modal de configuração e o painel de modelo.
- `SECURITY.md` mostra os limites de segurança reais e o que não confiar cegamente.
- `TECH_STACK.md` resume a stack usada no MVP.
- `INFRAESTRUTURA_EXPLICADA.md` é o guia didático do fluxo interno.
- `ROADMAP.md` e `TERMINAL_ISOLATION_PLAN.md` ficam como planejamento futuro.

## Regra simples

Quando o código mudar, os docs devem mudar no mesmo PR.
Se o painel mostrar um campo novo, um warning novo ou um catálogo novo, atualize este mapa e o documento correspondente.
