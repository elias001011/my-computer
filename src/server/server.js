import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { panelDir, runtimeHome } from './paths.js';
import { compactChat, saveContextWindow, sendUserMessage } from './assistant.js';
import {
  appendEvent,
  createChat,
  ensureRuntime,
  listChats,
  loadConfig,
  readChat,
  readEvents,
  sanitizeConfig,
  saveConfig,
  updateChatMetadata,
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
    let chats = await listChats();
    if (config.setupComplete && chats.length === 0) {
      await createChat('Novo chat', { model: config.model });
      chats = await listChats();
    }
    const activeChat = chats[0] ? await readChat(chats[0].id) : null;
    sendJson(response, 200, {
      config: sanitizeConfig(config),
      chats,
      activeChat,
      events: await readEvents(),
      runtimeHome,
    });
    return;
  }

  if (method === 'PUT' && parts[1] === 'config') {
    const body = await readBody(request);
    const config = await saveConfig({
      provider: 'groq',
      apiKey: body.apiKey,
      model: body.model,
      language: body.language || 'auto',
      systemPromptExtra: body.systemPromptExtra || '',
      setupComplete: true,
    });
    sendJson(response, 200, { config: sanitizeConfig(config) });
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
    const body = await readBody(request);
    const config = await loadConfig();
    const chat = await createChat(body.title || 'Novo chat', { model: body.model || config.model });
    sendJson(response, 201, { chat, chats: await listChats() });
    return;
  }

  if (method === 'PUT' && chatId && parts.length === 3) {
    const body = await readBody(request);
    await updateChatMetadata(chatId, {
      title: body.title,
      model: body.model,
    });
    await appendEvent({
      type: 'chat.metadata.updated',
      chatId,
      details: { title: body.title, model: body.model },
    });
    sendJson(response, 200, { chat: await readChat(chatId), chats: await listChats() });
    return;
  }

  if (method === 'GET' && chatId && parts.length === 3) {
    sendJson(response, 200, { chat: await readChat(chatId) });
    return;
  }

  if (method === 'PUT' && chatId && parts[3] === 'memory') {
    const body = await readBody(request);
    sendJson(response, 200, { chat: await writeMemory(chatId, body.content || '') });
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'messages') {
    const body = await readBody(request);
    sendJson(response, 200, await sendUserMessage(chatId, body.content || ''));
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'compact') {
    sendJson(response, 200, await compactChat(chatId));
    return;
  }

  if (method === 'POST' && chatId && parts[3] === 'save-context') {
    sendJson(response, 200, await saveContextWindow(chatId));
    return;
  }

  sendJson(response, 404, { error: 'Endpoint de chat nao encontrado.' });
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

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 1_000_000) {
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
