# Security

## Current stance

O MVP é local-first e escuta em `127.0.0.1`.
Não exponha o painel na internet.

## Current protections

- Runtime central em `~/.my-computer` com permissões restritas quando criado pelo app.
- API keys salvas localmente em `config.json`, separadas por provider.
- Eventos importantes gravados em `events.jsonl`.
- Comandos de terminal possuem timeout.
- Output de terminal possui limite de tamanho.
- Tools podem ser desligadas nas configurações gerais e deixam de ser enviadas ao modelo.
- Rotação de API keys evita ficar preso em uma key rate-limited, mas não substitui autenticação nem controle de gasto.

## Current risks

- A tool `run_terminal_command` executa comandos sem confirmação manual no MVP quando está ligada.
- API keys ficam em texto claro no runtime local e também entram no arquivo exportado.
- Não existe autenticação no painel.
- Não existe allowlist ou denylist de comandos.
- Outputs de tools podem conter segredos se o comando imprimir segredos.
- Endpoints OpenAI-compatible customizados são confiados pelo usuário; um endpoint malicioso pode receber prompt, memórias e tool outputs.

## Near-term hardening

- Confirmação obrigatória para comandos destrutivos.
- Classificação de risco antes de executar terminal.
- Mascaramento de segredos em logs e UI.
- Proteção melhor para API keys.
- Criptografia ou storage protegido para secrets locais.
- Autenticação antes de qualquer acesso remoto.
- Permissões mais granulares por tool.
