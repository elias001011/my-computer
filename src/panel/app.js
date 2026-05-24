const state = {
  config: null,
  providers: [],
  models: [],
  ollamaInstalledModels: [],
  chats: [],
  activeChat: null,
  activeChatEvents: [],
  persistentMemory: '',
  runtimeHome: '',
  busy: false,
  settingsOpen: false,
  chatContextOpen: false,
  modelSettingsOpen: false,
  settingsProvider: '',
  pendingAttachments: [],
  ollamaStatus: null,
  apiKeyVisible: false,
  setupApiKeyVisible: false,
  lastFailedAction: null,
  status: '',
  error: '',
};

const CUSTOM_MODEL_VALUE = '__custom__';

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
  const providerId = state.config?.provider || 'groq';
  const provider = getProvider(providerId);
  const model = state.config?.model || provider.defaultModel;
  const providerSettings = state.config?.providerSettings?.[providerId] || {};
  const setupApiKeys = providerSettings.apiKeys?.length ? providerSettings.apiKeys : [{ id: 'setup-empty', value: '' }];
  const showCustomModel = !isKnownModel(providerId, model);
  const showBaseUrl = provider.id === 'openai-compatible' || provider.id === 'ollama';
  const modelCanSeeImages = modelSupportsImages(providerId, model);
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
              <select name="provider" id="setup-provider">
                ${renderProviderOptions(providerId)}
              </select>
            </label>
            <label>
              Modelo padrão
              <select name="model" id="setup-model">
                ${renderModelOptions(providerId, model)}
              </select>
            </label>
          </div>
          <label class="${showCustomModel ? '' : 'hidden'}" id="setup-custom-model-row">
            Modelo personalizado
            <input name="customModel" value="${showCustomModel ? escapeAttr(model) : ''}" placeholder="provider/model ou nome local" />
          </label>
          <label class="toggle-row ${showCustomModel ? '' : 'hidden'}" id="setup-custom-model-images-row">
            <input type="checkbox" name="customModelImages" ${modelCanSeeImages ? 'checked' : ''} />
            <span>
              <strong>Este modelo suporta imagens</strong>
              <small>Ative apenas se o endpoint aceitar imagens no formato OpenAI vision.</small>
            </span>
          </label>
          ${providerId === 'ollama' ? renderOllamaSetup(model) : ''}
          <label class="${showBaseUrl ? '' : 'hidden'}">
            Endpoint/base URL
            <input name="baseUrl" value="${escapeAttr(providerSettings.baseUrl || provider.baseUrl || '')}" placeholder="https://api.exemplo.com/v1" ${showBaseUrl ? 'required' : ''} />
          </label>
          ${
            provider.requiresApiKey
              ? `
                <div class="setup-api-section">
                  <label>${escapeHtml(provider.label)} API keys</label>
                  <div class="api-key-list setup-api-key-list">
                    ${setupApiKeys.map((key, index) => renderApiKeyRow(key, index, { setup: true })).join('')}
                  </div>
                  <div class="button-row">
                    <button type="button" id="setup-add-api-key">Adicionar key</button>
                    <button type="button" id="setup-toggle-api-key">${state.setupApiKeyVisible ? 'Ocultar keys' : 'Ver keys'}</button>
                  </div>
                  <p class="help-text">Se houver mais de uma key, o backend alterna quando uma falha por rate limit, autenticação ou erro temporário.</p>
                </div>
              `
              : '<p class="help-text">Este provider não precisa de API key local.</p>'
          }
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
  document.querySelector('#setup-provider').addEventListener('change', (event) => {
    syncSetupApiDraft();
    state.config.provider = event.target.value;
    state.config.model = getProvider(event.target.value).defaultModel;
    renderSetup();
  });
  document.querySelector('#setup-model').addEventListener('change', toggleSetupCustomModel);
  document.querySelector('#setup-add-api-key')?.addEventListener('click', addSetupApiKeyRow);
  document.querySelector('#setup-toggle-api-key')?.addEventListener('click', toggleSetupApiKeyVisibility);
  document.querySelectorAll('.setup-remove-api-key').forEach((button) => {
    button.addEventListener('click', () => removeSetupApiKeyRow(Number(button.dataset.keyIndex)));
  });
  document.querySelector('#check-ollama')?.addEventListener('click', checkOllamaStatus);
  document.querySelector('#install-ollama')?.addEventListener('click', installOllama);
  document.querySelector('#pull-ollama-model')?.addEventListener('click', () => pullOllamaModel(model));
  document.querySelector('#uninstall-ollama')?.addEventListener('click', uninstallOllama);
  document.querySelectorAll('.remove-ollama-model').forEach((button) => {
    button.addEventListener('click', () => removeOllamaModel(button.dataset.model));
  });
}

