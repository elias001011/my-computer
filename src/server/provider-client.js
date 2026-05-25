import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getProvider } from './models.js';
import { appendEvent } from './store.js';

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
  modelSettings = {},
  chatId = null,
}) {
  const routes = buildProviderRoutes(config, requestedProvider || config.provider, model || config.model);
  let lastError = null;

  for (const route of routes) {
    const provider = getProvider(route.provider);
    const selectedModel = String(route.model || provider.defaultModel).trim();
    const runtime = resolveProviderRuntime(config, provider);
    await appendProviderEvent(chatId, 'provider.request.started', {
      provider: provider.id,
      model: selectedModel,
      source: route.source,
      pass: route.pass,
    });

    try {
      if (provider.id === 'ollama') {
        await ensureOllamaModel(selectedModel, runtime.baseUrl);
      }

      const message =
        provider.adapter === 'anthropic'
          ? await callWithKeyRotation(
              provider,
              runtime,
              (apiKey) =>
                callAnthropicChat({
                  provider,
                  runtime,
                  apiKey,
                  model: selectedModel,
                  messages,
                  tools,
                  temperature,
                  maxTokens,
                  modelSettings,
                }),
              { chatId, model: selectedModel, operation: 'chat' },
            )
          : await callWithKeyRotation(
              provider,
              runtime,
              (apiKey) =>
                callOpenAICompatibleChat({
                  provider,
                  runtime,
                  apiKey,
                  model: selectedModel,
                  messages,
                  tools,
                  temperature,
                  maxTokens,
                  modelSettings,
                }),
              { chatId, model: selectedModel, operation: 'chat' },
            );

      await appendProviderEvent(chatId, 'provider.request.completed', {
        provider: provider.id,
        model: selectedModel,
        source: route.source,
        pass: route.pass,
      });
      return {
        ...message,
        providerUsed: provider.id,
        modelUsed: selectedModel,
      };
    } catch (error) {
      lastError = error;
      await appendProviderEvent(chatId, 'provider.request.failed', {
        provider: provider.id,
        model: selectedModel,
        source: route.source,
        pass: route.pass,
        error: error.message,
        statusCode: error.statusCode || null,
      });
      if (!config.routing?.providerRotationEnabled) break;
    }
  }

  throw lastError || new Error('Falha ao chamar provider.');
}

export async function callProviderNativeWebSearch({
  config,
  provider: requestedProvider,
  model,
  query,
  maxResults = 5,
  chatId = null,
}) {
  const provider = getProvider(requestedProvider || config.provider);
  const selectedModel = String(model || config.model || provider.defaultModel).trim();
  if (!nativeSearchSupported(provider.id)) {
    const error = new Error(`Busca web nativa ainda não implementada para ${provider.label}.`);
    error.nativeSearchUnavailable = true;
    throw error;
  }

  const runtime = resolveProviderRuntime(config, provider);
  await appendProviderEvent(chatId, 'provider.native_search.started', {
    provider: provider.id,
    model: provider.id === 'groq' ? 'groq/compound' : selectedModel,
    query,
    maxResults,
  });
  try {
    const result = await callWithKeyRotation(
      provider,
      runtime,
      (apiKey) => callNativeSearchForProvider(provider, runtime, apiKey, selectedModel, query, maxResults),
      { chatId, model: selectedModel, operation: 'native_search' },
    );
    await appendProviderEvent(chatId, 'provider.native_search.completed', {
      provider: provider.id,
      model: result.modelUsed || selectedModel,
      query,
      resultCount: result.results?.length || 0,
      method: result.method,
    });
    return result;
  } catch (error) {
    await appendProviderEvent(chatId, 'provider.native_search.failed', {
      provider: provider.id,
      model: selectedModel,
      query,
      error: error.message,
      statusCode: error.statusCode || null,
    });
    throw error;
  }
}

