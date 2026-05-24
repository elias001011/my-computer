import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { panelDir, runtimeHome } from './paths.js';
import { compactChat, saveContextWindow, sendUserMessage } from './assistant.js';
import { getProviderModels, getProvidersForClient } from './models.js';
import { listOllamaInstalledModels } from './provider-client.js';
import { runTerminalCommand } from './tools.js';
import {
  appendEvent,
  createChat,
  deleteChat,
  deleteAttachment,
  ensureRuntime,
  exportRuntimeData,
  importRuntimeData,
  listChats,
  loadConfig,
  readAttachmentFile,
  readChat,
  readEvents,
  readPersistentMemory,
  saveAttachment,
  sanitizeConfig,
  saveConfig,
  updateChatMetadata,
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

export async function startServer({ port = Number(process.env.PORT || 8787), host = '127.0.0.1' } = {}) {
  await ensureRuntime();
  const handler = (request, response) => {
    handleRequest(request, response).catch((error) => sendError(response, error));
  };
  const { server, actualPort } = await listen(handler, host, port);
  const url = `http://${host}:${actualPort}`;
  return { server, url, runtimeHome };
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
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method || 'GET';

  if (method === 'GET' && parts[1] === 'bootstrap') {
    const config = await loadConfig();
    const ollamaInstalledModels = await listOllamaInstalledModels(config);
    let chats = await listChats();
    if (config.setupComplete && chats.length === 0) {
      await createChat('Novo chat', { provider: config.provider, model: config.model });
      chats = await listChats();
    }
    const activeChat = chats[0] ? await readChat(chats[0].id) : null;
    sendJson(response, 200, {
      config: sanitizeConfig(config),
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
      chats,
      activeChat,
      activeChatEvents: activeChat ? await readEvents({ chatId: activeChat.id }) : [],
      persistentMemory: await readPersistentMemory(),
      runtimeHome,
    });
    return;
  }

  if (method === 'PUT' && parts[1] === 'config') {
    const body = await readBody(request);
    const config = await saveConfig({
      provider: body.provider,
      apiKey: body.apiKey,
      model: body.model,
      language: body.language || 'auto',
      userNickname: body.userNickname || '',
      systemPromptExtra: body.systemPromptExtra || '',
      tools: body.tools,
      providerSettings: body.providerSettings,
      customModels: body.customModels,
      modelCapabilities: body.modelCapabilities,
      setupComplete: true,
    });
    sendJson(response, 200, { config: sanitizeConfig(config) });
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
    const body = await readBody(request, { limit: 20_000_000 });
    const imported = await importRuntimeData(body);
    const config = await loadConfig();
    const ollamaInstalledModels = await listOllamaInstalledModels(config);
    const chats = await listChats();
    const activeChat = chats[0] ? await readChat(chats[0].id) : null;
    sendJson(response, 200, {
      imported,
      config: sanitizeConfig(config),
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
      chats,
      activeChat,
      activeChatEvents: activeChat ? await readEvents({ chatId: activeChat.id }) : [],
      persistentMemory: await readPersistentMemory(),
    });
    return;
  }

  if (method === 'PUT' && parts[1] === 'persistent-memory') {
    const body = await readBody(request);
    const persistentMemory = await writePersistentMemory(body.content || '');
    sendJson(response, 200, { persistentMemory });
    return;
  }

  if (parts[1] === 'ollama') {
    await handleOllamaApi(request, response, parts);
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

  if (method === 'POST' && !chatId) {
    const config = await loadConfig();
    const chat = await createChat('Novo chat', { provider: config.provider, model: config.model });
    sendJson(response, 201, { chat, chats: await listChats() });
    return;
  }

  if (method === 'PUT' && chatId && parts.length === 3) {
    const body = await readBody(request);
    if (body.modelCapabilities) {
      await saveConfig({ modelCapabilities: body.modelCapabilities, setupComplete: true });
    }
    await updateChatMetadata(chatId, {
      title: body.title,
      provider: body.provider,
      model: body.model,
      modelSettings: body.modelSettings,
      systemPromptExtra: body.systemPromptExtra,
    });
    await appendEvent({
      type: 'chat.metadata.updated',
      chatId,
      details: { title: body.title, provider: body.provider, model: body.model },
    });
    sendJson(response, 200, {
      chat: await readChat(chatId),
      chats: await listChats(),
      activeChatEvents: await readEvents({ chatId }),
    });
    return;
  }

  if (method === 'DELETE' && chatId && parts.length === 3) {
    await deleteChat(chatId);
    let chats = await listChats();
    if (chats.length === 0) {
      const config = await loadConfig();
      await createChat('Novo chat', { provider: config.provider, model: config.model });
      chats = await listChats();
    }
    const activeChat = chats[0] ? await readChat(chats[0].id) : null;
    sendJson(response, 200, {
      chats,
      activeChat,
      activeChatEvents: activeChat ? await readEvents({ chatId: activeChat.id }) : [],
    });
    return;
  }

  if (method === 'GET' && chatId && parts.length === 3) {
    sendJson(response, 200, { chat: await readChat(chatId), activeChatEvents: await readEvents({ chatId }) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'attachments' && parts.length === 4) {
    const body = await readBody(request, { limit: 30_000_000 });
    const attachment = await saveAttachment(chatId, body);
    sendJson(response, 201, {
      attachment,
      chat: await readChat(chatId),
      activeChatEvents: await readEvents({ chatId }),
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

  if (method === 'DELETE' && chatId && parts[3] === 'attachments' && parts[4]) {
    await deleteAttachment(chatId, parts[4]);
    sendJson(response, 200, {
      chat: await readChat(chatId),
      activeChatEvents: await readEvents({ chatId }),
    });
    return;
  }

  if (method === 'PUT' && chatId && parts[3] === 'memory') {
    const body = await readBody(request);
    sendJson(response, 200, {
      chat: await writeMemory(chatId, body.content || ''),
      activeChatEvents: await readEvents({ chatId }),
    });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'messages') {
    const body = await readBody(request);
    const result = await sendUserMessage(chatId, body.content || '', {
      retryMessageId: body.retryMessageId || null,
      attachmentIds: body.attachmentIds || [],
    });
    sendJson(response, 200, { ...result, activeChatEvents: await readEvents({ chatId }) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'compact') {
    const result = await compactChat(chatId);
    sendJson(response, 200, { ...result, activeChatEvents: await readEvents({ chatId }) });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'save-context') {
    const result = await saveContextWindow(chatId);
    sendJson(response, 200, { ...result, activeChatEvents: await readEvents({ chatId }) });
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de chat nao encontrado.' });
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
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > limit) {
      const error = new Error('Payload muito grande.');
      error.statusCode = 413;
      throw error;
    }
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
      return { server, actualPort };
    } catch (error) {
      server.close();
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }

  throw new Error(`Nao encontrei uma porta livre entre ${startPort} e ${startPort + 19}.`);
}
