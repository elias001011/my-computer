# My Computer

My Computer é um painel self-hosted para conversar com uma IA que pode usar tools locais.
O MVP atual usa Groq como provider único, roda em um servidor Node local e salva tudo em uma pasta central do usuário.

## Rodar

```bash
./install.sh
```

O script instala dependências com `npm install`, cria o runtime em `~/.my-computer` e abre o navegador com o painel local.
O servidor fica em primeiro plano no terminal; use `Ctrl+C` para parar.

Também dá para iniciar manualmente:

```bash
npm run start:open
```

## Desinstalar

```bash
./uninstall.sh
```

Por padrão, o uninstall remove `node_modules` e preserva os dados em `~/.my-computer`.
Para remover chats, memória, config e logs também:

```bash
./uninstall.sh --remove-data
```

## O que existe no MVP

- Setup inicial com Groq API key, modelo padrão, idioma, apelido e system prompt geral.
- Chat novo usa o modelo padrão das configurações gerais.
- Modelo do chat editável durante a conversa, com evento registrado.
- Chat com histórico persistente.
- Tool `run_terminal_command` para a IA usar o terminal local.
- Tool `memory_chat` para a IA ler, anexar ou reescrever a memória Markdown do chat.
- Tool `persistent_memory` para memória global entre chats.
- Tool `compact_context` para compactação automática quando habilitada.
- Toggles globais para ligar/desligar tools.
- Memória por chat em `memory.md`.
- Memória persistente em `persistent-memory.md`.
- Contexto compactado em `context.md`.
- Janela de contexto atual em `context-window.md`.
- Snapshots manuais de contexto em `context-snapshots/`.

## Estrutura

- `docs/` - documentação alinhada ao MVP.
- `src/panel/` - painel web em HTML, CSS e JS puro.
- `src/server/` - servidor local, storage, Groq adapter e tools.
- `src/cli/` - CLI mínima para iniciar e diagnosticar.
- `scripts/` - instalação e desinstalação.
- `tests/` - testes do storage local.

## Docs

Comece por [docs/INDEX.md](./docs/INDEX.md).
