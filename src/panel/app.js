const state = {
  config: null,
  chats: [],
  activeChat: null,
  events: [],
  runtimeHome: '',
  busy: false,
  status: '',
  error: '',
};

const app = document.querySelector('#app');

bootstrap();

async function bootstrap() {
  try {
    const data = await api('/api/bootstrap');
    Object.assign(state, data);
    render();
  } catch (error) {
    renderError(error);
  }
}

function render() {
  if (!state.config?.setupComplete) {
    renderSetup();
    return;
  }
  renderApp();
}

function renderSetup() {
  app.innerHTML = `
    <main class="setup-screen">
      <section class="setup-panel">
        <div>
          <h1>My Computer</h1>
          <p>Painel local para conversar com uma IA que pode usar o terminal quando precisar.</p>
        </div>
        <form class="setup-form" id="setup-form">
          <div class="setup-grid">
            <label>
              Provider
              <select name="provider" disabled>
                <option value="groq">Groq</option>
              </select>
            </label>
            <label>
              Modelo padrao
              <input name="model" value="${escapeAttr(state.config?.model || 'llama-3.3-70b-versatile')}" />
            </label>
          </div>
          <label>
            Groq API key
            <input name="apiKey" type="password" autocomplete="off" placeholder="gsk_..." required />
          </label>
          <label>
            Idioma da IA
            <select name="language">
              <option value="auto">Automatico</option>
              <option value="pt-BR">Portugues brasileiro</option>
              <option value="en">English</option>
              <option value="es">Espanol</option>
            </select>
          </label>
          <label>
            System prompt extra / preferencias
            <textarea name="systemPromptExtra" rows="5" placeholder="Preferencias de tom, formato, limites e jeito de trabalhar."></textarea>
          </label>
          <div class="button-row">
            <button class="primary" type="submit">Salvar e abrir chat</button>
          </div>
          ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ''}
        </form>
      </section>
    </main>
  `;

  document.querySelector('#setup-form').addEventListener('submit', saveSetup);
}

