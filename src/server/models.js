export const CUSTOM_MODEL_VALUE = '__custom__';

const OPENAI_55_REASONING = ['none', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_54_REASONING = ['none', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_54_PRO_REASONING = ['medium', 'high', 'xhigh'];
const OPENAI_52_REASONING = ['none', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_52_PRO_REASONING = ['medium', 'high', 'xhigh'];
const OPENAI_51_REASONING = ['none', 'low', 'medium', 'high'];
const OPENAI_5_REASONING = ['minimal', 'low', 'medium', 'high'];
const OPENAI_5_PRO_REASONING = ['high'];
const OPENAI_53_CODEX_REASONING = ['low', 'medium', 'high', 'xhigh'];
const OPENAI_OSS_REASONING = ['low', 'medium', 'high'];
const O3_REASONING = ['high'];
const GROQ_REASONING = ['low', 'medium', 'high'];
const GROQ_QWEN_REASONING = ['none', 'default', 'low', 'medium', 'high'];
const XAI_REASONING = ['none', 'low', 'medium', 'high'];
const GEMINI_3_PRO_REASONING = ['minimal', 'low', 'medium', 'high'];
const GEMINI_3_FLASH_REASONING = ['minimal', 'low', 'medium', 'high'];
const GEMINI_2_5_FLASH_REASONING = ['none', 'minimal', 'low', 'medium', 'high'];
const GEMINI_2_5_PRO_REASONING = ['minimal', 'low', 'medium', 'high'];

const OPENAI_IMAGE_CAPS = { supportsImages: true };
const GROQ_VISION_CAPS = { supportsImages: true, maxInputImages: 5, maxFileSizeMB: 20 };
const XAI_VISION_CAPS = { supportsImages: true, maxFileSizeMB: 20 };
const GEMINI_VISION_CAPS = { supportsImages: true, maxOutputTokens: 65536 };
const ANTHROPIC_VISION_CAPS = { supportsImages: true };
const OLLAMA_VISION_CAPS = { supportsImages: true };

let runtimeDiscoveredModelsByProvider = new Map();

export const providerCatalog = Object.freeze([
  {
    id: 'groq',
    label: 'Groq',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    catalogMode: 'curated',
    catalogSummary: 'Lista curada de modelos oficiais e sistemas Groq, com Compound e roteamento próprio separados do chat comum.',
    models: [
      model('llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'Geral', 131072, {
        maxOutputTokens: 32768,
        description: 'Modelo geral atual do Groq para chat e ferramentas.',
        apiNotes: 'Text-only; tool use and JSON object mode are documented by Groq.',
      }),
      model('llama-3.1-8b-instant', 'Llama 3.1 8B Instant', 'Rápido', 131072, {
        maxOutputTokens: 32768,
        description: 'Modelo pequeno e rápido para trocas curtas.',
        apiNotes: 'Text-only; low-latency chat model.',
      }),
      model('openai/gpt-oss-120b', 'GPT OSS 120B', 'Raciocínio', 131072, {
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GROQ_REASONING,
        description: 'Modelo open-weight de raciocínio com tool use e browser search.',
        apiNotes: 'Groq reasoning modes: low, medium, high.',
      }),
      model('openai/gpt-oss-20b', 'GPT OSS 20B', 'Raciocínio', 131072, {
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GROQ_REASONING,
        description: 'Versão menor do GPT OSS para respostas rápidas.',
        apiNotes: 'Groq reasoning modes: low, medium, high.',
      }),
      model('whisper-large-v3', 'Whisper Large V3', 'Áudio', null, {
        selectable: false,
        description: 'Transcrição de áudio via Groq.',
        apiNotes: 'Speech-to-text only.',
      }),
      model('whisper-large-v3-turbo', 'Whisper Large V3 Turbo', 'Áudio', null, {
        selectable: false,
        description: 'Transcrição de áudio com menor latência.',
        apiNotes: 'Speech-to-text only.',
      }),
      model('qwen/qwen3-32b', 'Qwen3 32B', 'Raciocínio', 131072, {
        maxOutputTokens: 40960,
        supportsReasoning: true,
        reasoningEfforts: GROQ_QWEN_REASONING,
        description: 'Qwen 3 com modos de raciocínio configuráveis.',
        apiNotes: 'Groq reasoning modes: none, default, low, medium, high.',
      }),
      model('meta-llama/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B', 'Visão', 131072, {
        ...GROQ_VISION_CAPS,
        maxOutputTokens: 8192,
        description: 'Modelo multimodal com visão no Groq.',
        apiNotes: 'Text and image input; max 5 images and 20 MB per image.',
      }),
      model('groq/compound', 'Groq Compound', 'Router', null, {
        selectable: false,
        description: 'Sistema Compound do Groq com busca, code execution e routing de ferramentas.',
        apiNotes: 'Use Groq-Model-Version for version pinning when needed.',
      }),
      model('groq/compound-mini', 'Groq Compound Mini', 'Router', null, {
        selectable: false,
        description: 'Versão menor do sistema Compound do Groq.',
        apiNotes: 'Use Groq-Model-Version for version pinning when needed.',
      }),
      model('openai/gpt-oss-safeguard-20b', 'GPT OSS Safeguard 20B', 'Segurança', null, {
        selectable: false,
        description: 'Classificador de segurança do ecossistema GPT OSS.',
        apiNotes: 'Content moderation / trust and safety use case.',
      }),
      model('canopylabs/orpheus-arabic-saudi', 'Orpheus Arabic Saudi', 'Áudio', null, {
        selectable: false,
        description: 'Preview de voz/áudio listado pelo Groq.',
        apiNotes: 'Audio/voice preview model.',
      }),
      model('canopylabs/orpheus-v1-english', 'Orpheus V1 English', 'Áudio', null, {
        selectable: false,
        description: 'Preview de voz/áudio listado pelo Groq.',
        apiNotes: 'Audio/voice preview model.',
      }),
      model('meta-llama/llama-prompt-guard-2-22m', 'Llama Prompt Guard 2 22M', 'Segurança', null, {
        selectable: false,
        description: 'Classificador de prompt guard para segurança.',
        apiNotes: 'Prompt safety / moderation model.',
      }),
      model('meta-llama/llama-prompt-guard-2-86m', 'Llama Prompt Guard 2 86M', 'Segurança', null, {
        selectable: false,
        description: 'Versão maior do classificador de prompt guard.',
        apiNotes: 'Prompt safety / moderation model.',
      }),
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'gpt-5.5',
    catalogMode: 'curated',
    catalogSummary: 'Lista curada dos modelos oficiais atuais da OpenAI; snapshots legados e modelos especializados ficam como índice.',
    models: [
      model('gpt-5.5', 'GPT-5.5', 'Frontier', 1050000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_55_REASONING,
        description: 'Modelo principal atual da OpenAI para chat, código e multimodal.',
        apiNotes: 'Reasoning.effort: none, low, medium, high, xhigh. Responses API and Chat Completions available.',
      }),
      model('gpt-5.5-pro', 'GPT-5.5 Pro', 'Frontier', 1050000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_55_REASONING,
        selectable: false,
        description: 'Variante de maior custo e compute.',
        apiNotes: 'Responses API only.',
      }),
      model('gpt-5.4', 'GPT-5.4', 'Frontier', 1050000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_54_REASONING,
        description: 'Modelo frontal da linha GPT-5.4.',
        apiNotes: 'Reasoning.effort: none, low, medium, high, xhigh. Responses API and Chat Completions available.',
      }),
      model('gpt-5.4-pro', 'GPT-5.4 Pro', 'Frontier', 1050000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_54_PRO_REASONING,
        selectable: false,
        description: 'Variante de maior custo da linha GPT-5.4.',
        apiNotes: 'Responses API only.',
      }),
      model('gpt-5.4-mini', 'GPT-5.4 Mini', 'Rápido', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_54_REASONING,
        description: 'Versão menor da linha GPT-5.4.',
        apiNotes: 'Reasoning.effort: none, low, medium, high, xhigh. Built for high-volume workloads.',
      }),
      model('gpt-5.4-nano', 'GPT-5.4 Nano', 'Econômico', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_54_REASONING,
        description: 'Versão mínima da linha GPT-5.4.',
        apiNotes: 'Reasoning.effort: none, low, medium, high, xhigh. Cheapest GPT-5.4-class model.',
      }),
      model('gpt-5', 'GPT-5', 'Compatibilidade', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_5_REASONING,
        description: 'Modelo GPT-5 base para compatibilidade e fallback.',
        apiNotes: 'Reasoning.effort: minimal, low, medium, high.',
      }),
      model('gpt-5-mini', 'GPT-5 Mini', 'Rápido', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_5_REASONING,
        description: 'Variante menor da linha GPT-5; boa para tarefas bem definidas e prompts precisos.',
        apiNotes: 'Reasoning token support available; image input supported.',
      }),
      model('gpt-5-nano', 'GPT-5 Nano', 'Econômico', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_5_REASONING,
        description: 'Variante menor da linha GPT-5 para tarefas curtas e classificações.',
        apiNotes: 'Reasoning token support available; image input supported.',
      }),
      model('gpt-5.2', 'GPT-5.2', 'Frontier', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_52_REASONING,
        description: 'Linha GPT-5.2 com suporte amplo para chat e multimodal.',
        apiNotes: 'Reasoning.effort: none, low, medium, high, xhigh.',
      }),
      model('gpt-5.2-pro', 'GPT-5.2 Pro', 'Frontier', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_52_PRO_REASONING,
        selectable: false,
        description: 'Variante de maior compute da linha GPT-5.2.',
        apiNotes: 'Responses API only.',
      }),
      model('gpt-5.2-chat-latest', 'GPT-5.2 Chat', 'ChatGPT', 128000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 16384,
        supportsReasoning: false,
        selectable: false,
        description: 'GPT-5.2 model used in ChatGPT.',
        apiNotes: 'Deprecated chat snapshot; retained only for compatibility.',
      }),
      model('gpt-5.1', 'GPT-5.1', 'Frontier', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_51_REASONING,
        description: 'Linha GPT-5.1 para chat e código.',
        apiNotes: 'Reasoning.effort: none, low, medium, high.',
      }),
      model('gpt-5-pro', 'GPT-5 Pro', 'Frontier', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 272000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_5_PRO_REASONING,
        selectable: false,
        description: 'Variante de maior custo da linha GPT-5.',
        apiNotes: 'Responses API only.',
      }),
      model('gpt-5.1-chat-latest', 'GPT-5.1 Chat', 'ChatGPT', 128000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 16384,
        supportsReasoning: false,
        selectable: false,
        description: 'GPT-5.1 model used in ChatGPT.',
        apiNotes: 'Deprecated chat snapshot; retained only for compatibility.',
      }),
      model('gpt-5.3-chat-latest', 'GPT-5.3 Chat', 'ChatGPT', 128000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 16384,
        supportsReasoning: false,
        description: 'GPT-5.3 Instant model used in ChatGPT.',
        apiNotes: 'Instant ChatGPT alias; the snapshot behind the alias can change.',
      }),
      model('gpt-5.3-codex', 'GPT-5.3 Codex', 'Código', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_53_CODEX_REASONING,
        description: 'Most capable agentic coding model to date.',
        apiNotes: 'Optimized for Codex and similar agentic coding environments. Reasoning.effort: low, medium, high, xhigh.',
      }),
      model('gpt-4.1', 'GPT-4.1', 'Compatibilidade', 1047576, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 32768,
        description: 'Smartest non-reasoning model.',
        apiNotes: 'Non-reasoning model with text and image input.',
      }),
      model('gpt-4.1-mini', 'GPT-4.1 Mini', 'Rápido', 1047576, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 32768,
        description: 'Smaller, faster version of GPT-4.1.',
        apiNotes: 'Non-reasoning model with text and image input.',
      }),
      model('gpt-4.1-nano', 'GPT-4.1 Nano', 'Econômico', 1047576, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 32768,
        selectable: false,
        description: 'Fastest, most cost-efficient version of GPT-4.1.',
        apiNotes: 'Deprecated snapshot.',
      }),
      model('gpt-4o', 'GPT-4o', 'Compatibilidade', 128000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 16384,
        description: 'Fast, intelligent, flexible GPT model.',
        apiNotes: 'All latest OpenAI models support text and image input; GPT-4o is non-reasoning.',
      }),
      model('gpt-4o-mini', 'GPT-4o Mini', 'Rápido', 128000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 16384,
        description: 'Fast, affordable small model for focused tasks.',
        apiNotes: 'Non-reasoning GPT-4o family model.',
      }),
      model('o3', 'o3', 'Raciocínio', 200000, {
        maxOutputTokens: 100000,
        supportsReasoning: true,
        reasoningEfforts: O3_REASONING,
        description: 'Reasoning model for complex tasks, succeeded by GPT-5.',
        apiNotes: 'Reasoning.effort: high only.',
      }),
      model('o3-pro', 'o3 Pro', 'Raciocínio', 200000, {
        maxOutputTokens: 100000,
        supportsReasoning: true,
        reasoningEfforts: O3_REASONING,
        selectable: false,
        description: 'Version of o3 with more compute for better responses.',
        apiNotes: 'Responses API only.',
      }),
      model('chat-latest', 'Chat Latest', 'ChatGPT', 400000, {
        ...OPENAI_IMAGE_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: false,
        description: 'Latest Instant model used in ChatGPT.',
        apiNotes: 'Alias changes over time; use GPT-5.5 for production.',
      }),
      model('gpt-oss-120b', 'GPT OSS 120B', 'Raciocínio', 131072, {
        maxOutputTokens: 131072,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_OSS_REASONING,
        description: 'Most powerful open-weight model, fits into an H100 GPU.',
        apiNotes: 'Reasoning.effort: low, medium, high.',
      }),
      model('gpt-oss-20b', 'GPT OSS 20B', 'Raciocínio', 131072, {
        maxOutputTokens: 131072,
        supportsReasoning: true,
        reasoningEfforts: OPENAI_OSS_REASONING,
        description: 'Medium-sized open-weight model for low latency.',
        apiNotes: 'Reasoning.effort: low, medium, high.',
      }),
      model('gpt-image-2', 'GPT Image 2', 'Imagem', null, {
        selectable: false,
        supportsImages: true,
        description: 'Modelo de geração de imagem da OpenAI.',
      }),
      model('gpt-image-1.5', 'GPT Image 1.5', 'Imagem', null, {
        selectable: false,
        supportsImages: true,
        description: 'Variante de imagem da OpenAI.',
      }),
      model('chatgpt-image-latest', 'ChatGPT Image Latest', 'Imagem', null, {
        selectable: false,
        supportsImages: true,
        description: 'Alias de imagem do ecossistema ChatGPT.',
      }),
      model('gpt-realtime-2', 'GPT Realtime 2', 'Áudio', null, {
        selectable: false,
        description: 'Modelo realtime/multimodal de áudio.',
      }),
      model('gpt-realtime-translate', 'GPT Realtime Translate', 'Áudio', null, {
        selectable: false,
        description: 'Variante de tradução em tempo real.',
      }),
      model('gpt-realtime-whisper', 'GPT Realtime Whisper', 'Áudio', null, {
        selectable: false,
        description: 'Variante realtime baseada em Whisper.',
      }),
      model('gpt-audio-1.5', 'GPT Audio 1.5', 'Áudio', null, {
        selectable: false,
        description: 'Modelo de áudio da OpenAI.',
      }),
      model('text-embedding-3-large', 'Text Embedding 3 Large', 'Embedding', null, {
        selectable: false,
        description: 'Modelo de embeddings da OpenAI.',
      }),
      model('text-embedding-3-small', 'Text Embedding 3 Small', 'Embedding', null, {
        selectable: false,
        description: 'Modelo de embeddings mais leve da OpenAI.',
      }),
      model('text-embedding-ada-002', 'Text Embedding Ada 002', 'Embedding', null, {
        selectable: false,
        description: 'Modelo de embeddings legado da OpenAI.',
      }),
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    requiresApiKey: true,
    defaultModel: 'openrouter/free',
    catalogMode: 'dynamic',
    catalogSummary: 'Catálogo dinâmico via GET /api/v1/models, mantendo openrouter/free como fallback.',
    models: [
      model('openrouter/free', 'OpenRouter Free', 'Router', null, {
        supportsImages: true,
        description: 'Router gratuito que escolhe um modelo free disponível no momento.',
        apiNotes: 'Random free router; filters for supported features and preserves free-tier routing.',
      }),
      model('openrouter/auto', 'OpenRouter Auto', 'Router', null, {
        supportsImages: true,
        description: 'Router automático do OpenRouter.',
        apiNotes: 'Auto-selects the best available model for the request.',
      }),
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-6',
    catalogMode: 'curated',
    catalogSummary: 'Lista curada com modelos ativos e snapshots legados; deprecated ficam visíveis só como índice até a aposentadoria.',
    models: [
      model('claude-opus-4-7', 'Claude Opus 4.7', 'Avançado', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        description: 'Modelo Opus mais recente listado pela Anthropic.',
        apiNotes: '1M context, 128k output, high-resolution images, adaptive thinking. Sampling params temperature/top_p/top_k must be omitted.',
      }),
      model('claude-opus-4-6', 'Claude Opus 4.6', 'Avançado', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        description: 'Variante Opus anterior mantida como compatibilidade.',
        apiNotes: '1M context and extended thinking; web_search_20260209 supported.',
      }),
      model('claude-opus-4-5-20251101', 'Claude Opus 4.5', 'Avançado', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        description: 'Snapshot Opus 4.5 ainda ativo nos docs da Anthropic.',
        apiNotes: 'Active dated snapshot; search results feature available.',
      }),
      model('claude-opus-4-1-20250805', 'Claude Opus 4.1', 'Avançado', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        description: 'Snapshot Opus 4.1 ainda ativo nos docs da Anthropic.',
        apiNotes: 'Active dated snapshot; still listed in deprecation docs.',
      }),
      model('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'Geral', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        description: 'Modelo equilibrado com longo contexto e bom tool use.',
        apiNotes: '1M context, extended thinking, web_search_20260209.',
      }),
      model('claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 'Geral', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        supportsReasoning: true,
        description: 'Snapshot Sonnet 4.5 ainda ativo nos docs da Anthropic.',
        apiNotes: 'Active dated snapshot; search results feature available.',
      }),
      model('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'Rápido', 200000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 64000,
        supportsReasoning: true,
        description: 'Variante rápida e barata da família Haiku 4.5.',
        apiNotes: '200k context, 64k output, active dated snapshot.',
      }),
      model('claude-opus-4-20250514', 'Claude Opus 4 (Deprecated)', 'Legado', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        selectable: false,
        description: 'Modelo deprecated com data de aposentadoria já anunciada.',
        apiNotes: 'Retira-se em 15/06/2026.',
      }),
      model('claude-sonnet-4-20250514', 'Claude Sonnet 4 (Deprecated)', 'Legado', 1000000, {
        ...ANTHROPIC_VISION_CAPS,
        maxOutputTokens: 128000,
        selectable: false,
        description: 'Modelo deprecated com data de aposentadoria já anunciada.',
        apiNotes: 'Retira-se em 15/06/2026.',
      }),
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    adapter: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'gemini-3.5-flash',
    catalogMode: 'curated',
    catalogSummary: 'Lista curada para chat/texto; áudio, live e mídia ficam como índice separado do seletor principal.',
    models: [
      model('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'Preview', 1000000, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_3_PRO_REASONING,
        description: 'Preview multimodal de alto nível.',
        apiNotes: 'OpenAI compatibility maps reasoning_effort to thinking_level. No Gemini API free tier.',
      }),
      model('gemini-3.1-pro-preview-customtools', 'Gemini 3.1 Pro Preview Custom Tools', 'Preview', 1000000, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_3_PRO_REASONING,
        description: 'Mesma linha do Pro Preview com foco em ferramentas customizadas.',
        apiNotes: 'Custom tools variant of Gemini 3.1 Pro Preview.',
      }),
      model('gemini-3.5-flash', 'Gemini 3.5 Flash', 'Geral', 1000000, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_3_FLASH_REASONING,
        description: 'Modelo atual rápido e geral para chat multimodal.',
        apiNotes: 'OpenAI compatibility maps reasoning_effort to thinking_level.',
      }),
      model('gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'Preview', 1000000, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_3_FLASH_REASONING,
        description: 'Preview rápido da família Gemini 3.',
        apiNotes: 'Supports minimal, low, medium, and high thinking levels.',
      }),
      model('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Rápido', 1000000, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_3_FLASH_REASONING,
        description: 'Versão mais leve da família Gemini 3.1 Flash.',
        apiNotes: 'OpenAI compatibility maps reasoning_effort to thinking_level.',
      }),
      model('gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite Preview', 'Preview', 1000000, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_3_FLASH_REASONING,
        description: 'Preview leve da família Gemini 3.1 Flash.',
        apiNotes: 'OpenAI compatibility maps reasoning_effort to thinking_level.',
      }),
      model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'Compatibilidade', 1048576, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_2_5_PRO_REASONING,
        description: 'Modelo Gemini 2.5 Pro para compatibilidade e contexto longo.',
        apiNotes: 'Thinking uses reasoning_effort -> thinking_budget mapping. Reasoning cannot be turned off for 2.5 Pro.',
      }),
      model('gemini-2.5-flash', 'Gemini 2.5 Flash', 'Compatibilidade', 1048576, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_2_5_FLASH_REASONING,
        description: 'Modelo Gemini 2.5 Flash para equilíbrio de custo e velocidade.',
        apiNotes: 'Thinking uses reasoning_effort -> thinking_budget mapping.',
      }),
      model('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Compatibilidade', 1048576, {
        ...GEMINI_VISION_CAPS,
        maxOutputTokens: 65536,
        supportsReasoning: true,
        reasoningEfforts: GEMINI_2_5_FLASH_REASONING,
        description: 'Versão leve da família Gemini 2.5 Flash.',
        apiNotes: 'Thinking uses reasoning_effort -> thinking_budget mapping.',
      }),
      model('gemini-3.1-flash-live-preview', 'Gemini 3.1 Flash Live Preview', 'Áudio', null, {
        selectable: false,
        description: 'Preview de live/audio para fluxo realtime.',
        apiNotes: 'Audio/live model, not part of the text chat selector.',
      }),
      model('gemini-3.1-flash-tts-preview', 'Gemini 3.1 Flash TTS Preview', 'Áudio', null, {
        selectable: false,
        description: 'Preview de text-to-speech.',
        apiNotes: 'Audio/TTS model, not part of the text chat selector.',
      }),
      model('gemini-2.5-flash-live-preview', 'Gemini 2.5 Flash Live Preview', 'Áudio', null, {
        selectable: false,
        description: 'Preview live da família Gemini 2.5 Flash.',
        apiNotes: 'Audio/live model, not part of the text chat selector.',
      }),
      model('gemini-2.5-flash-tts-preview', 'Gemini 2.5 Flash TTS Preview', 'Áudio', null, {
        selectable: false,
        description: 'Preview text-to-speech da família Gemini 2.5 Flash.',
        apiNotes: 'Audio/TTS model, not part of the text chat selector.',
      }),
      model('gemini-2.5-pro-tts-preview', 'Gemini 2.5 Pro TTS Preview', 'Áudio', null, {
        selectable: false,
        description: 'Preview text-to-speech da família Gemini 2.5 Pro.',
        apiNotes: 'Audio/TTS model, not part of the text chat selector.',
      }),
      model('nano-banana-2-preview', 'Nano Banana 2 Preview', 'Imagem', null, {
        selectable: false,
        description: 'Modelo de criação visual em escala de produção com a inteligência da família Gemini 3.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('nano-banana-pro-preview', 'Nano Banana Pro Preview', 'Imagem', null, {
        selectable: false,
        description: 'Motor profissional para visuais 4K, layouts complexos e texto preciso.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('nano-banana', 'Nano Banana', 'Imagem', null, {
        selectable: false,
        description: 'Geração e edicao nativa de imagens para fluxos criativos rapidos.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('veo-3.1-preview', 'Veo 3.1 Preview', 'Vídeo', null, {
        selectable: false,
        description: 'Geracao de video cinematografico com controles criativos e audio sincronizado.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('veo-3.1-lite-preview', 'Veo 3.1 Lite Preview', 'Vídeo', null, {
        selectable: false,
        description: 'Geracao e edicao de video de baixo custo e foco em desenvolvedor.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('imagen-4', 'Imagen 4', 'Imagem', null, {
        selectable: false,
        description: 'Modelo text-to-image da Google com saida rapida e claridade alta.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('lyria-3-pro-preview', 'Lyria 3 Pro Preview', 'Música', null, {
        selectable: false,
        description: 'Modelo flagship para musica completa com coerencia estrutural.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
      model('lyria-3-clip-preview', 'Lyria 3 Clip Preview', 'Música', null, {
        selectable: false,
        description: 'Modelo para clipes curtos, loops e previews de ate 30 segundos.',
        apiNotes: 'Generative media model; not part of the chat selector.',
      }),
    ],
  },
  {
    id: 'xai',
    label: 'xAI',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'grok-4.3',
    catalogMode: 'curated',
    catalogSummary: 'Lista curada com modelos de chat e mídia do xAI, usando IDs fixos no app.',
    models: [
      model('grok-4.3', 'Grok 4.3', 'Geral', 1000000, {
        ...XAI_VISION_CAPS,
        supportsReasoning: true,
        reasoningEfforts: XAI_REASONING,
        description: 'Flagship atual do xAI para chat e raciocínio.',
        apiNotes: 'Configurable reasoning: none, low, medium, high. Supports web search / X Search.',
      }),
      model('grok-build-0.1', 'Grok Build 0.1', 'Código', 256000, {
        ...XAI_VISION_CAPS,
        supportsReasoning: true,
        reasoningEfforts: XAI_REASONING,
        description: 'Modelo focado em coding da linha Grok.',
        apiNotes: 'Alias for grok-code-fast-1; reasoning configurable.',
      }),
      model('grok-imagine-image-quality', 'Grok Imagine Image Quality', 'Imagem', null, {
        selectable: false,
        description: 'Modelo de imagem do xAI com foco em qualidade.',
        apiNotes: 'Image generation and editing API.',
      }),
      model('grok-imagine-image', 'Grok Imagine Image', 'Imagem', null, {
        selectable: false,
        description: 'Modelo de imagem do xAI.',
        apiNotes: 'Image generation and editing API.',
      }),
      model('grok-imagine-video', 'Grok Imagine Video', 'Vídeo', null, {
        selectable: false,
        description: 'Modelo de vídeo do xAI.',
        apiNotes: 'Video generation API.',
      }),
    ],
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    adapter: 'openai-compatible',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKeyEnv: 'HF_TOKEN',
    requiresApiKey: true,
    defaultModel: 'openai/gpt-oss-120b',
    catalogMode: 'dynamic',
    catalogSummary: 'Catálogo dinâmico via Hugging Face API /api/models com inference_provider=all.',
    models: [
      model('openai/gpt-oss-120b', 'GPT OSS 120B', 'Fallback', null, {
        description: 'Fallback curado para o catálogo do Hugging Face.',
        apiNotes: 'Dynamic catalog comes from HF Inference Providers; the OpenAI-compatible client is not supported for image generation.',
      }),
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    adapter: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    requiresApiKey: false,
    defaultModel: 'qwen3.6',
    catalogMode: 'local',
    catalogSummary: 'Catálogo local mesclado com /api/tags e manifests do Ollama.',
    models: [
      model('qwen3.6', 'Qwen3.6', 'Local', 256000, {
        description: 'Modelo local Qwen 3.6 base.',
      }),
      model('qwen3.6:27b', 'Qwen3.6 27B', 'Local', 256000, {
        description: 'Variante local maior do Qwen 3.6.',
      }),
      model('qwen3.6:35b', 'Qwen3.6 35B', 'Local', 256000, {
        description: 'Variante local ainda maior do Qwen 3.6.',
      }),
      model('qwen3-vl', 'Qwen3-VL', 'Visão', 256000, {
        ...OLLAMA_VISION_CAPS,
        description: 'Modelo local multimodal com visão.',
      }),
      model('qwen3-vl:8b', 'Qwen3-VL 8B', 'Visão', 256000, {
        ...OLLAMA_VISION_CAPS,
        description: 'Versão menor do Qwen3-VL local.',
      }),
      model('llama4:scout', 'Llama 4 Scout', 'Visão', null, {
        ...OLLAMA_VISION_CAPS,
        description: 'Modelo local Llama 4 Scout com visão.',
      }),
      model('llama4:maverick', 'Llama 4 Maverick', 'Visão', null, {
        ...OLLAMA_VISION_CAPS,
        description: 'Modelo local Llama 4 Maverick com visão.',
      }),
      model('devstral', 'Devstral', 'Código', 128000, {
        description: 'Modelo local focado em coding.',
      }),
      model('gpt-oss:20b', 'GPT OSS 20B', 'Local', 131072, {
        description: 'Build local do GPT OSS 20B.',
      }),
      model('gpt-oss:120b', 'GPT OSS 120B', 'Local', 131072, {
        description: 'Build local do GPT OSS 120B.',
      }),
      model('qwen3', 'Qwen3', 'Local', 256000, {
        description: 'Família Qwen 3 local.',
      }),
      model('qwen3:30b', 'Qwen3 30B', 'Local', 256000, {
        description: 'Variante local maior do Qwen 3.',
      }),
      model('qwen3:235b', 'Qwen3 235B', 'Local', 256000, {
        description: 'Maior variante local comum do Qwen 3.',
      }),
      model('qwen2.5-coder', 'Qwen2.5 Coder', 'Código', 128000, {
        description: 'Modelo local focado em coding.',
      }),
      model('deepseek-r1', 'DeepSeek R1', 'Raciocínio', null, {
        description: 'Modelo local de raciocínio.',
      }),
      model('gemma3', 'Gemma 3', 'Visão', 128000, {
        ...OLLAMA_VISION_CAPS,
        description: 'Modelo local Gemma 3.',
      }),
      model('gemma3:4b', 'Gemma 3 4B', 'Visão', 128000, {
        ...OLLAMA_VISION_CAPS,
        description: 'Variante menor do Gemma 3.',
      }),
      model('gemma3:12b', 'Gemma 3 12B', 'Visão', 128000, {
        ...OLLAMA_VISION_CAPS,
        description: 'Variante média do Gemma 3.',
      }),
      model('moondream', 'Moondream', 'Visão', null, {
        ...OLLAMA_VISION_CAPS,
        description: 'Pequeno modelo local para compreensão de imagens.',
      }),
    ],
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI compatível',
    adapter: 'openai-compatible',
    baseUrl: '',
    requiresApiKey: true,
    defaultModel: 'modelo-personalizado',
    catalogMode: 'dynamic',
    catalogSummary: 'Descobre modelos via /models no endpoint configurado; fallback manual sempre disponível.',
    models: [
      model('modelo-personalizado', 'Modelo personalizado', 'Endpoint próprio', null, {
        description: 'Fallback manual para endpoints OpenAI-compatible.',
      }),
    ],
  },
]);

