const state = {
  config: null,
  models: [],
  chats: [],
  activeChat: null,
  persistentMemory: '',
  events: [],
  runtimeHome: '',
  busy: false,
  settingsOpen: false,
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
              Modelo padrão
              <select name="model">
                ${renderModelOptions(state.config?.model || 'llama-3.3-70b-versatile')}
              </select>
            </label>
          </div>
          <label>
            Groq API key
            <input name="apiKey" type="password" autocomplete="off" placeholder="gsk_..." required />
          </label>
          <label>
            Apelido
            <input name="userNickname" placeholder="Como a IA deve chamar você" />
          </label>
          <label>
            Idioma da IA
            <select name="language">
              ${renderLanguageOptions(state.config?.language || 'auto')}
            </select>
          </label>
          <label>
            System prompt geral
            <textarea name="systemPromptExtra" rows="5" placeholder="Preferências gerais de tom, formato, limites e jeito de trabalhar."></textarea>
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
          <span>Groq · ${escapeHtml(state.config.model || '')}</span>
        </div>
        <div class="sidebar-actions">
          <button class="primary" id="new-chat">Novo chat</button>
          <button id="open-settings">Configurações gerais</button>
        </div>
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
            <button id="save-context" ${!chat || state.busy ? 'disabled' : ''}>Salvar snapshot</button>
            <button id="compact-context" ${!chat || state.busy ? 'disabled' : ''}>Compactar contexto</button>
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
          <h2>Configurações do chat</h2>
          <div class="settings-block">
            <label>
              Modelo deste chat
              <select id="chat-model-input" ${!chat ? 'disabled' : ''}>
                ${renderModelOptions(chat?.model || state.config.model)}
              </select>
            </label>
            <label>
              System prompt do chat
              <textarea id="chat-prompt-input" rows="5" ${!chat ? 'disabled' : ''} placeholder="Preferências específicas deste chat.">${escapeHtml(chat?.systemPromptExtra || '')}</textarea>
            </label>
            <button id="save-chat-settings" ${!chat ? 'disabled' : ''}>Salvar configurações do chat</button>
          </div>
        </section>

        <section class="inspector-section">
          <h2>Memória do chat</h2>
          <textarea id="memory-editor" class="memory-editor" ${!chat ? 'disabled' : ''}>${escapeHtml(chat?.memory || '')}</textarea>
          <button id="save-memory" ${!chat ? 'disabled' : ''}>Salvar memória</button>
        </section>

        <section class="inspector-section">
          <h2>Status</h2>
          <div class="status ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status || 'Pronto')}</div>
        </section>

        <section class="inspector-section events-section">
          <h2>Eventos</h2>
          <div class="event-list">${state.events.map(renderEvent).join('')}</div>
        </section>
      </aside>
    </div>
    ${state.settingsOpen ? renderSettingsModal() : ''}
  `;

  bindAppEvents();
  scrollMessagesToBottom();
}

function renderSettingsModal() {
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <form id="general-settings-form">
          <header class="modal-header">
            <div>
              <h2 id="settings-title">Configurações gerais</h2>
              <p>Preferências globais, tools e memória compartilhada entre chats.</p>
            </div>
            <button type="button" id="close-settings" aria-label="Fechar">×</button>
          </header>

          <div class="modal-body">
            <section class="modal-section">
              <h3>Identidade e provider</h3>
              <div class="setup-grid">
                <label>
                  Apelido
                  <input name="userNickname" value="${escapeAttr(state.config.userNickname || '')}" placeholder="Como a IA deve chamar você" />
                </label>
                <label>
                  Modelo padrão
                  <select name="model">
                    ${renderModelOptions(state.config.model)}
                  </select>
                </label>
              </div>
              <div class="setup-grid">
                <label>
                  Idioma da IA
                  <select name="language">
                    ${renderLanguageOptions(state.config.language)}
                  </select>
                </label>
                <label>
                  Nova Groq API key
                  <input name="apiKey" type="password" autocomplete="off" placeholder="${state.config.apiKeySet ? 'já configurada' : 'gsk_...'}" />
                </label>
              </div>
              <label>
                System prompt geral
                <textarea name="systemPromptExtra" rows="5">${escapeHtml(state.config.systemPromptExtra || '')}</textarea>
              </label>
            </section>

            <section class="modal-section">
              <h3>Memória persistente</h3>
              <p class="help-text">Entra no prompt de todos os chats. A IA pode ler, anexar ou reescrever este Markdown quando a tool estiver ligada.</p>
              <textarea name="persistentMemory" class="memory-editor persistent-memory-editor">${escapeHtml(state.persistentMemory || '')}</textarea>
            </section>

            <section class="modal-section">
              <h3>Tools</h3>
              <div class="toggle-list">
                ${renderToolToggle('terminal', 'Terminal local', 'Permite que a IA execute comandos no terminal por run_terminal_command.')}
                ${renderToolToggle('chatMemory', 'Memória do chat', 'Permite que a IA edite o memory.md do chat atual por memory_chat.')}
                ${renderToolToggle('persistentMemory', 'Memória persistente', 'Permite que a IA edite a memória global por persistent_memory.')}
                ${renderToolToggle('autoCompact', 'Compactação automática', 'Permite que a IA chame compact_context quando o contexto estiver grande ou precisar preservar decisões.')}
              </div>
            </section>

            <section class="modal-section">
              <h3>Contexto</h3>
              <div class="explain-list">
                <p><strong>Janela interna do modelo:</strong> limite real do modelo na Groq. O app ainda aproxima por caracteres, então um modelo menor pode rejeitar chamadas se o prompt ficar grande demais.</p>
                <p><strong>Salvar snapshot:</strong> salva uma fotografia Markdown do estado atual em context-snapshots e atualiza context-window.md. Não muda o prompt futuro por si só.</p>
                <p><strong>Compactar contexto:</strong> pede ao modelo para resumir histórico, memória e decisões em context.md. Esse arquivo entra no prompt das próximas mensagens.</p>
                <p><strong>compact_context:</strong> tool opcional para a própria IA atualizar context.md quando perceber que a conversa está longa.</p>
              </div>
            </section>
          </div>

          <footer class="modal-footer">
            <button type="button" id="cancel-settings">Cancelar</button>
            <button class="primary" type="submit">Salvar configurações</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderToolToggle(name, title, description) {
  const checked = state.config.tools?.[name] !== false ? 'checked' : '';
  return `
    <label class="toggle-row">
      <input type="checkbox" name="tool_${escapeAttr(name)}" ${checked} />
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
    </label>
  `;
}

function renderChatItem(chat) {
  const active = state.activeChat?.id === chat.id ? 'active' : '';
  return `
    <button class="chat-item ${active}" data-chat-id="${escapeAttr(chat.id)}">
      <strong>${escapeHtml(chat.title)}</strong>
      <span class="meta">${escapeHtml(chat.model || state.config.model)} · ${new Date(chat.updatedAt).toLocaleString()}</span>
    </button>
  `;
}

function renderMessage(message) {
  const label = message.role === 'user' ? 'Você' : 'Assistente';
  const modelUsed = message.modelUsed ? `<span class="message-model">${escapeHtml(message.modelUsed)}</span>` : '';
  return `
    <article class="message ${escapeAttr(message.role)}">
      <div class="message-label">${label}${modelUsed}</div>
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
    <details class="tool-box">
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

function renderModelOptions(selectedModel) {
  const models = state.models?.length
    ? state.models
    : [{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', kind: 'Produção' }];
  const known = new Set(models.map((model) => model.id));
  const options = models
    .map((model) => {
      const selected = model.id === selectedModel ? 'selected' : '';
      return `<option value="${escapeAttr(model.id)}" ${selected}>${escapeHtml(model.label)} · ${escapeHtml(model.kind)} · ${escapeHtml(model.id)}</option>`;
    })
    .join('');

  if (selectedModel && !known.has(selectedModel)) {
    return `<option value="${escapeAttr(selectedModel)}" selected>${escapeHtml(selectedModel)}</option>${options}`;
  }
  return options;
}

function renderLanguageOptions(selectedLanguage = 'auto') {
  const languages = [
    ['auto', 'Automático'],
    ['pt-BR', 'Português brasileiro'],
    ['en', 'English'],
    ['es', 'Español'],
  ];
  return languages
    .map(([value, label]) => {
      const selected = selectedLanguage === value ? 'selected' : '';
      return `<option value="${escapeAttr(value)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function bindAppEvents() {
  document.querySelector('#new-chat').addEventListener('click', createNewChat);
  document.querySelector('#open-settings').addEventListener('click', openSettings);
  document.querySelectorAll('[data-chat-id]').forEach((button) => {
    button.addEventListener('click', () => loadChat(button.dataset.chatId));
  });
  document.querySelector('#composer').addEventListener('submit', sendMessage);
  document.querySelector('#save-memory').addEventListener('click', saveMemory);
  document.querySelector('#save-chat-settings').addEventListener('click', saveChatSettings);
  document.querySelector('#compact-context').addEventListener('click', compactContext);
  document.querySelector('#save-context').addEventListener('click', saveContext);

  if (state.settingsOpen) {
    document.querySelector('#general-settings-form').addEventListener('submit', saveGeneralSettings);
    document.querySelector('#close-settings').addEventListener('click', closeSettings);
    document.querySelector('#cancel-settings').addEventListener('click', closeSettings);
  }
}

async function saveSetup(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction('Salvando configuração...', async () => {
    await api('/api/config', {
      method: 'PUT',
      body: {
        apiKey: form.get('apiKey'),
        model: form.get('model'),
        language: form.get('language'),
        userNickname: form.get('userNickname'),
        systemPromptExtra: form.get('systemPromptExtra'),
      },
    });
    await bootstrap();
  });
}

async function createNewChat() {
  await runAction('Criando chat...', async () => {
    const data = await api('/api/chats', { method: 'POST' });
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
    await refreshBootstrapData();
  });
}

async function saveMemory() {
  const content = document.querySelector('#memory-editor').value;
  await runAction('Salvando memória...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/memory`, {
      method: 'PUT',
      body: { content },
    });
    state.activeChat = data.chat;
  });
}

async function saveChatSettings() {
  const model = document.querySelector('#chat-model-input').value;
  const systemPromptExtra = document.querySelector('#chat-prompt-input').value;
  await runAction('Salvando configurações do chat...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        model,
        systemPromptExtra,
      },
    });
    state.activeChat = data.chat;
    state.chats = data.chats;
    await refreshBootstrapData();
  });
}