function renderApp() {
  const chat = state.activeChat;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>My Computer</h1>
          <span>Provider: Groq</span>
        </div>
        <button class="primary" id="new-chat">Novo chat</button>
        <label>
          Modelo do novo chat
          <input id="new-chat-model" value="${escapeAttr(state.config.model || 'llama-3.3-70b-versatile')}" />
        </label>
        <div class="chat-list">
          ${state.chats.map(renderChatItem).join('')}
        </div>
        <div class="runtime">${escapeHtml(state.runtimeHome)}</div>
      </aside>

      <main class="chat-main">
        <header class="chat-header">
          <div>
            <h2 class="chat-title">${escapeHtml(chat?.title || 'Chat')}</h2>
            <div class="meta">${chat ? `${escapeHtml(chat.id)} - ${escapeHtml(chat.model || state.config.model)}` : 'Sem chat ativo'}</div>
          </div>
          <div class="chat-header-actions">
            <button id="save-context" ${!chat || state.busy ? 'disabled' : ''}>Salvar contexto</button>
            <button id="compact-context" ${!chat || state.busy ? 'disabled' : ''}>Compactar</button>
          </div>
        </header>
        <section class="messages" id="messages">
          ${chat?.messages?.length ? chat.messages.map(renderMessage).join('') : '<p class="empty">Comece uma conversa.</p>'}
          ${state.busy ? renderPending() : ''}
        </section>
        <form class="composer" id="composer">
          <textarea name="content" placeholder="Digite uma mensagem..." ${state.busy ? 'disabled' : ''}></textarea>
          <button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>Enviar</button>
        </form>
      </main>

      <aside class="inspector">
        <section class="inspector-section">
          <h2>Configuracao</h2>
          <div class="settings-block">
            <label>
              Modelo padrao
              <input id="model-input" value="${escapeAttr(state.config.model || '')}" />
            </label>
            <label>
              Modelo deste chat
              <input id="chat-model-input" value="${escapeAttr(chat?.model || state.config.model || '')}" />
            </label>
            <div class="button-row">
              <button id="save-chat-model" ${!chat ? 'disabled' : ''}>Salvar modelo do chat</button>
            </div>
            <label>
              Idioma
              <select id="language-input">
                ${renderLanguageOption('auto', 'Automatico')}
                ${renderLanguageOption('pt-BR', 'Portugues brasileiro')}
                ${renderLanguageOption('en', 'English')}
                ${renderLanguageOption('es', 'Espanol')}
              </select>
            </label>
            <label>
              Nova API key
              <input id="api-key-input" type="password" placeholder="${state.config.apiKeySet ? 'ja configurada' : 'gsk_...'}" />
            </label>
            <label>
              System prompt extra
              <textarea id="prompt-input" rows="4">${escapeHtml(state.config.systemPromptExtra || '')}</textarea>
            </label>
            <button id="save-config">Salvar config</button>
          </div>
        </section>

        <section class="inspector-section">
          <h2>Memoria do chat</h2>
          <textarea id="memory-editor" class="memory-editor">${escapeHtml(chat?.memory || '')}</textarea>
          <button id="save-memory" ${!chat ? 'disabled' : ''}>Salvar memoria</button>
        </section>

        <section class="inspector-section">
          <h2>Status</h2>
          <div class="status ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status || 'Pronto')}</div>
        </section>

        <section class="inspector-section">
          <h2>Eventos</h2>
          <div class="event-list">${state.events.map(renderEvent).join('')}</div>
        </section>
      </aside>
    </div>
  `;

  bindAppEvents();
  scrollMessagesToBottom();
}

function renderChatItem(chat) {
  const active = state.activeChat?.id === chat.id ? 'active' : '';
  return `
    <button class="chat-item ${active}" data-chat-id="${escapeAttr(chat.id)}">
      <strong>${escapeHtml(chat.title)}</strong>
      <span class="meta">${new Date(chat.updatedAt).toLocaleString()}</span>
    </button>
  `;
}

function renderMessage(message) {
  const label = message.role === 'user' ? 'Voce' : 'Assistente';
  return `
    <article class="message ${escapeAttr(message.role)}">
      <div class="message-label">${label}</div>
      ${(message.toolUses || []).map(renderToolUse).join('')}
      <div class="bubble">${formatContent(message.content)}</div>
    </article>
  `;
}

function renderToolUse(toolUse) {
  const result = toolUse.result || {};
  const command = toolUse.input?.command || '';
  const genericInput = JSON.stringify(toolUse.input || {}, null, 2);
  const genericResult = JSON.stringify(result || {}, null, 2);
  return `
    <details class="tool-box" open>
      <summary class="tool-summary">
        <span>Tool usada: ${escapeHtml(toolUse.name)}</span>
        <span>${result.exitCode === undefined ? escapeHtml(result.action || 'ok') : `exit ${escapeHtml(String(result.exitCode))}`}</span>
      </summary>
      <div class="tool-body">
        ${
          command
            ? `<div><div class="message-label">Comando</div><pre>${escapeHtml(command)}</pre></div>`
            : `<div><div class="message-label">Input</div><pre>${escapeHtml(genericInput)}</pre></div>`
        }
        ${result.stdout ? `<div><div class="message-label">stdout</div><pre>${escapeHtml(result.stdout)}</pre></div>` : ''}
        ${result.stderr ? `<div><div class="message-label">stderr</div><pre>${escapeHtml(result.stderr)}</pre></div>` : ''}
        ${!result.stdout && !result.stderr ? `<div><div class="message-label">Resultado</div><pre>${escapeHtml(genericResult)}</pre></div>` : ''}
      </div>
    </details>
  `;
}

function renderPending() {
  return `
    <article class="message assistant pending">
      <div class="message-label">Assistente</div>
      <div class="bubble">${escapeHtml(state.status || 'Pensando...')}</div>
    </article>
  `;
}

function renderEvent(event) {
  return `
    <div class="event-item">
      <strong>${escapeHtml(event.type)}</strong><br />
      ${escapeHtml(new Date(event.createdAt).toLocaleString())}
    </div>
  `;
}

function renderLanguageOption(value, label) {
  const selected = state.config.language === value ? 'selected' : '';
  return `<option value="${escapeAttr(value)}" ${selected}>${escapeHtml(label)}</option>`;
}

function bindAppEvents() {
  document.querySelector('#new-chat').addEventListener('click', createNewChat);
  document.querySelectorAll('[data-chat-id]').forEach((button) => {
    button.addEventListener('click', () => loadChat(button.dataset.chatId));
  });
  document.querySelector('#composer').addEventListener('submit', sendMessage);
  document.querySelector('#save-memory').addEventListener('click', saveMemory);
  document.querySelector('#save-config').addEventListener('click', saveConfig);
  document.querySelector('#save-chat-model').addEventListener('click', saveChatModel);
  document.querySelector('#compact-context').addEventListener('click', compactContext);
  document.querySelector('#save-context').addEventListener('click', saveContext);
}

async function saveSetup(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction('Salvando configuracao...', async () => {
    await api('/api/config', {
      method: 'PUT',
      body: {
        apiKey: form.get('apiKey'),
        model: form.get('model'),
        language: form.get('language'),
        systemPromptExtra: form.get('systemPromptExtra'),
      },
    });
    await bootstrap();
  });
}

async function createNewChat() {
  await runAction('Criando chat...', async () => {
    const model = document.querySelector('#new-chat-model')?.value || state.config.model;
    const data = await api('/api/chats', { method: 'POST', body: { title: 'Novo chat', model } });
    state.chats = data.chats;
    state.activeChat = data.chat;
  });
}

async function loadChat(chatId) {
  await runAction('Abrindo chat...', async () => {
    const data = await api(`/api/chats/${chatId}`);
    state.activeChat = data.chat;
  });
}

async function sendMessage(event) {
  event.preventDefault();
  const textarea = event.currentTarget.elements.content;
  const content = textarea.value.trim();
  if (!content || !state.activeChat) return;
  textarea.value = '';

  const localMessage = {
    id: `local-${Date.now()}`,
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
  state.activeChat.messages = [...state.activeChat.messages, localMessage];

  await runAction('Enviando para Groq...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/messages`, {
      method: 'POST',
      body: { content },
    });
    state.activeChat = data.chat;
    const fresh = await api('/api/chats');
    state.chats = fresh.chats;
    await refreshEvents();
  });
}