export const groqModels = Object.freeze(getProvider('groq').models);

export async function refreshRuntimeModelCatalog(config = {}, options = {}) {
  const next = new Map(runtimeDiscoveredModelsByProvider);

  if (Array.isArray(options.ollamaInstalledModels)) {
    next.set('ollama', buildInstalledOllamaModels(options.ollamaInstalledModels));
  }

  const openRouterModels = await discoverOpenRouterModels(config);
  if (openRouterModels !== null) next.set('openrouter', openRouterModels);

  const huggingFaceModels = await discoverHuggingFaceModels();
  if (huggingFaceModels !== null) next.set('huggingface', huggingFaceModels);

  const openAICompatibleModels = await discoverOpenAICompatibleModels(config);
  if (openAICompatibleModels !== null) next.set('openai-compatible', openAICompatibleModels);

  runtimeDiscoveredModelsByProvider = next;
  return getRuntimeModelCatalog();
}

export function getProvider(providerId) {
  return providerCatalog.find((provider) => provider.id === providerId) || providerCatalog[0];
}

export function isKnownProvider(providerId) {
  return providerCatalog.some((provider) => provider.id === providerId);
}

export function getDefaultModelForProvider(providerId) {
  return getProvider(providerId).defaultModel;
}

export function getProviderModels(providerId, options = {}) {
  const provider = getProvider(providerId);
  const customModels = normalizeCustomModelList(options.customModels || []);
  const modelCapabilities = options.modelCapabilities || {};
  const discoveredModels =
    options.discoveredModels || runtimeDiscoveredModelsByProvider.get(provider.id) || [];
  const installedModels = provider.id === 'ollama'
    ? buildInstalledOllamaModels(options.ollamaInstalledModels || [])
    : [];
  const models = mergeModels(provider.models, discoveredModels, customModels, installedModels);

  return models.map((item) => {
    const customCapabilities = modelCapabilities[item.id] || {};
    return {
      ...item,
      supportsImages: Boolean(customCapabilities.images ?? item.supportsImages),
      maxInputImages: customCapabilities.maxInputImages || item.maxInputImages || null,
      maxFileSizeMB: customCapabilities.maxFileSizeMB || item.maxFileSizeMB || null,
      maxOutputTokens: customCapabilities.maxOutputTokens || item.maxOutputTokens || null,
      supportsReasoning: Boolean(customCapabilities.reasoning ?? item.supportsReasoning),
      reasoningEfforts: customCapabilities.reasoningEfforts || item.reasoningEfforts || null,
      installed: provider.id === 'ollama' ? Boolean(item.installed) : undefined,
    };
  });
}

