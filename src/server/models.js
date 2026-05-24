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
      model('llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'Produção', 131072),
      model('llama-3.1-8b-instant', 'Llama 3.1 8B Instant', 'Produção', 131072),
      model('openai/gpt-oss-120b', 'GPT OSS 120B', 'Produção', 131072),
      model('openai/gpt-oss-20b', 'GPT OSS 20B', 'Produção', 131072),
      model('qwen/qwen3-32b', 'Qwen3 32B', 'Produção', 131072),
      model('meta-llama/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B', 'Preview', 131072),
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
    defaultModel: 'gpt-5.2',
    models: [
      model('gpt-5.2', 'GPT-5.2', 'Frontier', 400000, { supportsImages: true }),
      model('gpt-5.2-pro', 'GPT-5.2 pro', 'Frontier', 400000, { supportsImages: true }),
      model('gpt-5-mini', 'GPT-5 mini', 'Rápido', 400000, { supportsImages: true }),
      model('gpt-5-nano', 'GPT-5 nano', 'Econômico', 400000, { supportsImages: true }),
      model('gpt-4.1', 'GPT-4.1', 'Geral', 1000000, { supportsImages: true }),
      model('gpt-4.1-mini', 'GPT-4.1 mini', 'Geral', 1000000, { supportsImages: true }),
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
    defaultModel: 'openai/gpt-5.2',
    models: [
      model('openai/gpt-5.2', 'OpenAI GPT-5.2', 'Frontier', null, { supportsImages: true }),
      model('openai/gpt-5-mini', 'OpenAI GPT-5 mini', 'Rápido', null, { supportsImages: true }),
      model('anthropic/claude-opus-4.1', 'Claude Opus 4.1', 'Avançado', 200000, { supportsImages: true }),
      model('anthropic/claude-sonnet-4', 'Claude Sonnet 4', 'Geral', 200000, { supportsImages: true }),
      model('google/gemini-3-pro-preview', 'Gemini 3 Pro Preview', 'Preview', null, { supportsImages: true }),
      model('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Rápido', null, { supportsImages: true }),
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
      model('deepseek-ai/DeepSeek-R1', 'DeepSeek R1', 'Raciocínio'),
      model('Qwen/Qwen2.5-7B-Instruct-1M', 'Qwen2.5 7B 1M', 'Longo'),
      model('Qwen/Qwen2.5-Coder-32B-Instruct', 'Qwen2.5 Coder 32B', 'Código'),
      model('zai-org/GLM-4.5', 'GLM 4.5', 'Geral'),
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
    defaultModel: 'gemini-3-pro-preview',
    models: [
      model('gemini-3-pro-preview', 'Gemini 3 Pro Preview', 'Preview', null, { supportsImages: true }),
      model('gemini-3-pro-image-preview', 'Gemini 3 Pro Image Preview', 'Imagem', null, { supportsImages: true }),
      model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'Geral', null, { supportsImages: true }),
      model('gemini-2.5-flash', 'Gemini 2.5 Flash', 'Rápido', null, { supportsImages: true }),
      model('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Econômico', null, { supportsImages: true }),
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      model('claude-opus-4-1-20250805', 'Claude Opus 4.1', 'Avançado', 200000, { supportsImages: true }),
      model('claude-opus-4-20250514', 'Claude Opus 4', 'Avançado', 200000, { supportsImages: true }),
      model('claude-sonnet-4-20250514', 'Claude Sonnet 4', 'Geral', 200000, { supportsImages: true }),
      model('claude-3-7-sonnet-20250219', 'Claude Sonnet 3.7', 'Raciocínio', 200000, { supportsImages: true }),
      model('claude-3-5-haiku-20241022', 'Claude Haiku 3.5', 'Rápido', 200000, { supportsImages: true }),
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
      model('grok-4.3', 'Grok 4.3', 'Geral', null, { supportsImages: true }),
      model('grok-4.3-fast', 'Grok 4.3 Fast', 'Rápido', null, { supportsImages: true }),
      model('grok-3', 'Grok 3', 'Geral', null, { supportsImages: true }),
      model('grok-3-mini', 'Grok 3 mini', 'Rápido'),
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    adapter: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    requiresApiKey: false,
    defaultModel: 'gpt-oss:20b',
    models: [
      model('gpt-oss:20b', 'GPT OSS 20B', 'Local'),
      model('gpt-oss:120b', 'GPT OSS 120B', 'Local'),
      model('llama3.3', 'Llama 3.3', 'Local'),
      model('llama3.2', 'Llama 3.2', 'Local'),
      model('qwen3', 'Qwen3', 'Local'),
      model('qwen2.5-coder', 'Qwen2.5 Coder', 'Código'),
      model('deepseek-r1', 'DeepSeek R1', 'Raciocínio'),
      model('gemma3', 'Gemma 3', 'Local'),
      model('llama3.2-vision', 'Llama 3.2 Vision', 'Visão', null, { supportsImages: true }),
      model('qwen2.5vl', 'Qwen2.5 VL', 'Visão', null, { supportsImages: true }),
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
  return { id, label, kind, contextTokens, supportsImages: Boolean(options.supportsImages) };
}
