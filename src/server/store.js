import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultModelForProvider, isKnownProvider, providerCatalog } from './models.js';
import { chatsDir, configPath, eventsPath, persistentMemoryPath, runtimeHome } from './paths.js';

export const defaultConfig = Object.freeze({
  setupComplete: false,
  provider: 'groq',
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  language: 'auto',
  userNickname: '',
  systemPromptExtra: '',
  tools: {
    terminal: true,
    chatMemory: true,
    persistentMemory: true,
    autoCompact: true,
    chatTitle: true,
  },
  apiKey: process.env.GROQ_API_KEY || '',
  providerSettings: buildDefaultProviderSettings(),
  customModels: {},
});

export async function ensureRuntime() {
  await fs.mkdir(runtimeHome, { recursive: true, mode: 0o700 });
  await fs.mkdir(chatsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(runtimeHome, 'logs'), { recursive: true, mode: 0o700 });
  await ensureTextFile(
    persistentMemoryPath,
    '# Memória persistente\n\nUse este arquivo para informações duráveis entre todos os chats.\n',
  );

  try {
    await fs.access(configPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeJson(configPath, defaultConfig, 0o600);
  }
}

export async function loadConfig() {
  await ensureRuntime();
  const config = await readJson(configPath, defaultConfig);
  return normalizeConfig(config);
}

export async function saveConfig(patch) {
  const current = await loadConfig();
  const provider = normalizeProviderId(patch.provider || current.provider);
  const providerSettings = normalizeProviderSettings({
    ...current.providerSettings,
    ...(patch.providerSettings || {}),
  });

  if (Object.hasOwn(patch, 'apiKey') && patch.apiKey !== undefined) {
    providerSettings[provider] = {
      ...providerSettings[provider],
      apiKeys: normalizeApiKeyEntries([patch.apiKey]),
    };
  }

  const next = {
    ...current,
    provider,
    model: String(patch.model || current.model || getDefaultModelForProvider(provider)).trim(),
    language: String(patch.language || current.language || 'auto').trim(),
    userNickname: String(patch.userNickname ?? current.userNickname ?? '').trim(),
    systemPromptExtra: String(patch.systemPromptExtra ?? current.systemPromptExtra ?? '').trim(),
    tools: normalizeTools(patch.tools || current.tools),
    providerSettings,
    customModels: normalizeCustomModels({
      ...current.customModels,
      ...(patch.customModels || {}),
    }),
    setupComplete: Boolean(patch.setupComplete ?? true),
    updatedAt: new Date().toISOString(),
  };
  next.apiKey = getPrimaryApiKey(next.providerSettings, next.provider);

  await writeJson(configPath, next, 0o600);
  await appendEvent({ type: 'config.updated', details: { provider: next.provider, model: next.model } });
  return next;
}

export function sanitizeConfig(config) {
  const providerSettings = normalizeProviderSettings(config.providerSettings || {});
  return {
    setupComplete: Boolean(config.setupComplete),
    provider: normalizeProviderId(config.provider),
    model: config.model,
    language: config.language,
    userNickname: config.userNickname,
    systemPromptExtra: config.systemPromptExtra,
    tools: normalizeTools(config.tools),
    providerSettings,
    customModels: normalizeCustomModels(config.customModels || {}),
    apiKeySet: Boolean(getPrimaryApiKey(providerSettings, config.provider)),
    apiKey: getPrimaryApiKey(providerSettings, config.provider),
  };
}

export async function listChats() {
  await ensureRuntime();
  const entries = await fs.readdir(chatsDir, { withFileTypes: true });
  const chats = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      chats.push(await readChatMetadata(entry.name));
    } catch {
      // A broken chat directory should not break the whole panel.
    }
  }

  return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function createChat(title = 'Novo chat', options = {}) {
  await ensureRuntime();
  const now = new Date();
  const id = `${stamp(now)}-${crypto.randomUUID().slice(0, 8)}`;
  const chatDir = getChatDir(id);
  const provider = normalizeProviderId(options.provider || defaultConfig.provider);
  const metadata = {
    id,
    title: normalizeTitle(title),
    provider,
    model: String(options.model || getDefaultModelForProvider(provider)).trim(),
    systemPromptExtra: String(options.systemPromptExtra || '').trim(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    paths: {
      memory: path.join(chatDir, 'memory.md'),
      context: path.join(chatDir, 'context.md'),
      contextWindow: path.join(chatDir, 'context-window.md'),
    },
  };

  await fs.mkdir(path.join(chatDir, 'context-snapshots'), { recursive: true, mode: 0o700 });
  await writeJson(path.join(chatDir, 'metadata.json'), metadata, 0o600);
  await writeJson(path.join(chatDir, 'messages.json'), [], 0o600);
  await fs.writeFile(
    metadata.paths.memory,
    '# Chat memory\n\nUse este arquivo para notas duraveis que devem acompanhar este chat.\n',
    { mode: 0o600 },
  );
  await fs.writeFile(metadata.paths.context, '# Context summary\n\nAinda não compactado.\n', {
    mode: 0o600,
  });
  await fs.writeFile(metadata.paths.contextWindow, '# Context window\n\nAinda não salvo.\n', {
    mode: 0o600,
  });
  await appendEvent({ type: 'chat.created', chatId: id, details: { title: metadata.title } });
  return readChat(id);
}

export async function readChat(id) {
  assertChatId(id);
  const metadata = await readChatMetadata(id);
  const chatDir = getChatDir(id);
  const messages = await readJson(path.join(chatDir, 'messages.json'), []);
  const memory = await readText(metadata.paths.memory, '');
  const contextSummary = await readText(metadata.paths.context, '');
  return { ...metadata, messages, memory, contextSummary };
}

export async function appendMessages(id, messages) {
  assertChatId(id);
  const chatDir = getChatDir(id);
  const current = await readJson(path.join(chatDir, 'messages.json'), []);
  const next = [...current, ...messages];
  await writeJson(path.join(chatDir, 'messages.json'), next, 0o600);
  await touchChat(id);
  return next;
}

export async function updateMessage(id, messageId, patch) {
  assertChatId(id);
  const chatDir = getChatDir(id);
  const messagesPath = path.join(chatDir, 'messages.json');
  const current = await readJson(messagesPath, []);
  let found = false;
  const next = current.map((message) => {
    if (message.id !== messageId) return message;
    found = true;
    return {
      ...message,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  });

  if (!found) {
    const error = new Error('Mensagem não encontrada.');
    error.statusCode = 404;
    throw error;
  }

  await writeJson(messagesPath, next, 0o600);
  await touchChat(id);
  return next.find((message) => message.id === messageId);
}

export async function updateChatMetadata(id, patch) {
  assertChatId(id);
  const metadata = await readChatMetadata(id);
  const next = {
    ...metadata,
    ...patch,
    title: patch.title ? normalizeTitle(patch.title) : metadata.title,
    provider: patch.provider ? normalizeProviderId(patch.provider) : normalizeProviderId(metadata.provider),
    model: patch.model ? String(patch.model).trim() : metadata.model,
    systemPromptExtra:
      patch.systemPromptExtra === undefined
        ? metadata.systemPromptExtra || ''
        : String(patch.systemPromptExtra || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(path.join(getChatDir(id), 'metadata.json'), next, 0o600);
  return next;
}

export async function deleteChat(id) {
  assertChatId(id);
  const metadata = await readChatMetadata(id);
  await fs.rm(getChatDir(id), { recursive: true, force: true });
  await appendEvent({ type: 'chat.deleted', chatId: id, details: { title: metadata.title } });
}

export async function readMemory(id) {
  const chat = await readChat(id);
  return chat.memory;
}

export async function writeMemory(id, content) {
  const chat = await readChat(id);
  await fs.writeFile(chat.paths.memory, String(content || ''), { mode: 0o600 });
  await touchChat(id);
  await appendEvent({ type: 'chat.memory.updated', chatId: id });
  return readChat(id);
}

export async function readPersistentMemory() {
  await ensureRuntime();
  return readText(persistentMemoryPath, '');
}

export async function writePersistentMemory(content) {
  await ensureRuntime();
  await fs.writeFile(persistentMemoryPath, String(content || ''), { mode: 0o600 });
  await appendEvent({ type: 'memory.persistent.updated', details: { path: persistentMemoryPath } });
  return readPersistentMemory();
}

export async function readContextSummary(id) {
  const chat = await readChat(id);
  return chat.contextSummary;
}

export async function writeContextSummary(id, content) {
  const chat = await readChat(id);
  await fs.writeFile(chat.paths.context, String(content || ''), { mode: 0o600 });
  await touchChat(id);
  await appendEvent({ type: 'chat.context.compacted', chatId: id });
  return readChat(id);
}

export async function saveCurrentContextWindow(id, content) {
  const chat = await readChat(id);
  await fs.writeFile(chat.paths.contextWindow, String(content || ''), { mode: 0o600 });
  await touchChat(id);
  return chat.paths.contextWindow;
}

export async function saveContextSnapshot(id, content) {
  const chat = await readChat(id);
  const fileName = `${stamp(new Date())}.md`;
  const snapshotPath = path.join(getChatDir(id), 'context-snapshots', fileName);
  await fs.writeFile(snapshotPath, String(content || ''), { mode: 0o600 });
  await appendEvent({ type: 'chat.context.saved', chatId: id, details: { path: snapshotPath } });
  await touchChat(id);
  return snapshotPath;
}

export async function readEvents(options = {}) {
  const limit = typeof options === 'number' ? options : Number(options.limit || 80);
  const chatId = typeof options === 'object' ? options.chatId : null;
  await ensureRuntime();
  let raw = '';
  try {
    raw = await fs.readFile(eventsPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'event.parse_error', createdAt: new Date().toISOString(), raw: line };
      }
    })
    .filter((event) => !chatId || event.chatId === chatId)
    .slice(-limit)
    .reverse();
}

export async function appendEvent(event) {
  await fs.mkdir(runtimeHome, { recursive: true, mode: 0o700 });
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  };
  await fs.appendFile(eventsPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return entry;
}

export async function exportRuntimeData() {
  await ensureRuntime();
  const chats = [];
  for (const chat of await listChats()) {
    const fullChat = await readChat(chat.id);
    const chatDir = getChatDir(chat.id);
    chats.push({
      metadata: {
        id: fullChat.id,
        title: fullChat.title,
        provider: fullChat.provider,
        model: fullChat.model,
        systemPromptExtra: fullChat.systemPromptExtra || '',
        createdAt: fullChat.createdAt,
        updatedAt: fullChat.updatedAt,
      },
      messages: fullChat.messages || [],
      memory: fullChat.memory || '',
      contextSummary: fullChat.contextSummary || '',
      contextWindow: await readText(path.join(chatDir, 'context-window.md'), ''),
    });
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    config: await loadConfig(),
    persistentMemory: await readPersistentMemory(),
    chats,
    events: await readEvents({ limit: 10000 }),
  };
}

export async function importRuntimeData(payload = {}) {
  await ensureRuntime();
  if (payload.config) {
    await saveConfig({
      ...payload.config,
      setupComplete: Boolean(payload.config.setupComplete ?? true),
    });
  }

  if (Object.hasOwn(payload, 'persistentMemory')) {
    await writePersistentMemory(payload.persistentMemory || '');
  }

  if (Array.isArray(payload.chats)) {
    for (const importedChat of payload.chats) {
      await writeImportedChat(importedChat);
    }
  }

  await appendEvent({
    type: 'runtime.imported',
    details: { chatCount: Array.isArray(payload.chats) ? payload.chats.length : 0 },
  });

  return exportRuntimeData();
}

export function createMessage(role, content, extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content: String(content || ''),
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export function getChatDir(id) {
  assertChatId(id);
  return path.join(chatsDir, id);
}

async function readChatMetadata(id) {
  assertChatId(id);
  const metadata = await readJson(path.join(getChatDir(id), 'metadata.json'), null);
  if (!metadata) return metadata;
  const provider = normalizeProviderId(metadata.provider || defaultConfig.provider);
  return {
    ...metadata,
    provider,
    model: String(metadata.model || getDefaultModelForProvider(provider)).trim(),
    systemPromptExtra: String(metadata.systemPromptExtra || '').trim(),
  };
}

async function writeImportedChat(importedChat = {}) {
  const importedMetadata = importedChat.metadata || {};
  const id = /^[a-zA-Z0-9_-]+$/.test(String(importedMetadata.id || ''))
    ? String(importedMetadata.id)
    : `${stamp(new Date())}-${crypto.randomUUID().slice(0, 8)}`;
  const chatDir = getChatDir(id);
  const provider = normalizeProviderId(importedMetadata.provider || defaultConfig.provider);
  const now = new Date().toISOString();
  const metadata = {
    id,
    title: normalizeTitle(importedMetadata.title || 'Chat importado'),
    provider,
    model: String(importedMetadata.model || getDefaultModelForProvider(provider)).trim(),
    systemPromptExtra: String(importedMetadata.systemPromptExtra || '').trim(),
    createdAt: importedMetadata.createdAt || now,
    updatedAt: now,
    paths: {
      memory: path.join(chatDir, 'memory.md'),
      context: path.join(chatDir, 'context.md'),
      contextWindow: path.join(chatDir, 'context-window.md'),
    },
  };

  await fs.mkdir(path.join(chatDir, 'context-snapshots'), { recursive: true, mode: 0o700 });
  await writeJson(path.join(chatDir, 'metadata.json'), metadata, 0o600);
  await writeJson(path.join(chatDir, 'messages.json'), Array.isArray(importedChat.messages) ? importedChat.messages : [], 0o600);
  await fs.writeFile(metadata.paths.memory, String(importedChat.memory || '# Chat memory\n'), { mode: 0o600 });
  await fs.writeFile(metadata.paths.context, String(importedChat.contextSummary || '# Context summary\n'), { mode: 0o600 });
  await fs.writeFile(metadata.paths.contextWindow, String(importedChat.contextWindow || '# Context window\n'), { mode: 0o600 });
}

async function touchChat(id) {
  const metadata = await readChatMetadata(id);
  await writeJson(path.join(getChatDir(id), 'metadata.json'), {
    ...metadata,
    updatedAt: new Date().toISOString(),
  });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value, mode = 0o600) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await fs.rename(tempPath, filePath);
}

async function ensureTextFile(filePath, content) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(filePath, content, { mode: 0o600 });
  }
}