export function getProvidersForClient(options = {}) {
  const customModelsByProvider = options.customModelsByProvider || {};
  const modelCapabilitiesByProvider = options.modelCapabilitiesByProvider || {};
  const discoveredModelsByProvider = options.discoveredModelsByProvider || getRuntimeModelCatalog();

  return providerCatalog.map((provider) => ({
    id: provider.id,
    label: provider.label,
    adapter: provider.adapter,
    baseUrl: provider.baseUrl,
    requiresApiKey: provider.requiresApiKey,
    defaultModel: provider.defaultModel,
    catalogMode: provider.catalogMode,
    catalogSummary: provider.catalogSummary,
    models: getProviderModels(provider.id, {
      customModels: customModelsByProvider[provider.id],
      modelCapabilities: modelCapabilitiesByProvider[provider.id],
      discoveredModels: discoveredModelsByProvider[provider.id],
      ollamaInstalledModels: options.ollamaInstalledModels,
    }),
  }));
}

export function modelSupportsImages(providerId, modelId, config = {}) {
  const metadata = resolveCatalogModel(providerId, modelId, config);
  return Boolean(metadata?.supportsImages);
}

export function getModelMetadata(providerId, modelId, config = {}) {
  const metadata = resolveCatalogModel(providerId, modelId, config);
  const custom = config.modelCapabilities?.[providerId]?.[modelId] || {};
  return {
    id: modelId,
    selectable: Boolean(metadata ? metadata.selectable !== false : true),
    supportsImages: Boolean(custom.images ?? metadata?.supportsImages),
    maxInputImages: Number(custom.maxInputImages || metadata?.maxInputImages || 0) || null,
    maxFileSizeMB: Number(custom.maxFileSizeMB || metadata?.maxFileSizeMB || 0) || null,
    maxOutputTokens: Number(custom.maxOutputTokens || metadata?.maxOutputTokens || 0) || null,
    contextTokens: Number(metadata?.contextTokens || 0) || null,
    supportsReasoning: Boolean(custom.reasoning ?? metadata?.supportsReasoning),
    reasoningEfforts: custom.reasoningEfforts || metadata?.reasoningEfforts || null,
    description: metadata?.description || '',
    apiNotes: metadata?.apiNotes || '',
  };
}

