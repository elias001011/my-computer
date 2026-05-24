# Security

## Current stance

O MVP é local-first e escuta em `127.0.0.1`.
Não exponha o painel na internet.

## Current protections

- Runtime central em `~/.my-computer` com permissões restritas quando criado pelo app.
- API key salva localmente em `config.json`.
- Eventos importantes gravados em `events.jsonl`.
- Comandos de terminal possuem timeout.
- Output de terminal possui limite de tamanho.
- Tools podem ser desligadas nas configurações gerais e deixam de ser enviadas ao modelo.

## Current risks

- A tool `run_terminal_command` executa comandos sem confirmação manual no MVP quando está ligada.
- A Groq API key fica em texto claro no runtime local.
- Não existe autenticação no painel.
- Não existe allowlist ou denylist de comandos.
- Outputs de tools podem conter segredos se o comando imprimir segredos.

## Near-term hardening

- Confirmação obrigatória para comandos destrutivos.
- Classificação de risco antes de executar terminal.
- Mascaramento de segredos em logs e UI.
- Proteção melhor para API keys.
- Autenticação antes de qualquer acesso remoto.
- Permissões mais granulares por tool.
