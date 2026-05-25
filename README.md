# My Computer

My Computer é um painel self-hosted para conversar com uma IA que pode usar tools locais, ler contexto salvo e executar terminal quando a tool estiver ligada.

O MVP roda em Node local, usa HTML/CSS/JS puro no painel e salva tudo em uma pasta central do usuário.

## Instalar e abrir

```bash
./install.sh
```

Esse é o único entrypoint de instalação para uso normal. Ele chama o script interno `scripts/bootstrap.sh`, instala dependências com `npm install`, cria o runtime em `~/.my-computer` e abre o navegador com o painel local. O servidor fica em primeiro plano no terminal; use `Ctrl+C` para parar.

Opções úteis:

```bash
./install.sh --fresh          # move ~/.my-computer para backup e mostra setup inicial
./install.sh --no-open        # inicia sem abrir navegador
./install.sh --no-start       # instala/prepara runtime sem iniciar servidor
./install.sh --port 8788      # inicia em outra porta
./install.sh --host 0.0.0.0   # força bind de rede; prefira configurar rede pela UI
```

Para ver o setup inicial sem apagar seus dados, movendo o runtime atual para backup:

```bash
./install.sh --fresh
```

Também dá para iniciar manualmente:

```bash
npm run start:open
npm run start -- --port 8787
```

Depois de instalado, iniciar novamente é só rodar `./install.sh`, `npm run start:open` ou `npm run start` nesta pasta.

## Desinstalar

```bash
./uninstall.sh
```

Por padrão, o uninstall remove `node_modules` e preserva os dados em `~/.my-computer`.

Para remover chats, memória, config, anexos e logs também:

```bash
./uninstall.sh --remove-data
```

Use `./uninstall.sh --help` para ver as opções. Se o servidor estiver rodando, encerre pelo botão das configurações ou use `Ctrl+C` no terminal antes de remover dependências.

## Configurar integrações externas

- API keys ficam em Configurações gerais > Providers e APIs. Cada provider aceita várias keys e o backend tenta a próxima quando uma falha recuperável acontece.
- OpenAI compatível custom usa qualquer endpoint com `/v1/chat/completions`; configure `Endpoint/base URL`, modelo e keys no painel.
- Ollama pode ser instalado, verificado, ter modelos baixados/removidos e ser desinstalado pelo painel. Se `sudo` pedir senha, rode o comando exibido no terminal.
- Rede local fica em Configurações gerais > Rede local. Quando ligada com senha, o próximo restart escuta em `0.0.0.0` e usa Basic Auth com senha única, sem usuário por pessoa. A própria UI mostra o endereço LAN detectado, como `http://192.168.x.x:8787`, e um checklist de restart, Wi-Fi e firewall.
- Pesquisa web fica em Configurações gerais > Tools, com modo `Web nativa`, `Terminal`, `Ambos` ou `Desligado`. A nativa roda no provider; a de terminal usa a tool local e segue aprovação.
- Se o modelo escrever uma chamada de `web_search` como texto, o backend tenta recuperar como tool real e normaliza `maxResults` antes de executar.
- A rotatória de providers fica em Configurações gerais > Providers. Quando ativada, o app tenta fallbacks em ordem e registra tentativas, erros e sucesso nos eventos do chat.

## Atualizar

O botão de atualização fica em Configurações gerais > Atualizações.

Ele usa o clone Git local:

1. roda `git fetch --prune`
2. compara `HEAD` com o upstream da branch
3. se houver commits novos e o código local estiver limpo, mostra confirmação
4. ao confirmar, roda `git pull --ff-only && npm install`
5. reinicia o servidor na mesma porta

Se houver alterações locais sem commit, o painel bloqueia a atualização para não sobrescrever trabalho.

## Providers

Providers nomeados:

- Groq
- OpenAI
- OpenRouter
- Hugging Face
- Gemini
- Anthropic
- xAI
- Ollama
- OpenAI compatível custom

O provider custom aceita qualquer endpoint que implemente `/v1/chat/completions`, como Minimax, Together, Fireworks, servidores próprios ou gateways.

Cada provider tem endpoint/base URL e múltiplas API keys salvas localmente. Se uma key falha por autenticação, rate limit ou erro temporário, o backend tenta a próxima.

Os presets foram revisados para 24/05/2026 com modelos atuais como GPT-5.5, Claude Opus 4.7, Claude Sonnet 4.6, Gemini 3.5 Flash, Gemini 3.1 Pro Preview, Grok 4.3, Llama 4 Scout no Groq e Qwen3.6/Qwen3-VL no Ollama. Modelos que mudam rápido continuam disponíveis via `Modelo personalizado`.