export function normalizeCustomModelList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function getRuntimeModelCatalog() {
  return Object.fromEntries(runtimeDiscoveredModelsByProvider.entries());
}

function resolveCatalogModel(providerId, modelId, config = {}) {
  const provider = getProvider(providerId);
  const staticModel = provider.models.find((modelItem) => modelItem.id === modelId);
  if (staticModel) return staticModel;

  const runtimeModel = runtimeDiscoveredModelsByProvider.get(provider.id)?.find((item) => item.id === modelId);
  if (runtimeModel) return runtimeModel;

  const customModels = normalizeCustomModelList(config.customModels?.[provider.id] || []);
  if (customModels.includes(modelId)) {
    return model(modelId, humanizeModelId(modelId), 'Personalizado', null, {
      description: 'Modelo personalizado informado pelo usuário.',
    });
  }

  return null;
}

function mergeModels(baseModels, discoveredModels, customModels, installedModels) {
  const byId = new Map();
  for (const item of baseModels) byId.set(item.id, item);
  for (const item of discoveredModels) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  for (const item of installedModels) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  for (const id of customModels) {
    if (!byId.has(id)) byId.set(id, model(id, humanizeModelId(id), 'Personalizado', null, {
      description: 'Modelo personalizado informado manualmente.',
    }));
  }
  return [...byId.values()];
}