function renderApp() {
  const chat = state.activeChat;
  const chatProviderId = chat?.provider || state.config.provider;
  const chatModel = chat?.model || state.config.model;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>My Computer</h1>
          <span>${escapeHtml(providerLabel(state.config.provider))} · ${escapeHtml(state.config.model || '')}</span>
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
            <div class="meta">${chat ? `${escapeHtml(chat.id)} - ${escapeHtml(providerLabel(chatProviderId))} - ${escapeHtml(chatModel)}` : 'Sem chat ativo'}</div>
          </div>
          <div class="chat-header-actions">
            <button id="save-context" ${!chat || state.busy ? 'disabled' : ''}>Salvar snapshot</button>
            <button id="compact-context" ${!chat || state.busy ? 'disabled' : ''}>Compactar contexto</button>
          </div>
        </header>
        <section class="messages" id="messages">
          ${state.error ? renderErrorBanner() : ''}
          ${chat?.messages?.length ? chat.messages.map(renderMessage).join('') : '<p class="empty">Comece uma conversa.</p>'}
          ${state.busy ? renderPending() : ''}
        </section>
        <form class="composer" id="composer">
          <div class="attachment-tray" id="attachment-tray">
            ${state.pendingAttachments.length ? state.pendingAttachments.map((attachment) => renderAttachmentCard(attachment, { pending: true })).join('') : ''}
          </div>
          <div class="composer-main">
            <label class="attach-button icon-button" title="Anexar arquivo" aria-label="Anexar arquivo">
              <span aria-hidden="true">+</span>
              <input id="file-input" type="file" multiple ${!chat || state.busy ? 'disabled' : ''} />
            </label>
            <textarea name="content" placeholder="Digite uma mensagem..." ${state.busy ? 'disabled' : ''}></textarea>
            <button class="primary icon-button" type="submit" aria-label="Enviar" title="Enviar" ${state.busy ? 'disabled' : ''}>
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </form>
      </main>

      <aside class="inspector">
        <section class="inspector-section">
          <h2>Configurações do chat</h2>
          <div class="settings-block">
            <label>
              Nome do chat
              <input id="chat-title-input" value="${escapeAttr(chat?.title || '')}" ${!chat ? 'disabled' : ''} />
            </label>
            <label>
              Provider deste chat
              <select id="chat-provider-input" ${!chat ? 'disabled' : ''}>
                ${renderProviderOptions(chatProviderId)}
              </select>
            </label>
            <label>
              Modelo deste chat
              <select id="chat-model-input" ${!chat ? 'disabled' : ''}>
                ${renderModelOptions(chatProviderId, chatModel)}
              </select>
            </label>
            <label class="${isKnownModel(chatProviderId, chatModel) ? 'hidden' : ''}" id="chat-custom-model-row">
              Modelo personalizado
              <input id="chat-custom-model-input" value="${isKnownModel(chatProviderId, chatModel) ? '' : escapeAttr(chatModel)}" ${!chat ? 'disabled' : ''} placeholder="provider/model ou nome local" />
            </label>
            <label class="toggle-row ${isKnownModel(chatProviderId, chatModel) ? 'hidden' : ''}" id="chat-custom-model-images-row">
              <input type="checkbox" id="chat-custom-model-images" ${modelSupportsImages(chatProviderId, chatModel) ? 'checked' : ''} ${!chat ? 'disabled' : ''} />
              <span>
                <strong>Este modelo suporta imagens</strong>
                <small>Use para modelos personalizados vision. Se desligado, imagens ficam bloqueadas.</small>
              </span>
            </label>
            ${chatProviderId === 'ollama' ? '<p class="help-text">Se o modelo local não estiver instalado, o My Computer chama o pull do Ollama antes da primeira resposta.</p>' : ''}
            <div class="button-row stacked-actions">
              <button type="button" id="open-chat-context" ${!chat ? 'disabled' : ''}>Prompt e memória</button>
              <button type="button" id="open-model-settings" ${!chat ? 'disabled' : ''}>Configurações do modelo</button>
            </div>
            <div class="button-row">
              <button id="save-chat-settings" ${!chat ? 'disabled' : ''}>Salvar configurações</button>
              <button id="delete-chat" class="danger-button" ${!chat ? 'disabled' : ''}>Apagar chat</button>
            </div>
          </div>
        </section>

        <section class="inspector-section">
          <h2>Status</h2>
          <div class="status ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status || 'Pronto')}</div>
          ${state.error && state.lastFailedAction ? '<button id="retry-action">Tentar novamente</button>' : ''}
        </section>

        <section class="inspector-section events-section">
          <h2>Eventos</h2>
          <div class="event-list">${state.activeChatEvents.map(renderEvent).join('')}</div>
        </section>
      </aside>
    </div>
    ${state.settingsOpen ? renderSettingsModal() : ''}
    ${state.chatContextOpen ? renderChatContextModal() : ''}
    ${state.modelSettingsOpen ? renderModelSettingsModal() : ''}
  `;

  bindAppEvents();
  scrollMessagesToBottom();
}

function renderSettingsModal() {
  const defaultProvider = state.config.provider || 'groq';
  const defaultModel = state.config.model || getProvider(defaultProvider).defaultModel;
  const apiProvider = state.settingsProvider || defaultProvider;
  const apiProviderInfo = getProvider(apiProvider);
  const apiSettings = state.config.providerSettings?.[apiProvider] || {};
  const apiKeys = apiSettings.apiKeys?.length ? apiSettings.apiKeys : [];
  const ollamaModelForSettings = defaultProvider === 'ollama' ? defaultModel : getProvider('ollama').defaultModel;
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
              <h3>Identidade e padrão</h3>
              <div class="setup-grid">
                <label>
                  Apelido
                  <input name="userNickname" value="${escapeAttr(state.config.userNickname || '')}" placeholder="Como a IA deve chamar você" />
                </label>
                <label>
                  Provider padrão
                  <select name="provider" id="default-provider-input">
                    ${renderProviderOptions(defaultProvider)}
                  </select>
                </label>
              </div>
              <div class="setup-grid">
                <label>
                  Modelo padrão
                  <select name="model" id="default-model-input">
                    ${renderModelOptions(defaultProvider, defaultModel)}
                  </select>
                </label>
                <label>
                  Idioma da IA
                  <select name="language">
                    ${renderLanguageOptions(state.config.language)}
                  </select>
                </label>
              </div>
              <label class="${isKnownModel(defaultProvider, defaultModel) ? 'hidden' : ''}" id="default-custom-model-row">
                Modelo personalizado
                <input name="customModel" id="default-custom-model-input" value="${isKnownModel(defaultProvider, defaultModel) ? '' : escapeAttr(defaultModel)}" placeholder="provider/model ou nome local" />
              </label>
              <label class="toggle-row ${isKnownModel(defaultProvider, defaultModel) ? 'hidden' : ''}" id="default-custom-model-images-row">
                <input type="checkbox" name="customModelImages" id="default-custom-model-images" ${modelSupportsImages(defaultProvider, defaultModel) ? 'checked' : ''} />
                <span>
                  <strong>Este modelo suporta imagens</strong>
                  <small>Ative somente se o endpoint aceitar imagens. O app bloqueia imagem quando isso estiver desligado.</small>
                </span>
              </label>
              <label>
                System prompt geral
                <textarea name="systemPromptExtra" rows="5">${escapeHtml(state.config.systemPromptExtra || '')}</textarea>
              </label>
            </section>

            <section class="modal-section">
              <h3>Providers e APIs</h3>
              <p class="help-text">Cada provider guarda seu próprio endpoint e suas próprias keys. Se houver várias keys, o backend tenta a próxima quando uma chamada falha por autenticação, rate limit ou erro temporário.</p>
              <div class="setup-grid">
                <label>
                  Provider para editar
                  <select id="api-provider-input">
                    ${renderProviderOptions(apiProvider)}
                  </select>
                </label>
                <label>
                  Endpoint/base URL
                  <input id="api-base-url-input" value="${escapeAttr(apiSettings.baseUrl || apiProviderInfo.baseUrl || '')}" placeholder="https://api.exemplo.com/v1" ${apiProviderInfo.id === 'openai-compatible' || apiProviderInfo.id === 'ollama' ? '' : ''} />
                </label>
              </div>
              ${
                apiProviderInfo.id === 'ollama'
                  ? `
                    <p class="help-text">Ollama local normalmente não usa API key. O endpoint padrão é http://127.0.0.1:11434/v1.</p>
                    ${renderOllamaSetup(ollamaModelForSettings)}
                  `
                  : `
                    <div class="api-key-list">
                      ${(apiKeys.length ? apiKeys : [{ id: 'empty', label: 'Key 1', value: '' }])
                        .map((key, index) => renderApiKeyRow(key, index))
                        .join('')}
                    </div>
                    <div class="button-row">
                      <button type="button" id="add-api-key">Adicionar API key</button>
                      <button type="button" id="toggle-api-key">${state.apiKeyVisible ? 'Ocultar keys' : 'Ver keys'}</button>
                    </div>
                  `
              }
              ${
                apiProviderInfo.id === 'openai-compatible'
                  ? '<p class="help-text">Use este provider para Minimax, Together, Fireworks, servidores próprios ou qualquer API que aceite o formato /v1/chat/completions.</p>'
                  : ''
              }
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
                ${renderToolToggle('chatTitle', 'Título do chat', 'Permite que a IA renomeie o chat com rename_chat, normalmente depois da primeira mensagem.')}
              </div>
            </section>

            <section class="modal-section">
              <h3>Contexto</h3>
              <div class="explain-list">
                <p><strong>Janela interna do modelo:</strong> limite real do modelo/provider em uso. O app ainda aproxima por caracteres, então um modelo menor pode rejeitar chamadas se o prompt ficar grande demais.</p>
                <p><strong>Salvar snapshot:</strong> salva uma fotografia Markdown do estado atual em context-snapshots e atualiza context-window.md. Não muda o prompt futuro por si só.</p>
                <p><strong>Compactar contexto:</strong> pede ao modelo para resumir histórico, memória e decisões em context.md. Esse arquivo entra no prompt das próximas mensagens.</p>
                <p><strong>compact_context:</strong> tool opcional para a própria IA atualizar context.md quando perceber que a conversa está longa.</p>
              </div>
            </section>

            <section class="modal-section">
              <h3>Backup</h3>
              <p class="help-text">Exporta ou importa configurações, chats, memórias e contexto salvo do runtime local.</p>
              <div class="button-row">
                <button type="button" id="export-data">Exportar dados</button>
                <label class="file-button">
                  Importar dados
                  <input type="file" id="import-data" accept="application/json" />
                </label>
              </div>
            </section>

            <section class="modal-section danger-zone">
              <h3>Servidor local</h3>
              <p class="help-text">Encerrar para o processo do My Computer. Para iniciar de novo, rode <code>./install.sh</code> ou <code>npm run start:open</code> nesta pasta.</p>
              <button type="button" id="shutdown-app" class="danger-button">Encerrar My Computer</button>
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

function renderChatContextModal() {
  const chat = state.activeChat;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="chat-context-title">
        <form id="chat-context-form">
          <header class="modal-header">
            <div>
              <h2 id="chat-context-title">Prompt e memória do chat</h2>
              <p>Preferências e notas duráveis específicas deste chat.</p>
            </div>
            <button type="button" id="close-chat-context" aria-label="Fechar">×</button>
          </header>
          <div class="modal-body">
            <section class="modal-section">
              <label>
                System prompt do chat
                <textarea id="chat-prompt-modal-input" rows="7" placeholder="Preferências específicas deste chat.">${escapeHtml(chat?.systemPromptExtra || '')}</textarea>
              </label>
            </section>
            <section class="modal-section">
              <label>
                Memória do chat
                <textarea id="chat-memory-modal-input" class="memory-editor">${escapeHtml(chat?.memory || '')}</textarea>
              </label>
              <p class="help-text">A tool memory_chat usa este Markdown como base quando precisa ler, anexar ou reescrever memória do chat.</p>
            </section>
          </div>
          <footer class="modal-footer">
            <button type="button" id="cancel-chat-context">Cancelar</button>
            <button class="primary" type="submit">Salvar</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderModelSettingsModal() {
  const chat = state.activeChat;
  const providerId = chat?.provider || state.config.provider;
  const modelId = chat?.model || state.config.model;
  const settings = chat?.modelSettings || {};
  const support = getModelSettingSupport(providerId);
  const metadata = getModelMetadata(providerId, modelId);
  const maxOutputLimit = metadata.maxOutputTokens || 300000;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
        <form id="model-settings-form">
          <header class="modal-header">
            <div>
              <h2 id="model-settings-title">Configurações do modelo</h2>
              <p>${escapeHtml(providerLabel(providerId))} · ${escapeHtml(modelId)}</p>
            </div>
            <button type="button" id="close-model-settings" aria-label="Fechar">×</button>
          </header>
          <div class="modal-body">
            <section class="modal-section">
              <p class="help-text">Esses parâmetros valem só para este chat. Campos não compatíveis com o provider ficam ocultos para reduzir erro de API.</p>
              <div class="setup-grid">
                ${renderModelNumberInput('temperature', 'Temperatura', settings.temperature, '0', '2', '0.1', support.temperature)}
                ${renderModelNumberInput('topP', 'Top P', settings.topP, '0', '1', '0.05', support.topP)}
              </div>
              <div class="setup-grid">
                ${renderModelNumberInput('maxTokens', 'Máximo de tokens de saída', settings.maxTokens, '1', String(maxOutputLimit), '1', support.maxTokens)}
                ${renderModelNumberInput('seed', 'Seed', settings.seed, '1', '2147483647', '1', support.seed)}
              </div>
              <div class="setup-grid">
                ${renderModelNumberInput('presencePenalty', 'Presence penalty', settings.presencePenalty, '-2', '2', '0.1', support.penalties)}
                ${renderModelNumberInput('frequencyPenalty', 'Frequency penalty', settings.frequencyPenalty, '-2', '2', '0.1', support.penalties)}
              </div>
              ${
                support.reasoningEffort
                  ? `
                    <label>
                      Esforço de raciocínio
                      <select name="reasoningEffort">
                        ${['', 'none', 'low', 'medium', 'high', 'xhigh']
                          .map((value) => `<option value="${escapeAttr(value)}" ${settings.reasoningEffort === value ? 'selected' : ''}>${escapeHtml(value || 'Padrão do provider')}</option>`)
                          .join('')}
                      </select>
                    </label>
                  `
                  : ''
              }
              ${
                support.stop
                  ? `
                    <label>
                      Stop sequences
                      <textarea name="stop" rows="3" placeholder="Uma sequência por linha">${escapeHtml((settings.stop || []).join('\n'))}</textarea>
                    </label>
                  `
                  : ''
              }
            </section>
          </div>
          <footer class="modal-footer">
            <button type="button" id="clear-model-settings">Limpar ajustes</button>
            <button type="button" id="cancel-model-settings">Cancelar</button>
            <button class="primary" type="submit">Salvar</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderModelNumberInput(name, label, value, min, max, step, enabled) {
  if (!enabled) return '';
  return `
    <label>
      ${escapeHtml(label)}
      <input name="${escapeAttr(name)}" type="number" min="${escapeAttr(min)}" max="${escapeAttr(max)}" step="${escapeAttr(step)}" value="${value === undefined ? '' : escapeAttr(value)}" placeholder="Padrão" />
    </label>
  `;
}

function renderOllamaSetup(model) {
  const status = state.ollamaStatus;
  const installedModels = status?.models?.length ? status.models : state.ollamaInstalledModels || [];
  const statusText = status
    ? status.installed
      ? `Ollama encontrado${status.version ? `: ${status.version}` : ''}. Modelos locais: ${installedModels.length || 0}.`
      : 'Ollama ainda não foi encontrado no sistema.'
    : 'Verifique o Ollama antes de salvar se quiser usar IA local.';
  const installed = installedModels.includes(model) || installedModels.includes(`${model}:latest`);
  return `
    <section class="setup-assist">
      <h2>Ollama local</h2>
      <p>${escapeHtml(statusText)}</p>
      <p>O navegador pede ao servidor local para instalar/verificar. Em Linux, a instalação oficial pode pedir sudo; se isso acontecer, o painel mostra o comando para rodar no terminal.</p>
      <p>Ao instalar o Ollama pelo painel, o My Computer tenta baixar automaticamente o modelo selecionado. Modelos já baixados aparecem com marca na lista.</p>
      <div class="button-row">
        <button type="button" id="check-ollama">Verificar Ollama</button>
        <button type="button" id="install-ollama">Instalar Ollama</button>
        <button type="button" id="pull-ollama-model">${installed ? 'Modelo instalado' : 'Baixar modelo selecionado'}</button>
        <button type="button" id="uninstall-ollama" class="danger-button">Desinstalar Ollama</button>
      </div>
      ${
        installedModels.length
          ? `
            <div class="ollama-model-list">
              ${installedModels
                .map(
                  (item) => `
                    <div class="ollama-model-row">
                      <span>✓ ${escapeHtml(item)}</span>
                      <button type="button" class="remove-ollama-model danger-button" data-model="${escapeAttr(item)}">Remover</button>
                    </div>
                  `,
                )
                .join('')}
            </div>
          `
          : '<p class="help-text">Nenhum modelo local encontrado ainda.</p>'
      }
      ${status?.installCommand ? `<pre>${escapeHtml(status.installCommand)}</pre>` : ''}
    </section>
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
      <span class="meta">${escapeHtml(providerLabel(chat.provider || state.config.provider))} · ${escapeHtml(chat.model || state.config.model)} · ${new Date(chat.updatedAt).toLocaleString()}</span>
    </button>
  `;
}

function renderMessage(message) {
  const label = message.role === 'user' ? 'Você' : 'Assistente';
  const modelUsed = message.modelUsed
    ? `<span class="message-model">${escapeHtml(message.providerUsed ? `${providerLabel(message.providerUsed)} · ` : '')}${escapeHtml(message.modelUsed)}</span>`
    : '';
  const status = message.status ? `<span class="message-status ${escapeAttr(message.status)}">${renderMessageStatus(message.status)}</span>` : '';
  const copyButton =
    message.role === 'assistant'
      ? `<button class="copy-message" data-message-id="${escapeAttr(message.id)}">Copiar</button>`
      : '';
  const retryButton =
    message.role === 'user' && message.status === 'failed'
      ? `<button class="retry-message" data-message-id="${escapeAttr(message.id)}">Tentar novamente</button>`
      : '';
  return `
    <article class="message ${escapeAttr(message.role)} ${escapeAttr(message.status || '')}">
      <div class="message-label">${label}${modelUsed}${status}${retryButton}${copyButton}</div>
      ${(message.toolUses || []).map(renderToolUse).join('')}
      <div class="bubble">${formatContent(message.content)}</div>
      ${message.attachments?.length ? `<div class="message-attachments">${message.attachments.map((attachment) => renderAttachmentCard(attachment)).join('')}</div>` : ''}
      ${message.error ? `<div class="message-error">${escapeHtml(message.error)}</div>` : ''}
    </article>
  `;
}

function renderMessageStatus(status) {
  if (status === 'pending') return 'enviando';
  if (status === 'failed') return 'falhou';
  return '';
}

function renderErrorBanner() {
  return `
    <div class="request-error">
      <strong>Erro na requisição</strong>
      <span>${escapeHtml(state.error)}</span>
      ${state.lastFailedAction ? '<button id="retry-action-inline">Tentar novamente</button>' : ''}
    </div>
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
        <span>${result.timedOut ? 'timeout' : result.exitCode === undefined ? escapeHtml(result.action || 'ok') : `exit ${escapeHtml(String(result.exitCode))}`}</span>
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

function renderAttachmentCard(attachment, options = {}) {
  const chatId = state.activeChat?.id || '';
  const contentUrl = chatId ? `/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(attachment.id)}/content` : '';
  const imagePreview =
    attachment.kind === 'image' && contentUrl
      ? `<img class="attachment-thumb" src="${escapeAttr(contentUrl)}" alt="${escapeAttr(attachment.name)}" />`
      : '';
  const warning = getAttachmentWarning(attachment);
  const actions = options.pending
    ? `
      <div class="attachment-actions">
        ${attachment.extractedText ? `<button type="button" class="paste-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Colar texto</button>` : ''}
        <button type="button" class="remove-pending-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Remover</button>
      </div>
    `
    : '';
  return `
    <article class="attachment-card ${warning.level}">
      ${imagePreview}
      <div class="attachment-info">
        <strong>${escapeHtml(attachment.name)}</strong>
        <span>${escapeHtml(formatBytes(attachment.size))} · ${escapeHtml(attachment.mimeType || 'arquivo')} · ${escapeHtml(attachment.kind || 'documento')}</span>
        <small>${escapeHtml(warning.text)}</small>
        ${attachment.previewText && attachment.kind !== 'image' ? `<pre>${escapeHtml(attachment.previewText)}</pre>` : ''}
        ${actions}
      </div>
    </article>
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

function renderApiKeyRow(key, index, options = {}) {
  const inputClass = options.setup ? 'setup-api-key-input' : 'api-key-input';
  const removeClass = options.setup ? 'setup-remove-api-key' : 'remove-api-key';
  const visible = options.setup ? state.setupApiKeyVisible : state.apiKeyVisible;
  return `
    <div class="api-key-row" data-key-index="${index}">
      <span class="secret-field">
        <input class="${inputClass}" type="${visible ? 'text' : 'password'}" autocomplete="off" value="${escapeAttr(key.value || '')}" placeholder="API key ${index + 1}" />
        <button type="button" class="${removeClass}" data-key-index="${index}">Remover</button>
      </span>
    </div>
  `;
}

function renderProviderOptions(selectedProvider) {
  return (state.providers?.length ? state.providers : [{ id: 'groq', label: 'Groq' }])
    .map((provider) => {
      const selected = provider.id === selectedProvider ? 'selected' : '';
      return `<option value="${escapeAttr(provider.id)}" ${selected}>${escapeHtml(provider.label)}</option>`;
    })
    .join('');
}

function renderModelOptions(providerId, selectedModel) {
  const provider = getProvider(providerId);
  const models = provider.models?.length
    ? provider.models
    : [{ id: provider.defaultModel, label: provider.defaultModel, kind: 'Padrão' }];
  const known = new Set(models.map((model) => model.id));
  const options = models
    .map((model) => {
      const selected = model.id === selectedModel ? 'selected' : '';
      const installed = provider.id === 'ollama' && model.installed ? '&#10003; ' : '';
      const vision = model.supportsImages ? ' · visão' : '';
      return `<option value="${escapeAttr(model.id)}" ${selected}>${installed}${escapeHtml(model.label)} · ${escapeHtml(model.kind)}${vision} · ${escapeHtml(model.id)}</option>`;
    })
    .join('');
  const customSelected = selectedModel && !known.has(selectedModel) ? 'selected' : '';
  const customLabel = provider.id === 'ollama' ? 'Modelo personalizado ou ainda não instalado' : 'Modelo personalizado';
  const customOption = `<option value="${CUSTOM_MODEL_VALUE}" ${customSelected}>${escapeHtml(customLabel)}</option>`;

  return `${options}${customOption}`;
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

function getProvider(providerId) {
  return (
    state.providers?.find((provider) => provider.id === providerId) ||
    state.providers?.[0] || {
      id: 'groq',
      label: 'Groq',
      defaultModel: 'llama-3.3-70b-versatile',
      requiresApiKey: true,
      baseUrl: 'https://api.groq.com/openai/v1',
      models: [{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', kind: 'Produção' }],
    }
  );
}

function providerLabel(providerId) {
  return getProvider(providerId).label || providerId || 'Provider';
}

function isKnownModel(providerId, model) {
  return Boolean(getProvider(providerId).models?.some((item) => item.id === model));
}

function modelSupportsImages(providerId, model) {
  const known = getProvider(providerId).models?.find((item) => item.id === model);
  const custom = state.config?.modelCapabilities?.[providerId]?.[model];
  return Boolean(custom?.images ?? known?.supportsImages);
}

function getModelMetadata(providerId, model) {
  return getProvider(providerId).models?.find((item) => item.id === model) || {};
}

function getModelSettingSupport(providerId) {
  if (providerId === 'anthropic') {
    return {
      temperature: true,
      topP: true,
      maxTokens: true,
      stop: true,
      penalties: false,
      seed: false,
      reasoningEffort: false,
    };
  }

  if (providerId === 'groq') {
    return {
      temperature: true,
      topP: true,
      maxTokens: true,
      stop: true,
      penalties: false,
      seed: false,
      reasoningEffort: false,
    };
  }

  if (providerId === 'ollama') {
    return {
      temperature: true,
      topP: true,
      maxTokens: true,
      stop: true,
      penalties: false,
      seed: true,
      reasoningEffort: false,
    };
  }

  if (providerId === 'gemini' || providerId === 'huggingface') {
    return {
      temperature: true,
      topP: true,
      maxTokens: true,
      stop: true,
      penalties: false,
      seed: false,
      reasoningEffort: false,
    };
  }

  return {
    temperature: true,
    topP: true,
    maxTokens: true,
    stop: true,
    penalties: true,
    seed: true,
    reasoningEffort: true,
  };
}

function getModelValue(modelSelectId, customInputId, providerId) {
  const selected = document.querySelector(modelSelectId)?.value;
  if (selected !== CUSTOM_MODEL_VALUE) return selected || getProvider(providerId).defaultModel;
  return document.querySelector(customInputId)?.value.trim() || getProvider(providerId).defaultModel;
}

function withCustomModel(customModels, providerId, model) {
  const next = structuredClone(customModels || {});
  if (!model || isKnownModel(providerId, model)) return next;
  const existing = Array.isArray(next[providerId]) ? next[providerId] : [];
  next[providerId] = [...new Set([...existing, model])];
  return next;
}

function withCustomModelCapabilities(modelCapabilities, providerId, model, supportsImages) {
  if (!model || isKnownModel(providerId, model)) return structuredClone(modelCapabilities || {});
  const next = structuredClone(modelCapabilities || {});
  next[providerId] = {
    ...(next[providerId] || {}),
    [model]: { images: Boolean(supportsImages) },
  };
  return next;
}

function getAttachmentWarning(attachment) {
  if (attachment.kind === 'image') {
    const provider = state.activeChat?.provider || state.config.provider;
    const model = state.activeChat?.model || state.config.model;
    const metadata = getModelMetadata(provider, model);
    if (modelSupportsImages(provider, model)) {
      if (metadata.maxFileSizeMB && attachment.size > metadata.maxFileSizeMB * 1024 * 1024) {
        return {
          level: 'warn',
          text: `Esta imagem excede o limite informado do modelo (${metadata.maxFileSizeMB} MB).`,
        };
      }
      const limits = [
        metadata.maxInputImages ? `até ${metadata.maxInputImages} imagem(ns)` : '',
        metadata.maxFileSizeMB ? `${metadata.maxFileSizeMB} MB por imagem` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return {
        level: 'ok',
        text: `Será enviado ao modelo como imagem multimodal${limits ? ` (${limits})` : ''}.`,
      };
    }
    return {
      level: 'warn',
      text: 'Este modelo não está marcado como vision. Troque de modelo ou ative suporte para modelos personalizados.',
    };
  }

  if (attachment.extractedText) {
    return {
      level: attachment.extractionStatus === 'truncated' ? 'warn' : 'ok',
      text:
        attachment.extractionStatus === 'truncated'
          ? 'Texto extraído será enviado em uma seção de documentos, com truncamento.'
          : 'Texto extraído será enviado em uma seção de documentos.',
    };
  }

  return {
    level: 'warn',
    text: 'Arquivo salvo no chat. A IA verá caminho e metadados; para ler o conteúdo, pode usar o terminal.',
  };
}

function formatBytes(size) {
  const value = Number(size || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

function guessMimeType(name) {
  const extension = String(name || '').split('.').pop()?.toLowerCase();
  const byExtension = {
    md: 'text/markdown',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    pdf: 'application/pdf',
  };
  return byExtension[extension] || 'application/octet-stream';
}

function bindAppEvents() {
  document.querySelector('#new-chat').addEventListener('click', createNewChat);
  document.querySelector('#open-settings').addEventListener('click', openSettings);
  document.querySelectorAll('[data-chat-id]').forEach((button) => {
    button.addEventListener('click', () => loadChat(button.dataset.chatId));
  });
  document.querySelector('#composer').addEventListener('submit', sendMessage);
  document.querySelector('#composer textarea').addEventListener('keydown', handleComposerKeydown);
  document.querySelector('#composer textarea').addEventListener('input', autoResizeComposer);
  document.querySelector('#file-input')?.addEventListener('change', uploadSelectedFiles);
  document.querySelectorAll('.remove-pending-attachment').forEach((button) => {
    button.addEventListener('click', () => removePendingAttachment(button.dataset.attachmentId));
  });
  document.querySelectorAll('.paste-attachment').forEach((button) => {
    button.addEventListener('click', () => pasteAttachmentText(button.dataset.attachmentId));
  });
  document.querySelector('#chat-provider-input')?.addEventListener('change', changeChatProviderDraft);
  document.querySelector('#chat-model-input')?.addEventListener('change', toggleChatCustomModel);
  document.querySelector('#open-chat-context')?.addEventListener('click', openChatContext);
  document.querySelector('#open-model-settings')?.addEventListener('click', openModelSettings);
  document.querySelector('#save-chat-settings').addEventListener('click', saveChatSettings);
  document.querySelector('#delete-chat').addEventListener('click', deleteActiveChat);
  document.querySelector('#compact-context').addEventListener('click', compactContext);
  document.querySelector('#save-context').addEventListener('click', saveContext);
  document.querySelectorAll('.copy-message').forEach((button) => {
    button.addEventListener('click', () => copyMessage(button.dataset.messageId));
  });
  document.querySelectorAll('.retry-message').forEach((button) => {
    button.addEventListener('click', () => retryMessage(button.dataset.messageId));
  });
  document.querySelector('#retry-action')?.addEventListener('click', retryLastAction);
  document.querySelector('#retry-action-inline')?.addEventListener('click', retryLastAction);

  if (state.settingsOpen) {
    document.querySelector('#general-settings-form').addEventListener('submit', saveGeneralSettings);
    document.querySelector('#close-settings').addEventListener('click', closeSettings);
    document.querySelector('#cancel-settings').addEventListener('click', closeSettings);
    document.querySelector('#default-provider-input').addEventListener('change', changeDefaultProviderDraft);
    document.querySelector('#default-model-input').addEventListener('change', toggleDefaultCustomModel);
    document.querySelector('#api-provider-input').addEventListener('change', changeApiProviderDraft);
    document.querySelector('#toggle-api-key')?.addEventListener('click', toggleApiKeyVisibility);
    document.querySelector('#add-api-key')?.addEventListener('click', addApiKeyRow);
    document.querySelectorAll('.remove-api-key').forEach((button) => {
      button.addEventListener('click', () => removeApiKeyRow(Number(button.dataset.keyIndex)));
    });
    document.querySelector('#export-data').addEventListener('click', exportData);
    document.querySelector('#import-data').addEventListener('change', importData);
    document.querySelector('#shutdown-app').addEventListener('click', shutdownApp);
    document.querySelector('#check-ollama')?.addEventListener('click', checkOllamaStatus);
    document.querySelector('#install-ollama')?.addEventListener('click', installOllama);
    document.querySelector('#pull-ollama-model')?.addEventListener('click', () => pullOllamaModel(getCurrentOllamaModelDraft()));
    document.querySelector('#uninstall-ollama')?.addEventListener('click', uninstallOllama);
    document.querySelectorAll('.remove-ollama-model').forEach((button) => {
      button.addEventListener('click', () => removeOllamaModel(button.dataset.model));
    });
  }

  if (state.chatContextOpen) {
    document.querySelector('#chat-context-form').addEventListener('submit', saveChatContext);
    document.querySelector('#close-chat-context').addEventListener('click', closeChatContext);
    document.querySelector('#cancel-chat-context').addEventListener('click', closeChatContext);
  }

  if (state.modelSettingsOpen) {
    document.querySelector('#model-settings-form').addEventListener('submit', saveModelSettings);
    document.querySelector('#close-model-settings').addEventListener('click', closeModelSettings);
    document.querySelector('#cancel-model-settings').addEventListener('click', closeModelSettings);
    document.querySelector('#clear-model-settings').addEventListener('click', clearModelSettings);
  }

  autoResizeComposer();
}

async function saveSetup(event) {
  event.preventDefault();
  syncSetupApiDraft();
  const form = new FormData(event.currentTarget);
  const provider = form.get('provider') || 'groq';
  const model = getModelValue('#setup-model', '[name="customModel"]', provider);
  const customModels = withCustomModel(state.config.customModels, provider, model);
  const modelCapabilities = withCustomModelCapabilities(
    state.config.modelCapabilities,
    provider,
    model,
    form.get('customModelImages') === 'on',
  );
  const providerSettings = structuredClone(state.config.providerSettings || {});
  const providerInfo = getProvider(provider);
  providerSettings[provider] = {
    ...(providerSettings[provider] || {}),
    baseUrl: form.get('baseUrl') || providerInfo.baseUrl || '',
    apiKeys:
      state.config.providerSettings?.[provider]?.apiKeys ||
      [...document.querySelectorAll('.setup-api-key-input')]
        .map((input, index) => ({ id: `setup-${index}`, label: `Key ${index + 1}`, value: input.value.trim() }))
        .filter((item) => item.value),
  };

  await runAction('Salvando configuração...', async () => {
    if (provider === 'ollama') {
      await ensureOllamaModelAvailable(model);
    }
    await api('/api/config', {
      method: 'PUT',
      body: {
        provider,
        model,
        providerSettings,
        customModels,
        modelCapabilities,
        language: form.get('language'),
        userNickname: form.get('userNickname'),
        systemPromptExtra: form.get('systemPromptExtra'),
      },
    });
    await bootstrap();
  });
}

async function checkOllamaStatus() {
  await runAction('Verificando Ollama...', async () => {
    state.ollamaStatus = await api('/api/ollama/status');
  });
}

async function installOllama() {
  await runAction('Instalando Ollama...', async () => {
    const data = await api('/api/ollama/install', { method: 'POST' });
    state.status = data.message || 'Instalação concluída.';
    state.ollamaStatus = await api('/api/ollama/status');
    const selectedModel = getCurrentOllamaModelDraft();
    if (state.ollamaStatus?.installed && selectedModel) {
      await ensureOllamaModelAvailable(selectedModel);
    }
  });
}

async function pullOllamaModel(model) {
  const setupIsOllama = document.querySelector('#setup-provider')?.value === 'ollama';
  const defaultIsOllama = document.querySelector('#default-provider-input')?.value === 'ollama';
  const selected = setupIsOllama
    ? document.querySelector('#setup-model')?.value
    : defaultIsOllama
      ? document.querySelector('#default-model-input')?.value
      : '';
  const actualModel =
    selected === CUSTOM_MODEL_VALUE
      ? document.querySelector('[name="customModel"]')?.value.trim()
      : selected || model;
  if (!actualModel) return;
  await runAction(`Baixando ${actualModel} no Ollama...`, async () => {
    await api('/api/ollama/pull', {
      method: 'POST',
      body: { model: actualModel },
    });
    state.ollamaStatus = await api('/api/ollama/status');
    await refreshBootstrapData();
  });
}

async function ensureOllamaModelAvailable(model) {
  if (!model) return;
  const status = state.ollamaStatus || (await api('/api/ollama/status'));
  state.ollamaStatus = status;
  if (!status.installed) return;
  const installed = status.models?.includes(model) || status.models?.includes(`${model}:latest`);
  if (!installed) {
    await api('/api/ollama/pull', {
      method: 'POST',
      body: { model },
    });
    state.ollamaStatus = await api('/api/ollama/status');
    await refreshBootstrapData();
  }
}

function getCurrentOllamaModelDraft() {
  const provider =
    document.querySelector('#setup-provider')?.value ||
    document.querySelector('#default-provider-input')?.value ||
    state.config?.provider;
  if (provider !== 'ollama') {
    return state.settingsProvider === 'ollama' ? getProvider('ollama').defaultModel : '';
  }
  const select = document.querySelector('#setup-model') || document.querySelector('#default-model-input');
  const customInput = document.querySelector('[name="customModel"]') || document.querySelector('#default-custom-model-input');
  if (!select) return state.config?.model || getProvider('ollama').defaultModel;
  return select.value === CUSTOM_MODEL_VALUE ? customInput?.value.trim() : select.value;
}

async function removeOllamaModel(model) {
  const confirmed = window.confirm(`Remover o modelo Ollama "${model}" da máquina?`);
  if (!confirmed) return;
  await runAction(`Removendo ${model}...`, async () => {
    await api('/api/ollama/rm', {
      method: 'POST',
      body: { model },
    });
    state.ollamaStatus = await api('/api/ollama/status');
    await refreshBootstrapData();
  });
}

async function uninstallOllama() {
  const confirmed = window.confirm('Desinstalar o Ollama do sistema? Pode pedir sudo e falhar pelo navegador se precisar de senha.');
  if (!confirmed) return;
  await runAction('Desinstalando Ollama...', async () => {
    const data = await api('/api/ollama/uninstall', { method: 'POST' });
    state.status = data.message || 'Comando de desinstalação concluído.';
    state.ollamaStatus = await api('/api/ollama/status');
    await refreshBootstrapData();
  });
}

async function uploadSelectedFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length || !state.activeChat) return;

  for (const file of files) {
    await runAction(`Anexando ${file.name}...`, async () => {
      const dataBase64 = await fileToBase64(file);
      const data = await api(`/api/chats/${state.activeChat.id}/attachments`, {
        method: 'POST',
        body: {
          name: file.name,
          mimeType: file.type || guessMimeType(file.name),
          size: file.size,
          dataBase64,
        },
      });
      state.activeChat = data.chat;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
      state.pendingAttachments = [...state.pendingAttachments, data.attachment];
    });
  }
}

function removePendingAttachment(attachmentId) {
  state.pendingAttachments = state.pendingAttachments.filter((attachment) => attachment.id !== attachmentId);
  render();
}

function pasteAttachmentText(attachmentId) {
  const attachment = state.pendingAttachments.find((item) => item.id === attachmentId);
  const textarea = document.querySelector('#composer textarea');
  if (!attachment?.extractedText || !textarea) return;
  const text = `\n\n${attachment.extractedText}`;
  insertTextAtCursor(textarea, text);
}

function changeChatProviderDraft(event) {
  if (!state.activeChat) return;
  const provider = event.target.value;
  state.activeChat = {
    ...state.activeChat,
    provider,
    model: getProvider(provider).defaultModel,
  };
  render();
}

function toggleChatCustomModel() {
  const select = document.querySelector('#chat-model-input');
  const row = document.querySelector('#chat-custom-model-row');
  const imagesRow = document.querySelector('#chat-custom-model-images-row');
  if (!select || !row) return;
  row.classList.toggle('hidden', select.value !== CUSTOM_MODEL_VALUE);
  imagesRow?.classList.toggle('hidden', select.value !== CUSTOM_MODEL_VALUE);
}

function toggleSetupCustomModel() {
  const select = document.querySelector('#setup-model');
  const row = document.querySelector('#setup-custom-model-row');
  const imagesRow = document.querySelector('#setup-custom-model-images-row');
  if (!select || !row) return;
  const isCustom = select.value === CUSTOM_MODEL_VALUE;
  row.classList.toggle('hidden', !isCustom);
  imagesRow?.classList.toggle('hidden', !isCustom);
}

function changeDefaultProviderDraft(event) {
  syncProviderApiDraft();
  state.config = {
    ...state.config,
    provider: event.target.value,
    model: getProvider(event.target.value).defaultModel,
  };
  state.settingsProvider = event.target.value;
  render();
}

function toggleDefaultCustomModel() {
  const select = document.querySelector('#default-model-input');
  const row = document.querySelector('#default-custom-model-row');
  const imagesRow = document.querySelector('#default-custom-model-images-row');
  if (!select || !row) return;
  row.classList.toggle('hidden', select.value !== CUSTOM_MODEL_VALUE);
  imagesRow?.classList.toggle('hidden', select.value !== CUSTOM_MODEL_VALUE);
}

function syncSetupApiDraft() {
  const provider = document.querySelector('#setup-provider')?.value || state.config?.provider || 'groq';
  const apiKeyInputs = [...document.querySelectorAll('.setup-api-key-input')];
  if (!apiKeyInputs.length) return;
  state.config.providerSettings = {
    ...(state.config.providerSettings || {}),
    [provider]: {
      ...(state.config.providerSettings?.[provider] || {}),
      apiKeys: apiKeyInputs
        .map((input, index) => ({
          id: `setup-key-${index}`,
          label: `Key ${index + 1}`,
          value: input.value.trim(),
        }))
        .filter((item) => item.value),
    },
  };
}

function addSetupApiKeyRow() {
  syncSetupApiDraft();
  const provider = document.querySelector('#setup-provider')?.value || state.config.provider;
  const settings = state.config.providerSettings?.[provider] || {};
  settings.apiKeys = [...(settings.apiKeys || []), { id: `setup-draft-${Date.now()}`, label: `Key ${(settings.apiKeys || []).length + 1}`, value: '' }];
  state.config.providerSettings = {
    ...(state.config.providerSettings || {}),
    [provider]: settings,
  };
  renderSetup();
}

function removeSetupApiKeyRow(index) {
  syncSetupApiDraft();
  const provider = document.querySelector('#setup-provider')?.value || state.config.provider;
  const settings = state.config.providerSettings?.[provider] || {};
  settings.apiKeys = (settings.apiKeys || []).filter((_, itemIndex) => itemIndex !== index);
  state.config.providerSettings = {
    ...(state.config.providerSettings || {}),
    [provider]: settings,
  };
  renderSetup();
}

function toggleSetupApiKeyVisibility() {
  syncSetupApiDraft();
  state.setupApiKeyVisible = !state.setupApiKeyVisible;
  renderSetup();
}

function changeApiProviderDraft(event) {
  syncProviderApiDraft();
  state.settingsProvider = event.target.value;
  render();
}

function addApiKeyRow() {
  syncProviderApiDraft();
  const provider = state.settingsProvider || state.config.provider;
  const settings = state.config.providerSettings?.[provider] || {};
  settings.apiKeys = [...(settings.apiKeys || []), { id: `draft-${Date.now()}`, label: `Key ${(settings.apiKeys || []).length + 1}`, value: '' }];
  state.config.providerSettings = {
    ...(state.config.providerSettings || {}),
    [provider]: settings,
  };
  render();
}

function removeApiKeyRow(index) {
  syncProviderApiDraft();
  const provider = state.settingsProvider || state.config.provider;
  const settings = state.config.providerSettings?.[provider] || {};
  settings.apiKeys = (settings.apiKeys || []).filter((_, itemIndex) => itemIndex !== index);
  state.config.providerSettings = {
    ...(state.config.providerSettings || {}),
    [provider]: settings,
  };
  render();
}

async function createNewChat() {
  await runAction('Criando chat...', async () => {
    const data = await api('/api/chats', { method: 'POST' });
    state.chats = data.chats;
    state.activeChat = data.chat;
    state.activeChatEvents = [];
  });
}

async function loadChat(chatId) {
  await runAction('Abrindo chat...', async () => {
    const data = await api(`/api/chats/${chatId}`);
    state.activeChat = data.chat;
    state.activeChatEvents = data.activeChatEvents || [];
  });
}

async function sendMessage(event) {
  event.preventDefault();
  const textarea = event.currentTarget.elements.content;
  const content = textarea.value.trim();
  if ((!content && !state.pendingAttachments.length) || !state.activeChat) return;
  if (state.pendingAttachments.length > 8) {
    state.error = 'Envie no máximo 8 anexos por mensagem neste MVP.';
    render();
    return;
  }
  const activeProvider = state.activeChat.provider || state.config.provider;
  const activeModel = state.activeChat.model || state.config.model;
  const activeModelMetadata = getModelMetadata(activeProvider, activeModel);
  const unsupportedImage = state.pendingAttachments.find(
    (attachment) =>
      attachment.kind === 'image' &&
      !modelSupportsImages(activeProvider, activeModel),
  );
  if (unsupportedImage) {
    state.error = `O modelo atual não aceita imagens: ${unsupportedImage.name}. Troque para um modelo vision ou marque o modelo personalizado como compatível.`;
    render();
    return;
  }
  const imageAttachments = state.pendingAttachments.filter((attachment) => attachment.kind === 'image');
  if (activeModelMetadata.maxInputImages && imageAttachments.length > activeModelMetadata.maxInputImages) {
    state.error = `O modelo atual aceita até ${activeModelMetadata.maxInputImages} imagem(ns) por mensagem.`;
    render();
    return;
  }
  const oversizedImage = imageAttachments.find(
    (attachment) =>
      activeModelMetadata.maxFileSizeMB && attachment.size > activeModelMetadata.maxFileSizeMB * 1024 * 1024,
  );
  if (oversizedImage) {
    state.error = `${oversizedImage.name} excede o limite de ${activeModelMetadata.maxFileSizeMB} MB deste modelo.`;
    render();
    return;
  }
  textarea.value = '';
  autoResizeComposer();
  const attachments = state.pendingAttachments;
  state.pendingAttachments = [];
  await sendMessageContent(content || 'Analise os anexos enviados.', { attachments });
}

async function sendMessageContent(content, options = {}) {
  const chatId = state.activeChat.id;
  const attachments = options.attachments || [];
  if (options.retryMessageId) {
    state.activeChat.messages = state.activeChat.messages.map((message) =>
      message.id === options.retryMessageId
        ? { ...message, status: 'pending', error: null }
        : message,
    );
  } else {
    const localMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content,
      attachments,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    state.activeChat.messages = [...state.activeChat.messages, localMessage];
  }

  await runAction(
    `Enviando para ${providerLabel(state.activeChat.provider || state.config.provider)}...`,
    async () => {
      const data = await api(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: {
          content,
          retryMessageId: options.retryMessageId,
          attachmentIds: attachments.map((attachment) => attachment.id),
        },
      });
      state.activeChat = data.chat;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
      const fresh = await api('/api/chats');
      state.chats = fresh.chats;
      await refreshActiveChatData();
    },
    () => sendMessageContent(content, options),
  );
  if (state.error && state.activeChat?.id === chatId) {
    await refreshActiveChatData();
    render();
  }
}

function handleComposerKeydown(event) {
  if (event.key !== 'Enter') return;
  if (event.altKey) {
    event.preventDefault();
    insertTextAtCursor(event.currentTarget, '\n');
    return;
  }
  event.preventDefault();
  event.currentTarget.form.requestSubmit();
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  const nextPosition = start + text.length;
  textarea.selectionStart = nextPosition;
  textarea.selectionEnd = nextPosition;
  autoResizeComposer();
}

async function retryLastAction() {
  if (!state.lastFailedAction) return;
  const retry = state.lastFailedAction;
  state.lastFailedAction = null;
  await retry();
}

async function retryMessage(messageId) {
  const message = state.activeChat?.messages?.find((item) => item.id === messageId);
  if (!message) return;
  await sendMessageContent(message.content, { retryMessageId: message.id });
}

async function copyMessage(messageId) {
  const message = state.activeChat?.messages?.find((item) => item.id === messageId);
  if (!message) return;
  await navigator.clipboard.writeText(message.content || '');
  state.status = 'Mensagem copiada.';
  render();
}

async function deleteActiveChat() {
  if (!state.activeChat) return;
  const confirmed = window.confirm(`Apagar o chat "${state.activeChat.title}"?`);
  if (!confirmed) return;

  await runAction('Apagando chat...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'DELETE',
    });
    state.chats = data.chats;
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
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
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    await refreshActiveChatData();
  });
}

function openChatContext() {
  state.chatContextOpen = true;
  render();
}

function closeChatContext() {
  state.chatContextOpen = false;
  render();
}

async function saveChatContext(event) {
  event.preventDefault();
  const systemPromptExtra = document.querySelector('#chat-prompt-modal-input').value;
  const memory = document.querySelector('#chat-memory-modal-input').value;
  await runAction('Salvando prompt e memória...', async () => {
    const chatResponse = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        title: state.activeChat.title,
        provider: state.activeChat.provider,
        model: state.activeChat.model,
        modelSettings: state.activeChat.modelSettings || {},
        systemPromptExtra,
      },
    });
    const memoryResponse = await api(`/api/chats/${state.activeChat.id}/memory`, {
      method: 'PUT',
      body: { content: memory },
    });
    state.activeChat = memoryResponse.chat || chatResponse.chat;
    state.chats = chatResponse.chats || state.chats;
    state.activeChatEvents = memoryResponse.activeChatEvents || chatResponse.activeChatEvents || state.activeChatEvents;
    state.chatContextOpen = false;
    await refreshActiveChatData();
  });
}

