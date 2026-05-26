# Providers

Atualizado em 26/05/2026.

Este arquivo descreve o catalogo que o app mostra em `Indice de modelos` e nos seletores de provider/modelo.
A fonte de verdade continua sendo `src/server/models.js`.

## Como ler o catalogo

- `selecionavel`: aparece em dropdowns, rotatorias e modelo padrao.
- `indice`: aparece no indice tecnico, mas nao e bom candidato padrao para chat.
- `dinamico`: vem da descoberta do provider em runtime.
- `local`: depende do que existe na maquina do usuario.

Campos tecnicos usados no indice:

- `visao`: aceita imagem.
- `raciocinio`: suporta reasoning/thinking.
- `saida`: limite maximo de tokens de resposta.
- `contexto`: janela de contexto.
- `API`: observacoes especificas do provider, como endpoints, alias e restricoes.

## Regras gerais

- `openrouter/free` continua como entrada gratuita do OpenRouter.
- `openrouter/auto` continua como roteador automatico.
- Providers dinamicos podem mudar por chave, conta, regiao, permissao e plano.
- O indice tecnico existe para explicar capacidades e restricoes, nao so nomes bonitos.
- Se um modelo nao estiver no seletor, ele ainda pode aparecer no indice ou como custom/manual.

## Rotacao

- `Rotatoria de modelos` troca entre modelos do mesmo provider.
- `Rotatoria de providers` troca provider e modelo fallback quando uma chamada falha.
- Em providers dinamicos, o app mistura catalogo curado com descoberta em runtime.

## OpenAI

Provider curado para chat, raciocinio, multimodal e modelos especiais.

### Chat, raciocinio e uso geral

- `gpt-5.5`
- `gpt-5.5-pro`
- `gpt-5.4`
- `gpt-5.4-pro`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5`
- `gpt-5-mini`
- `gpt-5-nano`
- `gpt-5.2`
- `gpt-5.2-pro`
- `gpt-5.1`
- `gpt-5-pro`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `gpt-4o`
- `gpt-4o-mini`
- `o3`
- `o3-pro`
- `chat-latest`
- `gpt-5.1-chat-latest`
- `gpt-5.2-chat-latest`
- `gpt-5.3-chat-latest`
- `gpt-5.3-codex`
- `gpt-oss-120b`
- `gpt-oss-20b`

### Modelos especiais, fora do chat normal

- Imagem: `gpt-image-2`, `gpt-image-1.5`, `chatgpt-image-latest`
- Realtime e audio: `gpt-realtime-2`, `gpt-realtime-translate`, `gpt-realtime-whisper`, `gpt-audio-1.5`
- Embeddings: `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002`

### Notas tecnicas

- `gpt-5.5`, `gpt-5.4` e `gpt-5.2` suportam `reasoning.effort` com `none`, `low`, `medium`, `high` e `xhigh`.
- `gpt-5.1` suporta `none`, `low`, `medium` e `high`.
- `gpt-5` usa `minimal`, `low`, `medium` e `high`.
- `gpt-5.3-codex` usa `low`, `medium`, `high` e `xhigh`.
- `gpt-oss-120b` e `gpt-oss-20b` usam `low`, `medium` e `high`.
- `gpt-4.1` e `gpt-4o` sao modelos nao-reasoning.
- `gpt-5.5-pro`, `gpt-5.4-pro`, `gpt-5.2-pro`, `gpt-5-pro` e `o3-pro` ficam como indice ou compatibilidade de Responses API.
- `o3` usa `high` only; `o3-pro` fica como compatibilidade de Responses API.
- Snapshots e aliases de ChatGPT ficam no catalogo para compatibilidade, mas nao sao o padrao recomendado.

## Anthropic

Modelos ativos e snapshots ainda uteis:

- `claude-opus-4-7`
- `claude-opus-4-6`
- `claude-opus-4-5-20251101`
- `claude-opus-4-1-20250805`
- `claude-sonnet-4-6`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`

Modelos deprecated, mantidos so como indice ate o fim do ciclo:

- `claude-opus-4-20250514`
- `claude-sonnet-4-20250514`

### Notas tecnicas

- `claude-opus-4-7` pede que `temperature`, `top_p` e `top_k` sejam omitidos quando a chamada usa os defaults do modelo.
- `claude-opus-4-7`, `claude-opus-4-6` e `claude-sonnet-4-6` usam `web_search_20260209`.
- Modelos anteriores continuam com `web_search_20250305`.
- Cada ID datado tem sua propria agenda de deprecacao e retirement.

## Gemini

Catalogo curado para chat/texto. Audio, live e midia ficam como indice tecnico separado.

