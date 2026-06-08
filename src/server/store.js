import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultModelForProvider, isKnownProvider, providerCatalog } from './models.js';
import { getProfileRuntimeHome, profilesIndexPath, runtimeHome } from './paths.js';

const fileLocks = new Map();
const USER_MEMORY_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
const USER_MEMORY_PROMPT_TOTAL_CHARS = 60000;
const USER_MEMORY_PROMPT_FILE_CHARS = 12000;
const profileScope = new AsyncLocalStorage();
const defaultProfile = Object.freeze({
  id: 'default',
  name: 'Default',
});
let activeProfileId = 'default';
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
    searchMode: 'native',
    alwaysAllow: false,
    terminalMode: 'standard',
    deepInvestigation: false,
    userMemory: true,
    userMemoryEdit: false,
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
    const providerSettings = normalizeProviderSettings(mergeProviderSettings(current.providerSettings, patch.providerSettings));
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
  const providerSettings = normalizeProviderSettings(config.providerSettings || {});
  const privacy = normalizePrivacySettings(config.privacy);
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
  const attachmentsPath = getAttachmentsMetadataPath(id);
  const attachment = await withFileLock(attachmentsPath, async () => {
    const attachments = await readJson(attachmentsPath, []);
    const target = attachments.find((item) => item.id === attachmentId);
    if (!target) return null;
    await fs.rm(target.path, { force: true });
    await writeJson(
      attachmentsPath,
      attachments.filter((item) => item.id !== attachmentId),
      0o600,
    );
    return target;
  });
  if (!attachment) return;
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
    rootRuntimeHome: runtimeHome,
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
  await writeJson(path.join(chatDir, 'messages.json'), normalizeImportedMessages(importedChat.messages, options), 0o600);
  await fs.writeFile(metadata.paths.memory, String(importedChat.memory || '# Chat memory\n'), { mode: 0o600 });
  await fs.writeFile(metadata.paths.context, String(importedChat.contextSummary || '# Context summary\n'), { mode: 0o600 });
  await fs.writeFile(metadata.paths.contextWindow, String(importedChat.contextWindow || '# Context window\n'), { mode: 0o600 });
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

function normalizeImportedMessages(messages = [], options = {}) {
  const items = Array.isArray(messages) ? messages : [];
  if (options.attachments !== false) return items;
  return items.map((message) => ({ ...message, attachments: [] }));
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
  };
}

function getScopedProfileId() {
  return profileScope.getStore()?.profileId || activeProfileId;
}

function getActivePaths() {
  return profileScope.getStore()?.paths || activePaths;
}

async function ensureProfilesIndex() {
  await fs.mkdir(runtimeHome, { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const fallback = {
    version: 1,
    activeProfileId: 'default',
    profiles: [{ ...defaultProfile, createdAt: now, updatedAt: now }],
  };
  await ensureJsonFile(profilesIndexPath, fallback);
  const index = normalizeProfilesIndex(await readJson(profilesIndexPath, fallback));
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
  await writeJson(profilesIndexPath, next, 0o600);
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
    profiles.unshift({ ...defaultProfile, createdAt: now, updatedAt: now, runtimeHome });
  }
  const requestedActive = sanitizeProfileId(index.activeProfileId || 'default');
  const active = profiles.some((profile) => profile.id === requestedActive) ? requestedActive : 'default';
  return {
    version: 1,
    activeProfileId: active,
    profiles,
  };
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
  return clean.slice(0, 80) || 'Novo chat';
}

function normalizeTools(tools = {}, options = {}) {
  const searchMode = normalizeSearchMode(tools.searchMode, tools);
  const safeSearchMode = options.offlineMode && ['native', 'both'].includes(searchMode) ? 'off' : searchMode;
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
  const providerSettings = normalizeProviderSettings(config.providerSettings || {});

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