## Ollama

No setup, selecione Ollama para ver orientação dentro do navegador:

- verificar se `ollama` está instalado
- tentar instalar pelo script oficial
- baixar o modelo selecionado
- remover modelos locais já baixados
- tentar desinstalar o Ollama do sistema

Em Linux, a instalação pode pedir `sudo`. Se a instalação pelo navegador falhar por senha/permissão, o painel mostra o comando para rodar no terminal.
Quando a instalação termina e o provider/modelo selecionado é Ollama, o app tenta baixar automaticamente o modelo escolhido.
Modelos já baixados são detectados pelo serviço do Ollama e, se ele estiver offline, por leitura dos manifests locais quando disponíveis.

## Anexos

Arquivos enviados ficam salvos dentro da pasta do chat:

```text
~/.my-computer/chats/<chat-id>/attachments/
```

Metodologia atual:

- Imagens são enviadas ao modelo como imagem multimodal apenas se o modelo estiver marcado como compatível com imagens.
- Modelos personalizados têm toggle `Este modelo suporta imagens`.
- O MVP limita upload bruto a 20 MB por arquivo e envio a 8 anexos por mensagem.
- Quando o catálogo conhece limite de imagem do modelo, a UI avisa e o backend bloqueia excesso. Exemplo: Groq Llama 4 Scout aceita até 5 imagens e 20 MB por imagem.
- Texto, Markdown, JSON, CSV, HTML e código têm texto extraído e enviado ao modelo em uma seção de documentos.
- HTML é convertido para texto legível antes de ir para o modelo.
- PDF tem visualização no painel, mas ainda entra como referência/caminho. DOCX e binários incertos são bloqueados até haver extração confiável.
- Vídeos e áudios têm preview/player e ficam salvos como referência/caminho. Gemini tem suporte nativo a vídeo via Files API, mas o adapter nativo de vídeo ainda não está implementado neste MVP.
- Quando o texto extraído é grande, ele é truncado antes de entrar no prompt. O painel deixa isso claro.

## O que existe no MVP

- Setup inicial com provider, modelo padrão, idioma, apelido e system prompt geral.
- Nível técnico do usuário no setup e nas configurações gerais, com toggle para remover essa instrução extra do prompt.
- Múltiplas API keys já no setup inicial.
- Chat novo usa provider/modelo padrão das configurações gerais.
- Provider/modelo do chat editável durante a conversa.
- Configurações técnicas por chat: temperatura, top_p, max tokens, stop sequences e parâmetros compatíveis por provider.
- Chat com histórico persistente.
- Upload de arquivos com preview e tratamento de imagem/modelo incompatível.
- Tool `run_terminal_command` para a IA usar o terminal local.
- Tool `web_search` para pesquisa web transparente. Ela tenta busca nativa em OpenAI, Groq, Gemini, Anthropic, xAI e OpenRouter quando configurado; em `Ambos`, usa terminal como fallback.
- Tool `memory_chat` para a IA ler, anexar ou reescrever a memória Markdown do chat.
- Tool `persistent_memory` para memória global entre chats.
- Tool `compact_context` para compactação automática quando habilitada.
- Tool `rename_chat` para a IA nomear o chat.
- Toggles globais para ligar/desligar tools, escolher modo de busca, alternar terminal padrão/isolado leve e escolher se tools locais exigem aprovação pela UI.
- Cache local do prompt em andamento por chat, para não perder texto ao abrir configurações antes de enviar.
- Compactação automática configurável por limite estimado de contexto e mínimo de mensagens.
- Editor manual de `context.md` pelo botão de caneta ao lado de compactar contexto.
- Abertura opcional para rede local com autenticação básica e senha única, aplicada no próximo restart.
- Checagem e aplicação de update pelo repositório Git local.
- Eventos filtrados por chat no painel lateral.
- Botão de copiar respostas da IA e retry para requests com erro.
- Export/import seletivo de configurações, chats, memórias, contexto, anexos e eventos.

## Estrutura

- `docs/` - documentação alinhada ao MVP.
- `src/panel/` - painel web em HTML, CSS e JS puro.
- `src/server/` - servidor local, storage, providers e tools.
- `src/cli/` - CLI mínima para iniciar e diagnosticar.
- `scripts/` - implementação interna de instalação/desinstalação (`bootstrap.sh` e `remove.sh`).
- `tests/` - testes do storage local.

Comece por [docs/INDEX.md](./docs/INDEX.md).