async function discoverOpenRouterModels(config = {}) {
  const runtime = getProviderRuntimeSettings('openrouter', config);
  if (!runtime.baseUrl) return null;

  const payload = await fetchJson(appendPath(runtime.baseUrl, 'models'), {
    headers: runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {},
    timeoutMs: 6000,
  });
  if (!payload) return null;

  const models = extractModelArray(payload)
    .map((item) => normalizeOpenRouterModel(item))
    .filter(Boolean);
  return models;
}

async function discoverHuggingFaceModels() {
  const queries = ['text-generation', 'image-text-to-text'];
  const results = await Promise.all(queries.map((pipelineTag) => fetchJson(buildHuggingFaceModelsUrl(pipelineTag), {
    timeoutMs: 6000,
  })));
  let hadSuccess = false;
  const models = [];
  const seen = new Set();

  for (const payload of results) {
    if (!payload) continue;
    hadSuccess = true;
    for (const item of extractModelArray(payload)) {
      const modelItem = normalizeHuggingFaceModel(item);
      if (!modelItem || seen.has(modelItem.id)) continue;
      seen.add(modelItem.id);
      models.push(modelItem);
    }
  }

  return hadSuccess ? models : null;
}

async function discoverOpenAICompatibleModels(config = {}) {
  const runtime = getProviderRuntimeSettings('openai-compatible', config);
  if (!runtime.baseUrl) return null;

  const payload = await fetchJson(appendPath(runtime.baseUrl, 'models'), {
    headers: runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {},
    timeoutMs: 6000,
  });
  if (!payload) return null;

  const models = extractModelArray(payload)
    .map((item) => normalizeOpenAICompatibleModel(item))
    .filter(Boolean);
  return models;
}

