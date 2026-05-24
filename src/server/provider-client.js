import { getProvider } from './models.js';

const rotationCursors = new Map();
const OLLAMA_TAGS_PATH = '/api/tags';
const OLLAMA_PULL_PATH = '/api/pull';

export async function callProviderChat({
  config,
  provider: requestedProvider,
  model,
  messages,
  tools,
  temperature = 0.2,
  maxTokens = 2048,
}) {
  const provider = getProvider(requestedProvider || config.provider);
  const selectedModel = String(model || config.model || provider.defaultModel).trim();
  const runtime = resolveProviderRuntime(config, provider);

  if (provider.id === 'ollama') {
    await ensureOllamaModel(selectedModel, runtime.baseUrl);
  }

  if (provider.adapter === 'anthropic') {
    return callWithKeyRotation(provider, runtime, (apiKey) =>
      callAnthropicChat({ provider, runtime, apiKey, model: selectedModel, messages, tools, temperature, maxTokens }),
    );
  }

  return callWithKeyRotation(provider, runtime, (apiKey) =>
    callOpenAICompatibleChat({
      provider,
      runtime,
      apiKey,
      model: selectedModel,
      messages,
      tools,
      temperature,
      maxTokens,
    }),
  );
}

export async function listOllamaInstalledModels(config = {}) {
  const provider = getProvider('ollama');
  const runtime = resolveProviderRuntime(config, provider, { allowMissingKey: true });
  const baseApiUrl = getOllamaApiBaseUrl(runtime.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${baseApiUrl}${OLLAMA_TAGS_PATH}`, { signal: controller.signal });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    const names = (data.models || []).map((item) => item.name).filter(Boolean);
    const aliases = names
      .filter((name) => name.endsWith(':latest'))
      .map((name) => name.replace(/:latest$/, ''));
    return [...new Set([...names, ...aliases])].sort();
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function callWithKeyRotation(provider, runtime, request) {
  const apiKeys = runtime.apiKeys.length ? runtime.apiKeys : [''];
  const cursor = rotationCursors.get(provider.id) || 0;
  const orderedKeys = rotate(apiKeys, cursor);
  let lastError = null;

  for (let index = 0; index < orderedKeys.length; index += 1) {
    const apiKey = orderedKeys[index];
    try {
      const message = await request(apiKey);
      const nextCursor = (apiKeys.indexOf(apiKey) + 1) % apiKeys.length;
      rotationCursors.set(provider.id, nextCursor);
      return message;
    } catch (error) {
      lastError = error;
      if (orderedKeys.length <= 1 || !shouldTryNextKey(error)) break;
    }
  }

  throw lastError || new Error(`Falha ao chamar ${provider.label}.`);
}

async function callOpenAICompatibleChat({ provider, runtime, apiKey, model, messages, tools, temperature, maxTokens }) {
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost';
    headers['X-OpenRouter-Title'] = 'My Computer';
  }

  const response = await fetch(getChatCompletionsUrl(runtime.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `${provider.label} retornou HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  const message = data?.choices?.[0]?.message;
  if (!message) {
    const error = new Error(`${provider.label} retornou uma resposta vazia.`);
    error.statusCode = 502;
    error.details = data;
    throw error;
  }

  return message;
}

async function callAnthropicChat({ provider, runtime, apiKey, model, messages, tools, temperature, maxTokens }) {
  const { system, anthropicMessages } = toAnthropicMessages(messages);
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: anthropicMessages,
  };

  if (tools?.length) {
    body.tools = tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters || { type: 'object', properties: {} },
    }));
  }

  const response = await fetch(`${stripTrailingSlash(runtime.baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `${provider.label} retornou HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  const contentBlocks = Array.isArray(data.content) ? data.content : [];
  const text = contentBlocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n\n');
  const toolCalls = contentBlocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input || {}),
      },
    }));

  return {
    role: 'assistant',
    content: text,
    tool_calls: toolCalls,
  };
}

