# My Computer

Atualizado em 26/05/2026.

My Computer e um painel self-hosted para conversar com uma IA, usar tools locais com aprovacao, manter contexto entre chats e alternar entre providers sem perder o historico.

Ele roda localmente em Node.js, usa HTML/CSS/JS puro no painel e guarda todos os dados do usuario em um runtime separado do projeto.

## O que este projeto usa

- Node.js 20 ou mais novo.
- Git, para update direto do repositorio.
- npm, para instalar dependencias.
- Python 3, quando voce usa a pesquisa web via terminal.
- Uma ou mais API keys, dependendo dos providers que voce quiser usar.
- Opcional: Ollama, se voce quiser modelos locais.

### Dependencias opcionais e quando usar

- `ollama` para rodar modelos locais, fazer `pull` e testar vision local.
- `python3` para a busca web via terminal quando `tools.searchMode` estiver em `terminal` ou `both`.
- `sudo` so e necessario se voce quiser deixar o sistema instalar/remover Ollama automaticamente.

## Instalação rapida

```bash
./install.sh
```

Esse e o caminho normal de instalacao. O script faz o seguinte:

- roda `npm install`
- cria o runtime em `~/.my-computer` por padrao
- abre o painel local no navegador
- deixa o servidor rodando no terminal

Se quiser controlar melhor o comportamento, use as flags abaixo:

```bash
./install.sh --fresh
./install.sh --no-open
./install.sh --no-start
./install.sh --port 8788
./install.sh --host 127.0.0.1
```

- `--fresh` move o runtime atual para um backup e mostra o setup inicial de novo.
- `--no-open` inicia sem abrir o navegador.
- `--no-start` instala dependencias e prepara o runtime sem subir o servidor.
- `--port` escolhe a porta do painel.
- `--host` força o host de bind.

O script tambem respeita estas variaveis de ambiente:

- `MY_COMPUTER_HOME`
- `PORT`
- `HOST`

## Como iniciar

Depois da instalacao, voce pode abrir o painel de tres formas:

```bash
npm run start:open
npm run start
node src/cli/mc.js start --open
```

- `npm run start:open` sobe o servidor e abre o navegador.
- `npm run start` sobe o servidor sem forcar abrir o navegador.
- `node src/cli/mc.js start --open` usa o mesmo CLI interno do projeto.

Para diagnosticar o ambiente:

```bash
npm run doctor
node src/cli/mc.js doctor
```

## Desinstalação

```bash
./uninstall.sh
```

Por padrao, isso remove `node_modules` e preserva o runtime em `~/.my-computer`.

Para apagar tambem chats, anexos, memoria e configuracoes:

```bash
./uninstall.sh --remove-data
```

Outras opcoes:

- `--keep-data` preserva o runtime.
- `--yes` funciona como atalho para `--remove-data`.
- `./uninstall.sh --help` mostra a ajuda completa.

## Primeiro uso

1. Instale o projeto com `./install.sh`.
2. Abra o painel e siga o setup inicial, ou entre depois em `Configurações gerais`.
3. Escolha um provider e adicione as API keys.
4. Ajuste o tema do painel, o idioma e o nivel tecnico.
5. Se quiser usar modelos locais, configure Ollama.
6. Abra o `Indice de modelos` para conferir o que e selecionavel e o que e apenas informativo.
7. Comece um chat novo.

## Providers e chaves

O app suporta estes providers:

- OpenAI
- Anthropic
- Gemini
- Groq
- xAI
- OpenRouter
- Hugging Face
- Ollama
- OpenAI compativel custom

As chaves mais comuns sao:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `XAI_API_KEY`
- `OPENROUTER_API_KEY`
- `HF_TOKEN`

Se a variavel de ambiente existir, o backend a reaproveita automaticamente no provider correspondente.

### Como ler o índice de modelos

No painel existe uma aba chamada `Indice de modelos`. Ela mostra:

- `selecionavel`: aparece em dropdowns e rotatorias
- `indice`: nao entra no seletor, mas fica documentado
- `raciocinio`: suporta reasoning ou thinking
- `visao`: aceita imagens
- `saída`: limite maximo de tokens de resposta
- `API`: observacoes tecnicas e restricoes do provider

`openrouter/free` continua como o endpoint gratuito do OpenRouter. `openrouter/auto` continua como o roteador automatico.

## Modelos e rotação

O app tem tres ideias separadas:

- `Modelo padrão`: o valor salvo para chats novos.
- `Rotatória de modelos`: troca entre modelos do mesmo provider quando um deles falha.
- `Rotatória de providers`: troca de provider/modelo quando a chamada falha e existe fallback configurado.

Se um modelo nao aparece no seletor, ele ainda pode aparecer no `Indice de modelos`.
Se voce quiser usar um endpoint ou alias que ainda nao entrou na lista, use `Modelo personalizado`.

## Tema escuro

Em `Configurações gerais > Identidade` existe `Tema do painel` com:

- `Claro`
- `Escuro`
- `Sistema`

O tema e salvo na configuracao e segue a preferencia do sistema quando voce escolher `Sistema`.

## Backup e restauracao

Em `Configurações gerais > Backup`, o export inclui:

- configuracao completa, incluindo provider, API keys, tema, tools, contexto, rede e rotatorias
- memoria persistente
- chats, mensagens, memorias de chat e contexto salvo
- anexos dos chats, que podem ser ignorados na importacao
- eventos recentes para diagnostico