function normalizeOpenRouterModel(item) {
  const id = String(item?.id || item?.model || '').trim();
  if (!id) return null;

  const outputModalities = normalizeStringList(item?.architecture?.output_modalities || item?.output_modalities);
  const inputModalities = normalizeStringList(item?.architecture?.input_modalities || item?.input_modalities);
  const supportsImages =
    outputModalities.includes('image') ||
    inputModalities.includes('image') ||
    /vision|image|vl/i.test(id);
  const supportsReasoning =
    normalizeStringList(item?.supported_parameters || []).some((value) => /reason/i.test(value)) ||
    /reason/i.test(String(item?.name || item?.description || id));
  const selectable =
    outputModalities.length === 0 ||
    outputModalities.includes('text') ||
    supportsImages;

  return model(id, String(item?.name || humanizeModelId(id)).trim(), kindFromCapabilities({
    supportsImages,
    supportsReasoning,
    selectable,
  }), positiveNumberOrNull(item?.context_length || item?.contextLength || item?.top_provider?.context_length), {
    selectable,
    supportsImages,
    supportsReasoning,
    reasoningEfforts: supportsReasoning ? OPENAI_5_REASONING : null,
    description: String(item?.description || '').trim(),
    apiNotes: 'Descoberto dinamicamente em GET /api/v1/models do OpenRouter.',
  });
}