function toAnthropicMessages(messages = []) {
  const systemParts = [];
  const anthropicMessages = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content) systemParts.push(String(message.content));
      continue;
    }

    if (message.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.tool_call_id,
            content: String(message.content || ''),
          },
        ],
      });
      continue;
    }

    if (message.role === 'assistant') {
      const content = [];
      if (message.content) content.push({ type: 'text', text: String(message.content) });
      for (const toolCall of message.tool_calls || []) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function?.name,
          input: parseToolArguments(toolCall.function?.arguments),
        });
      }
      anthropicMessages.push({ role: 'assistant', content: content.length ? content : '' });
      continue;
    }

    if (message.role === 'user') {
      anthropicMessages.push({ role: 'user', content: String(message.content || '') });
    }
  }

  return {
    system: systemParts.join('\n\n'),
    anthropicMessages: mergeAdjacentMessages(anthropicMessages),
  };
}

async function ensureOllamaModel(model, openAIBaseUrl) {
  const baseApiUrl = getOllamaApiBaseUrl(openAIBaseUrl);
  const installed = await listOllamaInstalledModels({
    providerSettings: {
      ollama: {
        baseUrl: openAIBaseUrl,
        apiKeys: [],
      },
    },
  });

  if (installed.includes(model)) return;

  const response = await fetch(`${baseApiUrl}${OLLAMA_PULL_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.error || `Ollama não conseguiu instalar o modelo ${model}.`);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }
}

function resolveProviderRuntime(config, provider, options = {}) {
  const settings = config.providerSettings?.[provider.id] || {};
  const baseUrl = String(settings.baseUrl || provider.baseUrl || '').trim();
  const apiKeys = normalizeApiKeys(settings.apiKeys);
  const envKey = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '';
  if (envKey && !apiKeys.includes(envKey)) apiKeys.push(envKey);

  if (!baseUrl) {
    const error = new Error(`Configure o endpoint/base URL do provider ${provider.label}.`);
    error.statusCode = 400;
    throw error;
  }

  if (provider.requiresApiKey && !options.allowMissingKey && !apiKeys.length) {
    const error = new Error(`Configure ao menos uma API key para ${provider.label}.`);
    error.statusCode = 400;
    throw error;
  }

  return { baseUrl, apiKeys };
}

function normalizeApiKeys(apiKeys) {
  if (!Array.isArray(apiKeys)) return [];
  return [
    ...new Set(
      apiKeys
        .map((item) => (typeof item === 'string' ? item : item?.value))
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ];
}

function getChatCompletionsUrl(baseUrl) {
  const clean = stripTrailingSlash(baseUrl);
  if (clean.endsWith('/chat/completions')) return clean;
  return `${clean}/chat/completions`;
}

function getOllamaApiBaseUrl(openAIBaseUrl) {
  return stripTrailingSlash(String(openAIBaseUrl || 'http://127.0.0.1:11434/v1')).replace(/\/v1$/, '');
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function rotate(values, cursor) {
  if (!values.length) return [];
  const safeCursor = cursor % values.length;
  return [...values.slice(safeCursor), ...values.slice(0, safeCursor)];
}

function shouldTryNextKey(error) {
  const status = Number(error.statusCode || 0);
  if (!status) return true;
  return [401, 403, 408, 409, 425, 429].includes(status) || status >= 500;
}

function parseToolArguments(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function mergeAdjacentMessages(messages) {
  const merged = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (!previous || previous.role !== message.role) {
      merged.push(message);
      continue;
    }

    previous.content = mergeContent(previous.content, message.content);
  }
  return merged;
}

function mergeContent(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftBlocks = Array.isArray(left) ? left : [{ type: 'text', text: String(left || '') }];
    const rightBlocks = Array.isArray(right) ? right : [{ type: 'text', text: String(right || '') }];
    return [...leftBlocks, ...rightBlocks].filter((block) => block.type !== 'text' || block.text);
  }
  return [left, right].filter(Boolean).join('\n\n');
}