async function readText(filePath, fallback) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function normalizeTitle(title) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 80) || 'Novo chat';
}

function normalizeTools(tools = {}) {
  return {
    terminal: tools.terminal !== false,
    chatMemory: tools.chatMemory !== false,
    persistentMemory: tools.persistentMemory !== false,
    autoCompact: tools.autoCompact !== false,
    chatTitle: tools.chatTitle !== false,
  };
}

function normalizeConfig(config = {}) {
  const provider = normalizeProviderId(config.provider || defaultConfig.provider);
  const providerSettings = normalizeProviderSettings(config.providerSettings || {});

  if (config.apiKey && !getPrimaryApiKey(providerSettings, 'groq')) {
    providerSettings.groq.apiKeys = normalizeApiKeyEntries([config.apiKey]);
  }

  const model = String(config.model || getDefaultModelForProvider(provider)).trim();

  return {
    ...defaultConfig,
    ...config,
    provider,
    model,
    language: String(config.language || defaultConfig.language).trim(),
    userNickname: String(config.userNickname || '').trim(),
    systemPromptExtra: String(config.systemPromptExtra || '').trim(),
    tools: normalizeTools(config.tools || defaultConfig.tools),
    providerSettings,
    customModels: normalizeCustomModels(config.customModels || {}),
    apiKey: getPrimaryApiKey(providerSettings, provider),
    setupComplete: Boolean(config.setupComplete),
  };
}

