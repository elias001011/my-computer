# Security

Atualizado em 26/05/2026.

## Posicao do projeto

- O MVP é local-first.
- O painel escuta em `127.0.0.1` por padrão.
- Não exponha o app para a internet sem entender o risco.

## Proteções já presentes

- Runtime em `~/.my-computer`.
- API keys salvas localmente em `config.json`.
- Eventos importantes gravados em `events.jsonl`.
- Comandos de terminal com timeout e limite de saída.
- Tools locais pedem aprovação na UI por padrão.
- As tools podem ser desligadas por configuração.
- O terminal isolado usa `HOME` e `cwd` dentro do runtime do app.
- Modo de rede local usa Basic Auth com senha única.
- Métodos mutáveis da API exigem header do painel e validação de origem para reduzir CSRF.
- Seções são resolvidas por requisição para evitar mistura entre abas.
- O updater bloqueia aplicação quando o worktree Git está sujo.
- O catálogo de modelos tenta bloquear chamadas claramente incompatíveis antes de chegar na API.

## Riscos conhecidos

- `Sempre permitir qualquer tool` faz `run_terminal_command` rodar sem confirmacao manual.
- O terminal isolado é isolamento leve, não sandbox forte.
- API keys ficam em texto claro no runtime local e também podem ir para export.
- Endpoint customizado compatível com OpenAI pode ver prompt, memórias e tool outputs.
- Anexos exportados podem conter dados sensíveis.
- Search via terminal pode vazar a query para o motor de busca usado.
- Parâmetros técnicos errados podem quebrar chamada, elevar custo ou gerar rate limit.
- Ollama install/remove pode pedir `sudo`.

## Como usar sudo de forma sensata

Se o app pedir `sudo`, você tem duas opções seguras:

1. Rodar o comando manualmente no terminal e digitar a senha.
2. Criar uma regra limitada em `/etc/sudoers.d/my-computer`.

Exemplo de regra limitada para comandos de serviço do Ollama:

```sudoers
elias ALL=(root) NOPASSWD: /usr/bin/systemctl start ollama, /usr/bin/systemctl stop ollama, /usr/bin/systemctl restart ollama, /usr/bin/systemctl enable ollama, /usr/bin/systemctl disable ollama, /usr/bin/systemctl status ollama
```

Boas práticas:

- Troque `elias` pelo seu usuário.
- Libere só os comandos que você quer permitir.
- Evite `NOPASSWD: ALL`.
- Use `visudo` para validar a regra antes de salvar.
- Se o app pedir uma ação que você não reconhece, pare e confira o comando antes.

## Network mode

- Sem modo rede, o painel local não exige autenticao.
- Com modo rede, o painel usa Basic Auth simples com senha única.
- Requisições `POST`, `PUT` e `DELETE` vindas de fora do painel são bloqueadas pela proteção CSRF.
- O acesso remoto continua sendo uma decisão de risco do usuário.
- Use senha forte e rede confiável.

## Memória e anexos

- Memória persistente e memória de chat podem armazenar informação sensível.
- O arquivo exportado pode incluir chats, anexos e memórias.
- Anexos removidos têm a cópia local apagada e os snapshots antigos redigidos para não reaparecerem em prompts futuros ou backups.
- O app faz extração simples de texto, não análise de malware.
- HTML tem scripts removidos do texto extraído, mas isso não é sandbox completa.

## Caminho de hardening futuro

- Classificacao de risco antes de executar comandos locais.
- Mascaramento de segredos em logs e UI.
- Proteção melhor para API keys.
- Criptografia para secrets locais.
- Permissões mais granulares por tool.
- Parsers dedicados e sandbox real para arquivos complexos.
