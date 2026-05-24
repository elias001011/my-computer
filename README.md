# My Computer

My Computer é um painel self-hosted para conversar com uma IA que pode usar tools locais, ler contexto salvo e executar terminal quando a tool estiver ligada.

O MVP roda em Node local, usa HTML/CSS/JS puro no painel e salva tudo em uma pasta central do usuário.

## Instalar e abrir

```bash
./install.sh
```

O script instala dependências com `npm install`, cria o runtime em `~/.my-computer` e abre o navegador com o painel local. O servidor fica em primeiro plano no terminal; use `Ctrl+C` para parar.

Para ver o setup inicial sem apagar seus dados, movendo o runtime atual para backup:

```bash
./install.sh --fresh
```

Também dá para iniciar manualmente:

```bash
npm run start:open
```

## Desinstalar

```bash
./uninstall.sh
```

Por padrão, o uninstall remove `node_modules` e preserva os dados em `~/.my-computer`.

Para remover chats, memória, config, anexos e logs também:

```bash
./uninstall.sh --remove-data
```

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

## Ollama

No setup, selecione Ollama para ver orientação dentro do navegador:

- verificar se `ollama` está instalado
- tentar instalar pelo script oficial
- baixar o modelo selecionado

Em Linux, a instalação pode pedir `sudo`. Se a instalação pelo navegador falhar por senha/permissão, o painel mostra o comando para rodar no terminal.

## Anexos

Arquivos enviados ficam salvos dentro da pasta do chat:

```text
~/.my-computer/chats/<chat-id>/attachments/
```

Metodologia atual:

- Imagens são enviadas ao modelo como imagem multimodal apenas se o modelo estiver marcado como compatível com imagens.
- Modelos personalizados têm toggle `Este modelo suporta imagens`.
- Texto, Markdown, JSON, CSV, HTML e código têm texto extraído e enviado ao modelo em uma seção de documentos.
- HTML é convertido para texto legível antes de ir para o modelo.
- Formatos sem extração nativa no MVP, como PDF e DOCX, ficam salvos no chat; a IA recebe caminho/metadados e pode acessá-los pelo terminal se a tool estiver ligada.
- Quando o texto extraído é grande, ele é truncado antes de entrar no prompt. O painel deixa isso claro.

## O que existe no MVP

- Setup inicial com provider, modelo padrão, idioma, apelido e system prompt geral.
- Chat novo usa provider/modelo padrão das configurações gerais.
- Provider/modelo do chat editável durante a conversa.
- Chat com histórico persistente.
- Upload de arquivos com preview e tratamento de imagem/modelo incompatível.
- Tool `run_terminal_command` para a IA usar o terminal local.
- Tool `memory_chat` para a IA ler, anexar ou reescrever a memória Markdown do chat.
- Tool `persistent_memory` para memória global entre chats.
- Tool `compact_context` para compactação automática quando habilitada.
- Tool `rename_chat` para a IA nomear o chat.
- Toggles globais para ligar/desligar tools.
- Eventos filtrados por chat no painel lateral.
- Botão de copiar respostas da IA e retry para requests com erro.
- Export/import de configurações, chats, memórias, contexto e anexos.

## Estrutura

- `docs/` - documentação alinhada ao MVP.
- `src/panel/` - painel web em HTML, CSS e JS puro.
- `src/server/` - servidor local, storage, providers e tools.
- `src/cli/` - CLI mínima para iniciar e diagnosticar.
- `scripts/` - instalação e desinstalação.
- `tests/` - testes do storage local.

Comece por [docs/INDEX.md](./docs/INDEX.md).
