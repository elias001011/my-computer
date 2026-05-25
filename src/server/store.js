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
  technicalLevel: 'balanced',
  technicalGuidanceEnabled: true,
  systemPromptExtra: '',
  tools: {
    terminal: true,
    chatMemory: true,
    persistentMemory: true,
    autoCompact: true,
    chatTitle: true,
    webSearch: true,
    searchTerminal: false,
    searchMode: 'native',
    alwaysAllow: false,
    terminalMode: 'standard',
  },
  routing: {
    providerRotationEnabled: false,
    maxProviderPasses: 2,
    fallbacks: [],
  },
  context: {
    autoCompactEnabled: false,
    autoCompactChars: 24000,
    autoCompactMinMessages: 12,
  },
  server: {
    networkEnabled: false,
    authPassword: '',
  },
  apiKey: process.env.GROQ_API_KEY || '',
  providerSettings: buildDefaultProviderSettings(),
  customModels: {},
  modelCapabilities: {},
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
    technicalLevel: normalizeTechnicalLevel(patch.technicalLevel ?? current.technicalLevel),
    technicalGuidanceEnabled:
      patch.technicalGuidanceEnabled === undefined
        ? current.technicalGuidanceEnabled !== false
        : patch.technicalGuidanceEnabled !== false,
    systemPromptExtra: String(patch.systemPromptExtra ?? current.systemPromptExtra ?? '').trim(),
    tools: normalizeTools(patch.tools || current.tools),
    context: normalizeContextSettings({
      ...current.context,
      ...(patch.context || {}),
    }),
    routing: normalizeRoutingSettings({
      ...current.routing,
      ...(patch.routing || {}),
    }),
    server: normalizeServerSettings({
      ...current.server,
      ...(patch.server || {}),
    }),
    providerSettings,
    customModels: normalizeCustomModels({
      ...current.customModels,
      ...(patch.customModels || {}),
    }),
    modelCapabilities: normalizeModelCapabilities({
      ...current.modelCapabilities,
      ...(patch.modelCapabilities || {}),
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
    technicalLevel: normalizeTechnicalLevel(config.technicalLevel),
    technicalGuidanceEnabled: config.technicalGuidanceEnabled !== false,
    systemPromptExtra: config.systemPromptExtra,
    tools: normalizeTools(config.tools),
    context: normalizeContextSettings(config.context),
    routing: normalizeRoutingSettings(config.routing),
    server: normalizeServerSettings(config.server),
    providerSettings,
    customModels: normalizeCustomModels(config.customModels || {}),
    modelCapabilities: normalizeModelCapabilities(config.modelCapabilities || {}),
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
    modelSettings: normalizeModelSettings(options.modelSettings || {}),
    systemPromptExtra: String(options.systemPromptExtra || '').trim(),
    lastAutoCompactMessageCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    paths: {
      memory: path.join(chatDir, 'memory.md'),
      context: path.join(chatDir, 'context.md'),
      contextWindow: path.join(chatDir, 'context-window.md'),
      attachments: path.join(chatDir, 'attachments'),
    },
  };

  await fs.mkdir(path.join(chatDir, 'context-snapshots'), { recursive: true, mode: 0o700 });
  await fs.mkdir(metadata.paths.attachments, { recursive: true, mode: 0o700 });
  await writeJson(path.join(chatDir, 'attachments.json'), [], 0o600);
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
  const attachments = await listAttachments(id);
  const memory = await readText(metadata.paths.memory, '');
  const contextSummary = await readText(metadata.paths.context, '');
  return { ...metadata, messages, attachments, memory, contextSummary };
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
    modelSettings:
      patch.modelSettings === undefined ? normalizeModelSettings(metadata.modelSettings || {}) : normalizeModelSettings(patch.modelSettings),
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

export async function saveAttachment(id, file = {}) {
  assertChatId(id);
  const metadata = await readChatMetadata(id);
  const attachmentId = crypto.randomUUID();
  const name = sanitizeFileName(file.name || 'attachment');
  const mimeType = String(file.mimeType || file.type || 'application/octet-stream').slice(0, 120);
  const size = Number(file.size || 0);
  const rawBase64 = String(file.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!isSupportedAttachment(mimeType, name)) {
    const error = new Error(
      'Formato ainda não compatível. Envie imagens, vídeo, áudio, PDF, texto, código, JSON, CSV, HTML, XML, YAML ou Markdown.',
    );
    error.statusCode = 415;
    throw error;
  }
  if (!rawBase64) {
    const error = new Error('Arquivo sem conteúdo.');
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length > 20 * 1024 * 1024) {
    const error = new Error('Arquivo muito grande. Limite atual: 20 MB por arquivo.');
    error.statusCode = 413;
    throw error;
  }

  const attachmentsDir = metadata.paths.attachments;
  await fs.mkdir(attachmentsDir, { recursive: true, mode: 0o700 });
  const fileName = `${attachmentId}-${name}`;
  const filePath = path.join(attachmentsDir, fileName);
  await fs.writeFile(filePath, buffer, { mode: 0o600 });

  const extraction = extractAttachmentText(buffer, { name, mimeType });
  const attachment = {
    id: attachmentId,
    name,
    mimeType,
    size: size || buffer.length,
    path: filePath,
    kind: classifyAttachment(mimeType, name),
    sendMode: defaultAttachmentSendMode(mimeType, name, extraction),
    extractedText: extraction.text,
    previewText: truncate(extraction.text, 1800),
    extractionStatus: extraction.status,
    extractionNote: extraction.note,
    createdAt: new Date().toISOString(),
  };

  const attachments = await listAttachments(id);
  await writeJson(getAttachmentsMetadataPath(id), [...attachments, attachment], 0o600);
  await touchChat(id);
  await appendEvent({
    type: 'chat.attachment.created',
    chatId: id,
    details: { name: attachment.name, kind: attachment.kind, sendMode: attachment.sendMode },
  });
  return attachment;
}

export async function listAttachments(id) {
  assertChatId(id);
  return readJson(getAttachmentsMetadataPath(id), []);
}

export async function readAttachment(id, attachmentId) {
  assertChatId(id);
  const attachment = (await listAttachments(id)).find((item) => item.id === attachmentId);
  if (!attachment) {
    const error = new Error('Anexo não encontrado.');
    error.statusCode = 404;
    throw error;
  }
  return attachment;
}

export async function readAttachmentFile(id, attachmentId) {
  const attachment = await readAttachment(id, attachmentId);
  const chatDir = getChatDir(id);
  const resolved = path.resolve(attachment.path);
  if (!resolved.startsWith(`${path.resolve(chatDir)}${path.sep}`)) {
    const error = new Error('Caminho de anexo inválido.');
    error.statusCode = 403;
    throw error;
  }
  return {
    attachment,
    data: await fs.readFile(resolved),
  };
}

export async function deleteAttachment(id, attachmentId) {
  const attachments = await listAttachments(id);
  const attachment = attachments.find((item) => item.id === attachmentId);
  if (!attachment) return;
  await fs.rm(attachment.path, { force: true });
  await writeJson(
    getAttachmentsMetadataPath(id),
    attachments.filter((item) => item.id !== attachmentId),
    0o600,
  );
  await touchChat(id);
  await appendEvent({ type: 'chat.attachment.deleted', chatId: id, details: { name: attachment.name } });
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
        modelSettings: normalizeModelSettings(fullChat.modelSettings || {}),
        systemPromptExtra: fullChat.systemPromptExtra || '',
        lastAutoCompactMessageCount: Number(fullChat.lastAutoCompactMessageCount || 0),
        createdAt: fullChat.createdAt,
        updatedAt: fullChat.updatedAt,
      },
      messages: fullChat.messages || [],
      memory: fullChat.memory || '',
      contextSummary: fullChat.contextSummary || '',
      contextWindow: await readText(path.join(chatDir, 'context-window.md'), ''),
      attachments: await exportChatAttachments(fullChat.id),
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

export async function importRuntimeData(payload = {}, options = {}) {
  await ensureRuntime();
  const settings = normalizeImportOptions(options);

  if (settings.config && payload.config) {
    await saveConfig({
      ...payload.config,
      setupComplete: Boolean(payload.config.setupComplete ?? true),
    });
  }

  if (settings.persistentMemory && Object.hasOwn(payload, 'persistentMemory')) {
    await writePersistentMemory(payload.persistentMemory || '');
  }

  if (settings.chats && Array.isArray(payload.chats)) {
    for (const importedChat of payload.chats) {
      await writeImportedChat(importedChat, { attachments: settings.attachments });
    }
  }

  if (settings.events && Array.isArray(payload.events)) {
    await importEvents(payload.events);
  }

  await appendEvent({
    type: 'runtime.imported',
    details: {
      chatCount: settings.chats && Array.isArray(payload.chats) ? payload.chats.length : 0,
      config: settings.config,
      persistentMemory: settings.persistentMemory,
      attachments: settings.attachments,
      events: settings.events,
    },
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
    modelSettings: normalizeModelSettings(metadata.modelSettings || {}),
    systemPromptExtra: String(metadata.systemPromptExtra || '').trim(),
    lastAutoCompactMessageCount: Number(metadata.lastAutoCompactMessageCount || 0),
    paths: {
      ...(metadata.paths || {}),
      memory: metadata.paths?.memory || path.join(getChatDir(id), 'memory.md'),
      context: metadata.paths?.context || path.join(getChatDir(id), 'context.md'),
      contextWindow: metadata.paths?.contextWindow || path.join(getChatDir(id), 'context-window.md'),
      attachments: metadata.paths?.attachments || path.join(getChatDir(id), 'attachments'),
    },
  };
}

async function writeImportedChat(importedChat = {}, options = {}) {
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
    modelSettings: normalizeModelSettings(importedMetadata.modelSettings || {}),
    systemPromptExtra: String(importedMetadata.systemPromptExtra || '').trim(),
    lastAutoCompactMessageCount: Number(importedMetadata.lastAutoCompactMessageCount || 0),
    createdAt: importedMetadata.createdAt || now,
    updatedAt: now,
    paths: {
      memory: path.join(chatDir, 'memory.md'),
      context: path.join(chatDir, 'context.md'),
      contextWindow: path.join(chatDir, 'context-window.md'),
      attachments: path.join(chatDir, 'attachments'),
    },
  };

  await fs.mkdir(path.join(chatDir, 'context-snapshots'), { recursive: true, mode: 0o700 });
  await fs.mkdir(metadata.paths.attachments, { recursive: true, mode: 0o700 });
  await writeJson(path.join(chatDir, 'metadata.json'), metadata, 0o600);
  await writeJson(path.join(chatDir, 'messages.json'), Array.isArray(importedChat.messages) ? importedChat.messages : [], 0o600);
  await fs.writeFile(metadata.paths.memory, String(importedChat.memory || '# Chat memory\n'), { mode: 0o600 });
  await fs.writeFile(metadata.paths.context, String(importedChat.contextSummary || '# Context summary\n'), { mode: 0o600 });
  await fs.writeFile(metadata.paths.contextWindow, String(importedChat.contextWindow || '# Context window\n'), { mode: 0o600 });
  await importChatAttachments(id, options.attachments === false ? [] : importedChat.attachments || []);
}

async function exportChatAttachments(id) {
  const attachments = await listAttachments(id);
  const exported = [];
  for (const attachment of attachments) {
    let dataBase64 = '';
    try {
      dataBase64 = (await fs.readFile(attachment.path)).toString('base64');
    } catch {
      // Keep metadata if a file disappeared.
    }
    exported.push({ ...attachment, dataBase64 });
  }
  return exported;
}

async function importChatAttachments(id, attachments = []) {
  const imported = [];
  const chat = await readChatMetadata(id);
  await fs.mkdir(chat.paths.attachments, { recursive: true, mode: 0o700 });

  for (const attachment of attachments) {
    const attachmentId = /^[a-zA-Z0-9_-]+$/.test(String(attachment.id || ''))
      ? String(attachment.id)
      : crypto.randomUUID();
    const name = sanitizeFileName(attachment.name || 'attachment');
    const filePath = path.join(chat.paths.attachments, `${attachmentId}-${name}`);
    if (attachment.dataBase64) {
      await fs.writeFile(filePath, Buffer.from(attachment.dataBase64, 'base64'), { mode: 0o600 });
    }
    imported.push({
      ...attachment,
      id: attachmentId,
      name,
      path: filePath,
      dataBase64: undefined,
    });
  }

  await writeJson(getAttachmentsMetadataPath(id), imported, 0o600);
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
  const searchMode = normalizeSearchMode(tools.searchMode, tools);
  return {
    terminal: tools.terminal !== false,
    chatMemory: tools.chatMemory !== false,
    persistentMemory: tools.persistentMemory !== false,
    autoCompact: tools.autoCompact !== false,
    chatTitle: tools.chatTitle !== false,
    webSearch: searchMode !== 'off',
    searchTerminal: searchMode === 'terminal' || searchMode === 'both',
    searchMode,
    alwaysAllow: tools.alwaysAllow === true,
    terminalMode: tools.terminalMode === 'isolated' ? 'isolated' : 'standard',
  };
}

function normalizeSearchMode(value, legacyTools = {}) {
  const mode = String(value || '').trim();
  if (mode === 'terminal' || mode === 'both') return mode;
  if (legacyTools.webSearch === false) return 'off';
  if (legacyTools.searchTerminal === true) return 'terminal';
  if (['off', 'native', 'terminal', 'both'].includes(mode)) return mode;
  return 'native';
}

function normalizeContextSettings(context = {}) {
  return {
    autoCompactEnabled: context.autoCompactEnabled === true,
    autoCompactChars: clampInteger(context.autoCompactChars, 8000, 120000, 24000),
    autoCompactMinMessages: clampInteger(context.autoCompactMinMessages, 2, 80, 12),
  };
}

function normalizeRoutingSettings(routing = {}) {
  const fallbacks = Array.isArray(routing.fallbacks)
    ? routing.fallbacks
        .filter((item) => item?.provider)
        .map((item) => {
          const provider = normalizeProviderId(item?.provider);
          const model = String(item?.model || getDefaultModelForProvider(provider)).trim();
          return { provider, model };
        })
        .filter((item, index, items) =>
          items.findIndex((candidate) => candidate.provider === item.provider && candidate.model === item.model) === index,
        )
        .slice(0, 8)
    : [];

  return {
    providerRotationEnabled: routing.providerRotationEnabled === true,
    maxProviderPasses: clampInteger(routing.maxProviderPasses, 1, 5, 2),
    fallbacks,
  };
}

function normalizeServerSettings(server = {}) {
  const authPassword = String(server.authPassword || '').trim();
  return {
    networkEnabled: server.networkEnabled === true && Boolean(authPassword),
    authPassword,
  };
}

function normalizeTechnicalLevel(value) {
  const level = String(value || 'balanced').trim();
  return ['beginner', 'careful', 'balanced', 'advanced', 'expert'].includes(level) ? level : 'balanced';
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
    technicalLevel: normalizeTechnicalLevel(config.technicalLevel),
    technicalGuidanceEnabled: config.technicalGuidanceEnabled !== false,
    systemPromptExtra: String(config.systemPromptExtra || '').trim(),
    tools: normalizeTools(config.tools || defaultConfig.tools),
    context: normalizeContextSettings(config.context || defaultConfig.context),
    routing: normalizeRoutingSettings(config.routing || defaultConfig.routing),
    server: normalizeServerSettings(config.server || defaultConfig.server),
    providerSettings,
    customModels: normalizeCustomModels(config.customModels || {}),
    modelCapabilities: normalizeModelCapabilities(config.modelCapabilities || {}),
    apiKey: getPrimaryApiKey(providerSettings, provider),
    setupComplete: Boolean(config.setupComplete),
  };
}

