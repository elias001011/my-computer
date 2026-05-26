# Security

Atualizado em 26/05/2026.

## Posicao do projeto

- O MVP e local-first.
- O painel escuta em `127.0.0.1` por padrao.
- Nao exponha o app para a internet sem entender o risco.

## Protecoes ja presentes

- Runtime em `~/.my-computer`.
- API keys salvas localmente em `config.json`.
- Eventos importantes gravados em `events.jsonl`.
- Comandos de terminal com timeout e limite de saida.
- Tools locais pedem aprovacao na UI por padrao.
- As tools podem ser desligadas por configuracao.
- O terminal isolado usa `HOME` e `cwd` dentro do runtime do app.
- Modo de rede local usa Basic Auth com senha unica.
- O updater bloqueia aplicacao quando o worktree Git esta sujo.
- O catalogo de modelos tenta bloquear chamadas claramente incompativeis antes de chegar na API.

## Riscos conhecidos

- `Sempre permitir qualquer tool` faz `run_terminal_command` rodar sem confirmacao manual.
- O terminal isolado e isolamento leve, nao sandbox forte.
- API keys ficam em texto claro no runtime local e tambem podem ir para export.
- Endpoint OpenAI-compatible custom pode ver prompt, memarias e tool outputs.
- Anexos exportados podem conter dados sensiveis.
- Search via terminal pode vazar a query para o motor de busca usado.
- Parametros tecnicos errados podem quebrar chamada, elevar custo ou gerar rate limit.
- Ollama install/remove pode pedir `sudo`.

## Como usar sudo de forma sensata

Se o app pedir `sudo`, voce tem duas opcoes seguras:

1. Rodar o comando manualmente no terminal e digitar a senha.
2. Criar uma regra limitada em `/etc/sudoers.d/my-computer`.

Exemplo de regra limitada para comandos de servico do Ollama:

```sudoers
elias ALL=(root) NOPASSWD: /usr/bin/systemctl start ollama, /usr/bin/systemctl stop ollama, /usr/bin/systemctl restart ollama, /usr/bin/systemctl enable ollama, /usr/bin/systemctl disable ollama, /usr/bin/systemctl status ollama
```

Boas praticas:

- Troque `elias` pelo seu usuario.
- Libere so os comandos que voce quer permitir.
- Evite `NOPASSWD: ALL`.
- Use `visudo` para validar a regra antes de salvar.
- Se o app pedir uma acao que voce nao reconhece, pare e confira o comando antes.

## Network mode

- Sem modo rede, o painel local nao exige autenticao.
- Com modo rede, o painel usa Basic Auth simples com senha unica.
- O acesso remoto continua sendo uma decisao de risco do usuario.
- Use senha forte e rede confiavel.

## Memoria e anexos

- Memoria persistente e memoria de chat podem armazenar informacao sensivel.
- O arquivo exportado pode incluir chats, anexos e memorias.
- O app faz extracao simples de texto, nao analise de malware.
- HTML tem scripts removidos do texto extraido, mas isso nao e sandbox completa.

## Caminho de hardening futuro

- Classificacao de risco antes de executar comandos locais.
- Mascaramento de segredos em logs e UI.
- Protecao melhor para API keys.
- Criptografia para secrets locais.
- Permissoes mais granulares por tool.
- Parsers dedicados e sandbox real para arquivos complexos.
