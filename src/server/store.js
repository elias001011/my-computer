import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
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
  return {
    ...defaultConfig,
    ...config,
    provider: 'groq',
    apiKey: config.apiKey || process.env.GROQ_API_KEY || '',
  };
}

export async function saveConfig(patch) {
  const current = await loadConfig();
  const apiKey =
    Object.hasOwn(patch, 'apiKey') && String(patch.apiKey || '').trim()
      ? String(patch.apiKey).trim()
      : current.apiKey;

  const next = {
    ...current,
    provider: 'groq',
    model: String(patch.model || current.model || defaultConfig.model).trim(),
    language: String(patch.language || current.language || 'auto').trim(),
    userNickname: String(patch.userNickname ?? current.userNickname ?? '').trim(),
    systemPromptExtra: String(patch.systemPromptExtra ?? current.systemPromptExtra ?? '').trim(),
    tools: normalizeTools(patch.tools || current.tools),
    apiKey,
    setupComplete: Boolean(patch.setupComplete ?? true),
    updatedAt: new Date().toISOString(),
  };

  await writeJson(configPath, next, 0o600);
  await appendEvent({ type: 'config.updated', details: { provider: next.provider, model: next.model } });
  return next;
}

export function sanitizeConfig(config) {
  return {
    setupComplete: Boolean(config.setupComplete),
    provider: 'groq',
    model: config.model,
    language: config.language,
    userNickname: config.userNickname,
    systemPromptExtra: config.systemPromptExtra,
    tools: normalizeTools(config.tools),
    apiKeySet: Boolean(config.apiKey),
    apiKey: config.apiKey,
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
  const metadata = {
    id,
    title: normalizeTitle(title),
    model: String(options.model || defaultConfig.model).trim(),
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
  return readJson(path.join(getChatDir(id), 'metadata.json'), null);
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