### Chat e texto

- `gemini-3.1-pro-preview`
- `gemini-3.1-pro-preview-customtools`
- `gemini-3.5-flash`
- `gemini-3-flash-preview`
- `gemini-3.1-flash-lite`
- `gemini-3.1-flash-lite-preview`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

### Audio, live e TTS

- `gemini-3.1-flash-live-preview`
- `gemini-3.1-flash-tts-preview`
- `gemini-2.5-flash-live-preview`
- `gemini-2.5-flash-tts-preview`
- `gemini-2.5-pro-tts-preview`

### Midia generativa

- `nano-banana-2-preview`
- `nano-banana-pro-preview`
- `nano-banana`
- `veo-3.1-preview`
- `veo-3.1-lite-preview`
- `imagen-4`
- `lyria-3-pro-preview`
- `lyria-3-clip-preview`

### Notas tecnicas

- `gemini-3.1-pro-preview`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite` e `gemini-3.1-flash-lite-preview` usam niveis de thinking similares a `minimal`, `low`, `medium` e `high`.
- `gemini-2.5-pro` usa `minimal`, `low`, `medium` e `high`, mas nao desliga thinking.
- `gemini-2.5-flash` e `gemini-2.5-flash-lite` aceitam `none` para desativar thinking.
- `gemini-3-pro-preview` foi tratado como deprecated/shutdown e nao entra no seletor.
- Os modelos de midia nao sao modelos de chat e ficam como indice tecnico.

## Groq

Catalogo curado com modelos de chat, raciocinio, tool router e alguns modelos especiais do ecossistema Groq.

### Selecionaveis

- `llama-3.3-70b-versatile`
- `llama-3.1-8b-instant`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3-32b`
- `meta-llama/llama-4-scout-17b-16e-instruct`
- `groq/compound`
- `groq/compound-mini`

### Indice tecnico

- `whisper-large-v3`
- `whisper-large-v3-turbo`
- `openai/gpt-oss-safeguard-20b`
- `canopylabs/orpheus-arabic-saudi`
- `canopylabs/orpheus-v1-english`
- `meta-llama/llama-prompt-guard-2-22m`
- `meta-llama/llama-prompt-guard-2-86m`

### Notas tecnicas

- `openai/gpt-oss-120b` e `openai/gpt-oss-20b` usam `reasoning.effort` com `low`, `medium` e `high`, e o max output do Groq fica em `65536`.
- `qwen/qwen3-32b` usa `none`, `default`, `low`, `medium` e `high`, com max output de `40960`.
- `meta-llama/llama-4-scout-17b-16e-instruct` aceita imagem, ate 5 imagens e 20 MB por imagem.
- `groq/compound` e `groq/compound-mini` sao sistemas de roteamento e ferramentas, nao modelos chat comuns.

## xAI

### Selecionaveis

- `grok-4.3`
- `grok-build-0.1`

### Indice tecnico

- `grok-imagine-image-quality`
- `grok-imagine-image`
- `grok-imagine-video`

### Notas tecnicas

- `grok-4.3` suporta reasoning configuravel com `none`, `low`, `medium` e `high`.
- `grok-4.3` e o modelo chat geral recomendado no app.
- `grok-build-0.1` e o ID fixo de uso para o modelo de coding da familia Grok Build.
- Os modelos Imagine ficam fora do seletor de chat e aparecem so como indice tecnico.

## Hugging Face

- Provider dinamico.
- O app consulta `https://huggingface.co/api/models?inference_provider=all` com filtros por task.
- A lista depende do provider, da task e da permissao da conta.
- O catalogo curado guarda apenas um fallback para o seletor nao ficar vazio.

## Ollama

- Provider local dinamico.
- O app consulta `/api/tags` e tambem pode ler manifests locais.
- A lista real depende dos modelos instalados na maquina.
- O painel marca modelos instalados, faz `pull` e pode tentar remover modelos.
- Nao existe lista universal fixa para Ollama.

## OpenAI compatible custom

- Provider dinamico.
- O app consulta `/models` no endpoint configurado.
- Use esse provider quando voce tiver um servidor compativel com a API da OpenAI, mas fora dos providers nomeados.
- Se o endpoint devolver alias ou um nome proprio, ele pode aparecer no indice e na rotacao.

## Resumo pratico

Se voce quiser usar o app sem pensar muito:

- OpenAI, Anthropic, Gemini, Groq e xAI sao os catlogos curados.
- OpenRouter, Hugging Face, Ollama e OpenAI compatible custom sao descobertos em runtime.
- `Indice de modelos` e o lugar certo para conferir capacidade, limite e observacao tecnica.
