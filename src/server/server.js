import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { panelDir } from './paths.js';
import { compactChat, continueToolApproval, editContextSummary, saveContextWindow, sendUserMessage, stopChatRun } from './assistant.js';
import { getProviderModels, getProvidersForClient, refreshRuntimeModelCatalog } from './models.js';
import { listOllamaInstalledModels } from './provider-client.js';
import { runTerminalCommand } from './tools.js';
import { applySourceUpdate, getUpdateStatus, restartProcess } from './updater.js';
import { runScheduledTaskNow, startScheduler } from './scheduler.js';
import { sendEmail } from './email.js';
import {
  appendEvent,
  activateProfile,
  createChat,
  createProfile,
  createScheduledTask,
  deleteAllChats,
  deleteChat,
  deleteAttachment,
  deleteProfile,
  deleteScheduledTask,
  deleteUserMemoryFile,
  ensureRuntime,
  exportRuntimeData,
  getRuntimeInfo,
  importRuntimeData,
  listChats,
  listScheduledTasks,
  listUserMemoryFilesWithHints,
  loadConfig,
  readAttachmentFile,
  readAttachmentTextContent,
  readChat,
  readContextSummary,
  readEvents,
  readPersistentMemory,
  readUserMemoryFileWithHints,
  saveUserMemoryFile,
  saveAttachment,
  sanitizeConfig,
  saveConfig,
  updateProfile,
  updateChatMetadata,
  updateScheduledTask,
  withProfileScope,
  writeAttachmentTextContent,
  writeUserMemoryFileContent,
  writePersistentMemory,
  writeMemory,
} from './store.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PANEL_REQUEST_HEADER = 'panel';
const CHAT_EVENT_DETAIL_LIMIT = 10000;
const CHAT_ATTACHMENT_BODY_LIMIT = 32 * 1024 * 1024;

let currentLaunch = { port: null, requestedHost: null, actualHost: null };

export async function startServer({ port = Number(process.env.PORT || 8787), host = null } = {}) {
  await ensureRuntime();
  const config = await loadConfig();
  const runtimeInfo = await getRuntimeInfo();
  const actualHost = host || (config.server?.networkEnabled ? '0.0.0.0' : '127.0.0.1');
  const auth = config.server?.networkEnabled && config.server?.authPassword ? { password: config.server.authPassword } : null;
  const handler = (request, response) => {
    if (auth && !isAuthorized(request, auth)) {
      response.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="My Computer"',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Autenticação necessária.');
      return;
    }
    handleRequest(request, response).catch((error) => sendError(response, error));
  };
  const { server, actualPort } = await listen(handler, actualHost, port);
  currentLaunch = { port: actualPort, requestedHost: host, actualHost };
  startScheduler();
  const url = `http://${actualHost === '0.0.0.0' ? '127.0.0.1' : actualHost}:${actualPort}`;
  return { server, url, runtimeHome: runtimeInfo.runtimeHome, networkStatus: getNetworkStatus(config) };
}

async function handleRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    await handleApi(request, response, url);
    return;
  }

  await serveStatic(response, url.pathname);
}

async function handleApi(request, response, url) {
  const method = request.method || 'GET';
  if (MUTATING_METHODS.has(method) && !isTrustedMutationRequest(request)) {
    sendJson(response, 403, { error: 'Requisição mutável bloqueada por proteção CSRF.' });
    return;
  }
  await withProfileScope(getRequestProfileId(request, url), () => handleApiScoped(request, response, url));
}

