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
      model('meta-llama/llama-4-maverick-17b-128e-instruct', 'Llama 4 Maverick 17B', 'Preview', 131072),
      model('moonshotai/kimi-k2-instruct-0905', 'Kimi K2 Instruct', 'Preview', 131072),
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'gpt-4o-mini',
    models: [
      model('gpt-4o-mini', 'GPT-4o mini', 'Rápido'),
      model('gpt-4o', 'GPT-4o', 'Geral'),
      model('gpt-4.1-mini', 'GPT-4.1 mini', 'Geral'),
      model('gpt-4.1', 'GPT-4.1', 'Geral'),
      model('o4-mini', 'o4-mini', 'Raciocínio'),
      model('o3', 'o3', 'Raciocínio'),
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    requiresApiKey: true,
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      model('openai/gpt-4o-mini', 'OpenAI GPT-4o mini', 'Rápido'),
      model('openai/gpt-4o', 'OpenAI GPT-4o', 'Geral'),
      model('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', 'Geral'),
      model('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Rápido'),
      model('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B', 'Aberto'),
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
      model('meta-llama/Llama-3.1-8B-Instruct', 'Llama 3.1 8B Instruct', 'Aberto'),
      model('Qwen/Qwen2.5-7B-Instruct', 'Qwen2.5 7B Instruct', 'Aberto'),
      model('mistralai/Mistral-7B-Instruct-v0.3', 'Mistral 7B Instruct', 'Aberto'),
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    adapter: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    requiresApiKey: true,
    defaultModel: 'gemini-2.5-flash',
    models: [
      model('gemini-2.5-flash', 'Gemini 2.5 Flash', 'Rápido'),
      model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'Geral'),
      model('gemini-3.5-flash', 'Gemini 3.5 Flash', 'Preview'),
      model('gemini-3.5-pro', 'Gemini 3.5 Pro', 'Preview'),
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-5',
    models: [
      model('claude-sonnet-4-5', 'Claude Sonnet 4.5', 'Geral'),
      model('claude-opus-4-1', 'Claude Opus 4.1', 'Avançado'),
      model('claude-haiku-4-5', 'Claude Haiku 4.5', 'Rápido'),
      model('claude-3-5-haiku-latest', 'Claude 3.5 Haiku latest', 'Rápido'),
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
      model('grok-4.3', 'Grok 4.3', 'Geral'),
      model('grok-4', 'Grok 4', 'Geral'),
      model('grok-3', 'Grok 3', 'Geral'),
      model('grok-3-mini', 'Grok 3 mini', 'Rápido'),
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    adapter: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    requiresApiKey: false,
    defaultModel: 'llama3.2',
    models: [
      model('llama3.2', 'Llama 3.2', 'Local'),
      model('llama3.1', 'Llama 3.1', 'Local'),
      model('qwen2.5', 'Qwen2.5', 'Local'),
      model('qwen3:8b', 'Qwen3 8B', 'Local'),
      model('mistral', 'Mistral', 'Local'),
      model('gemma3', 'Gemma 3', 'Local'),
      model('codellama', 'Code Llama', 'Local'),
      model('gpt-oss:20b', 'GPT OSS 20B', 'Local'),
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
      model('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B', 'Exemplo'),
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
  const installedOllamaModels =
    provider.id === 'ollama' ? normalizeCustomModelList(options.ollamaInstalledModels || []) : [];
  const models = mergeModels(provider.models, customModels, installedOllamaModels);
  return models.map((item) =>
    provider.id === 'ollama'
      ? {
          ...item,
          installed: installedOllamaModels.includes(item.id),
        }
      : item,
  );
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
      ollamaInstalledModels: options.ollamaInstalledModels,
    }),
  }));
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

function model(id, label, kind, contextTokens = null) {
  return { id, label, kind, contextTokens };
}
