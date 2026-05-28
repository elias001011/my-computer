# Providers

Atualizado em 26/05/2026.

Este arquivo descreve o catálogo que o app mostra em `Índice de modelos` e nos seletores de provider/modelo.
A fonte de verdade continua sendo `src/server/models.js`.

## Como ler o catálogo

- `selecionável`: aparece em dropdowns, rotatórias e modelo padrão.
- `índice`: aparece no índice técnico, mas não é bom candidato padrão para chat.
- `dinâmico`: vem da descoberta do provider em runtime.
- `local`: depende do que existe na máquina do usuário.

Campos técnicos usados no índice:

- `visão`: aceita imagem.
- `raciocínio`: suporta reasoning/thinking.
- `saída`: limite máximo de tokens de resposta.
- `contexto`: janela de contexto.
- `API`: observações específicas do provider, como endpoints, alias e restrições.

## Regras gerais

- `openrouter/free` continua como entrada gratuita do OpenRouter.
- `openrouter/auto` continua como roteador automático.
- Providers dinâmicos podem mudar por chave, conta, região, permissão e plano.
- O índice técnico existe para explicar capacidades e restrições, não só nomes bonitos.
- Se um modelo não estiver no seletor, ele ainda pode aparecer no índice ou como custom/manual.

## Rotação

- `Rotatória de modelos` troca entre modelos do mesmo provider.
- `Rotatória de providers` troca provider e modelo fallback quando uma chamada falha.
- Em providers dinâmicos, o app mistura catálogo curado com descoberta em runtime.

## OpenAI

Provider curado para chat, raciocínio, multimodal e modelos especiais.

### Chat, raciocínio e uso geral

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
- Realtime e áudio: `gpt-realtime-2`, `gpt-realtime-translate`, `gpt-realtime-whisper`, `gpt-audio-1.5`
- Embeddings: `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002`

### Notas técnicas

- `gpt-5.5`, `gpt-5.4` e `gpt-5.2` suportam `reasoning.effort` com `none`, `low`, `medium`, `high` e `xhigh`.
- `gpt-5.1` suporta `none`, `low`, `medium` e `high`.
- `gpt-5` usa `minimal`, `low`, `medium` e `high`.
- `gpt-5.3-codex` usa `low`, `medium`, `high` e `xhigh`.
- `gpt-oss-120b` e `gpt-oss-20b` usam `low`, `medium` e `high`.
- `gpt-4.1` e `gpt-4o` são modelos não-reasoning.
- `gpt-5.5-pro`, `gpt-5.4-pro`, `gpt-5.2-pro`, `gpt-5-pro` e `o3-pro` ficam como índice ou compatibilidade de Responses API.
- `o3` usa `high` only; `o3-pro` fica como compatibilidade de Responses API.
- Snapshots e aliases de ChatGPT ficam no catálogo para compatibilidade, mas não são o padrão recomendado.

## OpenRouter

- Provider dinâmico via `GET /api/v1/models`.
- `openrouter/free` fica como fallback gratuito no seletor.
- `openrouter/auto` fica como roteador automático.
- A lista real depende dos modelos disponíveis na conta e nos providers conectados ao OpenRouter.

## Anthropic

Modelos ativos e snapshots ainda úteis:

- `claude-opus-4-7`
- `claude-opus-4-6`
- `claude-opus-4-5-20251101`
- `claude-opus-4-1-20250805`
- `claude-sonnet-4-6`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`

Modelos deprecated, mantidos só como índice até o fim do ciclo:

- `claude-opus-4-20250514`
- `claude-sonnet-4-20250514`

### Notas técnicas

- `claude-opus-4-7` pede que `temperature`, `top_p` e `top_k` sejam omitidos quando a chamada usa os defaults do modelo.
- `claude-opus-4-7`, `claude-opus-4-6` e `claude-sonnet-4-6` usam `web_search_20260209`.
- Modelos anteriores continuam com `web_search_20250305`.
- Cada ID datado tem sua própria agenda de deprecação e retirement.

## Gemini

Catálogo curado para chat/texto. Áudio, live e mídia ficam como índice técnico separado.

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

### Áudio, live e TTS

- `gemini-3.1-flash-live-preview`
- `gemini-3.1-flash-tts-preview`
- `gemini-2.5-flash-live-preview`
- `gemini-2.5-flash-tts-preview`
- `gemini-2.5-pro-tts-preview`

### Mídia generativa

- `nano-banana-2-preview`
- `nano-banana-pro-preview`
- `nano-banana`
- `veo-3.1-preview`
- `veo-3.1-lite-preview`
- `imagen-4`
- `lyria-3-pro-preview`
- `lyria-3-clip-preview`

### Notas técnicas

- `gemini-3.1-pro-preview`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite` e `gemini-3.1-flash-lite-preview` usam níveis de thinking similares a `minimal`, `low`, `medium` e `high`.
- `gemini-2.5-pro` usa `minimal`, `low`, `medium` e `high`, mas não desliga thinking.
- `gemini-2.5-flash` e `gemini-2.5-flash-lite` aceitam `none` para desativar thinking.
- `gemini-3-pro-preview` foi tratado como deprecated/shutdown e não entra no seletor.
- Os modelos de mídia não são modelos de chat e ficam como índice técnico.

## Groq

Catálogo curado com modelos de chat, raciocínio, tool router e alguns modelos especiais do ecossistema Groq.

### Selecionáveis

- `llama-3.3-70b-versatile`
- `llama-3.1-8b-instant`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3-32b`
- `meta-llama/llama-4-scout-17b-16e-instruct`
- `groq/compound`
- `groq/compound-mini`

### Índice técnico

- `whisper-large-v3`
- `whisper-large-v3-turbo`
- `openai/gpt-oss-safeguard-20b`
- `canopylabs/orpheus-arabic-saudi`
- `canopylabs/orpheus-v1-english`
- `meta-llama/llama-prompt-guard-2-22m`
- `meta-llama/llama-prompt-guard-2-86m`

### Notas técnicas

- `openai/gpt-oss-120b` e `openai/gpt-oss-20b` usam `reasoning.effort` com `low`, `medium` e `high`, e o max output do Groq fica em `65536`.
- `qwen/qwen3-32b` usa `none`, `default`, `low`, `medium` e `high`, com max output de `40960`.
- `meta-llama/llama-4-scout-17b-16e-instruct` aceita imagem, até 5 imagens e 20 MB por imagem.
- `groq/compound` e `groq/compound-mini` são sistemas de roteamento e ferramentas, não modelos chat comuns.

## xAI

### Selecionáveis

- `grok-4.3`
- `grok-build-0.1`

### Índice técnico

- `grok-imagine-image-quality`
- `grok-imagine-image`
- `grok-imagine-video`

### Notas técnicas

- `grok-4.3` suporta reasoning configurável com `none`, `low`, `medium` e `high`.
- `grok-4.3` é o modelo chat geral recomendado no app.
- `grok-build-0.1` é o ID fixo de uso para o modelo de coding da familia Grok Build.
- Os modelos Imagine ficam fora do seletor de chat e aparecem só como índice técnico.

## Hugging Face

- Provider dinâmico.
- O app consulta `https://huggingface.co/api/models?inference_provider=all` com filtros por task.
- A lista depende do provider, da task e da permissão da conta.
- O catálogo curado guarda apenas um fallback para o seletor não ficar vazio.

## Ollama

- Provider local dinâmico.
- O app consulta `/api/tags` e também pode ler manifests locais.
- A lista real depende dos modelos instalados na máquina.
- O painel marca modelos instalados, faz `pull` e pode tentar remover modelos.
- Não existe lista universal fixa para Ollama.

## OpenAI compatível

- Provider dinâmico.
- O app consulta `/models` no endpoint configurado.
- Use esse provider quando você tiver um servidor compatível com a API da OpenAI, mas fora dos providers nomeados.
- Se o endpoint devolver alias ou um nome próprio, ele pode aparecer no índice e na rotação.

## Resumo prático

Se você quiser usar o app sem pensar muito:

- OpenAI, Anthropic, Gemini, Groq e xAI são os catálogos curados.
- OpenRouter, Hugging Face, Ollama e OpenAI compatível são descobertos em runtime.
- `Índice de modelos` é o lugar certo para conferir capacidade, limite e observação técnica.
