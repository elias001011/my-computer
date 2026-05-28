# My Computer

Atualizado em 26/05/2026.

My Computer é um painel self-hosted para conversar com uma IA, usar tools locais com aprovação, manter contexto entre chats e alternar entre providers sem perder o histórico.

Ele roda localmente em Node.js, usa HTML/CSS/JS puro no painel e guarda todos os dados do usuário em um runtime separado do projeto.

## O que este projeto usa

- Node.js 20 ou mais novo.
- Git, para update direto do repositório.
- npm, para instalar dependências.
- Python 3, quando você usa a pesquisa web via terminal.
- Uma ou mais API keys, dependendo dos providers que você quiser usar.
- Opcional: Ollama, se você quiser modelos locais.

### Dependências opcionais e quando usar

- `ollama` para rodar modelos locais, fazer `pull` e testar vision local.
- `python3` para a busca web via terminal quando `tools.searchMode` estiver em `terminal` ou `both`.
- `sudo` só é necessário se você quiser deixar o sistema instalar/remover Ollama automaticamente.

## Instalação rápida

```bash
./install.sh
```

Esse é o caminho normal de instalação. O script faz o seguinte:

- roda `npm install`
- cria o runtime em `~/.my-computer` por padrão
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
- `--no-start` instala dependências e prepara o runtime sem subir o servidor.
- `--port` escolhe a porta do painel.
- `--host` força o host de bind.

O script também respeita estas variáveis de ambiente:

- `MY_COMPUTER_HOME`
- `PORT`
- `HOST`

## Como iniciar

Depois da instalação, você pode abrir o painel de três formas:

```bash
npm run start:open
npm run start
node src/cli/mc.js start --open
```

- `npm run start:open` sobe o servidor e abre o navegador.
- `npm run start` sobe o servidor sem forçar abrir o navegador.
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

Por padrão, isso remove `node_modules` e preserva o runtime em `~/.my-computer`.

Para apagar também chats, anexos, memória e configurações:

```bash
./uninstall.sh --remove-data
```

Outras opções:

- `--keep-data` preserva o runtime.
- `--yes` funciona como atalho para `--remove-data`.
- `./uninstall.sh --help` mostra a ajuda completa.

## Primeiro uso

1. Instale o projeto com `./install.sh`.
2. Abra o painel e siga o setup inicial, ou entre depois em `Configurações gerais`.
3. Escolha um provider e adicione as API keys.
4. Ajuste o tema do painel, o idioma e o nível técnico.
5. Se quiser usar modelos locais, configure Ollama.
6. Abra o `Índice de modelos` para conferir o que é selecionável e o que é apenas informativo.
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
- OpenAI compatível

As chaves mais comuns são:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `XAI_API_KEY`
- `OPENROUTER_API_KEY`
- `HF_TOKEN`

Se a variável de ambiente existir, o backend a reaproveita automaticamente no provider correspondente.

### Como ler o índice de modelos

No painel existe uma aba chamada `Índice de modelos`. Ela mostra:

- `selecionável`: aparece em dropdowns e rotatórias
- `índice`: não entra no seletor, mas fica documentado
- `raciocínio`: suporta reasoning ou thinking
- `visão`: aceita imagens
- `saída`: limite máximo de tokens de resposta
- `API`: observações técnicas e restrições do provider

`openrouter/free` continua como o endpoint gratuito do OpenRouter. `openrouter/auto` continua como o roteador automático.

## Modelos e rotação

O app tem três ideias separadas:

- `Modelo padrão`: o valor salvo para chats novos.
- `Rotatória de modelos`: troca entre modelos do mesmo provider quando um deles falha.
- `Rotatória de providers`: troca de provider/modelo quando a chamada falha e existe fallback configurado.

Se um modelo não aparece no seletor, ele ainda pode aparecer no `Índice de modelos`.
Se você quiser usar um endpoint ou alias que ainda não entrou na lista, use `Modelo personalizado`.

## Tema escuro

Em `Configurações gerais > Identidade` existe `Tema do painel` com:

- `Claro`
- `Escuro`
- `Sistema`

O tema é salvo na configuração e segue a preferência do sistema quando você escolher `Sistema`.

## Backup e restauração

Em `Configurações gerais > Backup`, o export inclui:

- configuração completa, incluindo provider, API keys, tema, tools, contexto, rede e rotatórias
- memória persistente
- chats, mensagens, memórias de chat e contexto salvo
- anexos dos chats, que podem ser ignorados na importação
- eventos recentes para diagnóstico

Na importação, você escolhe cada grupo. Configuração importada é tratada como snapshot completo: modelos customizados e capacidades que não estão no backup são removidos do runtime atual. Se importar chats sem anexos, o histórico entra sem copiar os arquivos anexados.