async function handleApiScoped(request, response, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method || 'GET';

  if (method === 'GET' && parts[1] === 'bootstrap') {
    sendJson(response, 200, await buildBootstrapPayload());
    return;
  }

  if (method === 'GET' && parts[1] === 'network' && parts[2] === 'status') {
    sendJson(response, 200, { networkStatus: getNetworkStatus(await loadConfig()) });
    return;
  }

  if (parts[1] === 'profiles') {
    await handleProfilesApi(request, response, parts);
    return;
  }

  if (parts[1] === 'scheduled-tasks') {
    await handleScheduledTasksApi(request, response, parts);
    return;
  }

  if (method === 'POST' && parts[1] === 'email' && parts[2] === 'test') {
    await handleEmailTestApi(request, response);
    return;
  }

  if (method === 'PUT' && parts[1] === 'config') {
    const body = await readBody(request);
    if (body.server?.networkEnabled === true && !String(body.server?.authPassword || '').trim()) {
      sendJson(response, 400, { error: 'Defina uma senha para abrir o painel na rede local.' });
      return;
    }
    const config = await saveConfig({
      provider: body.provider,
      apiKey: body.apiKey,
      model: body.model,
      language: body.language,
      userNickname: body.userNickname,
      technicalLevel: body.technicalLevel,
      technicalGuidanceEnabled: body.technicalGuidanceEnabled,
      systemPromptExtra: body.systemPromptExtra,
      appearance: body.appearance,
      tools: body.tools,
      userMemory: body.userMemory,
      privacy: body.privacy,
      context: body.context,
      email: body.email,
      routing: body.routing,
      server: body.server,
      providerSettings: body.providerSettings,
      customModels: body.customModels,
      modelCapabilities: body.modelCapabilities,
      setupComplete: true,
    });
    const { providers, models, ollamaInstalledModels } = await buildClientCatalog(config);
    sendJson(response, 200, {
      config: sanitizeConfig(config),
      providers,
      models,
      ollamaInstalledModels,
      networkStatus: getNetworkStatus(config),
    });
    return;
  }

  if (method === 'GET' && parts[1] === 'providers' && parts[2] === 'ollama' && parts[3] === 'models') {
    const config = await loadConfig();
    sendJson(response, 200, { models: await listOllamaInstalledModels(config) });
    return;
  }

  if (method === 'GET' && parts[1] === 'export') {
    sendJson(response, 200, await exportRuntimeData());
    return;
  }

  if (method === 'POST' && parts[1] === 'import') {
    const body = await readBody(request, { limit: 80_000_000 });
    const payload = body?.data && body?.options ? body.data : body;
    const options = body?.data && body?.options ? body.options : {};
    const imported = await importRuntimeData(payload, options);
    sendJson(response, 200, {
      imported,
      ...(await buildBootstrapPayload()),
    });
    return;
  }

  if (method === 'PUT' && parts[1] === 'persistent-memory') {
    const body = await readBody(request);
    const persistentMemory = await writePersistentMemory(body.content || '');
    sendJson(response, 200, { persistentMemory });
    return;
  }

  if (parts[1] === 'persistent-memory-user') {
    await handleUserMemoryApi(request, response, parts);
    return;
  }

  if (parts[1] === 'ollama') {
    await handleOllamaApi(request, response, parts);
    return;
  }

  if (method === 'GET' && parts[1] === 'update' && parts[2] === 'status') {
    sendJson(response, 200, { update: await getUpdateStatus({ fetch: true }) });
    return;
  }

  if (method === 'POST' && parts[1] === 'update' && parts[2] === 'apply') {
    const body = await readBody(request);
    if (body.confirm !== true) {
      sendJson(response, 400, { error: 'Confirmação obrigatória para atualizar.' });
      return;
    }
    const result = await applySourceUpdate();
    sendJson(response, 200, {
      ...result,
      restarting: Boolean(result.updated),
      message: result.updated
        ? 'Atualização aplicada. O servidor será reiniciado.'
        : 'Nenhuma atualização nova para aplicar.',
    });
    if (result.updated) {
      setTimeout(() => {
        restartProcess({ port: currentLaunch.port, host: currentLaunch.requestedHost });
        process.exit(0);
      }, 500).unref();
    }
    return;
  }

  if (method === 'POST' && parts[1] === 'shutdown') {
    sendJson(response, 200, { ok: true, message: 'My Computer está encerrando.' });
    setTimeout(() => process.exit(0), 100).unref();
    return;
  }

  if (parts[1] === 'chats') {
    await handleChatsApi(request, response, parts);
    return;
  }

  sendJson(response, 404, { error: 'Endpoint nao encontrado.' });
}