function normalizeHuggingFaceModel(item) {
  const id = String(item?.id || item?.modelId || item?.model_id || '').trim();
  if (!id) return null;

  const pipelineTag = String(item?.pipeline_tag || '').trim();
  const tags = normalizeStringList(item?.tags || []);
  const supportsImages =
    pipelineTag === 'image-text-to-text' ||
    tags.includes('image-text-to-text') ||
    tags.includes('vision');
  const supportsReasoning = tags.some((tag) => /reason|thinking/i.test(tag)) || /reason|thinking/i.test(id);
  const selectable = pipelineTag === 'text-generation' || pipelineTag === 'image-text-to-text';

  return model(id, humanizeModelId(id), kindFromCapabilities({
    supportsImages,
    supportsReasoning,
    selectable,
  }), null, {
    selectable,
    supportsImages,
    supportsReasoning,
    reasoningEfforts: supportsReasoning ? OPENAI_5_REASONING : null,
    description: `Hugging Face inference catalog entry (${pipelineTag || 'unknown'}).`,
    apiNotes: 'Descoberto dinamicamente em https://huggingface.co/api/models?inference_provider=all.',
  });
}

function normalizeOpenAICompatibleModel(item) {
  const id = String(typeof item === 'string' ? item : item?.id || item?.model || '').trim();
  if (!id) return null;

  const idHint = id.toLowerCase();
  const supportsImages = /vision|vl|multimodal/.test(idHint) && !/^gpt-image/.test(idHint);
  const supportsReasoning = Boolean(item?.supports_reasoning ?? item?.reasoning ?? /reason|think|o3|gpt-5/i.test(idHint));
  const selectable = !/(embedding|whisper|tts|audio|speech|realtime|image$|gpt-image|chatgpt-image)/i.test(id);

  return model(id, String(item?.name || item?.title || humanizeModelId(id)).trim(), kindFromCapabilities({
    supportsImages,
    supportsReasoning,
    selectable,
  }), positiveNumberOrNull(item?.context_length || item?.contextLength || item?.max_context_length), {
    selectable,
    supportsImages,
    supportsReasoning,
    reasoningEfforts: supportsReasoning ? OPENAI_5_REASONING : null,
    description: String(item?.description || 'Modelo descoberto dinamicamente no endpoint /models do provider configurado.').trim(),
    apiNotes: 'OpenAI-compatible custom endpoint.',
  });
}