function openModelSettings() {
  state.modelSettingsOpen = true;
  render();
}

function closeModelSettings() {
  state.modelSettingsOpen = false;
  render();
}

async function clearModelSettings() {
  await saveModelSettings(null, {});
}

async function saveModelSettings(event, overrideSettings = null) {
  event?.preventDefault();
  const settings = overrideSettings ?? readModelSettingsForm();
  await runAction('Salvando parâmetros do modelo...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        title: state.activeChat.title,
        provider: state.activeChat.provider,
        model: state.activeChat.model,
        modelSettings: settings,
        systemPromptExtra: state.activeChat.systemPromptExtra || '',
      },
    });
    state.activeChat = data.chat;
    state.chats = data.chats;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    state.modelSettingsOpen = false;
    await refreshActiveChatData();
  });
}

function readModelSettingsForm() {
  const form = document.querySelector('#model-settings-form');
  const data = new FormData(form);
  const settings = {};
  for (const name of ['temperature', 'topP', 'maxTokens', 'seed', 'presencePenalty', 'frequencyPenalty']) {
    const value = data.get(name);
    if (value !== null && String(value).trim() !== '') settings[name] = Number(value);
  }
  const reasoningEffort = String(data.get('reasoningEffort') || '').trim();
  if (reasoningEffort) settings.reasoningEffort = reasoningEffort;
  const stop = String(data.get('stop') || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (stop.length) settings.stop = stop;
  return settings;
}

async function saveChatSettings() {
  const title = document.querySelector('#chat-title-input').value;
  const provider = document.querySelector('#chat-provider-input').value;
  const model = getModelValue('#chat-model-input', '#chat-custom-model-input', provider);
  const modelCapabilities = withCustomModelCapabilities(
    state.config.modelCapabilities,
    provider,
    model,
    document.querySelector('#chat-custom-model-images')?.checked,
  );
  await runAction('Salvando configurações do chat...', async () => {
    if (provider === 'ollama') {
      await ensureOllamaModelAvailable(model);
    }
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        title,
        provider,
        model,
        modelCapabilities,
        modelSettings: state.activeChat.modelSettings || {},
        systemPromptExtra: state.activeChat.systemPromptExtra || '',
      },
    });
    state.activeChat = data.chat;
    state.chats = data.chats;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    await refreshActiveChatData();
  });
}