async function handleChatsApi(request, response, parts) {
  const method = request.method || 'GET';
  const chatId = parts[2];

  if (method === 'GET' && !chatId) {
    sendJson(response, 200, { chats: await listChats() });
    return;
  }

  if (method === 'DELETE' && !chatId) {
    const body = await readBody(request);
    if (body.confirmText !== 'APAGAR TODOS OS CHATS') {
      sendJson(response, 400, { error: 'Confirmação obrigatória para apagar todos os chats.' });
      return;
    }
    const deleted = await deleteAllChats();
    sendJson(response, 200, {
      deleted,
      chats: await listChats(),
      activeChat: null,
      activeChatEvents: [],
    });
    return;
  }

  if (method === 'POST' && !chatId) {
    const config = await loadConfig();
    const chat = await createChat('New chat', { provider: config.provider, model: config.model });
    sendJson(response, 201, { chat, chats: await listChats() });
    return;
  }

  if (method === 'PUT' && chatId && parts.length === 3) {
    const body = await readBody(request);
    if (body.modelCapabilities) {
      await saveConfig({ modelCapabilities: body.modelCapabilities, setupComplete: true });
    }
    const config = await loadConfig();
    const offlineMode = config.privacy?.offlineMode === true;
    const currentChat = offlineMode ? await readChat(chatId) : null;
    const hasProvider = Object.hasOwn(body, 'provider') && body.provider !== undefined;
    const hasModel = Object.hasOwn(body, 'model') && body.model !== undefined;
    let nextProvider = hasProvider ? body.provider : undefined;
    let nextModel = hasModel ? body.model : undefined;
    if (offlineMode && (hasProvider || hasModel)) {
      const requestedProvider = hasProvider ? body.provider : currentChat?.provider || config.provider;
      if (requestedProvider === 'ollama') {
        nextProvider = 'ollama';
        nextModel = hasModel ? body.model : currentChat?.provider === 'ollama' ? currentChat.model : config.model;
      } else {
        nextProvider = 'ollama';
        nextModel = config.model;
      }
    }
    await updateChatMetadata(chatId, {
      title: body.title,
      folder: body.folder,
      provider: nextProvider,
      model: nextModel,
      modelSettings: body.modelSettings,
      systemPromptExtra: body.systemPromptExtra,
    });
    await appendEvent({
      type: 'chat.metadata.updated',
      chatId,
      details: { title: body.title, provider: nextProvider ?? body.provider, model: nextModel ?? body.model },
    });
    sendJson(response, 200, {
      chat: await readChat(chatId),
      chats: await listChats(),
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'DELETE' && chatId && parts.length === 3) {
    await deleteChat(chatId);
    let chats = await listChats();
    if (chats.length === 0) {
      const config = await loadConfig();
      await createChat('New chat', { provider: config.provider, model: config.model });
      chats = await listChats();
    }
    const activeChat = chats[0] ? await readChat(chats[0].id) : null;
    sendJson(response, 200, {
      chats,
      activeChat,
      activeChatEvents: activeChat ? await readChatEvents(activeChat.id) : [],
    });
    return;
  }

  if (method === 'GET' && chatId && parts.length === 3) {
    sendJson(response, 200, { chat: await readChat(chatId), activeChatEvents: await readChatEvents(chatId) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'attachments' && parts.length === 4) {
    const body = await readBody(request, { limit: CHAT_ATTACHMENT_BODY_LIMIT });
    const attachment = await saveAttachment(chatId, body);
    sendJson(response, 201, {
      attachment,
      chat: await readChat(chatId),
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'GET' && chatId && parts[3] === 'attachments' && parts[5] === 'content') {
    const { attachment, data } = await readAttachmentFile(chatId, parts[4]);
    response.writeHead(200, {
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeHeaderValue(attachment.name)}"`,
      'Cache-Control': 'no-store',
    });
    response.end(data);
    return;
  }

  if (method === 'GET' && chatId && parts[3] === 'attachments' && parts[5] === 'text') {
    const { attachment, content } = await readAttachmentTextContent(chatId, parts[4]);
    sendJson(response, 200, { attachment, content, editable: true });
    return;
  }

  if (method === 'PUT' && chatId && parts[3] === 'attachments' && parts[5] === 'text') {
    const body = await readBody(request, { limit: CHAT_ATTACHMENT_BODY_LIMIT });
    const update = await writeAttachmentTextContent(chatId, parts[4], body.content || '');
    sendJson(response, 200, {
      attachment: update.attachment,
      previousContent: update.previousContent,
      content: update.content,
      chat: await readChat(chatId),
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'DELETE' && chatId && parts[3] === 'attachments' && parts[4]) {
    await deleteAttachment(chatId, parts[4]);
    sendJson(response, 200, {
      chat: await readChat(chatId),
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'PUT' && chatId && parts[3] === 'memory') {
    const body = await readBody(request);
    sendJson(response, 200, {
      chat: await writeMemory(chatId, body.content || ''),
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'GET' && chatId && parts[3] === 'context') {
    const chat = await readChat(chatId);
    sendJson(response, 200, {
      content: await readContextSummary(chatId),
      path: chat.paths.context,
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'PUT' && chatId && parts[3] === 'context') {
    const body = await readBody(request);
    const result = await editContextSummary(chatId, body.content || '');
    sendJson(response, 200, { ...result, activeChatEvents: await readChatEvents(chatId) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'messages') {
    const body = await readBody(request);
    const result = await sendUserMessage(chatId, body.content || '', {
      retryMessageId: body.retryMessageId || null,
      continueMessageId: body.continueMessageId || null,
      attachmentIds: body.attachmentIds || [],
    });
    sendJson(response, 200, { ...result, activeChatEvents: await readChatEvents(chatId) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'stop') {
    const body = await readBody(request);
    const result = await stopChatRun(chatId, { reason: body.reason || 'user_requested' });
    sendJson(response, 200, {
      ...result,
      chat: await readChat(chatId),
      activeChatEvents: await readChatEvents(chatId),
    });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'tool-approvals' && parts[4]) {
    const body = await readBody(request);
    const result = await continueToolApproval(chatId, parts[4], body.decision || 'approve', {
      toolCallId: body.toolCallId || null,
    });
    sendJson(response, 200, { ...result, chats: await listChats(), activeChatEvents: await readChatEvents(chatId) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'compact') {
    const result = await compactChat(chatId);
    sendJson(response, 200, { ...result, activeChatEvents: await readChatEvents(chatId) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'save-context') {
    const result = await saveContextWindow(chatId);
    sendJson(response, 200, { ...result, activeChatEvents: await readChatEvents(chatId) });
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de chat nao encontrado.' });
}

async function handleProfilesApi(request, response, parts) {
  const method = request.method || 'GET';
  const profileId = parts[2];

  if (method === 'GET' && !profileId) {
    const runtimeInfo = await getRuntimeInfo();
    sendJson(response, 200, {
      profiles: runtimeInfo.profiles,
      activeProfile: runtimeInfo.activeProfile,
      runtimeHome: runtimeInfo.runtimeHome,
    });
    return;
  }

  if (method === 'POST' && !profileId) {
    const body = await readBody(request);
    const profile = await createProfile(body.name || 'Nova seção');
    sendJson(response, 201, await withProfileScope(profile.id, () => buildBootstrapPayload()));
    return;
  }

  if (method === 'POST' && profileId && parts[3] === 'activate') {
    const profile = await activateProfile(profileId);
    sendJson(response, 200, await withProfileScope(profile.id, () => buildBootstrapPayload()));
    return;
  }

  if (method === 'PUT' && profileId && parts.length === 3) {
    const body = await readBody(request);
    await updateProfile(profileId, { name: body.name });
    const runtimeInfo = await getRuntimeInfo();
    sendJson(response, 200, {
      profiles: runtimeInfo.profiles,
      activeProfile: runtimeInfo.activeProfile,
      runtimeHome: runtimeInfo.runtimeHome,
    });
    return;
  }

  if (method === 'DELETE' && profileId && parts.length === 3) {
    const deleted = await deleteProfile(profileId);
    sendJson(response, 200, await withProfileScope(deleted?.activeProfileId || 'default', () => buildBootstrapPayload()));
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de seção não encontrado.' });
}

async function handleScheduledTasksApi(request, response, parts) {
  const method = request.method || 'GET';
  const taskId = parts[2];

  if (method === 'GET' && !taskId) {
    sendJson(response, 200, { scheduledTasks: await listScheduledTasks() });
    return;
  }

  if (method === 'POST' && !taskId) {
    const body = await readBody(request);
    const task = await createScheduledTask(body);
    sendJson(response, 201, { scheduledTask: task, scheduledTasks: await listScheduledTasks() });
    return;
  }

  if (method === 'PUT' && taskId) {
    const body = await readBody(request);
    const task = await updateScheduledTask(taskId, body);
    sendJson(response, 200, { scheduledTask: task, scheduledTasks: await listScheduledTasks() });
    return;
  }

  if (method === 'DELETE' && taskId) {
    await deleteScheduledTask(taskId);
    sendJson(response, 200, { scheduledTasks: await listScheduledTasks() });
    return;
  }

  if (method === 'POST' && taskId && parts[3] === 'run') {
    const result = await runScheduledTaskNow(taskId);
    sendJson(response, 200, { ...result, scheduledTasks: await listScheduledTasks() });
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de tarefa agendada não encontrado.' });
}

async function handleEmailTestApi(request, response) {
  const body = await readBody(request);
  const config = await loadConfig();
  const email = config.email || {};
  const apiKey = String(body.resendApiKey || email.resendApiKey || '').trim();
  const destinationEmail = String(body.destinationEmail || email.destinationEmail || '').trim();
  if (!apiKey || !destinationEmail) {
    sendJson(response, 400, { error: 'Configure a chave do Resend e o email de destino antes de testar.' });
    return;
  }
  try {
    const sent = await sendEmail({
      apiKey,
      to: destinationEmail,
      subject: 'My Computer - email de teste',
      text: 'Se você recebeu este email, o envio via Resend está configurado corretamente.',
    });
    sendJson(response, 200, { sent: true, id: sent.id });
  } catch (error) {
    sendJson(response, 502, { sent: false, error: error.message });
  }
}

async function handleUserMemoryApi(request, response, parts) {
  const method = request.method || 'GET';
  const fileId = parts[2];

  if (method === 'GET' && !fileId) {
    sendJson(response, 200, { files: await listUserMemoryFilesWithHints() });
    return;
  }

  if (method === 'GET' && fileId) {
    const file = await readUserMemoryFileWithHints(fileId);
    sendJson(response, 200, { file });
    return;
  }

  if (method === 'PUT' && fileId) {
    const body = await readBody(request, { limit: 8_000_000 });
    const update = await writeUserMemoryFileContent(fileId, body.content || '');
    const file = await readUserMemoryFileWithHints(update.file.id);
    sendJson(response, 200, {
      file,
      files: await listUserMemoryFilesWithHints(),
    });
    return;
  }

  if (method === 'POST' && !fileId) {
    const body = await readBody(request, { limit: 8_000_000 });
    const file = await saveUserMemoryFile(body);
    sendJson(response, 201, { file, files: await listUserMemoryFilesWithHints() });
    return;
  }

  if (method === 'DELETE' && fileId) {
    await deleteUserMemoryFile(fileId);
    sendJson(response, 200, { files: await listUserMemoryFilesWithHints() });
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de arquivo de memória não encontrado.' });
}

async function buildBootstrapPayload() {
  const config = await loadConfig();
  const runtimeInfo = await getRuntimeInfo();
  const { providers, models, ollamaInstalledModels } = await buildClientCatalog(config);
  const chats = await listChats();
  const activeChat = chats[0] ? await readChat(chats[0].id) : null;
  return {
    config: sanitizeConfig(config),
    providers,
    models,
    ollamaInstalledModels,
    chats,
    activeChat,
    activeChatEvents: activeChat ? await readChatEvents(activeChat.id) : [],
    persistentMemory: await readPersistentMemory(),
    userMemoryFiles: await listUserMemoryFilesWithHints(),
    scheduledTasks: await listScheduledTasks(),
    runtimeHome: runtimeInfo.runtimeHome,
    rootRuntimeHome: runtimeInfo.rootRuntimeHome,
    profiles: runtimeInfo.profiles,
    activeProfile: runtimeInfo.activeProfile,
    networkStatus: getNetworkStatus(config),
  };
}

async function buildClientCatalog(config) {
  const ollamaInstalledModels = await listOllamaInstalledModels(config);
  await refreshRuntimeModelCatalog(config, { ollamaInstalledModels });
  return {
    providers: getProvidersForClient({
      customModelsByProvider: config.customModels,
      modelCapabilitiesByProvider: config.modelCapabilities,
      ollamaInstalledModels,
    }),
    models: getProviderModels(config.provider, {
      customModels: config.customModels?.[config.provider],
      modelCapabilities: config.modelCapabilities?.[config.provider],
      ollamaInstalledModels,
    }),
    ollamaInstalledModels,
  };
}

function readChatEvents(chatId) {
  return readEvents({ chatId, limit: CHAT_EVENT_DETAIL_LIMIT });
}

async function handleOllamaApi(request, response, parts) {
  const method = request.method || 'GET';

  if (method === 'GET' && parts[2] === 'status') {
    const config = await loadConfig();
    const version = await runTerminalCommand('command -v ollama >/dev/null 2>&1 && ollama --version || true', {
      timeoutSeconds: 5,
      outputLimit: 2000,
    });
    const installed = Boolean(version.stdout.trim());
    const models = await listOllamaInstalledModels(config);
    sendJson(response, 200, {
      installed,
      running: models.length > 0 || installed,
      version: version.stdout.trim(),
      models,
      installCommand: 'curl -fsSL https://ollama.com/install.sh | sh',
      note: installed
        ? 'Ollama encontrado. Se a lista de modelos estiver vazia, o serviço pode estar parado ou sem modelos instalados.'
        : 'Ollama não foi encontrado no PATH.',
    });
    return;
  }

  if (method === 'POST' && parts[2] === 'install') {
    const result = await runTerminalCommand('curl -fsSL https://ollama.com/install.sh | sh', {
      timeoutSeconds: 300,
      outputLimit: 20000,
    });
    await appendEvent({
      type: 'ollama.install',
      details: { exitCode: result.exitCode, timedOut: result.timedOut },
    });
    sendJson(response, 200, {
      ok: result.exitCode === 0,
      result,
      message:
        result.exitCode === 0
          ? 'Ollama instalado.'
          : 'A instalação pelo navegador falhou. Se o output mencionar sudo/senha, rode o comando exibido no terminal.',
    });
    return;
  }

  if (method === 'POST' && parts[2] === 'pull') {
    const body = await readBody(request);
    const model = String(body.model || '').trim();
    if (!model) {
      sendJson(response, 400, { error: 'Modelo do Ollama não informado.' });
      return;
    }
    const result = await runTerminalCommand(`ollama pull ${shellQuote(model)}`, {
      timeoutSeconds: 600,
      outputLimit: 30000,
    });
    await appendEvent({
      type: 'ollama.pull',
      details: { model, exitCode: result.exitCode, timedOut: result.timedOut },
    });
    const config = await loadConfig();
    sendJson(response, result.exitCode === 0 ? 200 : 500, {
      result,
      models: await listOllamaInstalledModels(config),
    });
    return;
  }

  if (method === 'POST' && parts[2] === 'rm') {
    const body = await readBody(request);
    const model = String(body.model || '').trim();
    if (!model) {
      sendJson(response, 400, { error: 'Modelo do Ollama não informado.' });
      return;
    }
    const result = await runTerminalCommand(`ollama rm ${shellQuote(model)}`, {
      timeoutSeconds: 120,
      outputLimit: 12000,
    });
    await appendEvent({
      type: 'ollama.rm',
      details: { model, exitCode: result.exitCode, timedOut: result.timedOut },
    });
    const config = await loadConfig();
    sendJson(response, result.exitCode === 0 ? 200 : 500, {
      result,
      models: await listOllamaInstalledModels(config),
    });
    return;
  }

  if (method === 'POST' && parts[2] === 'uninstall') {
    const command = [
      'sudo systemctl stop ollama 2>/dev/null || true',
      'sudo systemctl disable ollama 2>/dev/null || true',
      'sudo rm -f /etc/systemd/system/ollama.service /usr/local/bin/ollama',
      'sudo rm -rf /usr/share/ollama',
      'sudo systemctl daemon-reload 2>/dev/null || true',
    ].join(' && ');
    const result = await runTerminalCommand(command, {
      timeoutSeconds: 180,
      outputLimit: 20000,
    });
    await appendEvent({
      type: 'ollama.uninstall',
      details: { exitCode: result.exitCode, timedOut: result.timedOut },
    });
    sendJson(response, 200, {
      ok: result.exitCode === 0,
      command,
      result,
      message:
        result.exitCode === 0
          ? 'Ollama removido pelo comando do sistema.'
          : 'Não foi possível remover automaticamente. Se o output mencionar sudo/senha, rode o comando exibido no terminal.',
    });
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de Ollama nao encontrado.' });
}

async function serveStatic(response, requestPath) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(panelDir, decodeURIComponent(relativePath));
  const panelRoot = path.resolve(panelDir);

  if (resolvedPath !== panelRoot && !resolvedPath.startsWith(`${panelRoot}${path.sep}`)) {
    sendJson(response, 403, { error: 'Acesso negado.' });
    return;
  }

  try {
    const data = await fs.readFile(resolvedPath);
    const contentType = CONTENT_TYPES[path.extname(resolvedPath)] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    response.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const index = await fs.readFile(path.join(panelDir, 'index.html'));
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'], 'Cache-Control': 'no-store' });
      response.end(index);
      return;
    }
    throw error;
  }
}

async function readBody(request, options = {}) {
  const limit = options.limit || 1_000_000;
  let raw = '';
  let tooLarge = false;
  for await (const chunk of request) {
    if (tooLarge) continue;
    raw += chunk.toString();
    if (raw.length > limit) {
      tooLarge = true;
      raw = '';
    }
  }

  if (tooLarge) {
    const error = new Error('Payload muito grande.');
    error.statusCode = 413;
    throw error;
  }

  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('JSON invalido.');
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const statusCode = error.statusCode && Number(error.statusCode) < 600 ? Number(error.statusCode) : 500;
  sendJson(response, statusCode, {
    error: error.message || 'Erro interno.',
    details: process.env.NODE_ENV === 'development' ? error.details : undefined,
  });
}

function isTrustedMutationRequest(request) {
  if (request.headers['x-my-computer-request'] !== PANEL_REQUEST_HEADER) return false;
  return isTrustedOriginHeader(request.headers.origin, request) && isTrustedOriginHeader(request.headers.referer, request);
}

function isTrustedOriginHeader(value, request) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    const host = request.headers.host;
    return Boolean(host) && parsed.host === host;
  } catch {
    return false;
  }
}

function getRequestProfileId(request, url) {
  return String(request.headers['x-profile-id'] || url.searchParams.get('profileId') || '').trim() || null;
}

export function getNetworkStatus(config = {}) {
  const port = currentLaunch.port || Number(process.env.PORT || 8787);
  const bindHost =
    currentLaunch.actualHost ||
    currentLaunch.requestedHost ||
    (config.server?.networkEnabled ? '0.0.0.0' : '127.0.0.1');
  const networkEnabled = config.server?.networkEnabled === true;
  const localUrl = `http://127.0.0.1:${port}`;
  const lanUrls = networkEnabled && bindHost === '0.0.0.0' ? getLanAddresses().map((address) => `http://${address}:${port}`) : [];
  return {
    port,
    bindHost,
    networkEnabled,
    authRequired: networkEnabled && Boolean(config.server?.authPassword),
    localUrl,
    lanUrls,
    checklist: [
      networkEnabled ? 'Rede local ligada.' : 'Ligue "Abrir painel para a rede".',
      config.server?.authPassword ? 'Senha definida.' : 'Defina uma senha.',
      bindHost === '0.0.0.0' ? 'Servidor reiniciado escutando em 0.0.0.0.' : 'Reinicie o servidor para escutar na rede.',
      'Use um dispositivo na mesma rede Wi-Fi.',
      `Abra a porta ${port} no firewall se o acesso falhar.`,
    ],
  };
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item.address)
    .filter(Boolean);
}

function isAuthorized(request, auth) {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : decoded;
  return password === auth.password;
}

function encodeHeaderValue(value) {
  return String(value || 'attachment').replace(/["\\]/g, '_');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function listen(handler, host, startPort) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const actualPort = startPort + attempt;
    const server = http.createServer(handler);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(actualPort, host, resolve);
      });
      return { server, actualPort: server.address()?.port || actualPort };
    } catch (error) {
      server.close();
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }

  throw new Error(`Nao encontrei uma porta livre entre ${startPort} e ${startPort + 19}.`);
}