export async function listOllamaInstalledModels(config = {}) {
  const provider = getProvider('ollama');
  const runtime = resolveProviderRuntime(config, provider, { allowMissingKey: true });
  const baseApiUrl = getOllamaApiBaseUrl(runtime.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${baseApiUrl}${OLLAMA_TAGS_PATH}`, { signal: controller.signal });
    if (!response.ok) return listOllamaManifestModels();
    const data = await response.json().catch(() => ({}));
    const names = (data.models || []).map((item) => item.name).filter(Boolean);
    const aliases = names
      .filter((name) => name.endsWith(':latest'))
      .map((name) => name.replace(/:latest$/, ''));
    const manifestNames = await listOllamaManifestModels();
    return [...new Set([...names, ...aliases, ...manifestNames])].sort();
  } catch {
    return listOllamaManifestModels();
  } finally {
    clearTimeout(timeout);
  }
}

async function listOllamaManifestModels() {
  const roots = [
    path.join(os.homedir(), '.ollama', 'models', 'manifests'),
    '/usr/share/ollama/.ollama/models/manifests',
  ];
  const names = [];
  for (const root of roots) {
    names.push(...(await readOllamaManifestRoot(root)));
  }
  return [...new Set(names)].sort();
}

async function readOllamaManifestRoot(root) {
  const files = [];
  await walkManifestFiles(root, files);
  const names = [];
  for (const file of files) {
    const relative = path.relative(root, file);
    const parts = relative.split(path.sep);
    if (parts.length < 4) continue;
    const namespace = parts.at(-3);
    const model = parts.at(-2);
    const tag = parts.at(-1);
    const name = namespace === 'library' ? `${model}:${tag}` : `${namespace}/${model}:${tag}`;
    names.push(name);
    if (tag === 'latest') names.push(name.replace(/:latest$/, ''));
  }
  return names;
}

async function walkManifestFiles(directory, files) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkManifestFiles(filePath, files);
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
}

async function callWithKeyRotation(provider, runtime, request, options = {}) {
  const apiKeys = runtime.apiKeys.length ? runtime.apiKeys : [''];
  const cursor = rotationCursors.get(provider.id) || 0;
  const orderedKeys = rotate(apiKeys, cursor);
  let lastError = null;

  for (let index = 0; index < orderedKeys.length; index += 1) {
    const apiKey = orderedKeys[index];
    const keyIndex = apiKeys.indexOf(apiKey);
    await appendProviderEvent(options.chatId, 'provider.key_attempt.started', {
      provider: provider.id,
      model: options.model || null,
      operation: options.operation || 'chat',
      keyIndex: keyIndex >= 0 ? keyIndex + 1 : index + 1,
      keyCount: apiKeys.length,
    });
    try {
      const message = await request(apiKey);
      const nextCursor = (apiKeys.indexOf(apiKey) + 1) % apiKeys.length;
      rotationCursors.set(provider.id, nextCursor);
      await appendProviderEvent(options.chatId, 'provider.key_attempt.completed', {
        provider: provider.id,
        model: options.model || null,
        operation: options.operation || 'chat',
        keyIndex: keyIndex >= 0 ? keyIndex + 1 : index + 1,
      });
      return message;
    } catch (error) {
      lastError = error;
      await appendProviderEvent(options.chatId, 'provider.key_attempt.failed', {
        provider: provider.id,
        model: options.model || null,
        operation: options.operation || 'chat',
        keyIndex: keyIndex >= 0 ? keyIndex + 1 : index + 1,
        statusCode: error.statusCode || null,
        error: error.message,
      });
      if (orderedKeys.length <= 1 || !shouldTryNextKey(error)) break;
    }
  }

  throw lastError || new Error(`Falha ao chamar ${provider.label}.`);
}

async function callNativeSearchForProvider(provider, runtime, apiKey, model, query, maxResults) {
  if (provider.id === 'groq') {
    return callGroqNativeSearch(provider, runtime, apiKey, query, maxResults);
  }
  if (provider.id === 'gemini') {
    return callGeminiNativeSearch(provider, runtime, apiKey, model, query, maxResults);
  }
  if (provider.id === 'anthropic') {
    return callAnthropicNativeSearch(provider, runtime, apiKey, model, query, maxResults);
  }
  if (provider.id === 'openrouter') {
    return callOpenRouterNativeSearch(provider, runtime, apiKey, model, query, maxResults);
  }
  if (provider.id === 'openai' || provider.id === 'xai') {
    return callResponsesNativeSearch(provider, runtime, apiKey, model, query, maxResults);
  }
  const error = new Error(`Busca web nativa ainda não implementada para ${provider.label}.`);
  error.nativeSearchUnavailable = true;
  throw error;
}

async function callResponsesNativeSearch(provider, runtime, apiKey, model, query, maxResults) {
  const body = {
    model,
    input: nativeSearchPrompt(query, maxResults),
    tools: [{ type: 'web_search' }],
  };
  if (provider.id === 'openai') {
    body.include = ['web_search_call.action.sources'];
  }
  const data = await postJson(`${stripTrailingSlash(runtime.baseUrl)}/responses`, body, {
    Authorization: `Bearer ${apiKey}`,
  }, provider);
  return normalizeNativeSearchResult({
    query,
    method: `${provider.id}-responses-web_search`,
    provider: provider.id,
    modelUsed: model,
    content: data.output_text || extractResponsesText(data),
    results: extractResponsesSources(data),
    rawUsage: data.usage,
  });
}

async function callGroqNativeSearch(provider, runtime, apiKey, query, maxResults) {
  const model = 'groq/compound';
  const body = {
    model,
    messages: [{ role: 'user', content: nativeSearchPrompt(query, maxResults) }],
    compound_custom: {
      tools: {
        enabled_tools: ['web_search'],
      },
    },
  };
  const data = await postJson(getChatCompletionsUrl(runtime.baseUrl), body, {
    Authorization: `Bearer ${apiKey}`,
  }, provider);
  const message = data?.choices?.[0]?.message || {};
  return normalizeNativeSearchResult({
    query,
    method: 'groq-compound-web_search',
    provider: provider.id,
    modelUsed: model,
    content: message.content || '',
    results: extractGroqSearchResults(message),
    rawUsage: data.usage,
  });
}

async function callGeminiNativeSearch(provider, runtime, apiKey, model, query, maxResults) {
  const baseUrl = stripTrailingSlash(runtime.baseUrl).replace(/\/openai$/, '');
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: nativeSearchPrompt(query, maxResults) }] }],
    tools: [{ google_search: {} }],
  };
  const data = await postJson(url, body, {}, provider);
  const candidate = data?.candidates?.[0] || {};
  const content = (candidate.content?.parts || []).map((part) => part.text).filter(Boolean).join('\n\n');
  return normalizeNativeSearchResult({
    query,
    method: 'gemini-google_search',
    provider: provider.id,
    modelUsed: model,
    content,
    results: extractGeminiGrounding(candidate.groundingMetadata),
    rawUsage: data.usageMetadata,
  });
}

async function callAnthropicNativeSearch(provider, runtime, apiKey, model, query, maxResults) {
  const body = {
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: nativeSearchPrompt(query, maxResults) }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.max(1, Math.min(Number(maxResults || 5), 8)) }],
  };
  const data = await postJson(`${stripTrailingSlash(runtime.baseUrl)}/messages`, body, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }, provider);
  const blocks = Array.isArray(data.content) ? data.content : [];
  return normalizeNativeSearchResult({
    query,
    method: 'anthropic-web_search_20250305',
    provider: provider.id,
    modelUsed: model,
    content: blocks.filter((block) => block.type === 'text').map((block) => block.text).filter(Boolean).join('\n\n'),
    results: extractAnthropicSearchResults(blocks),
    rawUsage: data.usage,
  });
}

async function callOpenRouterNativeSearch(provider, runtime, apiKey, model, query, maxResults) {
  const body = {
    model,
    messages: [{ role: 'user', content: nativeSearchPrompt(query, maxResults) }],
    tools: [
      {
        type: 'openrouter:web_search',
        parameters: { max_results: Math.max(1, Math.min(Number(maxResults || 5), 8)) },
      },
    ],
  };
  const data = await postJson(getChatCompletionsUrl(runtime.baseUrl), body, {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'http://localhost',
    'X-OpenRouter-Title': 'My Computer',
  }, provider);
  const message = data?.choices?.[0]?.message || {};
  return normalizeNativeSearchResult({
    query,
    method: 'openrouter-server-tool-web_search',
    provider: provider.id,
    modelUsed: model,
    content: message.content || '',
    results: extractAnnotations(message),
    rawUsage: data.usage,
  });
}

async function postJson(url, body, headers, provider) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `${provider.label} retornou HTTP ${response.status}.`;
    const error = new Error(String(message));
    error.statusCode = response.status;
    error.details = data;
    if ([400, 404, 422].includes(response.status)) error.nativeSearchUnavailable = true;
    throw error;
  }
  return data;
}

async function callOpenAICompatibleChat({
  provider,
  runtime,
  apiKey,
  model,
  messages,
  tools,
  temperature,
  maxTokens,
  modelSettings = {},
}) {
  const body = {
    model,
    messages,
  };
  applyOpenAICompatibleModelSettings(body, provider, modelSettings, { temperature, maxTokens });

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

async function callAnthropicChat({
  provider,
  runtime,
  apiKey,
  model,
  messages,
  tools,
  temperature,
  maxTokens,
  modelSettings = {},
}) {
  const { system, anthropicMessages } = toAnthropicMessages(messages);
  const body = {
    model,
    max_tokens: Number(modelSettings.maxTokens || maxTokens || 2048),
    system,
    messages: anthropicMessages,
  };
  if (modelSettings.topP !== undefined) {
    body.top_p = Number(modelSettings.topP);
  } else {
    body.temperature = Number(modelSettings.temperature ?? temperature);
  }
  if (modelSettings.stop?.length) body.stop_sequences = modelSettings.stop;

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
      anthropicMessages.push({ role: 'user', content: toAnthropicContent(message.content) });
    }
  }

  return {
    system: systemParts.join('\n\n'),
    anthropicMessages: mergeAdjacentMessages(anthropicMessages),
  };
}

function toAnthropicContent(content) {
  if (!Array.isArray(content)) return String(content || '');
  return content
    .map((block) => {
      if (block.type === 'text') return { type: 'text', text: String(block.text || '') };
      if (block.type === 'image_url') {
        const url = block.image_url?.url || '';
        const match = /^data:([^;]+);base64,(.+)$/.exec(url);
        if (!match) return null;
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: match[1],
            data: match[2],
          },
        };
      }
      return null;
    })
    .filter(Boolean);
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

function buildProviderRoutes(config = {}, requestedProvider, requestedModel) {
  const primaryProvider = getProvider(requestedProvider || config.provider);
  const primary = {
    provider: primaryProvider.id,
    model: String(requestedModel || config.model || primaryProvider.defaultModel).trim(),
    source: 'primary',
  };
  const fallbacks = config.routing?.providerRotationEnabled
    ? (config.routing.fallbacks || []).map((fallback) => {
        const provider = getProvider(fallback.provider);
        return {
          provider: provider.id,
          model: String(fallback.model || provider.defaultModel).trim(),
          source: 'fallback',
        };
      })
    : [];
  const unique = [primary, ...fallbacks].filter(
    (route, index, routes) =>
      routes.findIndex((candidate) => candidate.provider === route.provider && candidate.model === route.model) === index,
  );
  const passes = config.routing?.providerRotationEnabled
    ? Math.max(1, Math.min(Number(config.routing.maxProviderPasses || 2), 5))
    : 1;
  const routes = [];
  for (let pass = 1; pass <= passes; pass += 1) {
    for (const route of unique) routes.push({ ...route, pass });
  }
  return routes;
}

function nativeSearchSupported(providerId) {
  return ['openai', 'groq', 'gemini', 'anthropic', 'xai', 'openrouter'].includes(providerId);
}

function nativeSearchPrompt(query, maxResults) {
  return [
    'Use web search for the user query below.',
    `Return a concise answer plus up to ${Math.max(1, Math.min(Number(maxResults || 5), 8))} source URLs/titles when available.`,
    `Query: ${query}`,
  ].join('\n');
}

function normalizeNativeSearchResult({ query, method, provider, modelUsed, content, results, rawUsage }) {
  const uniqueResults = [];
  const seen = new Set();
  for (const result of results || []) {
    const url = String(result?.url || result?.uri || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    uniqueResults.push({
      title: String(result.title || result.name || url).trim(),
      url,
      snippet: String(result.snippet || result.text || result.citedText || '').trim(),
    });
  }
  return {
    query,
    method,
    provider,
    modelUsed,
    content: String(content || '').trim(),
    results: uniqueResults,
    rawUsage,
  };
}

function extractResponsesText(data = {}) {
  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((item) => item.text || item.output_text || '')
    .filter(Boolean)
    .join('\n\n');
}

function extractResponsesSources(data = {}) {
  const output = Array.isArray(data.output) ? data.output : [];
  const sources = [];
  for (const item of output) {
    if (Array.isArray(item.action?.sources)) sources.push(...item.action.sources);
    if (Array.isArray(item.sources)) sources.push(...item.sources);
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        if (annotation.type === 'url_citation' || annotation.url) {
          sources.push({ title: annotation.title, url: annotation.url });
        }
      }
    }
  }
  return sources.map((source) => ({
    title: source.title || source.url,
    url: source.url,
    snippet: source.snippet || source.text || '',
  }));
}

function extractGroqSearchResults(message = {}) {
  return (message.executed_tools || [])
    .flatMap((tool) => tool.search_results || tool.results || [])
    .map((item) => ({
      title: item.title || item.url,
      url: item.url,
      snippet: item.snippet || item.content || item.text || '',
    }));
}

function extractGeminiGrounding(metadata = {}) {
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
  return chunks
    .map((chunk) => chunk.web || chunk.retrievedContext || chunk)
    .map((item) => ({
      title: item.title || item.uri,
      url: item.uri || item.url,
      snippet: item.text || '',
    }));
}

function extractAnthropicSearchResults(blocks = []) {
  const results = [];
  for (const block of blocks) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      results.push(
        ...block.content
          .filter((item) => item.type === 'web_search_result')
          .map((item) => ({
            title: item.title || item.url,
            url: item.url,
            snippet: item.cited_text || item.text || '',
          })),
      );
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      results.push(
        ...block.citations.map((citation) => ({
          title: citation.title || citation.url,
          url: citation.url,
          snippet: citation.cited_text || '',
        })),
      );
    }
  }
  return results;
}

function extractAnnotations(message = {}) {
  const annotations = message.annotations || message.content?.annotations || [];
  return annotations.map((annotation) => ({
    title: annotation.title || annotation.url,
    url: annotation.url,
    snippet: annotation.content || annotation.text || '',
  }));
}

async function appendProviderEvent(chatId, type, details = {}) {
  if (!chatId) return;
  try {
    await appendEvent({ type, chatId, details });
  } catch {
    // Provider calls should not fail because diagnostics could not be written.
  }
}

function applyOpenAICompatibleModelSettings(body, provider, modelSettings = {}, defaults = {}) {
  body.temperature = Number(modelSettings.temperature ?? defaults.temperature ?? 0.2);
  body.max_tokens = Number(modelSettings.maxTokens || defaults.maxTokens || 2048);
  if (modelSettings.topP !== undefined) body.top_p = Number(modelSettings.topP);
  if (modelSettings.stop?.length) body.stop = modelSettings.stop;

  if (['openai', 'openrouter', 'xai', 'openai-compatible'].includes(provider.id)) {
    if (modelSettings.presencePenalty !== undefined) body.presence_penalty = Number(modelSettings.presencePenalty);
    if (modelSettings.frequencyPenalty !== undefined) body.frequency_penalty = Number(modelSettings.frequencyPenalty);
    if (modelSettings.seed !== undefined) body.seed = Number(modelSettings.seed);
  }

  if (['openai', 'openrouter', 'xai', 'openai-compatible'].includes(provider.id) && modelSettings.reasoningEffort) {
    body.reasoning_effort = modelSettings.reasoningEffort;
  }

  if (provider.id === 'ollama' && modelSettings.seed !== undefined) {
    body.seed = Number(modelSettings.seed);
  }
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