## Ollama local

Ollama é opcional, mas o app sabe trabalhar com ele:

- verificar se o daemon está instalado
- instalar pelo script oficial
- listar modelos locais
- dar `pull` no modelo selecionado
- remover modelos locais
- tentar desinstalar o Ollama do sistema

Base local padrão:

```text
http://127.0.0.1:11434/v1
```

Se o instalador ou o gerenciamento do Ollama pedir `sudo`, você tem duas opções seguras:

1. Rodar o comando manualmente no terminal e digitar a senha.
2. Criar uma regra limitada em `/etc/sudoers.d/my-computer`.

Exemplo de regra limitada para comandos de serviço do Ollama:

```sudoers
elias ALL=(root) NOPASSWD: /usr/bin/systemctl start ollama, /usr/bin/systemctl stop ollama, /usr/bin/systemctl restart ollama, /usr/bin/systemctl enable ollama, /usr/bin/systemctl disable ollama, /usr/bin/systemctl status ollama
```

- Troque `elias` pelo seu usuário.
- Ajuste os binários e comandos para o que você realmente confia.
- Evite liberar `ALL` sem senha.
- O app mostra stdout, stderr e código de saída quando um comando falha.

## Search e tools

O app tem estes modos de pesquisa web:

- `Web nativa`
- `Terminal`
- `Ambos`
- `Desligado`

`Web nativa` usa o provider quando a API suporta busca.
`Terminal` usa o computador local.
`Ambos` tenta a rota nativa primeiro e cai para o terminal.

Outras tools locais podem ser ligadas e desligadas nas configurações:

- `run_terminal_command`
- `memory_chat`
- `persistent_memory`
- `compact_context`
- `rename_chat`

Por padrão, tools locais exigem aprovação manual na UI.

## Falhas e continuidade

Quando a IA falha, para no meio ou estoura limite de saída, o app não apaga a tentativa anterior.

O painel mostra:

- `Tentar novamente`: reenvia a solicitação original desde o início.
- `Continuar`: retoma a partir da última saída parcial e do histórico da tentativa.
- `Ver detalhes`: abre um modal com o processo e os eventos relacionados daquela tentativa.
- `Copiar eventos`: copia os eventos carregados do chat para análise ou auditoria.

Isso existe para manter o histórico visível e reduzir perda de contexto quando uma resposta sai incompleta.
Retry e Continue ficam disponíveis apenas na tentativa mais recente do grupo. O backend também rejeita envios, retries e continues simultâneos no mesmo chat para evitar cliques duplicados e side effects repetidos.
Falhas reais de tools, timeout e signal deixam a tentativa incompleta. Em terminal, exit code diferente de zero ainda aparece destacado, mas se a IA pediu `returnOutput: true` o stdout/stderr volta para o modelo para ele poder corrigir o próximo passo.
Quando um modelo devolve conteúdo em `<think>`, o app separa esse texto em um bloco recolhível e mantém a resposta final limpa.

## Rede local

Em `Configurações gerais > Rede`, você pode abrir o painel para outros dispositivos na mesma rede.

Quando isso está ligado:

- o próximo restart escuta em `0.0.0.0`
- a UI pede senha única via Basic Auth
- o painel mostra a URL local e os IPs LAN detectados

Para ligar:

1. Marque `Abrir painel para a rede`.
2. Defina uma senha.
3. Salve as configurações.
4. Reinicie o servidor.

## Atualizações

O botão de atualização usa o clone Git local.

O fluxo é este:

1. `git fetch --prune`
2. compara `HEAD` com o upstream
3. bloqueia atualização se houver mudanças locais
4. quando você confirma, roda `git pull --ff-only && npm install`
5. reinicia o servidor na mesma porta

## Runtime

Por padrão, tudo fica em:

```text
~/.my-computer
```

Você pode trocar isso com `MY_COMPUTER_HOME`.

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
- `scripts/` - implementação interna de install e uninstall.
- `docs/` - documentação do produto e da arquitetura.
- `tests/` - testes locais.

## Documentação recomendada

- [docs/INDEX.md](./docs/INDEX.md)
- [docs/PROVIDERS.md](./docs/PROVIDERS.md)
- [docs/UI_SPEC.md](./docs/UI_SPEC.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/SECURITY.md](./docs/SECURITY.md)

## Dica prática

Se algo parecer errado no catálogo de modelos, abra o `Índice de modelos` no painel e compare com [docs/PROVIDERS.md](./docs/PROVIDERS.md). O catálogo do app é atualizado pelo arquivo `src/server/models.js` e pela descoberta dinâmica dos providers.
