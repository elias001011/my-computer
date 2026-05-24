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
- Tools exigem aprovação na UI por padrão, a menos que `Sempre permitir qualquer tool` esteja ligado.
- Tools podem ser desligadas nas configurações gerais e deixam de ser enviadas ao modelo.
- O terminal isolado usa `HOME` e diretório de trabalho dentro do runtime do My Computer.
- Abrir para rede local exige senha e usa autenticação básica no próximo restart.
- Rotação de API keys evita ficar preso em uma key rate-limited, mas não substitui autenticação nem controle de gasto.
- Anexos ficam dentro da pasta do chat e são servidos apenas por endpoints locais com ids validados.
- Imagens só são enviadas ao modelo quando o modelo está marcado como compatível.
- Limites de anexos e de imagem conhecidos são validados na UI e no backend.

## Current risks

- Se `Sempre permitir qualquer tool` estiver ligado, `run_terminal_command` executa comandos sem confirmação manual.
- O terminal isolado é contenção leve, não sandbox forte. Comandos ainda podem tocar caminhos absolutos da máquina.
- API keys ficam em texto claro no runtime local e também entram no arquivo exportado.
- Múltiplas API keys aumentam conveniência, mas também aumentam o impacto de vazamento do `config.json` ou de um export.
- Sem modo rede, o painel local não exige autenticação. Com modo rede, há Basic Auth simples com senha única.
- Não existe allowlist ou denylist de comandos.
- Outputs de tools podem conter segredos se o comando imprimir segredos.
- Endpoints OpenAI-compatible customizados são confiados pelo usuário; um endpoint malicioso pode receber prompt, memórias e tool outputs.
- Anexos exportados entram em base64 no arquivo de backup. Esse arquivo pode conter documentos sensíveis.
- A extração de texto do MVP é simples e não isola conteúdo malicioso dentro de HTML além de remover scripts/styles como texto.
- A instalação/desinstalação de Ollama pelo painel pode falhar quando `sudo` pedir senha; o comando exibido deve ser tratado como comando administrativo.
- Ajustes técnicos de modelo, como max tokens alto, podem elevar custo ou causar erro de rate limit no provider.
- A search tool via terminal usa rede pública e pode revelar queries ao motor de busca usado.

## Near-term hardening

- Classificação de risco antes de pedir aprovação de comandos destrutivos.
- Classificação de risco antes de executar terminal.
- Mascaramento de segredos em logs e UI.
- Proteção melhor para API keys.
- Criptografia ou storage protegido para secrets locais.
- Usuários, permissões, HTTPS e rotação de senha para acesso remoto.
- Permissões mais granulares por tool.
- Parsers dedicados e sandbox para PDF/DOCX/OCR.