Na importacao, voce escolhe cada grupo. Configuracao importada e tratada como snapshot completo: modelos customizados e capacidades que nao estao no backup sao removidos do runtime atual. Se importar chats sem anexos, o historico entra sem copiar os arquivos anexados.

## Ollama local

Ollama e opcional, mas o app sabe trabalhar com ele:

- verificar se o daemon esta instalado
- instalar pelo script oficial
- listar modelos locais
- dar `pull` no modelo selecionado
- remover modelos locais
- tentar desinstalar o Ollama do sistema

Base local padrao:

```text
http://127.0.0.1:11434/v1
```

Se o instalador ou o gerenciamento do Ollama pedir `sudo`, voce tem duas opcoes seguras:

1. Rodar o comando manualmente no terminal e digitar a senha.
2. Criar uma regra limitada em `/etc/sudoers.d/my-computer`.

Exemplo de regra limitada para comandos de servico do Ollama:

```sudoers
elias ALL=(root) NOPASSWD: /usr/bin/systemctl start ollama, /usr/bin/systemctl stop ollama, /usr/bin/systemctl restart ollama, /usr/bin/systemctl enable ollama, /usr/bin/systemctl disable ollama, /usr/bin/systemctl status ollama
```

- Troque `elias` pelo seu usuario.
- Ajuste os binarios e comandos para o que voce realmente confia.
- Evite liberar `ALL` sem senha.
- O app mostra stdout, stderr e codigo de saida quando um comando falha.

## Search e tools

O app tem estes modos de pesquisa web:

- `Web nativa`
- `Terminal`
- `Ambos`
- `Desligado`

`Web nativa` usa o provider quando a API suporta busca.
`Terminal` usa o computador local.
`Ambos` tenta a rota nativa primeiro e cai para o terminal.

Outras tools locais podem ser ligadas e desligadas nas configuracoes:

- `run_terminal_command`
- `memory_chat`
- `persistent_memory`
- `compact_context`
- `rename_chat`

Por padrao, tools locais exigem aprovacao manual na UI.

## Falhas e continuidade

Quando a IA falha, para no meio ou estoura limite de saida, o app nao apaga a tentativa anterior.

O painel mostra:

- `Tentar novamente`: reenvia a solicitacao original desde o inicio.
- `Continuar`: retoma a partir da ultima saida parcial e do historico da tentativa.
- `Ver detalhes`: abre um modal com o processo e os eventos relacionados daquela tentativa.
- `Copiar eventos`: copia os eventos carregados do chat para analise ou auditoria.

Isso existe para manter o historico visivel e reduzir perda de contexto quando uma resposta sai incompleta.
Retry e Continue ficam disponiveis apenas na tentativa mais recente do grupo. O backend tambem rejeita envios, retries e continues simultaneos no mesmo chat para evitar cliques duplicados e side effects repetidos.
Falhas de terminal e tools, incluindo timeout, signal e exit code diferente de zero, ficam marcadas como falhas reais da tentativa.

## Rede local

Em `Configurações gerais > Rede`, voce pode abrir o painel para outros dispositivos na mesma rede.

Quando isso esta ligado:

- o proximo restart escuta em `0.0.0.0`
- a UI pede senha unica via Basic Auth
- o painel mostra a URL local e os IPs LAN detectados

Para ligar:

1. Marque `Abrir painel para a rede`.
2. Defina uma senha.
3. Salve as configuracoes.
4. Reinicie o servidor.

## Atualizações

O botao de atualizacao usa o clone Git local.

O fluxo e este:

1. `git fetch --prune`
2. compara `HEAD` com o upstream
3. bloqueia atualizacao se houver mudancas locais
4. quando voce confirma, roda `git pull --ff-only && npm install`
5. reinicia o servidor na mesma porta

## Runtime

Por padrao, tudo fica em:

```text
~/.my-computer
```

Voce pode trocar isso com `MY_COMPUTER_HOME`.

Arquivos principais do runtime:

- `config.json`
- `events.jsonl`
- `persistent-memory.md`
- `chats/<chat-id>/metadata.json`
- `chats/<chat-id>/messages.json`
- `chats/<chat-id>/memory.md`
- `chats/<chat-id>/context.md`
- `chats/<chat-id>/context-window.md`
- `chats/<chat-id>/attachments/`

## Estrutura do projeto

- `src/panel/` - UI local do painel.
- `src/server/` - HTTP server, storage, providers e tools.
- `src/cli/` - comandos do painel.
- `scripts/` - implementacao interna de install e uninstall.
- `docs/` - documentacao do produto e da arquitetura.
- `tests/` - testes locais.

## Documentação recomendada

- [docs/INDEX.md](./docs/INDEX.md)
- [docs/PROVIDERS.md](./docs/PROVIDERS.md)
- [docs/UI_SPEC.md](./docs/UI_SPEC.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/SECURITY.md](./docs/SECURITY.md)

## Dica pratica

Se algo parecer errado no catalogo de modelos, abra o `Indice de modelos` no painel e compare com [docs/PROVIDERS.md](./docs/PROVIDERS.md). O catalogo do app e atualizado pelo arquivo `src/server/models.js` e pela descoberta dinamica dos providers.
