# Docs

Este diretorio documenta o MVP real do projeto em 26/05/2026.

Se voce so quiser colocar o sistema para rodar, leia primeiro o [README](../README.md).

## Ordem recomendada

1. [README](../README.md) - instalacao, setup, providers, Ollama, rede local e atualizacoes.
2. [Providers](./PROVIDERS.md) - catalogo de modelos, rotatorias e o que e selecionavel ou apenas indice.
3. [UI Spec](./UI_SPEC.md) - como o painel se comporta e quais telas existem.
4. [Architecture](./ARCHITECTURE.md) - fluxo de dados, runtime e tools.
5. [Security](./SECURITY.md) - riscos, sudo, rede e limites de seguranca.
6. [Technology Stack](./TECH_STACK.md) - dependencias reais e porque o MVP continua simples.
7. [Infraestrutura explicada](./INFRAESTRUTURA_EXPLICADA.md) - explicacao mais didatica do fluxo interno.

## O que esta aqui

- `ARCHITECTURE.md` explica como Browser, servidor, providers e runtime conversam.
- `PROVIDERS.md` explica o indice de modelos e como lidar com providers dinamicos.
- `UI_SPEC.md` descreve as telas, o modal de configuracao e o painel de modelo.
- `SECURITY.md` mostra os limites de seguranca reais e o que nao confiar cegamente.
- `TECH_STACK.md` resume a stack usada no MVP.
- `INFRAESTRUTURA_EXPLICADA.md` e o guia didatico do fluxo interno.
- `ROADMAP.md` e `TERMINAL_ISOLATION_PLAN.md` ficam como planejamento futuro.

## Regra simples

Quando o codigo mudar, os docs devem mudar no mesmo PR.
Se o painel mostrar um campo novo, um warning novo ou um catalogo novo, atualize este mapa e o documento correspondente.