async function saveGeneralSettings(event) {
  event.preventDefault();
  syncProviderApiDraft();
  const form = new FormData(event.currentTarget);
  const provider = form.get('provider') || state.config.provider;
  const model = getModelValue('#default-model-input', '#default-custom-model-input', provider);
  const customModels = withCustomModel(state.config.customModels, provider, model);
  const modelCapabilities = withCustomModelCapabilities(
    state.config.modelCapabilities,
    provider,
    model,
    form.get('customModelImages') === 'on',
  );
  await runAction('Salvando configurações gerais...', async () => {
    const tools = {
      terminal: form.get('tool_terminal') === 'on',
      chatMemory: form.get('tool_chatMemory') === 'on',
      persistentMemory: form.get('tool_persistentMemory') === 'on',
      autoCompact: form.get('tool_autoCompact') === 'on',
      chatTitle: form.get('tool_chatTitle') === 'on',
    };
    if (provider === 'ollama') {
      await ensureOllamaModelAvailable(model);
    }
    const configResponse = await api('/api/config', {
      method: 'PUT',
      body: {
        provider,
        model,
        language: form.get('language'),
        userNickname: form.get('userNickname'),
        systemPromptExtra: form.get('systemPromptExtra'),
        tools,
        providerSettings: state.config.providerSettings,
        customModels,
        modelCapabilities,
      },
    });
    const memoryResponse = await api('/api/persistent-memory', {
      method: 'PUT',
      body: { content: form.get('persistentMemory') },
    });
    state.config = configResponse.config;
    state.persistentMemory = memoryResponse.persistentMemory;
    state.settingsOpen = false;
    await refreshActiveChatData();
  });
}