function buildDefaultProviderSettings() {
  return normalizeProviderSettings({});
}

function normalizeProviderId(providerId) {
  const value = String(providerId || '').trim();
  return isKnownProvider(value) ? value : 'groq';
}

function normalizeProviderSettings(settings = {}) {
  const next = {};
  for (const provider of providerCatalog) {
    const current = settings[provider.id] || {};
    const apiKeys = normalizeApiKeyEntries(current.apiKeys || current.apiKey || []);
    const envKey = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '';
    if (envKey && !apiKeys.some((item) => item.value === envKey)) {
      apiKeys.push({
        id: 'env',
        label: `${provider.label} env`,
        value: envKey,
      });
    }
    next[provider.id] = {
      baseUrl: String(current.baseUrl || provider.baseUrl || '').trim(),
      apiKeys,
    };
  }
  return next;
}

function normalizeApiKeyEntries(value = []) {
  const entries = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return entries
    .map((entry, index) => {
      const rawValue = typeof entry === 'string' ? entry : entry?.value;
      const cleanValue = String(rawValue || '').trim();
      if (!cleanValue || seen.has(cleanValue)) return null;
      seen.add(cleanValue);
      return {
        id: String((typeof entry === 'object' && entry?.id) || crypto.randomUUID()),
        label: String((typeof entry === 'object' && entry?.label) || `Key ${index + 1}`).trim(),
        value: cleanValue,
      };
    })
    .filter(Boolean);
}

function normalizeCustomModels(customModels = {}) {
  const next = {};
  for (const provider of providerCatalog) {
    const value = customModels[provider.id];
    next[provider.id] = Array.isArray(value)
      ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
      : [];
  }
  return next;
}

function getPrimaryApiKey(providerSettings = {}, providerId = 'groq') {
  const provider = normalizeProviderId(providerId);
  return providerSettings[provider]?.apiKeys?.[0]?.value || '';
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function assertChatId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id || ''))) {
    const error = new Error('Chat invalido.');
    error.statusCode = 400;
    throw error;
  }
}
