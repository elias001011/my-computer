import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDefaultModelForProvider, isKnownProvider, providerCatalog } from './models.js';
import { assertLocalOllamaBaseUrl, isLocalOllamaBaseUrl } from './offline.js';
import { getProfileRuntimeHome, getProfilesIndexPath, getRuntimeHome } from './paths.js';

const fileLocks = new Map();
const USER_MEMORY_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
const USER_MEMORY_PROMPT_TOTAL_CHARS = 60000;
const USER_MEMORY_PROMPT_FILE_CHARS = 12000;
const ATTACHMENT_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const profileScope = new AsyncLocalStorage();
const defaultProfile = Object.freeze({
  id: 'default',
  name: 'Default',
});
let activeProfileId = 'default';
let activeRootRuntimeHome = getRuntimeHome();
let activePaths = buildProfilePaths(activeProfileId);

export const defaultConfig = Object.freeze({
  setupComplete: false,
  provider: 'groq',
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  language: 'auto',
  userNickname: '',
  technicalLevel: 'balanced',
  technicalGuidanceEnabled: true,
  systemPromptExtra: '',
  appearance: {
    theme: 'light',
    uiLanguage: 'en-US',
  },
  tools: {
    terminal: true,
    chatMemory: true,
    persistentMemory: true,
    autoCompact: true,
    chatTitle: true,
    webSearch: true,
    searchTerminal: false,
    searchMode: 'both',
    alwaysAllow: false,
    terminalMode: 'standard',
    deepInvestigation: false,
    userMemory: true,
    userMemoryEdit: false,
    chatDocuments: true,
  },
  userMemory: {
    sendFilesToPrompt: false,
    remindModelToUpdateFiles: false,
  },
  privacy: {
    offlineMode: false,
  },
  routing: {
    modelRotationEnabled: false,
    modelFallbacks: [],
    providerRotationEnabled: false,
    maxProviderPasses: 2,
    fallbacks: [],
  },
  context: {
    autoCompactEnabled: false,
    autoCompactChars: 24000,
    autoCompactMinMessages: 12,
    historyBudgetEnabled: true,
    historyBudgetChars: 28000,
  },
  email: {
    enabled: false,
    resendApiKey: '',
    destinationEmail: '',
    notifyOnScheduledTaskFailure: true,
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

export async function withProfileScope(profileId, action) {
  const index = await ensureProfilesIndex();
  const scopedProfileId = sanitizeProfileId(profileId || index.activeProfileId || 'default') || 'default';
  const profile = index.profiles.find((item) => item.id === scopedProfileId);
  if (!profile) {
    const error = new Error('Seção não encontrada.');
    error.statusCode = 404;
    throw error;
  }
  return profileScope.run({ profileId: profile.id, paths: buildProfilePaths(profile.id) }, action);
}

export async function ensureRuntime() {
  refreshRuntimeRootIfNeeded();
  await ensureProfilesIndex();
  const paths = getActivePaths();
  await fs.mkdir(paths.runtimeHome, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.chatsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.userMemoryDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(paths.runtimeHome, 'logs'), { recursive: true, mode: 0o700 });
  await ensureTextFile(
    paths.persistentMemoryPath,
    '# Memória persistente\n\nUse este arquivo para informações duráveis entre todos os chats.\n',
  );
  await ensureJsonFile(paths.userMemoryIndexPath, []);
  await ensureJsonFile(paths.scheduledTasksPath, []);

  try {
    await fs.access(paths.configPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeJson(paths.configPath, defaultConfig, 0o600);
  }
}

export async function loadConfig() {
  await ensureRuntime();
  const config = await readJson(getActivePaths().configPath, defaultConfig);
  return normalizeConfig(config);
}

export async function saveConfig(patch = {}) {
  const configFilePath = getActivePaths().configPath;
  return withFileLock(configFilePath, async () => {
    const current = await loadConfig();
    const privacy = normalizePrivacySettings({
      ...current.privacy,
      ...(patch.privacy || {}),
    });
    const requestedProvider = normalizeProviderId(patch.provider || current.provider);
    const provider = privacy.offlineMode ? 'ollama' : requestedProvider;
    const providerSettings = normalizeProviderSettings(mergeProviderSettings(current.providerSettings, patch.providerSettings), {
      offlineMode: privacy.offlineMode,
    });
    const requestedModel = String(patch.model || current.model || getDefaultModelForProvider(provider)).trim();
    const model = privacy.offlineMode && requestedProvider !== 'ollama' ? getDefaultModelForProvider('ollama') : requestedModel;

    if (Object.hasOwn(patch, 'apiKey') && patch.apiKey !== undefined) {
      providerSettings[provider] = {
        ...providerSettings[provider],
        apiKeys: normalizeApiKeyEntries([patch.apiKey]),
      };
    }

    const next = {
      ...current,
      provider,
      model,
      language: String(patch.language || current.language || 'auto').trim(),
      userNickname: String(patch.userNickname ?? current.userNickname ?? '').trim(),
      technicalLevel: normalizeTechnicalLevel(patch.technicalLevel ?? current.technicalLevel),
      technicalGuidanceEnabled:
        patch.technicalGuidanceEnabled === undefined
          ? current.technicalGuidanceEnabled !== false
          : patch.technicalGuidanceEnabled !== false,
      systemPromptExtra: String(patch.systemPromptExtra ?? current.systemPromptExtra ?? '').trim(),
      appearance: normalizeAppearanceSettings({
        ...current.appearance,
        ...(patch.appearance || {}),
      }),
      tools: normalizeTools(mergeToolsSettings(current.tools, patch.tools), { offlineMode: privacy.offlineMode }),
      userMemory: normalizeUserMemorySettings({
        ...current.userMemory,
        ...(patch.userMemory || {}),
      }),
      privacy,
      context: normalizeContextSettings({
        ...current.context,
        ...(patch.context || {}),
      }),
      email: normalizeEmailSettings({
        ...current.email,
        ...(patch.email || {}),
      }),
      routing: normalizeRoutingSettings({
        ...current.routing,
        ...(patch.routing || {}),
      }, { offlineMode: privacy.offlineMode }),
      server: normalizeServerSettings({
        ...current.server,
        ...(patch.server || {}),
      }),
      providerSettings,
      customModels: normalizeCustomModels({
        ...current.customModels,
        ...(patch.customModels || {}),
      }),
      modelCapabilities: normalizeModelCapabilities(mergeModelCapabilities(current.modelCapabilities, patch.modelCapabilities)),
      setupComplete: Boolean(patch.setupComplete ?? true),
      updatedAt: new Date().toISOString(),
    };
    next.apiKey = getPrimaryApiKey(next.providerSettings, next.provider);

    await writeJson(configFilePath, next, 0o600);
    await appendEvent({ type: 'config.updated', details: { provider: next.provider, model: next.model } });
    return next;
  });
}

export async function replaceConfig(config = {}) {
  const configFilePath = getActivePaths().configPath;
  return withFileLock(configFilePath, async () => {
    await ensureRuntime();
    const next = normalizeConfig({
      ...config,
      setupComplete: Boolean(config.setupComplete ?? true),
      updatedAt: new Date().toISOString(),
    });
    next.apiKey = getPrimaryApiKey(next.providerSettings, next.provider);

    await writeJson(configFilePath, next, 0o600);
    await appendEvent({ type: 'config.replaced', details: { provider: next.provider, model: next.model } });
    return next;
  });
}

export function sanitizeConfig(config) {
  const privacy = normalizePrivacySettings(config.privacy);
  const providerSettings = normalizeProviderSettings(config.providerSettings || {}, { offlineMode: privacy.offlineMode });
  return {
    setupComplete: Boolean(config.setupComplete),
    provider: normalizeProviderId(config.provider),
    model: config.model,
    language: config.language,
    userNickname: config.userNickname,
    technicalLevel: normalizeTechnicalLevel(config.technicalLevel),
    technicalGuidanceEnabled: config.technicalGuidanceEnabled !== false,
    systemPromptExtra: config.systemPromptExtra,
    appearance: normalizeAppearanceSettings(config.appearance),
    tools: normalizeTools(config.tools, { offlineMode: privacy.offlineMode }),
    userMemory: normalizeUserMemorySettings(config.userMemory),
    privacy,
    context: normalizeContextSettings(config.context),
    email: normalizeEmailSettings(config.email),
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
  const entries = await fs.readdir(getActivePaths().chatsDir, { withFileTypes: true });
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

export async function createChat(title = 'New chat', options = {}) {
  await ensureRuntime();
  const now = new Date();
  const id = `${stamp(now)}-${crypto.randomUUID().slice(0, 8)}`;
  const chatDir = getChatDir(id);
  const provider = normalizeProviderId(options.provider || defaultConfig.provider);
  const metadata = {
    id,
    title: normalizeTitle(title),
    folder: normalizeChatFolder(options.folder || ''),
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
  if (!metadata) {
    const error = new Error('Chat não encontrado.');
    error.statusCode = 404;
    throw error;
  }
  const chatDir = getChatDir(id);
  const attachments = await listAttachments(id);
  const messages = sanitizeMessagesForAvailableAttachments(await readJson(path.join(chatDir, 'messages.json'), []), attachments);
  const memory = await readText(metadata.paths.memory, '');
  const contextSummary = await readText(metadata.paths.context, '');
  return { ...metadata, messages, attachments, memory, contextSummary };
}

export async function appendMessages(id, messages) {
  assertChatId(id);
  const chatDir = getChatDir(id);
  const messagesPath = path.join(chatDir, 'messages.json');
  return withFileLock(messagesPath, async () => {
    const current = await readJson(messagesPath, []);
    const next = [...current, ...messages];
    await writeJson(messagesPath, next, 0o600);
    await touchChat(id);
    return next;
  });
}

export async function updateMessage(id, messageId, patch) {
  assertChatId(id);
  const chatDir = getChatDir(id);
  const messagesPath = path.join(chatDir, 'messages.json');
  return withFileLock(messagesPath, async () => {
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
  });
}

export async function updateChatMetadata(id, patch) {
  assertChatId(id);
  const metadataPath = path.join(getChatDir(id), 'metadata.json');
  return withFileLock(metadataPath, async () => {
    const metadata = await readChatMetadata(id);
    const next = {
      ...metadata,
      ...patch,
      title: patch.title ? normalizeTitle(patch.title) : metadata.title,
      folder:
        Object.hasOwn(patch, 'folder') && patch.folder !== undefined
          ? normalizeChatFolder(patch.folder)
          : normalizeChatFolder(metadata.folder || ''),
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
    await writeJson(metadataPath, next, 0o600);
    return next;
  });
}

export async function deleteChat(id) {
  assertChatId(id);
  const metadata = await readChatMetadata(id);
  await fs.rm(getChatDir(id), { recursive: true, force: true });
  await appendEvent({ type: 'chat.deleted', chatId: id, details: { title: metadata.title } });
}

export async function deleteAllChats() {
  await ensureRuntime();
  const chats = await listChats();
  const paths = getActivePaths();
  await fs.rm(paths.chatsDir, { recursive: true, force: true });
  await fs.mkdir(paths.chatsDir, { recursive: true, mode: 0o700 });
  await appendEvent({ type: 'chats.deleted_all', details: { count: chats.length } });
  return { count: chats.length };
}

export async function readMemory(id) {
  const chat = await readChat(id);
  return chat.memory;
}

export async function writeMemory(id, content) {
  await updateMemory(id, () => String(content || ''));
  return readChat(id);
}

export async function updateMemory(id, updater) {
  assertChatId(id);
  const metadata = await readChatMetadata(id);
  return withFileLock(metadata.paths.memory, async () => {
    const previousContent = await readText(metadata.paths.memory, '');
    const nextValue = await updater(previousContent);
    const content = String(nextValue ?? '');
    await fs.writeFile(metadata.paths.memory, content, { mode: 0o600 });
    await touchChat(id);
    await appendEvent({ type: 'chat.memory.updated', chatId: id });
    return {
      previousContent,
      content,
      path: metadata.paths.memory,
    };
  });
}

export async function readPersistentMemory() {
  await ensureRuntime();
  return readText(getActivePaths().persistentMemoryPath, '');
}

export async function writePersistentMemory(content) {
  const result = await updatePersistentMemory(() => String(content || ''));
  return result.content;
}

export async function updatePersistentMemory(updater) {
  await ensureRuntime();
  const memoryPath = getActivePaths().persistentMemoryPath;
  return withFileLock(memoryPath, async () => {
    const previousContent = await readText(memoryPath, '');
    const nextValue = await updater(previousContent);
    const content = String(nextValue ?? '');
    await fs.writeFile(memoryPath, content, { mode: 0o600 });
    await appendEvent({ type: 'memory.persistent.updated', details: { path: memoryPath } });
    return {
      previousContent,
      content,
      path: memoryPath,
    };
  });
}

export async function listUserMemoryFiles() {
  await ensureRuntime();
  const files = await readJson(getActivePaths().userMemoryIndexPath, []);
  return normalizeUserMemoryFiles(files);
}

export async function listUserMemoryFilesWithHints() {
  const files = await listUserMemoryFiles();
  return Promise.all(files.map((file) => addUserMemoryFileHints(file)));
}

async function addUserMemoryFileHints(file = {}) {
  const storageName = path.basename(file.path || '');
  const hint = {
    displayName: file.name,
    storageName,
    title: '',
    preview: '',
  };
  try {
    const content = await fs.readFile(assertUserMemoryPath(file.path), 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const heading = lines.find((line) => /^#{1,6}\s+/.test(line));
    const firstBodyLine = lines.find((line) => !/^#{1,6}\s+/.test(line)) || '';
    hint.title = heading ? heading.replace(/^#{1,6}\s+/, '').trim().slice(0, 160) : '';
    hint.preview = truncate(firstBodyLine || heading || '', 280).replace(/\n\.\.\.\[truncated\]$/, '...');
  } catch {
    hint.preview = 'Arquivo indisponível para prévia no momento.';
  }
  return { ...file, ...hint };
}

export async function saveUserMemoryFile(file = {}) {
  await ensureRuntime();
  const name = sanitizeFileName(file.name || 'memory.md');
  const mimeType = String(file.mimeType || file.type || guessMimeType(name)).slice(0, 120);
  if (!isUserMemoryCompatible(mimeType, name)) {
    const error = new Error('Arquivo de memória incompatível. Use Markdown, texto, HTML, JSON, CSV, YAML, XML, código ou logs.');
    error.statusCode = 415;
    throw error;
  }

  const rawBase64 = String(file.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = rawBase64 ? Buffer.from(rawBase64, 'base64') : Buffer.from(String(file.content || ''), 'utf8');
  if (!buffer.length) {
    const error = new Error('Arquivo de memória sem conteúdo.');
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > USER_MEMORY_FILE_LIMIT_BYTES) {
    const error = new Error('Arquivo de memória muito grande. Limite atual: 5 MB por arquivo.');
    error.statusCode = 413;
    throw error;
  }

  const paths = getActivePaths();
  await fs.mkdir(paths.userMemoryDir, { recursive: true, mode: 0o700 });
  const id = crypto.randomUUID();
  const fileName = `${id}-${name}`;
  const filePath = path.join(paths.userMemoryDir, fileName);
  await fs.writeFile(filePath, buffer, { mode: 0o600 });
  const now = new Date().toISOString();
  const entry = {
    id,
    name,
    mimeType,
    size: buffer.length,
    path: filePath,
    editable: isUserMemoryEditable(mimeType, name),
    createdAt: now,
    updatedAt: now,
  };

  await withFileLock(paths.userMemoryIndexPath, async () => {
    const files = normalizeUserMemoryFiles(await readJson(paths.userMemoryIndexPath, []));
    await writeJson(paths.userMemoryIndexPath, [...files, entry], 0o600);
  });
  await appendEvent({ type: 'memory.user_file.created', details: { name, size: buffer.length } });
  return entry;
}

export async function readUserMemoryFile(identifier) {
  await ensureRuntime();
  const entry = await findUserMemoryFile(identifier);
  const resolved = assertUserMemoryPath(entry.path);
  const content = await fs.readFile(resolved, 'utf8');
  return { ...entry, content };
}

export async function readUserMemoryFileWithHints(identifier) {
  const file = await readUserMemoryFile(identifier);
  return addUserMemoryFileHints(file);
}

export async function deleteUserMemoryFile(identifier) {
  await ensureRuntime();
  const paths = getActivePaths();
  const deleted = await withFileLock(paths.userMemoryIndexPath, async () => {
    const files = normalizeUserMemoryFiles(await readJson(paths.userMemoryIndexPath, []));
    const target = findUserMemoryFileInList(files, identifier);
    if (!target) return null;
    await fs.rm(assertUserMemoryPath(target.path), { force: true });
    await writeJson(
      paths.userMemoryIndexPath,
      files.filter((item) => item.id !== target.id),
      0o600,
    );
    return target;
  });
  if (deleted) await appendEvent({ type: 'memory.user_file.deleted', details: { name: deleted.name } });
  return deleted;
}

export async function writeUserMemoryFileContent(identifier, content) {
  await ensureRuntime();
  const paths = getActivePaths();
  const target = await findUserMemoryFile(identifier);
  if (!target.editable) {
    const error = new Error('Este arquivo de memória não está marcado como editável.');
    error.statusCode = 415;
    throw error;
  }
  const nextContent = String(content ?? '');
  const nextSize = Buffer.byteLength(nextContent, 'utf8');
  if (nextSize > USER_MEMORY_FILE_LIMIT_BYTES) {
    const error = new Error('Arquivo de memória muito grande. Limite atual: 5 MB por arquivo.');
    error.statusCode = 413;
    throw error;
  }
  const filePath = assertUserMemoryPath(target.path);
  return withFileLock(filePath, async () => {
    const previousContent = await fs.readFile(filePath, 'utf8');
    const updatedAt = new Date().toISOString();
    await fs.writeFile(filePath, nextContent, { mode: 0o600 });
    await withFileLock(paths.userMemoryIndexPath, async () => {
      const files = normalizeUserMemoryFiles(await readJson(paths.userMemoryIndexPath, []));
      await writeJson(
        paths.userMemoryIndexPath,
        files.map((item) =>
          item.id === target.id
            ? {
                ...item,
                size: nextSize,
                updatedAt,
              }
            : item,
        ),
        0o600,
      );
    });
    await appendEvent({ type: 'memory.user_file.manual_updated', details: { name: target.name, size: nextSize } });
    return {
      file: {
        ...target,
        size: nextSize,
        updatedAt,
      },
      previousContent,
      content: nextContent,
      path: filePath,
    };
  });
}

export async function replaceTextInUserMemoryFile(identifier, oldText, newText) {
  await ensureRuntime();
  const paths = getActivePaths();
  const target = await findUserMemoryFile(identifier);
  if (!target.editable) {
    const error = new Error('Este arquivo de memória não está marcado como editável.');
    error.statusCode = 415;
    throw error;
  }
  const filePath = assertUserMemoryPath(target.path);
  return withFileLock(filePath, async () => {
    const previousContent = await fs.readFile(filePath, 'utf8');
    const needle = String(oldText ?? '');
    if (!needle) {
      const error = new Error('oldText é obrigatório para editar arquivo de memória.');
      error.statusCode = 400;
      throw error;
    }
    if (!previousContent.includes(needle)) {
      const error = new Error('Trecho oldText não encontrado no arquivo de memória.');
      error.statusCode = 409;
      throw error;
    }
    const content = previousContent.replace(needle, String(newText ?? ''));
    await fs.writeFile(filePath, content, { mode: 0o600 });
    const updatedAt = new Date().toISOString();
    await withFileLock(paths.userMemoryIndexPath, async () => {
      const files = normalizeUserMemoryFiles(await readJson(paths.userMemoryIndexPath, []));
      await writeJson(
        paths.userMemoryIndexPath,
        files.map((item) =>
          item.id === target.id
            ? {
                ...item,
                size: Buffer.byteLength(content, 'utf8'),
                updatedAt,
              }
            : item,
        ),
        0o600,
      );
    });
    await appendEvent({ type: 'memory.user_file.edited', details: { name: target.name, path: filePath } });
    return {
      file: {
        ...target,
        size: Buffer.byteLength(content, 'utf8'),
        updatedAt,
      },
      previousContent,
      content,
      path: filePath,
    };
  });
}

export async function searchUserMemoryFiles(keyword, options = {}) {
  const needle = String(keyword || '').trim().toLowerCase();
  if (!needle) return [];
  const maxMatches = clampInteger(options.maxMatches, 1, 50, 20);
  const contextChars = clampInteger(options.contextChars, 20, 1000, 200);
  const files = await listUserMemoryFiles();
  const matches = [];
  for (const file of files) {
    if (matches.length >= maxMatches) break;
    let content;
    try {
      content = (await readUserMemoryFile(file.id)).content;
    } catch {
      continue;
    }
    const haystack = content.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1 && matches.length < maxMatches) {
      matches.push({
        fileId: file.id,
        fileName: file.name,
        offset: index,
        snippet: content.slice(Math.max(0, index - contextChars), index + needle.length + contextChars),
      });
      index = haystack.indexOf(needle, index + needle.length);
    }
  }
  return matches;
}

// Tool names a scheduled task is allowed to pick from. Kept as a local list
// (rather than importing tools.js) since store.js only needs the name set,
// not the definitions, and tools.js does not import store.js.
const KNOWN_SCHEDULED_TASK_TOOL_NAMES = [
  'run_terminal_command',
  'web_search',
  'memory_chat',
  'persistent_memory',
  'persistent_memory_user',
  'edit_persistent_memory_user',
  'chat_document',
  'compact_context',
  'rename_chat',
  'send_email',
];
const SCHEDULED_TASK_LEASE_STALE_MS = 10 * 60 * 1000;

const VALID_SCHEDULE_TIMEZONES = (() => {
  try {
    return new Set(Intl.supportedValuesOf('timeZone'));
  } catch {
    return null; // older runtime without supportedValuesOf: skip validation, trust the input
  }
})();

function normalizeScheduleTimezone(timezone) {
  const value = String(timezone || 'UTC').trim() || 'UTC';
  if (VALID_SCHEDULE_TIMEZONES && !VALID_SCHEDULE_TIMEZONES.has(value)) return 'UTC';
  return value;
}

function normalizeScheduleConfig(schedule = {}) {
  if (schedule.type === 'interval') {
    return { type: 'interval', everyHours: numberInRange(schedule.everyHours, 0.1, 24 * 30) || 6 };
  }
  if (schedule.type === 'weekly') {
    const daysOfWeek = Array.isArray(schedule.daysOfWeek)
      ? [...new Set(schedule.daysOfWeek.map((day) => clampInteger(day, 0, 6, null)).filter((day) => day !== null))].sort()
      : [];
    return {
      type: 'weekly',
      daysOfWeek: daysOfWeek.length ? daysOfWeek : [1],
      hour: clampInteger(schedule.hour, 0, 23, 9),
      minute: clampInteger(schedule.minute, 0, 59, 0),
      timezone: normalizeScheduleTimezone(schedule.timezone),
    };
  }
  if (schedule.type === 'monthly') {
    return {
      type: 'monthly',
      dayOfMonth: clampInteger(schedule.dayOfMonth, 1, 31, 1),
      hour: clampInteger(schedule.hour, 0, 23, 9),
      minute: clampInteger(schedule.minute, 0, 59, 0),
      timezone: normalizeScheduleTimezone(schedule.timezone),
    };
  }
  return {
    type: 'daily',
    hour: clampInteger(schedule.hour, 0, 23, 9),
    minute: clampInteger(schedule.minute, 0, 59, 0),
    timezone: normalizeScheduleTimezone(schedule.timezone),
  };
}

function getTimezoneOffsetMinutes(timezone, date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function nextDailyOccurrence(hour, minute, timezone, fromDate) {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, fromDate);
  const localNow = new Date(fromDate.getTime() + offsetMinutes * 60000);
  const candidateLocal = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), hour, minute, 0, 0),
  );
  let candidateUtc = new Date(candidateLocal.getTime() - offsetMinutes * 60000);
  if (candidateUtc.getTime() <= fromDate.getTime()) {
    candidateUtc = new Date(candidateUtc.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidateUtc;
}

function nextWeeklyOccurrence(daysOfWeek, hour, minute, timezone, fromDate) {
  for (let daysAhead = 0; daysAhead < 8; daysAhead += 1) {
    const probeUtc = new Date(fromDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const offsetMinutes = getTimezoneOffsetMinutes(timezone, probeUtc);
    const localProbe = new Date(probeUtc.getTime() + offsetMinutes * 60000);
    if (!daysOfWeek.includes(localProbe.getUTCDay())) continue;
    const candidateLocal = new Date(
      Date.UTC(localProbe.getUTCFullYear(), localProbe.getUTCMonth(), localProbe.getUTCDate(), hour, minute, 0, 0),
    );
    const candidateUtc = new Date(candidateLocal.getTime() - offsetMinutes * 60000);
    if (candidateUtc.getTime() > fromDate.getTime()) return candidateUtc;
  }
  return new Date(fromDate.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function nextMonthlyOccurrence(dayOfMonth, hour, minute, timezone, fromDate) {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, fromDate);
  const localNow = new Date(fromDate.getTime() + offsetMinutes * 60000);
  for (let monthsAhead = 0; monthsAhead <= 1; monthsAhead += 1) {
    const targetYear = localNow.getUTCFullYear();
    const targetMonth = localNow.getUTCMonth() + monthsAhead;
    const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(dayOfMonth, daysInMonth);
    const candidateLocal = new Date(Date.UTC(targetYear, targetMonth, clampedDay, hour, minute, 0, 0));
    const candidateUtc = new Date(candidateLocal.getTime() - offsetMinutes * 60000);
    if (candidateUtc.getTime() > fromDate.getTime()) return candidateUtc;
  }
  return new Date(fromDate.getTime() + 30 * 24 * 60 * 60 * 1000);
}

export function computeNextRunAt(schedule, fromDate = new Date()) {
  const normalized = normalizeScheduleConfig(schedule);
  if (normalized.type === 'interval') {
    return new Date(fromDate.getTime() + normalized.everyHours * 60 * 60 * 1000).toISOString();
  }
  if (normalized.type === 'weekly') {
    return nextWeeklyOccurrence(normalized.daysOfWeek, normalized.hour, normalized.minute, normalized.timezone, fromDate).toISOString();
  }
  if (normalized.type === 'monthly') {
    return nextMonthlyOccurrence(normalized.dayOfMonth, normalized.hour, normalized.minute, normalized.timezone, fromDate).toISOString();
  }
  return nextDailyOccurrence(normalized.hour, normalized.minute, normalized.timezone, fromDate).toISOString();
}

function normalizeScheduledTask(task = {}, existing = null) {
  const now = new Date().toISOString();
  const allowedTools = Array.isArray(task.allowedTools)
    ? task.allowedTools.filter((name) => KNOWN_SCHEDULED_TASK_TOOL_NAMES.includes(name))
    : existing?.allowedTools || [];
  const schedule = normalizeScheduleConfig(task.schedule || existing?.schedule || {});
  return {
    id: existing?.id || crypto.randomUUID(),
    name: String(task.name ?? existing?.name ?? 'Tarefa agendada').trim().slice(0, 200) || 'Tarefa agendada',
    enabled: task.enabled === undefined ? existing?.enabled ?? true : task.enabled !== false,
    prompt: String(task.prompt ?? existing?.prompt ?? '').trim(),
    systemPrompt: String(task.systemPrompt ?? existing?.systemPrompt ?? '').trim().slice(0, 4000),
    provider: task.provider !== undefined ? normalizeProviderId(task.provider) : existing?.provider,
    model: task.model !== undefined ? String(task.model || '').trim() : existing?.model,
    allowedTools,
    reuseChat: task.reuseChat === undefined ? existing?.reuseChat ?? true : task.reuseChat !== false,
    chatId: task.chatId !== undefined ? task.chatId : existing?.chatId || null,
    skipMemoryInPrompt:
      task.skipMemoryInPrompt === undefined ? existing?.skipMemoryInPrompt ?? true : task.skipMemoryInPrompt !== false,
    schedule,
    nextRunAt: existing?.nextRunAt || computeNextRunAt(schedule),
    lastRunAt: existing?.lastRunAt || null,
    lastRunStatus: existing?.lastRunStatus || null,
    lastRunError: existing?.lastRunError || null,
    runningSince: existing?.runningSince || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export async function listScheduledTasks() {
  await ensureRuntime();
  const tasks = await readJson(getActivePaths().scheduledTasksPath, []);
  return Array.isArray(tasks) ? tasks : [];
}

export async function getScheduledTask(id) {
  const tasks = await listScheduledTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    const error = new Error('Tarefa agendada não encontrada.');
    error.statusCode = 404;
    throw error;
  }
  return task;
}

export async function createScheduledTask(input = {}) {
  await ensureRuntime();
  const paths = getActivePaths();
  return withFileLock(paths.scheduledTasksPath, async () => {
    const tasks = await readJson(paths.scheduledTasksPath, []);
    const task = normalizeScheduledTask(input);
    await writeJson(paths.scheduledTasksPath, [...tasks, task], 0o600);
    await appendEvent({ type: 'scheduledTask.created', details: { id: task.id, name: task.name } });
    return task;
  });
}

export async function updateScheduledTask(id, patch = {}) {
  const paths = getActivePaths();
  return withFileLock(paths.scheduledTasksPath, async () => {
    const tasks = await readJson(paths.scheduledTasksPath, []);
    let updated = null;
    const next = tasks.map((task) => {
      if (task.id !== id) return task;
      const scheduleChanged = Boolean(patch.schedule) && JSON.stringify(patch.schedule) !== JSON.stringify(task.schedule);
      updated = normalizeScheduledTask({ ...task, ...patch }, task);
      if (scheduleChanged) updated.nextRunAt = computeNextRunAt(updated.schedule);
      return updated;
    });
    if (!updated) {
      const error = new Error('Tarefa agendada não encontrada.');
      error.statusCode = 404;
      throw error;
    }
    await writeJson(paths.scheduledTasksPath, next, 0o600);
    await appendEvent({ type: 'scheduledTask.updated', details: { id } });
    return updated;
  });
}

export async function deleteScheduledTask(id) {
  const paths = getActivePaths();
  return withFileLock(paths.scheduledTasksPath, async () => {
    const tasks = await readJson(paths.scheduledTasksPath, []);
    const next = tasks.filter((task) => task.id !== id);
    if (next.length === tasks.length) {
      const error = new Error('Tarefa agendada não encontrada.');
      error.statusCode = 404;
      throw error;
    }
    await writeJson(paths.scheduledTasksPath, next, 0o600);
    await appendEvent({ type: 'scheduledTask.deleted', details: { id } });
    return { id };
  });
}

// Atomic lease: returns the task with `runningSince` set if it was free (or
// the previous lease was stale, e.g. the process crashed mid-run), or null
// if another tick/process already holds a fresh lease.
export async function claimScheduledTaskRun(id) {
  const paths = getActivePaths();
  return withFileLock(paths.scheduledTasksPath, async () => {
    const tasks = await readJson(paths.scheduledTasksPath, []);
    const task = tasks.find((item) => item.id === id);
    if (!task) return null;
    if (task.runningSince) {
      const age = Date.now() - new Date(task.runningSince).getTime();
      if (age < SCHEDULED_TASK_LEASE_STALE_MS) return null;
    }
    const claimed = { ...task, runningSince: new Date().toISOString() };
    await writeJson(paths.scheduledTasksPath, tasks.map((item) => (item.id === id ? claimed : item)), 0o600);
    return claimed;
  });
}

export async function releaseScheduledTaskRun(id, { status, error = null, nextRunAt } = {}) {
  const paths = getActivePaths();
  return withFileLock(paths.scheduledTasksPath, async () => {
    const tasks = await readJson(paths.scheduledTasksPath, []);
    let updated = null;
    const next = tasks.map((task) => {
      if (task.id !== id) return task;
      updated = {
        ...task,
        runningSince: null,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: status || 'unknown',
        lastRunError: error,
        nextRunAt: nextRunAt || task.nextRunAt,
        updatedAt: new Date().toISOString(),
      };
      return updated;
    });
    if (updated) await writeJson(paths.scheduledTasksPath, next, 0o600);
    return updated;
  });
}

export async function buildUserMemoryPromptContext(config = {}) {
  const files = await listUserMemoryFilesWithHints();
  const sendFullContent = config.userMemory?.sendFilesToPrompt === true;
  const promptFiles = [];
  let remaining = USER_MEMORY_PROMPT_TOTAL_CHARS;
  if (sendFullContent) {
    for (const file of files) {
      if (remaining <= 0) break;
      try {
        const full = await readUserMemoryFile(file.id);
        const limit = Math.min(USER_MEMORY_PROMPT_FILE_CHARS, remaining);
        const content = truncate(full.content, limit);
        remaining -= content.length;
        promptFiles.push({ ...file, content, truncated: full.content.length > content.length });
      } catch {
        promptFiles.push({ ...file, content: '', readError: true });
      }
    }
  }
  return {
    mode: sendFullContent ? 'full' : 'index',
    files,
    promptFiles,
    totalContentLimit: USER_MEMORY_PROMPT_TOTAL_CHARS,
  };
}

export async function readContextSummary(id) {
  const chat = await readChat(id);
  return chat.contextSummary;
}

export async function writeContextSummary(id, content) {
  const chat = await readChat(id);
  // Locked on the same path redactDeletedAttachmentContextFiles() uses, so deleting an
  // attachment mid-compaction can't lose its redaction to this write (lost-update race).
  await withFileLock(chat.paths.context, () => fs.writeFile(chat.paths.context, String(content || ''), { mode: 0o600 }));
  await touchChat(id);
  await appendEvent({ type: 'chat.context.compacted', chatId: id });
  return readChat(id);
}

export async function saveCurrentContextWindow(id, content) {
  const chat = await readChat(id);
  await withFileLock(chat.paths.contextWindow, () =>
    fs.writeFile(chat.paths.contextWindow, String(content || ''), { mode: 0o600 }),
  );
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
  if (buffer.length > ATTACHMENT_FILE_LIMIT_BYTES) {
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

  const attachmentsPath = getAttachmentsMetadataPath(id);
  await withFileLock(attachmentsPath, async () => {
    const attachments = await readJson(attachmentsPath, []);
    await writeJson(attachmentsPath, [...attachments, attachment], 0o600);
  });
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
  const attachment = findAttachmentInList(await listAttachments(id), attachmentId);
  if (!attachment) {
    const error = new Error('Anexo não encontrado.');
    error.statusCode = 404;
    throw error;
  }
  return attachment;
}

export async function readAttachmentFile(id, attachmentId) {
  const attachment = await readAttachment(id, attachmentId);
  const resolved = assertAttachmentPath(id, attachment.path);
  return {
    attachment,
    data: await fs.readFile(resolved),
  };
}

export async function readAttachmentTextContent(id, attachmentId) {
  const { attachment, data } = await readAttachmentFile(id, attachmentId);
  assertTextEditableAttachment(attachment);
  return {
    attachment,
    content: data.toString('utf8').replace(/\u0000/g, ''),
  };
}

export async function writeAttachmentTextContent(id, attachmentId, content) {
  assertChatId(id);
  const target = await readAttachment(id, attachmentId);
  assertTextEditableAttachment(target);
  const filePath = assertAttachmentPath(id, target.path);
  const nextContent = String(content ?? '');
  const buffer = Buffer.from(nextContent, 'utf8');
  if (buffer.length > ATTACHMENT_FILE_LIMIT_BYTES) {
    const error = new Error('Arquivo muito grande. Limite atual: 20 MB por arquivo.');
    error.statusCode = 413;
    throw error;
  }

  return withFileLock(filePath, async () => {
    const previousContent = (await fs.readFile(filePath)).toString('utf8').replace(/\u0000/g, '');
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    const attachment = await updateAttachmentAfterWrite(id, target, buffer);
    await appendEvent({ type: 'chat.attachment.manual_updated', chatId: id, details: { name: attachment.name, size: attachment.size } });
    return { attachment, previousContent, content: nextContent, path: filePath };
  });
}

export async function replaceTextInAttachment(id, attachmentId, oldText, newText) {
  assertChatId(id);
  const target = await readAttachment(id, attachmentId);
  assertTextEditableAttachment(target);
  const filePath = assertAttachmentPath(id, target.path);
  return withFileLock(filePath, async () => {
    const previousContent = (await fs.readFile(filePath)).toString('utf8').replace(/\u0000/g, '');
    const needle = String(oldText ?? '');
    if (!needle) {
      const error = new Error('oldText é obrigatório para editar o documento anexado.');
      error.statusCode = 400;
      throw error;
    }
    if (!previousContent.includes(needle)) {
      const error = new Error('Trecho oldText não encontrado no documento anexado.');
      error.statusCode = 409;
      throw error;
    }
    const content = previousContent.replace(needle, String(newText ?? ''));
    const buffer = Buffer.from(content, 'utf8');
    if (buffer.length > ATTACHMENT_FILE_LIMIT_BYTES) {
      const error = new Error('Arquivo muito grande. Limite atual: 20 MB por arquivo.');
      error.statusCode = 413;
      throw error;
    }
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    const attachment = await updateAttachmentAfterWrite(id, target, buffer);
    await appendEvent({ type: 'chat.attachment.edited', chatId: id, details: { name: attachment.name, path: filePath } });
    return { attachment, previousContent, content, path: filePath };
  });
}

export async function deleteAttachment(id, attachmentId) {
  const attachmentsPath = getAttachmentsMetadataPath(id);
  const deletedAt = new Date().toISOString();
  const attachment = await withFileLock(attachmentsPath, async () => {
    const attachments = await readJson(attachmentsPath, []);
    const target = attachments.find((item) => item.id === attachmentId);
    if (!target) return null;
    const filePath = assertAttachmentPath(id, target.path);
    let data = null;
    try {
      data = await fs.readFile(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rm(filePath, { force: true });
    await writeJson(
      attachmentsPath,
      attachments.filter((item) => item.id !== attachmentId),
      0o600,
    );
    return { ...target, deletedAt, deletionData: data };
  });
  if (!attachment) return;
  const redactionPlan = createAttachmentRedactionPlan(attachment, attachment.deletionData);
  await redactDeletedAttachmentReferencesInMessages(id, attachment, redactionPlan);
  await redactDeletedAttachmentContextFiles(id, redactionPlan);
  await redactDeletedAttachmentEvents(id, redactionPlan);
  await touchChat(id);
  await appendEvent({ type: 'chat.attachment.deleted', chatId: id, details: { name: attachment.name } });
}

export async function readEvents(options = {}) {
  const limit = typeof options === 'number' ? options : Number(options.limit || 80);
  const chatId = typeof options === 'object' ? options.chatId : null;
  await ensureRuntime();
  let raw = '';
  try {
    raw = await fs.readFile(getActivePaths().eventsPath, 'utf8');
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
  await ensureProfilesIndex();
  const paths = getActivePaths();
  await fs.mkdir(paths.runtimeHome, { recursive: true, mode: 0o700 });
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    profileId: getScopedProfileId(),
    ...event,
  };
  await fs.appendFile(paths.eventsPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return entry;
}

export async function getRuntimeInfo() {
  await ensureRuntime();
  const profiles = await listProfiles();
  const scopedProfileId = getScopedProfileId();
  return {
    runtimeHome: getActivePaths().runtimeHome,
    rootRuntimeHome: getRuntimeHome(),
    activeProfileId: scopedProfileId,
    activeProfile: profiles.find((profile) => profile.id === scopedProfileId) || profiles[0],
    profiles,
  };
}

export async function listProfiles() {
  const index = await ensureProfilesIndex();
  return normalizeProfilesIndex(index).profiles;
}

export async function createProfile(name = 'Nova seção') {
  const index = await ensureProfilesIndex();
  const now = new Date().toISOString();
  const baseId = slugifyProfileId(name) || `profile-${Date.now()}`;
  const existingIds = new Set(index.profiles.map((profile) => profile.id));
  let id = baseId;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const profile = {
    id,
    name: normalizeProfileName(name),
    createdAt: now,
    updatedAt: now,
  };
  await writeProfilesIndex({
    ...index,
    activeProfileId: id,
    profiles: [...index.profiles, profile],
  });
  activeProfileId = id;
  activePaths = buildProfilePaths(id);
  await withProfileScope(id, async () => {
    await ensureRuntime();
    await appendEvent({ type: 'profile.created', details: { id, name: profile.name } });
  });
  return profile;
}

export async function activateProfile(id) {
  const index = await ensureProfilesIndex();
  const profile = index.profiles.find((item) => item.id === id);
  if (!profile) {
    const error = new Error('Seção não encontrada.');
    error.statusCode = 404;
    throw error;
  }
  await writeProfilesIndex({ ...index, activeProfileId: profile.id });
  activeProfileId = profile.id;
  activePaths = buildProfilePaths(profile.id);
  await withProfileScope(profile.id, async () => {
    await ensureRuntime();
    await appendEvent({ type: 'profile.activated', details: { id: profile.id, name: profile.name } });
  });
  return profile;
}

export async function updateProfile(id, patch = {}) {
  const index = await ensureProfilesIndex();
  const profiles = index.profiles.map((profile) =>
    profile.id === id
      ? {
          ...profile,
          name: normalizeProfileName(patch.name || profile.name),
          updatedAt: new Date().toISOString(),
        }
      : profile,
  );
  if (!profiles.some((profile) => profile.id === id)) {
    const error = new Error('Seção não encontrada.');
    error.statusCode = 404;
    throw error;
  }
  await writeProfilesIndex({ ...index, profiles });
  await appendEvent({ type: 'profile.updated', details: { id, name: patch.name } });
  return profiles.find((profile) => profile.id === id);
}

export async function deleteProfile(id) {
  if (id === 'default') {
    const error = new Error('A seção default não pode ser apagada.');
    error.statusCode = 400;
    throw error;
  }
  const index = await ensureProfilesIndex();
  const target = index.profiles.find((profile) => profile.id === id);
  if (!target) return null;
  const profiles = index.profiles.filter((profile) => profile.id !== id);
  const nextActiveProfileId = index.activeProfileId === id ? 'default' : index.activeProfileId;
  await fs.rm(getProfileRuntimeHome(id), { recursive: true, force: true });
  await writeProfilesIndex({ ...index, activeProfileId: nextActiveProfileId, profiles });
  activeProfileId = nextActiveProfileId;
  activePaths = buildProfilePaths(nextActiveProfileId);
  await withProfileScope(nextActiveProfileId, async () => {
    await ensureRuntime();
    await appendEvent({ type: 'profile.deleted', details: { id, name: target.name } });
  });
  return { ...target, activeProfileId: nextActiveProfileId };
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
        folder: normalizeChatFolder(fullChat.folder || ''),
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
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: (await getRuntimeInfo()).activeProfile,
    config: await loadConfig(),
    persistentMemory: await readPersistentMemory(),
    persistentMemoryUserFiles: await exportUserMemoryFiles(),
    chats,
    events: await readEvents({ limit: 10000 }),
  };
}

export async function importRuntimeData(payload = {}, options = {}) {
  await ensureRuntime();
  const settings = normalizeImportOptions(options);
  preflightRuntimeImport(payload, settings);
  const rollbackDir = await createRuntimeImportRollback();

  try {
    if (settings.config && payload.config) {
      await replaceConfig({
        ...payload.config,
        setupComplete: Boolean(payload.config.setupComplete ?? true),
      });
    }

    if (settings.persistentMemory && Object.hasOwn(payload, 'persistentMemory')) {
      await writePersistentMemory(payload.persistentMemory || '');
    }

    if (settings.persistentMemoryUser && Array.isArray(payload.persistentMemoryUserFiles)) {
      await importUserMemoryFiles(payload.persistentMemoryUserFiles);
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
        persistentMemoryUser: settings.persistentMemoryUser,
        attachments: settings.attachments,
        events: settings.events,
      },
    });

    return exportRuntimeData();
  } catch (error) {
    await restoreRuntimeImportRollback(rollbackDir);
    throw error;
  } finally {
    await fs.rm(rollbackDir, { recursive: true, force: true });
  }
}

async function createRuntimeImportRollback() {
  const source = getActivePaths().runtimeHome;
  const rollbackDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-import-rollback-'));
  await fs.cp(source, rollbackDir, { recursive: true, force: true, preserveTimestamps: true });
  return rollbackDir;
}

async function restoreRuntimeImportRollback(rollbackDir) {
  const target = getActivePaths().runtimeHome;
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.cp(rollbackDir, target, { recursive: true, force: true, preserveTimestamps: true });
}

function preflightRuntimeImport(payload = {}, settings = {}) {
  const paths = getActivePaths();
  if (settings.persistentMemoryUser && Array.isArray(payload.persistentMemoryUserFiles)) {
    for (const file of payload.persistentMemoryUserFiles.filter((item) => !item?.missing)) {
      prepareImportedUserMemoryFile(file, paths.userMemoryDir);
    }
  }
  if (settings.chats && settings.attachments !== false && Array.isArray(payload.chats)) {
    for (const chat of payload.chats) {
      validateImportedChatAttachments(chat.attachments || []);
    }
  }
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
  return path.join(getActivePaths().chatsDir, id);
}

async function readChatMetadata(id) {
  assertChatId(id);
  const metadata = await readJson(path.join(getChatDir(id), 'metadata.json'), null);
  if (!metadata) return metadata;
  const provider = normalizeProviderId(metadata.provider || defaultConfig.provider);
  return {
    ...metadata,
    provider,
    folder: normalizeChatFolder(metadata.folder || ''),
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
  const id = await getAvailableImportedChatId(importedMetadata.id);
  const chatDir = getChatDir(id);
  const provider = normalizeProviderId(importedMetadata.provider || defaultConfig.provider);
  const now = new Date().toISOString();
  const attachmentRedactionPlans = options.attachments === false ? createImportedAttachmentRedactionPlans(importedChat.attachments || []) : [];
  const metadata = {
    id,
    title: normalizeTitle(importedMetadata.title || 'Chat importado'),
    folder: normalizeChatFolder(importedMetadata.folder || ''),
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
  await writeJson(path.join(chatDir, 'messages.json'), normalizeImportedMessages(importedChat.messages, options, attachmentRedactionPlans), 0o600);
  await fs.writeFile(metadata.paths.memory, redactImportedAttachmentText(String(importedChat.memory || '# Chat memory\n'), attachmentRedactionPlans), { mode: 0o600 });
  await fs.writeFile(metadata.paths.context, redactImportedAttachmentText(String(importedChat.contextSummary || '# Context summary\n'), attachmentRedactionPlans), { mode: 0o600 });
  await fs.writeFile(metadata.paths.contextWindow, redactImportedAttachmentText(String(importedChat.contextWindow || '# Context window\n'), attachmentRedactionPlans), { mode: 0o600 });
  await importChatAttachments(id, options.attachments === false ? [] : importedChat.attachments || []);
}

async function getAvailableImportedChatId(requestedId) {
  const requested = /^[a-zA-Z0-9_-]+$/.test(String(requestedId || '')) ? String(requestedId) : '';
  const base = requested || `${stamp(new Date())}-${crypto.randomUUID().slice(0, 8)}`;
  let id = base;
  let suffix = 2;
  while (await pathExists(getChatDir(id))) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeImportedMessages(messages = [], options = {}, attachmentRedactionPlans = []) {
  const items = Array.isArray(messages) ? messages : [];
  if (options.attachments !== false) return items;
  return items.map((message) => {
    let nextMessage = message;
    for (const plan of attachmentRedactionPlans) nextMessage = redactAttachmentData(nextMessage, plan);
    return { ...nextMessage, attachments: [] };
  });
}

function createImportedAttachmentRedactionPlans(attachments = []) {
  return (attachments || []).map((attachment) => {
    let data = null;
    try {
      const rawBase64 = String(attachment?.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
      if (rawBase64) data = Buffer.from(rawBase64, 'base64');
    } catch {
      data = null;
    }
    return createAttachmentRedactionPlan(attachment || {}, data);
  });
}

function redactImportedAttachmentText(text, attachmentRedactionPlans = []) {
  let next = String(text || '');
  for (const plan of attachmentRedactionPlans) next = redactAttachmentString(next, plan);
  return next;
}

async function exportChatAttachments(id) {
  const attachments = await listAttachments(id);
  const exported = [];
  for (const attachment of attachments) {
    let dataBase64 = '';
    let missing = false;
    try {
      dataBase64 = (await fs.readFile(attachment.path)).toString('base64');
    } catch {
      missing = true;
    }
    exported.push({ ...attachment, dataBase64, missing });
  }
  return exported;
}

async function importChatAttachments(id, attachments = []) {
  const imported = [];
  const chat = await readChatMetadata(id);
  await fs.rm(chat.paths.attachments, { recursive: true, force: true });
  await fs.mkdir(chat.paths.attachments, { recursive: true, mode: 0o700 });

  for (const attachment of attachments) {
    if (attachment.missing) continue;
    const prepared = prepareImportedAttachment(attachment);
    if (!prepared) continue;
    const { attachmentId, name, mimeType, buffer } = prepared;
    const filePath = path.join(chat.paths.attachments, `${attachmentId}-${name}`);
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    const extraction = extractAttachmentText(buffer, { name, mimeType });
    imported.push({
      ...attachment,
      id: attachmentId,
      name,
      mimeType,
      size: buffer.length,
      path: filePath,
      dataBase64: undefined,
      missing: undefined,
      kind: classifyAttachment(mimeType, name),
      sendMode: defaultAttachmentSendMode(mimeType, name, extraction),
      extractedText: extraction.text,
      previewText: truncate(extraction.text, 1800),
      extractionStatus: extraction.status,
      extractionNote: extraction.note,
    });
  }

  await writeJson(getAttachmentsMetadataPath(id), imported, 0o600);
}

function validateImportedChatAttachments(attachments = []) {
  for (const attachment of attachments) {
    if (!attachment?.missing) prepareImportedAttachment(attachment);
  }
}

function prepareImportedAttachment(attachment = {}) {
  const attachmentId = /^[a-zA-Z0-9_-]+$/.test(String(attachment.id || '')) ? String(attachment.id) : crypto.randomUUID();
  const name = sanitizeFileName(attachment.name || 'attachment');
  const mimeType = String(attachment.mimeType || guessMimeType(name)).slice(0, 120);
  if (!isSupportedAttachment(mimeType, name)) {
    const error = new Error(`Anexo incompatível no backup: ${name}`);
    error.statusCode = 415;
    throw error;
  }
  const rawBase64 = String(attachment.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!rawBase64) return null;
  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length > 20 * 1024 * 1024) {
    const error = new Error(`Anexo muito grande no backup: ${name}`);
    error.statusCode = 413;
    throw error;
  }
  return { attachmentId, name, mimeType, buffer };
}

async function exportUserMemoryFiles() {
  const files = await listUserMemoryFiles();
  const exported = [];
  for (const file of files) {
    let dataBase64 = '';
    let missing = false;
    try {
      dataBase64 = (await fs.readFile(assertUserMemoryPath(file.path))).toString('base64');
    } catch {
      missing = true;
    }
    exported.push({ ...file, dataBase64, missing });
  }
  return exported;
}

async function importUserMemoryFiles(files = []) {
  const paths = getActivePaths();
  const token = crypto.randomUUID();
  const tempDir = path.join(paths.runtimeHome, `persistent-memory-user.tmp-${token}`);
  const backupDir = path.join(paths.runtimeHome, `persistent-memory-user.old-${token}`);
  const tempIndexPath = `${paths.userMemoryIndexPath}.tmp-${token}`;
  const backupIndexPath = `${paths.userMemoryIndexPath}.old-${token}`;
  const prepared = files.filter((file) => !file?.missing).map((file) => prepareImportedUserMemoryFile(file, paths.userMemoryDir));

  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
  for (const file of prepared) {
    await fs.writeFile(path.join(tempDir, file.storageName), file.buffer, { mode: 0o600 });
  }
  await writeJson(
    tempIndexPath,
    prepared.map((file) => file.entry),
    0o600,
  );

  let movedCurrentDir = false;
  let movedCurrentIndex = false;
  try {
    if (await pathExists(paths.userMemoryDir)) {
      await fs.rename(paths.userMemoryDir, backupDir);
      movedCurrentDir = true;
    }
    if (await pathExists(paths.userMemoryIndexPath)) {
      await fs.rename(paths.userMemoryIndexPath, backupIndexPath);
      movedCurrentIndex = true;
    }
    await fs.rename(tempDir, paths.userMemoryDir);
    await fs.rename(tempIndexPath, paths.userMemoryIndexPath);
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.rm(backupIndexPath, { force: true });
  } catch (error) {
    await fs.rm(paths.userMemoryDir, { recursive: true, force: true });
    await fs.rm(paths.userMemoryIndexPath, { force: true });
    if (movedCurrentDir) await fs.rename(backupDir, paths.userMemoryDir);
    if (movedCurrentIndex) await fs.rename(backupIndexPath, paths.userMemoryIndexPath);
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(tempIndexPath, { force: true });
    throw error;
  }
}

function prepareImportedUserMemoryFile(file = {}, userMemoryDir) {
  const name = sanitizeFileName(file.name || 'memory.md');
  const mimeType = String(file.mimeType || guessMimeType(name)).slice(0, 120);
  if (!isUserMemoryCompatible(mimeType, name)) {
    const error = new Error(`Arquivo de memória incompatível no backup: ${name}`);
    error.statusCode = 415;
    throw error;
  }
  const id = /^[a-zA-Z0-9_-]+$/.test(String(file.id || '')) ? String(file.id) : crypto.randomUUID();
  const storageName = `${id}-${name}`;
  const filePath = path.join(userMemoryDir, storageName);
  const buffer = file.dataBase64 ? Buffer.from(file.dataBase64, 'base64') : Buffer.from(String(file.content || ''), 'utf8');
  if (buffer.length > USER_MEMORY_FILE_LIMIT_BYTES) {
    const error = new Error(`Arquivo de memória muito grande no backup: ${name}`);
    error.statusCode = 413;
    throw error;
  }
  return {
    storageName,
    buffer,
    entry: {
      id,
      name,
      mimeType,
      size: buffer.length,
      path: filePath,
      editable: isUserMemoryEditable(mimeType, name),
      createdAt: file.createdAt || new Date().toISOString(),
      updatedAt: file.updatedAt || new Date().toISOString(),
    },
  };
}

async function touchChat(id) {
  const metadataPath = path.join(getChatDir(id), 'metadata.json');
  await withFileLock(metadataPath, async () => {
    const metadata = await readChatMetadata(id);
    await writeJson(metadataPath, {
      ...metadata,
      updatedAt: new Date().toISOString(),
    });
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
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await fs.rename(tempPath, filePath);
}

async function withFileLock(filePath, action) {
  const key = path.resolve(filePath);
  const previous = fileLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(action);
  const cleanup = run.catch(() => {}).then(() => {
    if (fileLocks.get(key) === cleanup) fileLocks.delete(key);
  });
  fileLocks.set(key, cleanup);
  return run;
}

async function ensureTextFile(filePath, content) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(filePath, content, { mode: 0o600 });
  }
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeJson(filePath, fallback, 0o600);
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function buildProfilePaths(profileId = 'default') {
  const profileRuntimeHome = getProfileRuntimeHome(profileId);
  return {
    runtimeHome: profileRuntimeHome,
    chatsDir: path.join(profileRuntimeHome, 'chats'),
    configPath: path.join(profileRuntimeHome, 'config.json'),
    eventsPath: path.join(profileRuntimeHome, 'events.jsonl'),
    persistentMemoryPath: path.join(profileRuntimeHome, 'persistent-memory.md'),
    userMemoryDir: path.join(profileRuntimeHome, 'persistent-memory-user'),
    userMemoryIndexPath: path.join(profileRuntimeHome, 'persistent-memory-user.json'),
    scheduledTasksPath: path.join(profileRuntimeHome, 'scheduledTasks.json'),
  };
}

function getScopedProfileId() {
  return profileScope.getStore()?.profileId || activeProfileId;
}

function getActivePaths() {
  refreshRuntimeRootIfNeeded();
  return profileScope.getStore()?.paths || activePaths;
}

async function ensureProfilesIndex() {
  refreshRuntimeRootIfNeeded();
  const rootRuntimeHome = getRuntimeHome();
  const indexPath = getProfilesIndexPath();
  await fs.mkdir(rootRuntimeHome, { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const fallback = {
    version: 1,
    activeProfileId: 'default',
    profiles: [{ ...defaultProfile, createdAt: now, updatedAt: now }],
  };
  await ensureJsonFile(indexPath, fallback);
  const index = normalizeProfilesIndex(await readJson(indexPath, fallback));
  const changed =
    !index.profiles.length ||
    !index.profiles.some((profile) => profile.id === 'default') ||
    !index.profiles.some((profile) => profile.id === index.activeProfileId);
  const next = changed
    ? normalizeProfilesIndex({
        ...index,
        activeProfileId: index.profiles.some((profile) => profile.id === index.activeProfileId) ? index.activeProfileId : 'default',
        profiles: index.profiles.some((profile) => profile.id === 'default')
          ? index.profiles
          : [{ ...defaultProfile, createdAt: now, updatedAt: now }, ...index.profiles],
      })
    : index;
  activeProfileId = next.activeProfileId;
  activePaths = buildProfilePaths(activeProfileId);
  if (changed) await writeProfilesIndex(next);
  return next;
}

async function writeProfilesIndex(index) {
  const next = normalizeProfilesIndex(index);
  await writeJson(getProfilesIndexPath(), next, 0o600);
  activeProfileId = next.activeProfileId;
  activePaths = buildProfilePaths(activeProfileId);
  return next;
}

function normalizeProfilesIndex(index = {}) {
  const now = new Date().toISOString();
  const seen = new Set();
  const profiles = (Array.isArray(index.profiles) ? index.profiles : [])
    .map((profile) => {
      const id = sanitizeProfileId(profile?.id || '');
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name: normalizeProfileName(profile?.name || (id === 'default' ? defaultProfile.name : id)),
        createdAt: profile?.createdAt || now,
        updatedAt: profile?.updatedAt || profile?.createdAt || now,
        runtimeHome: getProfileRuntimeHome(id),
      };
    })
    .filter(Boolean);
  if (!profiles.some((profile) => profile.id === 'default')) {
    profiles.unshift({ ...defaultProfile, createdAt: now, updatedAt: now, runtimeHome: getRuntimeHome() });
  }
  const requestedActive = sanitizeProfileId(index.activeProfileId || 'default');
  const active = profiles.some((profile) => profile.id === requestedActive) ? requestedActive : 'default';
  return {
    version: 1,
    activeProfileId: active,
    profiles,
  };
}

function refreshRuntimeRootIfNeeded() {
  const currentRootRuntimeHome = getRuntimeHome();
  if (currentRootRuntimeHome === activeRootRuntimeHome) return;
  activeRootRuntimeHome = currentRootRuntimeHome;
  activeProfileId = 'default';
  activePaths = buildProfilePaths(activeProfileId);
}

function sanitizeProfileId(profileId) {
  return String(profileId || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function slugifyProfileId(value) {
  return sanitizeProfileId(
    String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  );
}

function normalizeProfileName(name) {
  return String(name || 'Nova seção').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nova seção';
}

function normalizeUserMemoryFiles(files = []) {
  return (Array.isArray(files) ? files : [])
    .map((file) => {
      const id = /^[a-zA-Z0-9_-]+$/.test(String(file?.id || '')) ? String(file.id) : '';
      const name = sanitizeFileName(file?.name || 'memory.md');
      const mimeType = String(file?.mimeType || guessMimeType(name)).slice(0, 120);
      const filePath = String(file?.path || '');
      if (!id || !filePath) return null;
      return {
        id,
        name,
        mimeType,
        size: Number(file?.size || 0),
        path: filePath,
        editable: file?.editable !== false && isUserMemoryEditable(mimeType, name),
        createdAt: file?.createdAt || new Date().toISOString(),
        updatedAt: file?.updatedAt || file?.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

async function findUserMemoryFile(identifier) {
  const files = await listUserMemoryFiles();
  const target = findUserMemoryFileInList(files, identifier);
  if (!target) {
    const error = new Error('Arquivo de memória do usuário não encontrado.');
    error.statusCode = 404;
    throw error;
  }
  return target;
}

function findUserMemoryFileInList(files, identifier) {
  const value = String(identifier || '').trim();
  return files.find((file) => file.id === value || file.name === value || path.basename(file.path) === value) || null;
}

function assertUserMemoryPath(filePath) {
  const resolved = path.resolve(filePath);
  const userMemoryDir = path.resolve(getActivePaths().userMemoryDir);
  if (!resolved.startsWith(`${userMemoryDir}${path.sep}`)) {
    const error = new Error('Caminho de arquivo de memória inválido.');
    error.statusCode = 403;
    throw error;
  }
  return resolved;
}

function isUserMemoryCompatible(mimeType, name) {
  return isTextLike(mimeType, name);
}

function isUserMemoryEditable(mimeType, name) {
  return isTextLike(mimeType, name);
}

function normalizeTitle(title) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 80) || 'New chat';
}

function normalizeChatFolder(folder) {
  const clean = String(folder || '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 60);
}

function normalizeTools(tools = {}, options = {}) {
  const searchMode = normalizeSearchMode(tools.searchMode, tools);
  const safeSearchMode = options.offlineMode && searchMode === 'both' ? 'off' : searchMode;
  return {
    terminal: tools.terminal !== false,
    chatMemory: tools.chatMemory !== false,
    persistentMemory: tools.persistentMemory !== false,
    autoCompact: tools.autoCompact !== false,
    chatTitle: tools.chatTitle !== false,
    webSearch: safeSearchMode !== 'off',
    searchTerminal: safeSearchMode === 'terminal' || safeSearchMode === 'both',
    searchMode: safeSearchMode,
    alwaysAllow: tools.alwaysAllow === true,
    terminalMode: tools.terminalMode === 'isolated' ? 'isolated' : 'standard',
    deepInvestigation: tools.deepInvestigation === true,
    userMemory: tools.userMemory !== false,
    userMemoryEdit: tools.userMemory !== false && tools.userMemoryEdit === true,
    chatDocuments: tools.chatDocuments !== false,
  };
}

function mergeToolsSettings(current = {}, patch = {}) {
  if (!patch || typeof patch !== 'object') return current || {};
  const next = { ...(current || {}) };
  const hasLegacySearchPatch =
    !Object.hasOwn(patch, 'searchMode') &&
    (Object.hasOwn(patch, 'webSearch') || Object.hasOwn(patch, 'searchTerminal'));

  if (hasLegacySearchPatch) {
    delete next.searchMode;
    delete next.webSearch;
    delete next.searchTerminal;
  }

  return {
    ...next,
    ...patch,
  };
}

// 'native'-only is intentionally not a passthrough value anymore: any legacy
// config saved with searchMode 'native' (or anything else unrecognized)
// silently migrates to 'both' the next time the config is normalized.
function normalizeSearchMode(value, legacyTools = {}) {
  const mode = String(value || '').trim();
  if (mode === 'terminal' || mode === 'both') return mode;
  if (legacyTools.webSearch === false) return 'off';
  if (legacyTools.searchTerminal === true) return 'terminal';
  if (mode === 'off') return mode;
  return 'both';
}

function normalizeContextSettings(context = {}) {
  return {
    autoCompactEnabled: context.autoCompactEnabled === true,
    autoCompactChars: clampInteger(context.autoCompactChars, 8000, 120000, 24000),
    autoCompactMinMessages: clampInteger(context.autoCompactMinMessages, 2, 80, 12),
    historyBudgetEnabled: context.historyBudgetEnabled !== false,
    historyBudgetChars: clampInteger(context.historyBudgetChars, 2000, 120000, 28000),
  };
}

function normalizeEmailSettings(email = {}) {
  return {
    enabled: email.enabled === true,
    resendApiKey: String(email.resendApiKey || '').trim(),
    destinationEmail: String(email.destinationEmail || '').trim(),
    notifyOnScheduledTaskFailure: email.notifyOnScheduledTaskFailure !== false,
  };
}

function normalizeUserMemorySettings(userMemory = {}) {
  return {
    sendFilesToPrompt: userMemory.sendFilesToPrompt === true,
    remindModelToUpdateFiles: userMemory.remindModelToUpdateFiles === true,
  };
}

function normalizePrivacySettings(privacy = {}) {
  return {
    offlineMode: privacy.offlineMode === true,
  };
}

function normalizeRoutingSettings(routing = {}, options = {}) {
  if (options.offlineMode) {
    return {
      modelRotationEnabled: false,
      modelFallbacks: [],
      providerRotationEnabled: false,
      maxProviderPasses: 1,
      fallbacks: [],
    };
  }
  const modelFallbacks = Array.isArray(routing.modelFallbacks)
    ? routing.modelFallbacks
        .filter((item) => item?.provider && String(item?.model || '').trim())
        .map((item) => {
          const provider = normalizeProviderId(item?.provider);
          const model = String(item?.model || '').trim();
          return { provider, model };
        })
        .filter((item, index, items) =>
          items.findIndex((candidate) => candidate.provider === item.provider && candidate.model === item.model) === index,
        )
        .slice(0, 16)
    : [];
  const fallbacks = Array.isArray(routing.fallbacks)
    ? routing.fallbacks
        .filter((item) => item?.provider && String(item?.model || '').trim())
        .map((item) => {
          const provider = normalizeProviderId(item?.provider);
          const model = String(item?.model || '').trim();
          return { provider, model };
        })
        .filter((item, index, items) =>
          items.findIndex((candidate) => candidate.provider === item.provider && candidate.model === item.model) === index,
        )
        .slice(0, 8)
    : [];

  return {
    modelRotationEnabled: routing.modelRotationEnabled === true,
    modelFallbacks,
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

function mergeProviderSettings(current = {}, patch = {}) {
  const next = { ...(current || {}) };
  for (const [providerId, settings] of Object.entries(patch || {})) {
    next[providerId] = {
      ...(current?.[providerId] || {}),
      ...(settings || {}),
    };
  }
  return next;
}

function mergeModelCapabilities(current = {}, patch = {}) {
  const next = { ...(current || {}) };
  for (const [providerId, capabilities] of Object.entries(patch || {})) {
    next[providerId] = {
      ...(current?.[providerId] || {}),
      ...(capabilities || {}),
    };
  }
  return next;
}

function normalizeAppearanceSettings(appearance = {}) {
  const theme = String(appearance.theme || 'light').trim();
  const uiLanguage = String(appearance.uiLanguage || 'en-US').trim();
  return {
    theme: ['light', 'dark', 'system'].includes(theme) ? theme : 'light',
    uiLanguage: ['en-US', 'pt-BR'].includes(uiLanguage) ? uiLanguage : 'en-US',
  };
}

function normalizeConfig(config = {}) {
  const privacy = normalizePrivacySettings(config.privacy || defaultConfig.privacy);
  const requestedProvider = normalizeProviderId(config.provider || defaultConfig.provider);
  const provider = privacy.offlineMode ? 'ollama' : requestedProvider;
  const providerSettings = normalizeProviderSettings(config.providerSettings || {}, { offlineMode: privacy.offlineMode });

  if (config.apiKey && !getPrimaryApiKey(providerSettings, 'groq')) {
    providerSettings.groq.apiKeys = normalizeApiKeyEntries([config.apiKey]);
  }

  const model =
    privacy.offlineMode && requestedProvider !== 'ollama'
      ? getDefaultModelForProvider('ollama')
      : String(config.model || getDefaultModelForProvider(provider)).trim();

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
    appearance: normalizeAppearanceSettings(config.appearance || defaultConfig.appearance),
    tools: normalizeTools(config.tools || defaultConfig.tools, { offlineMode: privacy.offlineMode }),
    userMemory: normalizeUserMemorySettings(config.userMemory || defaultConfig.userMemory),
    privacy,
    context: normalizeContextSettings(config.context || defaultConfig.context),
    email: normalizeEmailSettings(config.email || defaultConfig.email),
    routing: normalizeRoutingSettings(config.routing || defaultConfig.routing, { offlineMode: privacy.offlineMode }),
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
    persistentMemoryUser: options.persistentMemoryUser !== false,
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
  await fs.appendFile(getActivePaths().eventsPath, `${lines.join('\n')}\n`, { mode: 0o600 });
}

function buildDefaultProviderSettings() {
  return normalizeProviderSettings({});
}

function normalizeProviderId(providerId) {
  const value = String(providerId || '').trim();
  return isKnownProvider(value) ? value : 'groq';
}

function normalizeProviderSettings(settings = {}, options = {}) {
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
    const baseUrl = String(current.baseUrl || provider.baseUrl || '').trim();
    next[provider.id] = {
      baseUrl,
      apiKeys,
    };
  }
  if (options.offlineMode) {
    const ollamaDefault = providerCatalog.find((provider) => provider.id === 'ollama')?.baseUrl || 'http://127.0.0.1:11434/v1';
    const ollamaBaseUrl = next.ollama?.baseUrl || ollamaDefault;
    if (!isLocalOllamaBaseUrl(ollamaBaseUrl)) {
      assertLocalOllamaBaseUrl(ollamaBaseUrl, { offlineMode: true });
    }
    next.ollama = {
      ...(next.ollama || {}),
      baseUrl: ollamaBaseUrl,
      apiKeys: [],
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
  if (['none', 'default', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) next.reasoningEffort = reasoningEffort;
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

function findAttachmentInList(attachments = [], identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return (
    attachments.find((item) => item.id === value) ||
    attachments.find((item) => item.name === value || path.basename(item.path || '') === value) ||
    null
  );
}

function assertAttachmentPath(id, filePath) {
  const chatDir = getChatDir(id);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${path.resolve(chatDir)}${path.sep}`)) {
    const error = new Error('Caminho de anexo inválido.');
    error.statusCode = 403;
    throw error;
  }
  return resolved;
}

function assertTextEditableAttachment(attachment = {}) {
  if (!isTextLike(attachment.mimeType || '', attachment.name || '')) {
    const error = new Error('Este anexo não é um documento de texto editável. Use Markdown, texto, HTML, JSON, CSV, YAML, XML, código ou logs.');
    error.statusCode = 415;
    throw error;
  }
}

async function updateAttachmentAfterWrite(id, target, buffer) {
  const extraction = extractAttachmentText(buffer, { name: target.name, mimeType: target.mimeType });
  const updated = {
    ...target,
    size: buffer.length,
    kind: classifyAttachment(target.mimeType, target.name),
    sendMode: defaultAttachmentSendMode(target.mimeType, target.name, extraction),
    extractedText: extraction.text,
    previewText: truncate(extraction.text, 1800),
    extractionStatus: extraction.status,
    extractionNote: extraction.note,
    updatedAt: new Date().toISOString(),
  };
  const attachmentsPath = getAttachmentsMetadataPath(id);
  await withFileLock(attachmentsPath, async () => {
    const attachments = await readJson(attachmentsPath, []);
    await writeJson(
      attachmentsPath,
      attachments.map((item) => (item.id === target.id ? updated : item)),
      0o600,
    );
  });
  await updateAttachmentReferencesInMessages(id, updated);
  await touchChat(id);
  return updated;
}

async function updateAttachmentReferencesInMessages(id, attachment) {
  const messagesPath = path.join(getChatDir(id), 'messages.json');
  await withFileLock(messagesPath, async () => {
    const messages = await readJson(messagesPath, []);
    let changed = false;
    const next = messages.map((message) => {
      if (!Array.isArray(message.attachments)) return message;
      let messageChanged = false;
      const attachments = message.attachments.map((item) => {
        if (item.id !== attachment.id) return item;
        messageChanged = true;
        return { ...item, ...attachment };
      });
      if (!messageChanged) return message;
      changed = true;
      return { ...message, attachments };
    });
    if (changed) await writeJson(messagesPath, next, 0o600);
  });
}

async function redactDeletedAttachmentReferencesInMessages(id, attachment, redactionPlan) {
  const messagesPath = path.join(getChatDir(id), 'messages.json');
  const redacted = sanitizeDeletedAttachmentSnapshot(attachment);
  await withFileLock(messagesPath, async () => {
    const messages = await readJson(messagesPath, []);
    let changed = false;
    const next = messages.map((message) => {
      let nextMessage = redactAttachmentData(message, redactionPlan);
      if (!Array.isArray(nextMessage.attachments)) {
        if (nextMessage !== message) changed = true;
        return nextMessage;
      }
      let messageChanged = false;
      const attachments = nextMessage.attachments.map((item) => {
        if (item.id !== attachment.id) return item;
        messageChanged = true;
        return redacted;
      });
      if (!messageChanged) {
        if (nextMessage !== message) changed = true;
        return nextMessage;
      }
      changed = true;
      return { ...nextMessage, attachments };
    });
    if (changed) await writeJson(messagesPath, next, 0o600);
  });
}

async function redactDeletedAttachmentContextFiles(id, redactionPlan) {
  const metadata = await readChatMetadata(id);
  for (const filePath of [metadata.paths.context, metadata.paths.contextWindow].filter(Boolean)) {
    await withFileLock(filePath, async () => {
      const current = await readText(filePath, '');
      const next = redactAttachmentString(current, redactionPlan);
      if (next !== current) await fs.writeFile(filePath, next, { mode: 0o600 });
    });
  }
}

async function redactDeletedAttachmentEvents(id, redactionPlan) {
  const eventsPath = getActivePaths().eventsPath;
  await withFileLock(eventsPath, async () => {
    let raw = '';
    try {
      raw = await fs.readFile(eventsPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    const lines = raw.split('\n').filter(Boolean);
    let changed = false;
    const nextLines = lines.map((line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        const redactedRaw = redactAttachmentString(line, redactionPlan);
        changed = changed || redactedRaw !== line;
        return JSON.stringify({ type: 'event.parse_error', createdAt: new Date().toISOString(), chatId: id, raw: redactedRaw });
      }
      if (event.chatId && event.chatId !== id) return line;
      const redacted = redactAttachmentData(event, redactionPlan);
      if (redacted === event) return line;
      changed = true;
      return JSON.stringify(redacted);
    });
    if (changed) await fs.writeFile(eventsPath, `${nextLines.join('\n')}${nextLines.length ? '\n' : ''}`, { mode: 0o600 });
  });
}

function sanitizeMessagesForAvailableAttachments(messages = [], attachments = []) {
  const activeAttachmentIds = new Set((attachments || []).map((attachment) => attachment.id).filter(Boolean));
  return (messages || []).map((message) => {
    if (!Array.isArray(message.attachments) || !message.attachments.length) return message;
    let changed = false;
    const messageAttachments = message.attachments.map((attachment) => {
      if (!attachment?.id || activeAttachmentIds.has(attachment.id) || attachment.deletedAt) return attachment;
      changed = true;
      return sanitizeDeletedAttachmentSnapshot(attachment);
    });
    return changed ? { ...message, attachments: messageAttachments } : message;
  });
}

function sanitizeDeletedAttachmentSnapshot(attachment = {}) {
  return {
    id: String(attachment.id || ''),
    name: String(attachment.name || 'Anexo removido'),
    mimeType: String(attachment.mimeType || 'application/octet-stream'),
    size: Number(attachment.size || 0),
    kind: attachment.kind || classifyAttachment(String(attachment.mimeType || ''), String(attachment.name || '')),
    sendMode: 'deleted',
    extractionStatus: 'deleted',
    extractionNote: 'Anexo removido pelo usuário. Conteúdo e caminho local foram apagados.',
    deletedAt: attachment.deletedAt || new Date().toISOString(),
  };
}

function createAttachmentRedactionPlan(attachment = {}, data = null) {
  const marker = `[conteúdo removido do anexo "${attachment.name || attachment.id || 'arquivo'}"]`;
  const pathMarker = '[caminho removido de anexo apagado]';
  const rawText = data ? data.toString('utf8').replace(/\u0000/g, '') : '';
  const base64Text = data ? data.toString('base64') : '';
  const dataUrl = base64Text && attachment.mimeType ? `data:${attachment.mimeType};base64,${base64Text}` : '';
  const extractedFromRaw = rawText ? extractAttachmentText(data, { name: attachment.name || '', mimeType: attachment.mimeType || '' }).text : '';
  const values = [
    dataUrl,
    base64Text,
    rawText,
    rawText.replace(/\r\n/g, '\n').trim(),
    extractedFromRaw,
    attachment.extractedText,
    attachment.previewText,
  ];
  for (const value of [rawText, extractedFromRaw, attachment.extractedText, attachment.previewText]) {
    const text = String(value || '').replace(/\r\n/g, '\n');
    values.push(truncate(text.trim(), 160000), truncate(text.trim(), 60000), truncate(text.trim(), 12000));
    for (const line of text.split('\n')) {
      const cleanLine = line.trim();
      if (cleanLine.length >= 8) values.push(cleanLine);
    }
  }
  const contentNeedles = uniqueRedactionNeedles(values, { max: 2500 });
  const pathNeedles = uniqueRedactionNeedles([attachment.path, attachment.path ? path.basename(attachment.path) : ''], { minLength: 8, max: 10 });
  return { marker, pathMarker, contentNeedles, pathNeedles };
}

function uniqueRedactionNeedles(values = [], options = {}) {
  const minLength = Number(options.minLength || 8);
  const max = Number(options.max || 1000);
  const seen = new Set();
  const needles = [];
  for (const value of values) {
    const text = String(value || '');
    const variants = [text, text.replace(/\r\n/g, '\n'), text.replace(/\n\.\.\.\[truncated\]$/, '')];
    for (const variant of variants) {
      const needle = variant.trim();
      if (needle.length < minLength || seen.has(needle)) continue;
      seen.add(needle);
      needles.push(needle);
      if (needles.length >= max) return needles.sort((a, b) => b.length - a.length);
    }
  }
  return needles.sort((a, b) => b.length - a.length);
}

function redactAttachmentData(value, redactionPlan) {
  if (typeof value === 'string') return redactAttachmentString(value, redactionPlan);
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const redacted = redactAttachmentData(item, redactionPlan);
      if (redacted !== item) changed = true;
      return redacted;
    });
    return changed ? next : value;
  }
  if (!value || typeof value !== 'object') return value;
  let changed = false;
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    const redacted = redactAttachmentData(item, redactionPlan);
    if (redacted !== item) changed = true;
    next[key] = redacted;
  }
  return changed ? next : value;
}

function redactAttachmentString(value, redactionPlan = {}) {
  let text = String(value || '');
  const replaceAll = (needle, marker) => {
    if (!needle || !text.includes(needle)) return;
    text = text.split(needle).join(marker);
  };
  for (const needle of redactionPlan.contentNeedles || []) replaceAll(needle, redactionPlan.marker || '[conteúdo de anexo removido]');
  for (const needle of redactionPlan.pathNeedles || []) replaceAll(needle, redactionPlan.pathMarker || '[caminho de anexo removido]');
  return text;
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

function guessMimeType(name) {
  const extension = path.extname(name || '').replace('.', '').toLowerCase();
  const byExtension = {
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    log: 'text/plain',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    json: 'application/json',
    jsonl: 'application/json',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    js: 'text/javascript',
    mjs: 'text/javascript',
    cjs: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    jsx: 'text/javascript',
    css: 'text/css',
    py: 'text/x-python',
    sh: 'text/x-shellscript',
    toml: 'text/plain',
    ini: 'text/plain',
    sql: 'text/plain',
  };
  return byExtension[extension] || 'text/plain';
}

function htmlToText(html) {
  const source = String(html || '');
  let output = '';
  let tagBuffer = '';
  let insideTag = false;
  let ignoredTag = '';

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (insideTag) {
      tagBuffer += char;
      if (char !== '>') continue;
      const tag = parseHtmlTagName(tagBuffer);
      if (tag) {
        if (tag.closing && tag.name === ignoredTag) ignoredTag = '';
        if (!tag.closing && ['script', 'style', 'noscript'].includes(tag.name)) ignoredTag = tag.name;
        if (['br', 'p', 'div', 'li', 'tr', 'section', 'article'].includes(tag.name) || /^h[1-6]$/.test(tag.name)) output += '\n';
      }
      insideTag = false;
      tagBuffer = '';
      continue;
    }
    if (char === '<') {
      insideTag = true;
      tagBuffer = char;
      continue;
    }
    if (!ignoredTag) output += char;
  }

  return decodeHtmlEntities(output)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function parseHtmlTagName(tagText) {
  const text = String(tagText || '').trim();
  if (!text.startsWith('<') || text.startsWith('<!--') || text.startsWith('<!')) return null;
  let index = 1;
  let closing = false;
  if (text[index] === '/') {
    closing = true;
    index += 1;
  }
  while (/\s/.test(text[index] || '')) index += 1;
  let name = '';
  while (/[a-zA-Z0-9:-]/.test(text[index] || '')) {
    name += text[index];
    index += 1;
  }
  return name ? { name: name.toLowerCase(), closing } : null;
}

function decodeHtmlEntities(text) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return String(text || '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    const value = String(entity || '').toLowerCase();
    if (value.startsWith('#x')) return decodeHtmlCodePoint(Number.parseInt(value.slice(2), 16), match);
    if (value.startsWith('#')) return decodeHtmlCodePoint(Number.parseInt(value.slice(1), 10), match);
    return Object.hasOwn(named, value) ? named[value] : match;
  });
}

function decodeHtmlCodePoint(codePoint, fallback) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return fallback;
  return String.fromCodePoint(codePoint);
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