function syncProviderApiDraft() {
  if (!state.settingsOpen) return;
  const provider = state.settingsProvider || state.config.provider;
  const baseUrlInput = document.querySelector('#api-base-url-input');
  const apiKeyInputs = [...document.querySelectorAll('.api-key-input')];
  if (!baseUrlInput && !apiKeyInputs.length) return;

  state.config.providerSettings = {
    ...(state.config.providerSettings || {}),
    [provider]: {
      ...(state.config.providerSettings?.[provider] || {}),
      baseUrl: baseUrlInput?.value.trim() || getProvider(provider).baseUrl || '',
      apiKeys: apiKeyInputs
        .map((input, index) => ({
          id: `key-${index}`,
          label: `Key ${index + 1}`,
          value: input.value.trim(),
        }))
        .filter((item) => item.value),
    },
  };
}

async function exportData() {
  await runAction('Exportando dados...', async () => {
    const data = await api('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-computer-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const confirmed = window.confirm('Importar este backup pode sobrescrever chats com o mesmo id. Continuar?');
  if (!confirmed) return;

  await runAction('Importando dados...', async () => {
    const content = await file.text();
    const payload = JSON.parse(content);
    const data = await api('/api/import', {
      method: 'POST',
      body: payload,
    });
    state.config = data.config;
    state.providers = data.providers || state.providers;
    state.models = data.models || state.models;
    state.ollamaInstalledModels = data.ollamaInstalledModels || state.ollamaInstalledModels;
    state.chats = data.chats;
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
    state.persistentMemory = data.persistentMemory || '';
  });
}

async function compactContext() {
  await runAction('Compactando contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/compact`, { method: 'POST' });
    state.activeChat = data.chat;
    await refreshActiveChatData();
  });
}

async function saveContext() {
  await runAction('Salvando snapshot de contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/save-context`, { method: 'POST' });
    state.activeChat = data.chat;
    state.status = `Snapshot salvo em ${data.path}`;
    await refreshActiveChatData();
  });
}

async function refreshBootstrapData() {
  const data = await api('/api/bootstrap');
  state.config = data.config;
  state.providers = data.providers || state.providers;
  state.models = data.models;
  state.ollamaInstalledModels = data.ollamaInstalledModels || [];
  state.chats = data.chats;
  state.persistentMemory = data.persistentMemory;
  if (!state.activeChat && data.activeChat) {
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
  }
}

async function refreshActiveChatData() {
  await refreshBootstrapData();
  if (!state.activeChat) return;
  const data = await api(`/api/chats/${state.activeChat.id}`);
  state.activeChat = data.chat;
  state.activeChatEvents = data.activeChatEvents || [];
}

function openSettings() {
  state.settingsOpen = true;
  state.settingsProvider = state.settingsProvider || state.config.provider;
  render();
}

function closeSettings() {
  state.settingsOpen = false;
  render();
}

function toggleApiKeyVisibility() {
  syncProviderApiDraft();
  state.apiKeyVisible = !state.apiKeyVisible;
  render();
}

async function shutdownApp() {
  const confirmed = window.confirm('Encerrar o servidor local do My Computer? Para iniciar depois, rode ./install.sh ou npm run start:open.');
  if (!confirmed) return;
  await api('/api/shutdown', { method: 'POST' });
  state.status = 'My Computer está encerrando. Para iniciar novamente, rode ./install.sh.';
  render();
}

async function runAction(status, action, retry = null) {
  state.busy = true;
  state.status = status;
  state.error = '';
  state.lastFailedAction = null;
  render();
  try {
    await action();
    state.status = 'Pronto';
  } catch (error) {
    state.error = error.message;
    state.lastFailedAction = retry || (() => runAction(status, action));
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

function autoResizeComposer() {
  const textarea = document.querySelector('#composer textarea');
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
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