async function saveMemory() {
  const content = document.querySelector('#memory-editor').value;
  await runAction('Salvando memoria...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/memory`, {
      method: 'PUT',
      body: { content },
    });
    state.activeChat = data.chat;
  });
}

async function saveConfig() {
  await runAction('Salvando config...', async () => {
    const data = await api('/api/config', {
      method: 'PUT',
      body: {
        apiKey: document.querySelector('#api-key-input').value,
        model: document.querySelector('#model-input').value,
        language: document.querySelector('#language-input').value,
        systemPromptExtra: document.querySelector('#prompt-input').value,
      },
    });
    state.config = data.config;
  });
}

async function saveChatModel() {
  await runAction('Salvando modelo do chat...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        model: document.querySelector('#chat-model-input').value,
      },
    });
    state.activeChat = data.chat;
    state.chats = data.chats;
    await refreshEvents();
  });
}

async function compactContext() {
  await runAction('Compactando contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/compact`, { method: 'POST' });
    state.activeChat = data.chat;
    await refreshEvents();
  });
}

async function saveContext() {
  await runAction('Salvando janela de contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/save-context`, { method: 'POST' });
    state.activeChat = data.chat;
    state.status = `Contexto salvo em ${data.path}`;
    await refreshEvents();
  });
}

async function refreshEvents() {
  const data = await api('/api/bootstrap');
  state.events = data.events;
  state.chats = data.chats;
}

async function runAction(status, action) {
  state.busy = true;
  state.status = status;
  state.error = '';
  render();
  try {
    await action();
    state.status = 'Pronto';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = false;
    render();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function scrollMessagesToBottom() {
  const messages = document.querySelector('#messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function renderError(error) {
  app.innerHTML = `<main class="setup-screen"><p class="error">${escapeHtml(error.message)}</p></main>`;
}

function formatContent(content) {
  return escapeHtml(content || '');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
