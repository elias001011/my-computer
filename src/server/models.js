export const CUSTOM_MODEL_VALUE = '__custom__';

export const providerCatalog = Object.freeze([
  {
    id: 'groq',
    label: 'Groq',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      model('llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'Produção', 131072, {
        maxOutputTokens: 32768,
      }),
      model('llama-3.1-8b-instant', 'Llama 3.1 8B Instant', 'Produção', 131072, {
        maxOutputTokens: 131072,
      }),
      model('openai/gpt-oss-120b', 'GPT OSS 120B', 'Produção', 131072, {
        maxOutputTokens: 65536,
      }),
      model('openai/gpt-oss-20b', 'GPT OSS 20B', 'Produção', 131072, {
        maxOutputTokens: 65536,
      }),
      model('qwen/qwen3-32b', 'Qwen3 32B', 'Produção', 131072),
      model('meta-llama/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B', 'Visão', 131072, {
        supportsImages: true,
        maxInputImages: 5,
        maxFileSizeMB: 20,
        maxOutputTokens: 8192,
      }),
      model('compound-beta', 'Groq Compound', 'Ferramentas'),
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
    models: [
      model('gpt-5.5', 'GPT-5.5', 'Frontier', 1050000, {
        supportsImages: true,
        maxInputImages: 500,
        maxFileSizeMB: 50,
        maxOutputTokens: 128000,
      }),
      model('gpt-5.4', 'GPT-5.4', 'Frontier', 1050000, {
        supportsImages: true,
        maxInputImages: 500,
        maxFileSizeMB: 50,
        maxOutputTokens: 128000,
      }),
      model('gpt-5.4-mini', 'GPT-5.4 mini', 'Rápido', 400000, {
        supportsImages: true,
        maxInputImages: 500,
        maxFileSizeMB: 50,
        maxOutputTokens: 128000,
      }),
      model('gpt-5.4-nano', 'GPT-5.4 nano', 'Econômico', 400000, {
        supportsImages: true,
        maxInputImages: 500,
        maxFileSizeMB: 50,
        maxOutputTokens: 128000,
      }),
      model('gpt-5.2', 'GPT-5.2', 'Compatibilidade', 400000, {
        supportsImages: true,
        maxInputImages: 500,
        maxFileSizeMB: 50,
        maxOutputTokens: 128000,
      }),
      model('gpt-5.2-pro', 'GPT-5.2 pro', 'Compatibilidade', 400000, {
        supportsImages: true,
        maxInputImages: 500,
        maxFileSizeMB: 50,
        maxOutputTokens: 128000,
      }),
      model('gpt-5.2-chat-latest', 'GPT-5.2 Chat', 'ChatGPT', 400000, { supportsImages: true }),
      model('gpt-5-mini', 'GPT-5 mini', 'Rápido', 400000, { supportsImages: true }),
      model('gpt-5-nano', 'GPT-5 nano', 'Econômico', 400000, { supportsImages: true }),
      model('gpt-4.1', 'GPT-4.1', 'Geral', 1000000, { supportsImages: true }),
      model('gpt-4.1-mini', 'GPT-4.1 mini', 'Geral', 1000000, { supportsImages: true }),
      model('gpt-4.1-nano', 'GPT-4.1 nano', 'Econômico', 1000000, { supportsImages: true }),
      model('gpt-4o', 'GPT-4o', 'Geral', 128000, { supportsImages: true }),
      model('gpt-4o-mini', 'GPT-4o mini', 'Rápido', 128000, { supportsImages: true }),
      model('o3', 'o3', 'Raciocínio'),
      model('o4-mini', 'o4-mini', 'Raciocínio', null, { supportsImages: true }),
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    requiresApiKey: true,
    defaultModel: 'openai/gpt-5.5',
    models: [
      model('openai/gpt-5.5', 'OpenAI GPT-5.5', 'Frontier', null, { supportsImages: true }),
      model('openai/gpt-5.4', 'OpenAI GPT-5.4', 'Frontier', null, { supportsImages: true }),
      model('openai/gpt-5.4-mini', 'OpenAI GPT-5.4 mini', 'Rápido', null, { supportsImages: true }),
      model('openai/gpt-5.2', 'OpenAI GPT-5.2', 'Compatibilidade', null, { supportsImages: true }),
      model('openai/gpt-5-mini', 'OpenAI GPT-5 mini', 'Rápido', null, { supportsImages: true }),
      model('anthropic/claude-opus-4.7', 'Claude Opus 4.7', 'Avançado', 1000000, { supportsImages: true }),
      model('anthropic/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'Geral', 1000000, { supportsImages: true }),
      model('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'Rápido', 200000, { supportsImages: true }),
      model('google/gemini-3.5-flash', 'Gemini 3.5 Flash', 'Atual', 1048576, { supportsImages: true }),
      model('google/gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'Preview', 1048576, { supportsImages: true }),
      model('google/gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'Rápido', null, { supportsImages: true }),
      model('google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 'Econômico', 1048576, { supportsImages: true }),
      model('x-ai/grok-4.3', 'Grok 4.3', 'Geral', null, { supportsImages: true }),
      model('deepseek/deepseek-r1', 'DeepSeek R1', 'Raciocínio'),
      model('qwen/qwen3-coder', 'Qwen3 Coder', 'Código'),
    ],
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    adapter: 'openai-compatible',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKeyEnv: 'HF_TOKEN',
    requiresApiKey: true,
    defaultModel: 'openai/gpt-oss-20b',
    models: [
      model('openai/gpt-oss-20b', 'GPT OSS 20B', 'Aberto'),
      model('openai/gpt-oss-120b', 'GPT OSS 120B', 'Aberto'),
      model('Qwen/Qwen3-Coder-480B-A35B-Instruct', 'Qwen3 Coder 480B A35B', 'Código'),
      model('Qwen/Qwen3-4B-Thinking-2507', 'Qwen3 4B Thinking 2507', 'Raciocínio'),
      model('deepseek-ai/DeepSeek-R1', 'DeepSeek R1', 'Raciocínio'),
      model('Qwen/Qwen2.5-7B-Instruct-1M', 'Qwen2.5 7B 1M', 'Longo'),
      model('Qwen/Qwen2.5-Coder-32B-Instruct', 'Qwen2.5 Coder 32B', 'Código'),
      model('zai-org/GLM-4.5', 'GLM 4.5', 'Geral'),
      model('CohereLabs/aya-vision-32b:cohere', 'Aya Vision 32B', 'Visão', null, { supportsImages: true }),
      model('google/gemma-2-2b-it', 'Gemma 2 2B IT', 'Pequeno'),
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
    models: [
      model('gemini-3.5-flash', 'Gemini 3.5 Flash', 'Atual', 1048576, {
        supportsImages: true,
        maxOutputTokens: 65536,
      }),
      model('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'Preview', 1048576, {
        supportsImages: true,
        maxOutputTokens: 65536,
      }),
      model('gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'Preview', 1048576, {
        supportsImages: true,
        maxOutputTokens: 65536,
      }),
      model('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 'Econômico', 1048576, {
        supportsImages: true,
        maxOutputTokens: 65536,
      }),
      model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'Compatibilidade', 1048576, { supportsImages: true }),
      model('gemini-2.5-flash', 'Gemini 2.5 Flash', 'Compatibilidade', 1048576, { supportsImages: true }),
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
    models: [
      model('claude-opus-4-7', 'Claude Opus 4.7', 'Avançado', 1000000, {
        supportsImages: true,
        maxOutputTokens: 128000,
      }),
      model('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'Geral', 1000000, {
        supportsImages: true,
        maxOutputTokens: 64000,
      }),
      model('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'Rápido', 200000, {
        supportsImages: true,
        maxOutputTokens: 64000,
      }),
      model('claude-opus-4-1-20250805', 'Claude Opus 4.1', 'Compatibilidade', 200000, { supportsImages: true }),
      model('claude-sonnet-4-20250514', 'Claude Sonnet 4', 'Compatibilidade', 200000, { supportsImages: true }),
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
    models: [
      model('grok-4.3', 'Grok 4.3', 'Geral', 1000000, {
        supportsImages: true,
        maxInputImages: null,
        maxFileSizeMB: 20,
      }),
      model('grok-4.3-latest', 'Grok 4.3 Latest', 'Alias', 1000000, {
        supportsImages: true,
        maxFileSizeMB: 20,
      }),
      model('grok-latest', 'Grok Latest', 'Alias', 1000000, {
        supportsImages: true,
        maxFileSizeMB: 20,
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
    models: [
      model('qwen3.6', 'Qwen3.6', 'Local', 256000, { supportsImages: true }),
      model('qwen3.6:27b', 'Qwen3.6 27B', 'Local', 256000, { supportsImages: true }),
      model('qwen3.6:35b', 'Qwen3.6 35B', 'Local', 256000, { supportsImages: true }),
      model('qwen3-vl', 'Qwen3-VL', 'Visão', 256000, { supportsImages: true }),
      model('qwen3-vl:8b', 'Qwen3-VL 8B', 'Visão', 256000, { supportsImages: true }),
      model('llama4:scout', 'Llama 4 Scout', 'Visão', null, { supportsImages: true }),
      model('llama4:maverick', 'Llama 4 Maverick', 'Visão', null, { supportsImages: true }),
      model('devstral', 'Devstral', 'Código', 128000),
      model('gpt-oss:20b', 'GPT OSS 20B', 'Local'),
      model('gpt-oss:120b', 'GPT OSS 120B', 'Local'),
      model('qwen3', 'Qwen3', 'Local'),
      model('qwen3:30b', 'Qwen3 30B', 'Local', 256000),
      model('qwen3:235b', 'Qwen3 235B', 'Local', 256000),
      model('qwen2.5-coder', 'Qwen2.5 Coder', 'Código'),
      model('deepseek-r1', 'DeepSeek R1', 'Raciocínio'),
      model('gemma3', 'Gemma 3', 'Visão', 128000, { supportsImages: true }),
      model('gemma3:4b', 'Gemma 3 4B', 'Visão', 128000, { supportsImages: true }),
      model('gemma3:12b', 'Gemma 3 12B', 'Visão', 128000, { supportsImages: true }),
      model('moondream', 'Moondream', 'Visão', null, { supportsImages: true }),
    ],
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI compatível',
    adapter: 'openai-compatible',
    baseUrl: '',
    requiresApiKey: true,
    defaultModel: 'modelo-personalizado',
    models: [
      model('modelo-personalizado', 'Modelo personalizado', 'Endpoint próprio'),
      model('minimax/minimax-m2', 'Minimax M2', 'Exemplo'),
      model('deepseek/deepseek-r1', 'DeepSeek R1', 'Exemplo'),
      model('qwen/qwen3-coder', 'Qwen3 Coder', 'Exemplo'),
    ],
  },
]);

export const groqModels = Object.freeze(getProvider('groq').models);

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
  const installedOllamaModels =
    provider.id === 'ollama' ? normalizeCustomModelList(options.ollamaInstalledModels || []) : [];
  const models = mergeModels(provider.models, customModels, installedOllamaModels);
  return models.map((item) => {
    const customCapabilities = modelCapabilities[item.id] || {};
    return {
      ...item,
      supportsImages: Boolean(customCapabilities.images ?? item.supportsImages),
      maxInputImages: customCapabilities.maxInputImages || item.maxInputImages || null,
      maxFileSizeMB: customCapabilities.maxFileSizeMB || item.maxFileSizeMB || null,
      maxOutputTokens: customCapabilities.maxOutputTokens || item.maxOutputTokens || null,
      installed: provider.id === 'ollama' ? installedOllamaModels.includes(item.id) : undefined,
    };
  });
}

export function getProvidersForClient(options = {}) {
  const customModelsByProvider = options.customModelsByProvider || {};
  return providerCatalog.map((provider) => ({
    id: provider.id,
    label: provider.label,
    adapter: provider.adapter,
    baseUrl: provider.baseUrl,
    requiresApiKey: provider.requiresApiKey,
    defaultModel: provider.defaultModel,
    models: getProviderModels(provider.id, {
      customModels: customModelsByProvider[provider.id],
      modelCapabilities: options.modelCapabilitiesByProvider?.[provider.id],
      ollamaInstalledModels: options.ollamaInstalledModels,
    }),
  }));
}

export function modelSupportsImages(providerId, modelId, config = {}) {
  const provider = getProvider(providerId);
  const catalogModel = provider.models.find((modelItem) => modelItem.id === modelId);
  const custom = config.modelCapabilities?.[provider.id]?.[modelId];
  return Boolean(custom?.images ?? catalogModel?.supportsImages);
}

export function getModelMetadata(providerId, modelId, config = {}) {
  const provider = getProvider(providerId);
  const catalogModel = provider.models.find((modelItem) => modelItem.id === modelId);
  const custom = config.modelCapabilities?.[provider.id]?.[modelId] || {};
  return {
    id: modelId,
    supportsImages: Boolean(custom.images ?? catalogModel?.supportsImages),
    maxInputImages: Number(custom.maxInputImages || catalogModel?.maxInputImages || 0) || null,
    maxFileSizeMB: Number(custom.maxFileSizeMB || catalogModel?.maxFileSizeMB || 0) || null,
    maxOutputTokens: Number(custom.maxOutputTokens || catalogModel?.maxOutputTokens || 0) || null,
    contextTokens: Number(catalogModel?.contextTokens || 0) || null,
  };
}

export function normalizeCustomModelList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function mergeModels(baseModels, customModels, installedModels) {
  const byId = new Map();
  for (const item of baseModels) byId.set(item.id, item);
  for (const id of installedModels) {
    if (!byId.has(id)) byId.set(id, model(id, id, 'Instalado'));
  }
  for (const id of customModels) {
    if (!byId.has(id)) byId.set(id, model(id, id, 'Personalizado'));
  }
  return [...byId.values()];
}

function model(id, label, kind, contextTokens = null, options = {}) {
  return {
    id,
    label,
    kind,
    contextTokens,
    supportsImages: Boolean(options.supportsImages),
    maxInputImages: options.maxInputImages || null,
    maxFileSizeMB: options.maxFileSizeMB || null,
    maxOutputTokens: options.maxOutputTokens || null,
  };
}