async function saveGeneralSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction('Salvando configurações gerais...', async () => {
    const tools = {
      terminal: form.get('tool_terminal') === 'on',
      chatMemory: form.get('tool_chatMemory') === 'on',
      persistentMemory: form.get('tool_persistentMemory') === 'on',
      autoCompact: form.get('tool_autoCompact') === 'on',
    };
    const configResponse = await api('/api/config', {
      method: 'PUT',
      body: {
        apiKey: form.get('apiKey'),
        model: form.get('model'),
        language: form.get('language'),
        userNickname: form.get('userNickname'),
        systemPromptExtra: form.get('systemPromptExtra'),
        tools,
      },
    });
    const memoryResponse = await api('/api/persistent-memory', {
      method: 'PUT',
      body: { content: form.get('persistentMemory') },
    });
    state.config = configResponse.config;
    state.persistentMemory = memoryResponse.persistentMemory;
    state.settingsOpen = false;
    await refreshBootstrapData();
  });
}

async function compactContext() {
  await runAction('Compactando contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/compact`, { method: 'POST' });
    state.activeChat = data.chat;
    await refreshBootstrapData();
  });
}

async function saveContext() {
  await runAction('Salvando snapshot de contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/save-context`, { method: 'POST' });
    state.activeChat = data.chat;
    state.status = `Snapshot salvo em ${data.path}`;
    await refreshBootstrapData();
  });
}

async function refreshBootstrapData() {
  const data = await api('/api/bootstrap');
  state.config = data.config;
  state.models = data.models;
  state.events = data.events;
  state.chats = data.chats;
  state.persistentMemory = data.persistentMemory;
}

function openSettings() {
  state.settingsOpen = true;
  render();
}

function closeSettings() {
  state.settingsOpen = false;
  render();
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
