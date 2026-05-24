# Security

## Current stance

O MVP e local-first e escuta em `127.0.0.1`.
Nao exponha o painel na internet.

## Current protections

- Runtime central em `~/.my-computer` com permissoes restritas quando criado pelo app.
- API key salva localmente em `config.json`.
- Eventos importantes gravados em `events.jsonl`.
- Comandos de terminal possuem timeout.
- Output de terminal possui limite de tamanho.

## Current risks

- A tool `run_terminal_command` executa comandos sem confirmacao manual no MVP.
- A Groq API key fica em texto claro no runtime local.
- Nao existe autenticacao no painel.
- Nao existe allowlist ou denylist de comandos.
- Outputs de tools podem conter segredos se o comando imprimir segredos.

## Near-term hardening

- Confirmacao obrigatoria para comandos destrutivos.
- Classificacao de risco antes de executar terminal.
- Mascaramento de segredos em logs e UI.
- Protecao melhor para API keys.
- Autenticacao antes de qualquer acesso remoto.
- Permissoes por tool.