function normalizeImportOptions(options = {}) {
  return {
    config: options.config !== false,
    persistentMemory: options.persistentMemory !== false,
    chats: options.chats !== false,
    attachments: options.attachments !== false,
    events: options.events === true,
  };
}

async function importEvents(events = []) {
  const importedAt = new Date().toISOString();
  const lines = events
    .filter((event) => event && typeof event === 'object')
    .slice(0, 10000)
    .map((event) =>
      JSON.stringify({
        ...event,
        id: crypto.randomUUID(),
        imported: true,
        importedAt,
      }),
    );
  if (!lines.length) return;
  await fs.appendFile(eventsPath, `${lines.join('\n')}\n`, { mode: 0o600 });
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

function normalizeModelCapabilities(modelCapabilities = {}) {
  const next = {};
  for (const provider of providerCatalog) {
    const providerCapabilities = modelCapabilities[provider.id] || {};
    next[provider.id] = Object.fromEntries(
      Object.entries(providerCapabilities).map(([modelId, capabilities]) => [
        String(modelId),
        {
          images: Boolean(capabilities?.images),
          maxInputImages: positiveNumberOrNull(capabilities?.maxInputImages),
          maxFileSizeMB: positiveNumberOrNull(capabilities?.maxFileSizeMB),
          maxOutputTokens: positiveNumberOrNull(capabilities?.maxOutputTokens),
        },
      ]),
    );
  }
  return next;
}

function normalizeModelSettings(settings = {}) {
  const next = {};
  const temperature = numberInRange(settings.temperature, 0, 2);
  const topP = numberInRange(settings.topP ?? settings.top_p, 0, 1);
  const maxTokens = positiveIntegerOrNull(settings.maxTokens ?? settings.max_tokens);
  const presencePenalty = numberInRange(settings.presencePenalty ?? settings.presence_penalty, -2, 2);
  const frequencyPenalty = numberInRange(settings.frequencyPenalty ?? settings.frequency_penalty, -2, 2);
  const seed = positiveIntegerOrNull(settings.seed);
  const reasoningEffort = String(settings.reasoningEffort ?? settings.reasoning_effort ?? '').trim();
  const stop = normalizeStopSequences(settings.stop);

  if (temperature !== null) next.temperature = temperature;
  if (topP !== null) next.topP = topP;
  if (maxTokens !== null) next.maxTokens = maxTokens;
  if (presencePenalty !== null) next.presencePenalty = presencePenalty;
  if (frequencyPenalty !== null) next.frequencyPenalty = frequencyPenalty;
  if (seed !== null) next.seed = seed;
  if (['none', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) next.reasoningEffort = reasoningEffort;
  if (stop.length) next.stop = stop;
  return next;
}

function normalizeStopSequences(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(/\n|,/);
  return entries.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function numberInRange(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getPrimaryApiKey(providerSettings = {}, providerId = 'groq') {
  const provider = normalizeProviderId(providerId);
  return providerSettings[provider]?.apiKeys?.[0]?.value || '';
}

function getAttachmentsMetadataPath(id) {
  return path.join(getChatDir(id), 'attachments.json');
}

function classifyAttachment(mimeType, name) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (isTextLike(mimeType, name)) return 'text';
  return 'document';
}

function defaultAttachmentSendMode(mimeType, name, extraction) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'reference';
  if (mimeType.startsWith('audio/')) return 'reference';
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'reference';
  if (extraction.status === 'extracted') return 'text';
  return 'reference';
}

function extractAttachmentText(buffer, file) {
  if (!isTextLike(file.mimeType, file.name)) {
    return {
      status: 'reference',
      text: '',
      note: file.mimeType.startsWith('video/')
        ? 'Vídeo salvo no chat. O MVP ainda não envia vídeo nativo para providers; a IA recebe caminho/metadados.'
        : file.mimeType.startsWith('audio/')
          ? 'Áudio salvo no chat. O MVP ainda não transcreve áudio; a IA recebe caminho/metadados.'
          : file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)
            ? 'PDF salvo no chat. O MVP mostra o arquivo na UI, mas ainda não extrai texto de PDF; a IA recebe caminho/metadados.'
        : 'Arquivo salvo no chat. O MVP ainda não extrai texto deste formato.',
    };
  }

  const raw = buffer.toString('utf8').replace(/\u0000/g, '');
  const text = file.mimeType === 'text/html' || /\.html?$/i.test(file.name) ? htmlToText(raw) : raw;
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) {
    return { status: 'empty', text: '', note: 'Não foi possível extrair texto útil deste arquivo.' };
  }

  const limit = 160000;
  return {
    status: clean.length > limit ? 'truncated' : 'extracted',
    text: truncate(clean, limit),
    note:
      clean.length > limit
        ? `Texto extraído e truncado para ${limit} caracteres antes de enviar ao modelo.`
        : 'Texto extraído e enviado ao modelo em uma seção de documentos.',
  };
}

function isSupportedAttachment(mimeType, name) {
  const extension = path.extname(name || '').toLowerCase();
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return true;
  if (mimeType === 'application/pdf' || extension === '.pdf') return true;
  return isTextLike(mimeType, name);
}

function isTextLike(mimeType, name) {
  const extension = path.extname(name || '').toLowerCase();
  return (
    mimeType.startsWith('text/') ||
    [
      '.md',
      '.markdown',
      '.json',
      '.jsonl',
      '.csv',
      '.tsv',
      '.html',
      '.htm',
      '.xml',
      '.yaml',
      '.yml',
      '.js',
      '.mjs',
      '.cjs',
      '.ts',
      '.tsx',
      '.jsx',
      '.css',
      '.py',
      '.rb',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.sh',
      '.sql',
      '.log',
      '.ini',
      '.toml',
    ].includes(extension) ||
    ['application/json', 'application/xml', 'application/x-yaml'].includes(mimeType)
  );
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function sanitizeFileName(name) {
  const clean = String(name || 'attachment')
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 120) || 'attachment';
}

function truncate(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated]`;
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
