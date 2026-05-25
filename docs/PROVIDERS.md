# Providers

Este catálogo é curado manualmente em `src/server/models.js`. Ele foi revisado em 24/05/2026 com documentação oficial dos providers.

## Estratégia

- Presets priorizam modelos atuais e IDs documentados.
- Modelos legados ficam como compatibilidade apenas quando ainda são úteis.
- `Modelo personalizado` continua disponível para endpoints, aliases e lançamentos que ainda não entraram no catálogo.
- Capacidade de imagem é explícita. Se o modelo não está marcado como vision, a UI e o backend bloqueiam imagens.
- Limites conhecidos, como quantidade de imagens ou tamanho máximo, são usados para avisos e validação.
- Capacidade de vídeo ainda não é usada no envio. Mesmo providers que aceitam vídeo, como Gemini via Files API, recebem vídeo como referência no MVP.

## Presets principais

### Groq

- `llama-3.3-70b-versatile`
- `llama-3.1-8b-instant`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3-32b`
- `meta-llama/llama-4-scout-17b-16e-instruct` com visão, até 5 imagens e 20 MB por imagem.

### OpenAI

- `gpt-5.5`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5.2`
- `gpt-5.2-pro`
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`

### Anthropic

- `claude-opus-4-7`
- `claude-sonnet-4-6`
- `claude-haiku-4-5-20251001`
- `claude-opus-4-1-20250805`
- `claude-sonnet-4-20250514`

### Gemini

- `gemini-3.5-flash`
- `gemini-3.1-pro-preview`
- `gemini-3-flash-preview`
- `gemini-3.1-flash-lite`
- `gemini-2.5-pro`
- `gemini-2.5-flash`

### xAI

- `grok-4.3`
- `grok-4.3-latest`
- `grok-latest`

### Ollama

- `qwen3.6`, `qwen3.6:27b`, `qwen3.6:35b`
- `qwen3-vl`, `qwen3-vl:8b`
- `llama4:scout`, `llama4:maverick`
- `devstral`
- `gpt-oss:20b`, `gpt-oss:120b`
- `qwen3`, `qwen3:30b`, `qwen3:235b`
- `gemma3`, `gemma3:4b`, `gemma3:12b`
- `moondream`

Ollama também mescla modelos já instalados via `/api/tags`; se o daemon estiver offline, o app tenta ler manifests locais. Se um modelo local não está no preset, ele aparece automaticamente na lista.

## Configurações técnicas por chat

Cada chat pode salvar `modelSettings` em `metadata.json`. A UI mostra apenas parâmetros compatíveis com o provider:

- Groq: temperatura, top_p, max tokens e stop.
- Ollama: temperatura, top_p, max tokens, seed e stop.
- Anthropic: temperatura ou top_p, max tokens e stop sequences.
- Gemini/Hugging Face: temperatura, top_p, max tokens e stop.
- OpenAI, OpenRouter, xAI e OpenAI compatível: temperatura, top_p, max tokens, penalties, seed, reasoning effort e stop.

Nem todo endpoint OpenAI-compatible aceita todos os parâmetros. Se um provider custom rejeitar algo, limpe as configurações do modelo do chat e tente novamente.

## Próxima melhoria

Alguns providers expõem APIs de lista de modelos, mas poucos expõem capacidades completas de visão, limites e parâmetros. Uma fase futura pode fazer descoberta dinâmica para nomes de modelos e manter o catálogo curado apenas para capacidades.

Busca nativa depende do adapter. O app mantém uma tool transparente `web_search`, mas o executor pode usar busca nativa em OpenAI, Groq, Gemini, Anthropic, xAI e OpenRouter. Groq usa `groq/compound` para esse caminho. Ollama e providers sem busca nativa continuam usando fallback via terminal quando `tools.searchMode` estiver em `terminal` ou `both`.