function buildInstalledOllamaModels(installedModels = []) {
  return normalizeCustomModelList(installedModels).map((id) => model(id, humanizeModelId(id), 'Instalado', null, {
    selectable: true,
    supportsImages: inferOllamaSupportsImages(id),
    supportsReasoning: inferOllamaSupportsReasoning(id),
    reasoningEfforts: inferOllamaSupportsReasoning(id) ? OPENAI_5_REASONING : null,
    description: 'Modelo local detectado pelo Ollama.',
    apiNotes: 'Descoberto via /api/tags ou manifests locais.',
  }));
}

function getProviderRuntimeSettings(providerId, config = {}) {
  const provider = getProvider(providerId);
  const providerSettings = config.providerSettings?.[provider.id] || {};
  const apiKeys = normalizeApiKeyValues(providerSettings.apiKeys || []);
  const envValue = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '';
  if (envValue) apiKeys.unshift(envValue);
  const uniqueKeys = [...new Set(apiKeys.map((item) => String(item || '').trim()).filter(Boolean))];
  return {
    baseUrl: String(providerSettings.baseUrl || provider.baseUrl || '').trim(),
    apiKey: uniqueKeys[0] || '',
    apiKeys: uniqueKeys,
  };
}

function buildHuggingFaceModelsUrl(pipelineTag) {
  const url = new URL('https://huggingface.co/api/models');
  url.searchParams.set('inference_provider', 'all');
  url.searchParams.set('pipeline_tag', pipelineTag);
  url.searchParams.set('limit', '50');
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractModelArray(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.models)) return payload.models;
  return [];
}

function normalizeApiKeyValues(value = []) {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => (typeof entry === 'string' ? entry : entry?.value))
    .map((raw) => String(raw || '').trim())
    .filter(Boolean);
}

function normalizeStringList(value = []) {
  const entries = Array.isArray(value) ? value : [value];
  return [...new Set(entries.map((item) => String(item || '').trim()).filter(Boolean))];
}

function appendPath(baseUrl, pathSegment) {
  const clean = stripTrailingSlash(baseUrl);
  if (clean.endsWith(`/${pathSegment}`)) return clean;
  return `${clean}/${pathSegment}`;
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function inferOllamaSupportsImages(modelId) {
  return /(vl|vision|llama4|gemma3|moondream|llava)/i.test(String(modelId || ''));
}

function inferOllamaSupportsReasoning(modelId) {
  return /(reason|deepseek-r1|qwen3|gpt-oss|devstral|thinking)/i.test(String(modelId || ''));
}

function kindFromCapabilities({ supportsImages, supportsReasoning, selectable }) {
  if (!selectable) return 'Índice';
  if (supportsImages) return 'Visão';
  if (supportsReasoning) return 'Raciocínio';
  return 'Geral';
}

function humanizeModelId(id) {
  const tail = String(id || '').trim().split('/').pop() || String(id || '').trim();
  return tail
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bgpt\b/gi, 'GPT')
    .replace(/\boss\b/gi, 'OSS')
    .replace(/\bvl\b/gi, 'VL')
    .replace(/\btts\b/gi, 'TTS')
    .replace(/\br1\b/gi, 'R1')
    .trim() || tail;
}

function model(id, label, kind, contextTokens = null, options = {}) {
  return {
    id,
    label,
    kind,
    contextTokens,
    selectable: options.selectable !== false,
    supportsImages: Boolean(options.supportsImages),
    maxInputImages: options.maxInputImages || null,
    maxFileSizeMB: options.maxFileSizeMB || null,
    maxOutputTokens: options.maxOutputTokens || null,
    supportsReasoning: Boolean(options.supportsReasoning),
    reasoningEfforts: options.reasoningEfforts || null,
    description: options.description || '',
    apiNotes: options.apiNotes || '',
  };
}
