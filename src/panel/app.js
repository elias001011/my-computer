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
  networkStatus: null,
  busy: false,
  settingsOpen: false,
  settingsSection: 'identity',
  settingsDraft: null,
  settingsDirty: false,
  chatSettingsOpen: false,
  chatSettingsDraft: null,
  chatSettingsDirty: false,
  chatContextOpen: false,
  chatContextDirty: false,
  contextEditorOpen: false,
  contextEditor: null,
  modelSettingsOpen: false,
  modelSettingsDirty: false,
  settingsProvider: '',
  setupWizardStarted: false,
  setupReviewOpen: false,
  setupStep: 'welcome',
  setupDraft: null,
  pendingAttachments: [],
  attachmentViewer: null,
  importDraft: null,
  importModalOpen: false,
  confirmDialog: null,
  ollamaStatus: null,
  updateStatus: null,
  apiKeyVisible: false,
  setupApiKeyVisible: false,
  lastFailedAction: null,
  eventPollingTimer: null,
  toolDecisionInFlight: new Set(),
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
  if (!state.config?.setupComplete || state.setupReviewOpen) {
    renderSetup();
    return;
  }
  renderApp();
}

function renderSetup() {
  const setupConfig = state.setupDraft || state.config || {};
  const providerId = setupConfig.provider || 'groq';
  const provider = getProvider(providerId);
  const model = setupConfig.model || provider.defaultModel;
  const providerSettings = setupConfig.providerSettings?.[providerId] || {};
  const setupApiKeys = providerSettings.apiKeys?.length ? providerSettings.apiKeys : [{ id: 'setup-empty', value: '' }];
  const showCustomModel = !isKnownModel(providerId, model);
  const showBaseUrl = provider.id === 'openai-compatible' || provider.id === 'ollama';
  const modelCanSeeImages = modelSupportsImages(providerId, model);
  if (!state.setupWizardStarted) {
    app.innerHTML = `
      <main class="setup-screen">
        <section class="setup-panel setup-choice-panel">
          <div>
            <h1>${state.setupReviewOpen ? 'Tour inicial' : 'My Computer'}</h1>
            <p>${state.setupReviewOpen ? 'Revise as escolhas iniciais sem apagar chats, logs, anexos ou memórias.' : 'Um painel local para conversar com uma IA, usar tools do seu computador com controle e manter contexto entre chats.'}</p>
          </div>
          <div class="setup-choice-grid">
            <button type="button" class="setup-choice primary" id="start-guided-setup">
              <strong>${state.setupReviewOpen ? 'Refazer tour' : 'Configurar agora'}</strong>
              <span>Escolher provider, API key, nível técnico, busca, tools e rede.</span>
            </button>
            <button type="button" class="setup-choice" id="skip-guided-setup">
              <strong>${state.setupReviewOpen ? 'Voltar ao painel' : 'Pular para o painel'}</strong>
              <span>${state.setupReviewOpen ? 'Não altera nada e retorna ao chat.' : 'Usar defaults agora e ajustar tudo depois em Configurações gerais.'}</span>
            </button>
          </div>
        </section>
      </main>
    `;
    document.querySelector('#start-guided-setup').addEventListener('click', () => {
      state.setupWizardStarted = true;
      state.setupDraft = buildSetupDraft();
      state.setupStep = 'provider';
      renderSetup();
    });
    document.querySelector('#skip-guided-setup').addEventListener('click', state.setupReviewOpen ? closeSetupReview : skipSetup);
    return;
  }
  const step = state.setupStep || 'provider';
  app.innerHTML = `
    <main class="setup-screen">
      <section class="setup-panel">
        <div>
          <h1>My Computer</h1>
          <p>${escapeHtml(getSetupStepDescription(step))}</p>
        </div>
        <form class="setup-form" id="setup-form">
          <div class="setup-progress">${renderSetupProgress(step)}</div>
          ${step === 'provider' ? `
            <section class="setup-step-panel">
              <h2>Qual provider você pretende usar primeiro?</h2>
              <p class="help-text">Isso vira o padrão dos chats novos. Você pode trocar por chat depois.</p>
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
          <label class="toggle-row switch-row ${showCustomModel ? '' : 'hidden'}" id="setup-custom-model-images-row">
            <input type="checkbox" name="customModelImages" ${modelCanSeeImages ? 'checked' : ''} />
            <span class="switch" aria-hidden="true"></span>
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
            </section>
          ` : ''}
          ${step === 'profile' ? `
            <section class="setup-step-panel">
              <h2>Como a IA deve adaptar as respostas?</h2>
              <p class="help-text">Isso muda o nível de explicação, cautela e autonomia. Não altera segurança de tools.</p>
          <label>
            Apelido
              <input name="userNickname" value="${escapeAttr(setupConfig.userNickname || '')}" placeholder="Como a IA deve chamar você" />
          </label>
          <label>
            Idioma da IA
            <select name="language">
              ${renderLanguageOptions(setupConfig.language || 'auto')}
            </select>
          </label>
          <div class="setup-grid">
            <label id="setup-technical-level-row" class="${setupConfig.technicalGuidanceEnabled === false ? 'hidden' : ''}">
              Nível técnico
              <select name="technicalLevel" id="setup-technical-level" ${setupConfig.technicalGuidanceEnabled === false ? 'disabled' : ''}>
                ${renderTechnicalLevelOptions(setupConfig.technicalLevel || 'balanced')}
              </select>
            </label>
            <label class="toggle-row switch-row">
              <input type="checkbox" name="technicalGuidanceEnabled" id="setup-technical-guidance" ${setupConfig.technicalGuidanceEnabled !== false ? 'checked' : ''} />
              <span class="switch" aria-hidden="true"></span>
              <span>
                <strong>Adaptar resposta ao nível</strong>
                <small>Níveis mais baixos explicam mais e confirmam mais coisas; isso pode gastar mais tokens.</small>
              </span>
            </label>
          </div>
          <label>
            System prompt geral
            <textarea name="systemPromptExtra" rows="5" placeholder="Preferências gerais de tom, formato, limites e jeito de trabalhar.">${escapeHtml(setupConfig.systemPromptExtra || '')}</textarea>
          </label>
            </section>
          ` : ''}
          ${step === 'tools' ? `
          <section class="setup-assist">
            <h2>Como a IA pode usar tools?</h2>
            <p class="help-text">Busca nativa não executa comando local. Terminal e tools locais continuam sob aprovação quando “sempre permitir” estiver desligado.</p>
            <label class="toggle-row switch-row">
              <input type="checkbox" name="alwaysAllowTools" ${setupConfig.tools?.alwaysAllow ? 'checked' : ''} />
              <span class="switch" aria-hidden="true"></span>
              <span>
                <strong>Sempre permitir qualquer tool</strong>
                <small>Desligado por padrão. Quando desligado, a IA precisa da sua aprovação na UI antes de executar tools.</small>
              </span>
            </label>
            <div class="settings-subpanel">
              <h2>Pesquisa web</h2>
              <p class="help-text">Busca nativa usa o provider e não pede confirmação. Busca via terminal usa a máquina local.</p>
              ${renderSearchModeControl(getSearchMode(setupConfig.tools), { setup: true })}
            </div>
          </section>
          ` : ''}
          ${step === 'network' ? `
          <section class="setup-assist">
            <h2>Quer abrir o painel na rede local?</h2>
            <p class="help-text">Se ligar, salve e reinicie. No outro dispositivo, use o IP mostrado depois em Configurações gerais > Rede.</p>
            <label class="toggle-row switch-row">
              <input type="checkbox" name="networkEnabled" id="setup-network-enabled" ${setupConfig.server?.networkEnabled ? 'checked' : ''} />
              <span class="switch" aria-hidden="true"></span>
              <span>
                <strong>Abrir painel para a rede local</strong>
                <small>Exige senha abaixo e só vale depois de reiniciar o servidor. Use apenas em rede confiável.</small>
              </span>
            </label>
            <label id="setup-network-password-row" class="${setupConfig.server?.networkEnabled ? '' : 'hidden'}">
              Senha da rede local
              <input name="authPassword" type="password" autocomplete="new-password" value="${escapeAttr(setupConfig.server?.authPassword || '')}" placeholder="Obrigatória para abrir na rede" ${setupConfig.server?.networkEnabled ? '' : 'disabled'} />
              <small class="field-note">Sem senha, o app não permite abrir o painel para a rede.</small>
            </label>
          </section>
          ` : ''}
          <div class="button-row">
            ${step !== 'provider' ? '<button type="button" id="setup-back">Voltar</button>' : ''}
            <button class="primary" type="submit">${step === 'network' ? (state.setupReviewOpen ? 'Salvar e voltar ao painel' : 'Salvar e abrir chat') : 'Continuar'}</button>
          </div>
          ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ''}
        </form>
      </section>
    </main>
  `;

  document.querySelector('#setup-form').addEventListener('submit', step === 'network' ? saveSetup : nextSetupStep);
  document.querySelector('#setup-back')?.addEventListener('click', previousSetupStep);
  document.querySelector('#setup-provider')?.addEventListener('change', (event) => {
    syncSetupApiDraft();
    if (!state.setupDraft) state.setupDraft = buildSetupDraft();
    state.setupDraft.provider = event.target.value;
    state.setupDraft.model = getProvider(event.target.value).defaultModel;
    renderSetup();
  });
  document.querySelector('#setup-model')?.addEventListener('change', toggleSetupCustomModel);
  document.querySelector('#setup-technical-guidance')?.addEventListener('change', () => toggleTechnicalLevelField('setup'));
  document.querySelector('#setup-network-enabled')?.addEventListener('change', () => toggleNetworkPasswordField('setup'));
  document.querySelector('#setup-search-enabled')?.addEventListener('change', () => toggleSearchModeField('setup'));
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
  const chat = getActiveChatView();
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
            <button class="icon-button small-icon" id="edit-context" ${!chat || state.busy ? 'disabled' : ''} title="Editar contexto compactado" aria-label="Editar contexto compactado">✎</button>
          </div>
        </header>
        <section class="messages" id="messages">
          ${state.error ? renderErrorBanner() : ''}
          ${chat?.messages?.length ? chat.messages.map(renderMessage).join('') : '<p class="empty">Comece uma conversa.</p>'}
          ${renderContextEventCards()}
          ${state.busy ? renderPending() : ''}
        </section>
        <form class="composer" id="composer">
          <div class="attachment-tray" id="attachment-tray">
            ${state.pendingAttachments.length ? state.pendingAttachments.map((attachment) => renderAttachmentCard(attachment, { pending: true })).join('') : ''}
          </div>
          <div class="composer-main">
            <label class="attach-button icon-button" title="Anexar arquivo" aria-label="Anexar arquivo">
              <span aria-hidden="true">+</span>
              <input id="file-input" type="file" multiple accept="${escapeAttr(getSupportedUploadAccept())}" ${!chat || state.busy ? 'disabled' : ''} />
            </label>
            <textarea name="content" placeholder="Digite uma mensagem..." ${state.busy ? 'disabled' : ''}>${escapeHtml(getComposerDraft(chat?.id))}</textarea>
            <button class="primary icon-button" type="submit" aria-label="Enviar" title="Enviar" ${state.busy ? 'disabled' : ''}>
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </form>
      </main>

      <aside class="inspector">
        <section class="inspector-section mobile-chat-settings-entry">
          <button type="button" id="open-chat-settings-mobile" ${!chat ? 'disabled' : ''}>Configurações de chat</button>
        </section>
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
              ${state.chatSettingsDirty ? '<span class="dirty-note">Alterações não salvas</span>' : ''}
              <button id="save-chat-settings" class="${state.chatSettingsDirty ? 'dirty-save' : ''}" ${!chat ? 'disabled' : ''}>Salvar configurações</button>
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
    ${state.chatSettingsOpen ? renderChatSettingsModal() : ''}
    ${state.chatContextOpen ? renderChatContextModal() : ''}
    ${state.contextEditorOpen ? renderContextEditorModal() : ''}
    ${state.modelSettingsOpen ? renderModelSettingsModal() : ''}
    ${state.attachmentViewer ? renderAttachmentViewerModal() : ''}
    ${state.importModalOpen ? renderImportModal() : ''}
    ${state.confirmDialog ? renderConfirmDialog() : ''}
  `;

  bindAppEvents();
}

function renderSettingsModal() {
  const draftConfig = state.settingsDraft?.config || state.config;
  const draftMemory = state.settingsDraft?.persistentMemory ?? state.persistentMemory;
  const defaultProvider = draftConfig.provider || 'groq';
  const defaultModel = draftConfig.model || getProvider(defaultProvider).defaultModel;
  const apiProvider = state.settingsProvider || defaultProvider;
  const apiProviderInfo = getProvider(apiProvider);
  const apiSettings = draftConfig.providerSettings?.[apiProvider] || {};
  const apiKeys = apiSettings.apiKeys?.length ? apiSettings.apiKeys : [];
  const ollamaModelForSettings = defaultProvider === 'ollama' ? defaultModel : getProvider('ollama').defaultModel;
  const activeSection = state.settingsSection || 'identity';
  const dirtyText = state.settingsDirty ? '<span class="dirty-note">Alterações não salvas</span>' : '';
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <form id="general-settings-form">
          <header class="modal-header">
            <div>
              <h2 id="settings-title">Configurações gerais</h2>
              <p>Preferências globais, providers, segurança, tools e dados locais.</p>
            </div>
            <button type="button" id="close-settings" aria-label="Fechar">×</button>
          </header>

          <div class="modal-body settings-layout">
            <nav class="settings-nav" aria-label="Seções das configurações">
              ${renderSettingsNav(activeSection)}
            </nav>
            <div class="settings-content">
            <section class="modal-section settings-panel ${activeSection === 'identity' ? 'active' : ''}" data-section="identity">
              <h3>Identidade e padrão</h3>
              <p class="help-text">Essas escolhas viram padrão para chats novos; cada chat ainda pode ter provider/modelo próprios.</p>
              <div class="setup-grid">
                <label>
                  Apelido
                  <input name="userNickname" value="${escapeAttr(draftConfig.userNickname || '')}" placeholder="Como a IA deve chamar você" />
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
                    ${renderLanguageOptions(draftConfig.language)}
                  </select>
                </label>
              </div>
              <label class="${isKnownModel(defaultProvider, defaultModel) ? 'hidden' : ''}" id="default-custom-model-row">
                Modelo personalizado
                <input name="customModel" id="default-custom-model-input" value="${isKnownModel(defaultProvider, defaultModel) ? '' : escapeAttr(defaultModel)}" placeholder="provider/model ou nome local" />
              </label>
              <label class="toggle-row switch-row ${isKnownModel(defaultProvider, defaultModel) ? 'hidden' : ''}" id="default-custom-model-images-row">
                <input type="checkbox" name="customModelImages" id="default-custom-model-images" ${modelSupportsImages(defaultProvider, defaultModel) ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Este modelo suporta imagens</strong>
                  <small>Ative somente se o endpoint aceitar imagens. O app bloqueia imagem quando isso estiver desligado.</small>
                </span>
              </label>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="technicalGuidanceEnabled" id="settings-technical-guidance" ${draftConfig.technicalGuidanceEnabled !== false ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Adaptar resposta ao nível</strong>
                  <small>Quando ligado, adiciona uma instrução ao prompt para calibrar autonomia, explicações e cautela.</small>
                </span>
              </label>
              <div id="settings-technical-level-row" class="${draftConfig.technicalGuidanceEnabled === false ? 'hidden' : ''}">
                <label>
                  Nível técnico
                  <select name="technicalLevel" id="settings-technical-level" ${draftConfig.technicalGuidanceEnabled === false ? 'disabled' : ''}>
                    ${renderTechnicalLevelOptions(draftConfig.technicalLevel || 'balanced')}
                  </select>
                </label>
              </div>
              <label>
                System prompt geral
                <textarea name="systemPromptExtra" rows="5">${escapeHtml(draftConfig.systemPromptExtra || '')}</textarea>
              </label>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'providers' ? 'active' : ''}" data-section="providers">
              <h3>Providers e APIs</h3>
              <p class="help-text">Cada provider guarda endpoint e keys próprias. Rotação entre keys já acontece por provider; a rotação abaixo troca também de provider/modelo quando uma chamada falha.</p>
              <div class="setup-grid">
                <label>
                  Provider para editar
                  <select id="api-provider-input">
                    ${renderProviderOptions(apiProvider)}
                  </select>
                </label>
                <label>
                  Endpoint/base URL
                  <input id="api-base-url-input" value="${escapeAttr(apiSettings.baseUrl || apiProviderInfo.baseUrl || '')}" placeholder="https://api.exemplo.com/v1" />
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
              <div class="settings-subpanel">
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="providerRotationEnabled" ${draftConfig.routing?.providerRotationEnabled ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Rotatória de providers</strong>
                    <small>Se o provider/modelo atual falhar, tenta os fallbacks abaixo em ordem e registra tudo nos eventos do chat.</small>
                  </span>
                </label>
                <label>
                  Limite de voltas da rotatória
                  <input name="maxProviderPasses" type="number" min="1" max="5" step="1" value="${escapeAttr(draftConfig.routing?.maxProviderPasses || 2)}" />
                </label>
                <div class="routing-list">
                  ${renderRoutingFallbackRows(draftConfig.routing?.fallbacks || [])}
                </div>
                <button type="button" id="add-provider-fallback">Adicionar fallback</button>
              </div>
              ${
                apiProviderInfo.id === 'openai-compatible'
                  ? '<p class="help-text">Use este provider para Minimax, Together, Fireworks, servidores próprios ou qualquer API que aceite o formato /v1/chat/completions.</p>'
                  : ''
              }
            </section>

            <section class="modal-section settings-panel ${activeSection === 'memory' ? 'active' : ''}" data-section="memory">
              <h3>Memória persistente</h3>
              <p class="help-text">Entra no prompt de todos os chats. A IA pode ler, anexar ou reescrever este Markdown quando a tool estiver ligada.</p>
              <textarea name="persistentMemory" class="memory-editor persistent-memory-editor">${escapeHtml(draftMemory || '')}</textarea>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'tools' ? 'active' : ''}" data-section="tools">
              <h3>Tools</h3>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="tool_alwaysAllow" id="tool-alwaysAllow" ${draftConfig.tools?.alwaysAllow ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Sempre permitir qualquer tool</strong>
                  <small>Quando desligado, tools locais aparecem uma por vez para você permitir ou negar antes de executar.</small>
                </span>
              </label>
              <div class="settings-subpanel">
                <h4>Pesquisa web</h4>
                <p class="help-text">Busca nativa roda no servidor do provider e não pede confirmação. Busca via terminal usa a tool local e segue permissão.</p>
                ${renderSearchModeControl(getSearchMode(draftConfig.tools))}
              </div>
              <div class="toggle-list">
                ${renderToolToggle('terminal', 'Terminal local', 'Permite que a IA execute comandos no terminal por run_terminal_command.')}
                ${renderToolToggle('chatMemory', 'Memória do chat', 'Permite que a IA edite o memory.md do chat atual por memory_chat.')}
                ${renderToolToggle('persistentMemory', 'Memória persistente', 'Permite que a IA edite a memória global por persistent_memory.')}
                ${renderToolToggle('autoCompact', 'Tool de compactar contexto', 'Permite que a IA chame compact_context quando o contexto estiver grande ou precisar preservar decisões.')}
                ${renderToolToggle('chatTitle', 'Título do chat', 'Permite que a IA renomeie o chat com rename_chat, normalmente depois da primeira mensagem.')}
              </div>
              <div class="settings-subpanel">
                <h4>Nível de isolamento</h4>
                <div class="choice-grid">
                  ${renderTerminalModeCards(draftConfig.tools?.terminalMode || 'standard')}
                </div>
              </div>
              <p class="help-text">O método isolado é uma contenção leve por diretório e HOME, não uma VM/container. Comandos ainda podem acessar caminhos absolutos se forem instruídos a isso.</p>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'context' ? 'active' : ''}" data-section="context">
              <h3>Contexto</h3>
              <div class="toggle-list">
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="autoCompactEnabled" ${draftConfig.context?.autoCompactEnabled ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Compactar automaticamente</strong>
                    <small>Depois de uma resposta, o app compacta o chat quando o contexto estimado passar do limite configurado.</small>
                  </span>
                </label>
              </div>
              <div class="setup-grid">
                <label>
                  Limite estimado para compactar
                  <input name="autoCompactChars" type="number" min="8000" max="120000" step="1000" value="${escapeAttr(draftConfig.context?.autoCompactChars || 24000)}" />
                </label>
                <label>
                  Mínimo de mensagens entre compactações
                  <input name="autoCompactMinMessages" type="number" min="2" max="80" step="1" value="${escapeAttr(draftConfig.context?.autoCompactMinMessages || 12)}" />
                </label>
              </div>
              <div class="explain-list">
                <p><strong>Janela interna do modelo:</strong> limite real do modelo/provider em uso. O app ainda aproxima por caracteres, então um modelo menor pode rejeitar chamadas se o prompt ficar grande demais.</p>
                <p><strong>Salvar snapshot:</strong> salva uma fotografia Markdown do estado atual em context-snapshots e atualiza context-window.md. Não muda o prompt futuro por si só.</p>
                <p><strong>Compactar contexto:</strong> pede ao modelo para resumir histórico, memória e decisões em context.md. Esse arquivo entra no prompt das próximas mensagens.</p>
                <p><strong>compact_context:</strong> tool opcional para a própria IA atualizar context.md quando perceber que a conversa está longa.</p>
              </div>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'network' ? 'active' : ''}" data-section="network">
              <h3>Rede local</h3>
              <div class="notice-card">
                <strong>Como funciona</strong>
                <p>Por padrão o My Computer escuta só em 127.0.0.1. Ao abrir para a rede, o próximo restart passa a escutar em 0.0.0.0 e o navegador pede Basic Auth. Não existe usuário separado agora: qualquer usuário funciona se a senha estiver certa.</p>
              </div>
              ${renderNetworkStatusCard()}
              <label class="toggle-row switch-row">
                <input type="checkbox" name="networkEnabled" id="settings-network-enabled" ${draftConfig.server?.networkEnabled ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Abrir painel para a rede</strong>
                  <small>Permite acessar pelo IP local da máquina. Para acesso fora da rede, precisaremos projetar HTTPS, usuários e permissões com mais calma.</small>
                </span>
              </label>
              <label id="settings-network-password-row" class="${draftConfig.server?.networkEnabled ? '' : 'hidden'}">
                Senha de acesso
                <input name="authPassword" type="password" autocomplete="new-password" value="${escapeAttr(draftConfig.server?.authPassword || '')}" placeholder="Obrigatória para rede local" ${draftConfig.server?.networkEnabled ? '' : 'disabled'} />
                <small class="field-note">Obrigatória para habilitar rede local. A mudança vale no próximo restart.</small>
              </label>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'updates' ? 'active' : ''}" data-section="updates">
              <h3>Atualizações</h3>
              <p class="help-text">Atualiza direto do repositório Git configurado nesta pasta: faz <code>git fetch</code>, compara com o upstream e, se você confirmar, roda <code>git pull --ff-only && npm install</code>. O servidor reinicia depois da atualização.</p>
              <div class="button-row">
                <button type="button" id="check-update">Verificar atualização</button>
                ${state.updateStatus?.canApply ? '<button type="button" id="apply-update" class="primary">Atualizar e reiniciar</button>' : ''}
              </div>
              ${renderUpdateStatus()}
            </section>

            <section class="modal-section settings-panel ${activeSection === 'backup' ? 'active' : ''}" data-section="backup">
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

            <section class="modal-section danger-zone settings-panel ${activeSection === 'server' ? 'active' : ''}" data-section="server">
              <h3>Servidor local</h3>
              <p class="help-text">Encerrar para o processo do My Computer. Para iniciar de novo, rode <code>./install.sh</code> ou <code>npm run start:open</code> nesta pasta.</p>
              <div class="button-row">
                <button type="button" id="restart-tour">Refazer tour inicial</button>
                <button type="button" id="shutdown-app" class="danger-button">Encerrar My Computer</button>
              </div>
            </section>
            </div>
          </div>

          <footer class="modal-footer">
            ${state.error ? `<p class="error modal-error">${escapeHtml(state.error)}</p>` : ''}
            ${dirtyText}
            <button type="button" id="cancel-settings">Cancelar</button>
            <button class="primary ${state.settingsDirty ? 'dirty-save' : ''}" type="submit">Salvar configurações</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderSettingsNav(activeSection) {
  const sections = [
    ['identity', 'Identidade'],
    ['providers', 'Providers'],
    ['memory', 'Memória'],
    ['tools', 'Tools'],
    ['context', 'Contexto'],
    ['network', 'Rede'],
    ['updates', 'Atualizações'],
    ['backup', 'Backup'],
    ['server', 'Servidor'],
  ];
  return sections
    .map(
      ([id, label]) => `
        <button type="button" class="settings-nav-button ${activeSection === id ? 'active' : ''}" data-settings-section="${escapeAttr(id)}">
          ${escapeHtml(label)}
        </button>
      `,
    )
    .join('');
}

const SETUP_STEPS = ['provider', 'profile', 'tools', 'network'];

function buildSetupDraft() {
  return structuredClone(state.config || {});
}

function getSetupStepDescription(step) {
  return {
    provider: 'Primeiro, escolha a IA principal e como o app deve se conectar a ela.',
    profile: 'Agora ajuste como a IA deve falar com você e quanto contexto técnico deve assumir.',
    tools: 'Defina como busca e tools locais funcionam antes do primeiro chat.',
    network: 'Por fim, escolha se o painel fica só neste computador ou também na rede local.',
  }[step] || 'Configuração inicial guiada. Tudo pode ser alterado depois nas configurações gerais.';
}

function renderSetupProgress(activeStep) {
  return SETUP_STEPS.map((step, index) => {
    const active = step === activeStep ? 'active' : '';
    return `<span class="setup-progress-item ${active}">${index + 1}</span>`;
  }).join('');
}

function nextSetupStep(event) {
  event.preventDefault();
  captureSetupDraftFromForm(event.currentTarget);
  const currentIndex = SETUP_STEPS.indexOf(state.setupStep || 'provider');
  state.setupStep = SETUP_STEPS[Math.min(currentIndex + 1, SETUP_STEPS.length - 1)];
  renderSetup();
}

function previousSetupStep() {
  captureSetupDraftFromForm(document.querySelector('#setup-form'));
  const currentIndex = SETUP_STEPS.indexOf(state.setupStep || 'provider');
  state.setupStep = SETUP_STEPS[Math.max(currentIndex - 1, 0)];
  renderSetup();
}

function captureSetupDraftFromForm(formElement = document.querySelector('#setup-form')) {
  if (!state.setupDraft) state.setupDraft = buildSetupDraft();
  if (!formElement) return;
  const form = new FormData(formElement);
  const draft = state.setupDraft;
  if (form.has('provider')) {
    const provider = form.get('provider') || draft.provider || 'groq';
    draft.provider = provider;
    draft.model = getModelValue('#setup-model', '[name="customModel"]', provider);
    draft.customModels = withCustomModel(draft.customModels, provider, draft.model);
    draft.modelCapabilities = withCustomModelCapabilities(
      draft.modelCapabilities,
      provider,
      draft.model,
      form.get('customModelImages') === 'on',
    );
    const providerInfo = getProvider(provider);
    draft.providerSettings = {
      ...(draft.providerSettings || {}),
      [provider]: {
        ...(draft.providerSettings?.[provider] || {}),
        baseUrl: form.get('baseUrl') || providerInfo.baseUrl || '',
        apiKeys: [...document.querySelectorAll('.setup-api-key-input')]
          .map((input, index) => ({ id: `setup-${index}`, label: `Key ${index + 1}`, value: input.value.trim() }))
          .filter((item) => item.value),
      },
    };
  }
  if (form.has('userNickname') || form.has('technicalGuidanceEnabled')) {
    draft.language = form.get('language') || draft.language || 'auto';
    draft.userNickname = form.get('userNickname') || '';
    draft.technicalLevel = form.get('technicalLevel') || draft.technicalLevel || 'balanced';
    draft.technicalGuidanceEnabled = form.get('technicalGuidanceEnabled') === 'on';
    draft.systemPromptExtra = form.get('systemPromptExtra') || '';
  }
  if (form.has('alwaysAllowTools') || form.has('searchEnabled') || form.has('searchMode')) {
    const searchMode = form.get('searchEnabled') === 'on' ? form.get('searchMode') || getSearchMode(draft.tools) : 'off';
    draft.tools = {
      ...(draft.tools || {}),
      alwaysAllow: form.get('alwaysAllowTools') === 'on',
      searchMode,
      webSearch: searchMode !== 'off',
      searchTerminal: searchMode === 'terminal' || searchMode === 'both',
    };
  }
  if (document.querySelector('#setup-network-enabled')) {
    draft.server = {
      ...(draft.server || {}),
      networkEnabled: form.get('networkEnabled') === 'on',
      authPassword: form.get('authPassword') || '',
    };
  }
}

function renderSearchModeOptions(selectedMode) {
  const options = [
    ['native', 'Web nativa', 'Busca interna do provider, sem confirmação local.'],
    ['terminal', 'Terminal', 'Usa terminal local e pede permissão quando necessário.'],
    ['both', 'Ambos', 'Tenta web nativa primeiro e cai no terminal quando precisar.'],
  ];
  return options
    .map(
      ([value, title, description]) => `
        <label class="choice-card">
          <input type="radio" name="searchMode" value="${escapeAttr(value)}" ${selectedMode === value ? 'checked' : ''} />
          <span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(description)}</small>
          </span>
        </label>
      `,
    )
    .join('');
}

function renderSearchModeControl(selectedMode, options = {}) {
  const enabled = selectedMode !== 'off';
  const mode = enabled && selectedMode !== 'off' ? selectedMode : 'native';
  const prefix = options.setup ? 'setup' : 'settings';
  return `
    <label class="toggle-row switch-row">
      <input type="checkbox" name="searchEnabled" id="${prefix}-search-enabled" ${enabled ? 'checked' : ''} />
      <span class="switch" aria-hidden="true"></span>
      <span>
        <strong>Pesquisa web</strong>
        <small>Quando desligada, a IA não recebe a tool <code>web_search</code>.</small>
      </span>
    </label>
    <div id="${prefix}-search-mode-row" class="${enabled ? '' : 'hidden'}">
      <div class="choice-grid search-mode-grid">
        ${renderSearchModeOptions(mode)}
      </div>
    </div>
  `;
}

function renderNetworkStatusCard() {
  const status = state.networkStatus || {};
  const lanUrls = Array.isArray(status.lanUrls) ? status.lanUrls : [];
  const primaryLanUrl = lanUrls[0] || '';
  const extraLanCount = Math.max(0, lanUrls.length - 1);
  return `
    <div class="notice-card network-status-card">
      <strong>Endereços de acesso</strong>
      <p>Na máquina: <code>${escapeHtml(status.localUrl || 'http://127.0.0.1:8787')}</code></p>
      ${
        primaryLanUrl
          ? `<p>Em outro dispositivo: <code>${escapeHtml(primaryLanUrl)}</code>${extraLanCount ? `<small class="field-note">+ ${extraLanCount} outro(s) IP(s) detectado(s)</small>` : ''}</p>`
          : '<p>Em outro dispositivo: habilite rede local, salve e reinicie o servidor para aparecer o IP da rede.</p>'
      }
      <ul class="checklist">
        ${(status.checklist || ['Ligue rede local.', 'Defina senha.', 'Reinicie o servidor.', 'Use a mesma rede Wi-Fi.', 'Verifique firewall.'])
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join('')}
      </ul>
    </div>
  `;
}

function renderTerminalModeCards(selectedMode) {
  const options = [
    ['isolated', 'Isolamento leve', 'ISO', 'Comandos rodam com HOME e pasta de trabalho do My Computer.'],
    ['standard', 'Sem restrições', 'STD', 'Comandos usam o ambiente normal do usuário.'],
  ];
  return options
    .map(
      ([value, title, icon, description]) => `
        <label class="choice-card isolation-card">
          <input type="radio" name="terminalMode" value="${escapeAttr(value)}" ${selectedMode === value ? 'checked' : ''} />
          <span class="choice-icon" aria-hidden="true">${icon}</span>
          <span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(description)}</small>
          </span>
        </label>
      `,
    )
    .join('');
}

function renderRoutingFallbackRows(fallbacks = []) {
  const rows = fallbacks.length ? fallbacks : [{ provider: '', model: '' }];
  return rows
    .map(
      (fallback, index) => {
        const provider = fallback.provider || '';
        const model = fallback.model || (provider ? getProvider(provider).defaultModel : '');
        return `
          <div class="routing-fallback-row" data-fallback-index="${index}">
            <label>
              Provider
              <select class="fallback-provider">
                <option value="">Nenhum</option>
                ${renderProviderOptions(provider)}
              </select>
            </label>
            <label>
              Modelo
              <input class="fallback-model" value="${escapeAttr(model)}" placeholder="modelo do fallback" />
            </label>
            <button type="button" class="remove-provider-fallback danger-button" data-fallback-index="${index}">Remover</button>
          </div>
        `;
      },
    )
    .join('');
}

function renderChatSettingsModal() {
  const chat = getActiveChatView();
  const chatProviderId = chat?.provider || state.config.provider;
  const chatModel = chat?.model || state.config.model;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="mobile-chat-settings-title">
        <form id="mobile-chat-settings-form">
          <header class="modal-header">
            <div>
              <h2 id="mobile-chat-settings-title">Configurações de chat</h2>
              <p>Provider, modelo e atalhos deste chat.</p>
            </div>
            <button type="button" id="close-chat-settings-mobile" aria-label="Fechar">×</button>
          </header>
          <div class="modal-body">
            <section class="modal-section">
              <div class="settings-block">
                <label>
                  Nome do chat
                  <input id="mobile-chat-title-input" value="${escapeAttr(chat?.title || '')}" ${!chat ? 'disabled' : ''} />
                </label>
                <label>
                  Provider deste chat
                  <select id="mobile-chat-provider-input" ${!chat ? 'disabled' : ''}>
                    ${renderProviderOptions(chatProviderId)}
                  </select>
                </label>
                <label>
                  Modelo deste chat
                  <select id="mobile-chat-model-input" ${!chat ? 'disabled' : ''}>
                    ${renderModelOptions(chatProviderId, chatModel)}
                  </select>
                </label>
                <label class="${isKnownModel(chatProviderId, chatModel) ? 'hidden' : ''}" id="mobile-chat-custom-model-row">
                  Modelo personalizado
                  <input id="mobile-chat-custom-model-input" value="${isKnownModel(chatProviderId, chatModel) ? '' : escapeAttr(chatModel)}" ${!chat ? 'disabled' : ''} placeholder="provider/model ou nome local" />
                </label>
                <label class="toggle-row ${isKnownModel(chatProviderId, chatModel) ? 'hidden' : ''}" id="mobile-chat-custom-model-images-row">
                  <input type="checkbox" id="mobile-chat-custom-model-images" ${modelSupportsImages(chatProviderId, chatModel) ? 'checked' : ''} ${!chat ? 'disabled' : ''} />
                  <span>
                    <strong>Este modelo suporta imagens</strong>
                    <small>Use apenas se o endpoint aceitar imagens multimodais.</small>
                  </span>
                </label>
                <div class="button-row stacked-actions">
                  <button type="button" id="mobile-open-chat-context" ${!chat ? 'disabled' : ''}>Prompt e memória</button>
                  <button type="button" id="mobile-open-model-settings" ${!chat ? 'disabled' : ''}>Configurações do modelo</button>
                </div>
              </div>
            </section>
          </div>
          <footer class="modal-footer">
            ${state.chatSettingsDirty ? '<span class="dirty-note">Alterações não salvas</span>' : ''}
            <button type="button" id="cancel-chat-settings-mobile">Cancelar</button>
            <button type="button" id="mobile-delete-chat" class="danger-button" ${!chat ? 'disabled' : ''}>Apagar chat</button>
            <button class="primary ${state.chatSettingsDirty ? 'dirty-save' : ''}" type="submit" ${!chat ? 'disabled' : ''}>Salvar</button>
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
            ${state.chatContextDirty ? '<span class="dirty-note">Alterações não salvas</span>' : ''}
            <button type="button" id="cancel-chat-context">Cancelar</button>
            <button class="primary ${state.chatContextDirty ? 'dirty-save' : ''}" type="submit">Salvar</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderContextEditorModal() {
  const context = state.contextEditor || {};
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="context-editor-title">
        <form id="context-editor-form">
          <header class="modal-header">
            <div>
              <h2 id="context-editor-title">Contexto compactado</h2>
              <p>${escapeHtml(context.path || 'context.md')}</p>
            </div>
            <button type="button" id="close-context-editor" aria-label="Fechar">×</button>
          </header>
          <div class="modal-body">
            <section class="modal-section">
              <p class="help-text">Este Markdown entra no prompt das próximas mensagens como resumo durável do chat. Edite para corrigir fatos, remover ruído ou preservar decisões importantes.</p>
              <textarea id="context-editor-input" class="memory-editor">${escapeHtml(context.content || '')}</textarea>
            </section>
          </div>
          <footer class="modal-footer">
            <button type="button" id="cancel-context-editor">Cancelar</button>
            <button class="primary" type="submit">Salvar contexto</button>
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
              <div class="explain-list compact-explain">
                <p><strong>Temperatura:</strong> aumenta ou reduz variação/criatividade. Valores baixos tendem a ser mais previsíveis.</p>
                <p><strong>Top P:</strong> limita a amostragem por probabilidade acumulada. Use junto com temperatura só quando souber o motivo.</p>
                <p><strong>Máximo de tokens:</strong> teto da resposta do modelo. Alto demais pode custar mais ou falhar por limite do provider.</p>
                <p><strong>Stop:</strong> sequências que interrompem a geração quando aparecem.</p>
              </div>
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
            ${state.modelSettingsDirty ? '<span class="dirty-note">Alterações não salvas</span>' : ''}
            <button type="button" id="clear-model-settings">Limpar ajustes</button>
            <button type="button" id="cancel-model-settings">Cancelar</button>
            <button class="primary ${state.modelSettingsDirty ? 'dirty-save' : ''}" type="submit">Salvar</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderConfirmDialog() {
  const dialog = state.confirmDialog || {};
  if (dialog.type === 'close-settings') {
    return `
      <div class="modal-backdrop confirm-backdrop" role="presentation">
        <section class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <header class="modal-header">
            <div>
              <h2 id="confirm-title">Alterações não salvas</h2>
              <p>Você editou as configurações gerais. Escolha o que fazer antes de fechar.</p>
            </div>
          </header>
          <footer class="modal-footer">
            <button type="button" id="confirm-cancel">Continuar editando</button>
            <button type="button" id="confirm-discard" class="danger-button">Descartar</button>
            <button type="button" id="confirm-save" class="primary dirty-save">Salvar e fechar</button>
          </footer>
        </section>
      </div>
    `;
  }
  if (dialog.type === 'send-chat-settings') {
    return `
      <div class="modal-backdrop confirm-backdrop" role="presentation">
        <section class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <header class="modal-header">
            <div>
              <h2 id="confirm-title">Configurações do chat pendentes</h2>
              <p>Este chat tem ajustes não salvos. Você pode salvar antes de enviar ou enviar com as configurações já salvas no servidor.</p>
            </div>
          </header>
          <footer class="modal-footer">
            <button type="button" id="confirm-cancel">Cancelar</button>
            <button type="button" id="confirm-send-without-save">Enviar sem salvar</button>
            <button type="button" id="confirm-save-send" class="primary dirty-save">Salvar e enviar</button>
          </footer>
        </section>
      </div>
    `;
  }
  return '';
}

function renderAttachmentViewerModal() {
  const attachment = state.attachmentViewer;
  const chatId = state.activeChat?.id || '';
  if (!attachment || !chatId) return '';
  const contentUrl = `/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(attachment.id)}/content`;
  let preview = '';
  if (attachment.kind === 'image') {
    preview = `<img class="viewer-media" src="${escapeAttr(contentUrl)}" alt="${escapeAttr(attachment.name)}" />`;
  } else if (attachment.kind === 'video') {
    preview = `<video class="viewer-media" src="${escapeAttr(contentUrl)}" controls></video>`;
  } else if (attachment.kind === 'audio') {
    preview = `<audio class="viewer-audio" src="${escapeAttr(contentUrl)}" controls></audio>`;
  } else if (attachment.kind === 'pdf' || attachment.mimeType === 'application/pdf') {
    preview = `<iframe class="viewer-frame" src="${escapeAttr(contentUrl)}" title="${escapeAttr(attachment.name)}"></iframe>`;
  } else {
    preview = `<pre class="viewer-text">${escapeHtml(attachment.extractedText || attachment.previewText || 'Sem texto extraído para visualizar.')}</pre>`;
  }
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal attachment-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="attachment-viewer-title">
        <header class="modal-header">
          <div>
            <h2 id="attachment-viewer-title">${escapeHtml(attachment.name)}</h2>
            <p>${escapeHtml(formatBytes(attachment.size))} · ${escapeHtml(attachment.mimeType || 'arquivo')} · ${escapeHtml(attachment.kind || 'documento')}</p>
          </div>
          <button type="button" id="close-attachment-viewer" aria-label="Fechar">×</button>
        </header>
        <div class="modal-body viewer-body">
          ${preview}
          <p class="help-text">${escapeHtml(getAttachmentWarning(attachment).text)}</p>
        </div>
      </section>
    </div>
  `;
}

function renderImportModal() {
  const draft = state.importDraft;
  if (!draft) return '';
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header class="modal-header">
          <div>
            <h2 id="import-title">Importar backup</h2>
            <p>${escapeHtml(draft.fileName || 'backup.json')}</p>
          </div>
          <button type="button" id="close-import-modal" aria-label="Fechar">×</button>
        </header>
        <div class="modal-body">
          <section class="modal-section">
            <p class="help-text">Escolha o que importar. Chats com o mesmo id podem ser sobrescritos.</p>
            <div class="toggle-list">
              ${renderImportOption('config', 'Configurações e providers', 'Inclui provider padrão, API keys, tools, rede e rotatória.', true)}
              ${renderImportOption('persistentMemory', 'Memória persistente', 'Substitui a memória global compartilhada entre chats.', true)}
              ${renderImportOption('chats', 'Chats e mensagens', 'Importa metadados, histórico, memória e contexto dos chats.', true)}
              ${renderImportOption('attachments', 'Anexos', 'Inclui arquivos salvos dentro dos chats importados.', true)}
              ${renderImportOption('events', 'Eventos', 'Anexa eventos do backup ao log local para diagnóstico.', false)}
            </div>
          </section>
        </div>
        <footer class="modal-footer">
          <button type="button" id="cancel-import-modal">Cancelar</button>
          <button type="button" class="primary" id="confirm-import-modal">Importar selecionados</button>
        </footer>
      </section>
    </div>
  `;
}

function renderImportOption(name, title, description, checked) {
  const value = state.importDraft?.options?.[name] ?? checked;
  return `
    <label class="toggle-row">
      <input type="checkbox" class="import-option" name="${escapeAttr(name)}" ${value ? 'checked' : ''} />
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
    </label>
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
  const config = state.settingsDraft?.config || state.config;
  const checked = config.tools?.[name] !== false ? 'checked' : '';
  return `
    <label class="toggle-row switch-row" id="tool-${escapeAttr(name)}-row">
      <input type="checkbox" id="tool-${escapeAttr(name)}" name="tool_${escapeAttr(name)}" ${checked} />
      <span class="switch" aria-hidden="true"></span>
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
  const statusLabel = renderMessageStatus(message.status);
  const status = statusLabel ? `<span class="message-status ${escapeAttr(message.status)}">${statusLabel}</span>` : '';
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
      ${(message.toolUses || []).map((toolUse) => renderToolUse(toolUse, message)).join('')}
      <div class="bubble">${formatContent(message.content, message.role)}</div>
      ${renderMessageSources(message)}
      ${message.attachments?.length ? `<div class="message-attachments">${message.attachments.map((attachment) => renderAttachmentCard(attachment)).join('')}</div>` : ''}
      ${message.error ? `<div class="message-error">${escapeHtml(message.error)}</div>` : ''}
    </article>
  `;
}

function renderMessageSources(message) {
  if (message.role !== 'assistant') return '';
  const sources = [];
  for (const toolUse of message.toolUses || []) {
    if (toolUse.name !== 'web_search' || !Array.isArray(toolUse.result?.results)) continue;
    for (const result of toolUse.result.results) {
      if (!result.url || sources.some((item) => item.url === result.url)) continue;
      sources.push({ url: result.url, title: result.title || formatSourceHost(result.url) });
    }
  }
  if (!sources.length) return '';
  return `
    <div class="source-chips" aria-label="Fontes">
      ${sources
        .slice(0, 8)
        .map(
          (source) => `
            <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">
              <span>${escapeHtml(source.title)}</span>
              <small>${escapeHtml(formatSourceHost(source.url))}</small>
            </a>
          `,
        )
        .join('')}
    </div>
  `;
}

function formatSourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function renderMessageStatus(status) {
  if (status === 'pending') return 'enviando';
  if (status === 'failed') return 'falhou';
  if (status === 'needs_tool_approval') return 'aguardando aprovação';
  if (status === 'running_tools') return 'executando tools';
  if (status === 'tool_denied') return 'tool negada';
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

function renderContextEventCards() {
  const events = state.activeChatEvents.filter((event) => event.type === 'chat.context.auto_compacted').slice(0, 2);
  if (!events.length) return '';
  return events
    .map(
      (event) => `
        <article class="context-event-card">
          <div>
            <strong>Compactação automática</strong>
            <span>${escapeHtml(new Date(event.createdAt).toLocaleString())}</span>
          </div>
          <p>${escapeHtml(event.details?.summaryPreview || 'Contexto compactado atualizado.')}</p>
          <div class="button-row">
            <button type="button" class="open-context-editor">Editar contexto</button>
            <span class="meta">${escapeHtml(event.details?.path || 'context.md')}</span>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderToolUse(toolUse, message = null) {
  const result = toolUse.result || {};
  const command = toolUse.input?.command || '';
  const searchResults = toolUse.name === 'web_search' && Array.isArray(result.results) ? result.results : [];
  const genericInput = JSON.stringify(toolUse.input || {}, null, 2);
  const genericResult = JSON.stringify(result || {}, null, 2);
  const nextPending = message?.toolUses?.find((item) => item.status === 'pending_approval');
  const isActivePending = toolUse.status === 'pending_approval' && nextPending?.id === toolUse.id;
  const decisionBusy = state.toolDecisionInFlight.has(`${message?.id || ''}:${toolUse.id}`);
  const approvalActions =
    isActivePending
      ? `
        <div class="tool-approval-actions">
          <button type="button" class="primary approve-tool" data-message-id="${escapeAttr(message?.id || '')}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${decisionBusy ? 'disabled' : ''}>Permitir esta tool</button>
          <button type="button" class="danger-button deny-tool" data-message-id="${escapeAttr(message?.id || '')}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${decisionBusy ? 'disabled' : ''}>Negar esta tool</button>
        </div>
      `
      : toolUse.status === 'pending_approval'
        ? '<p class="help-text">Aguardando decisão da tool anterior.</p>'
      : '';
  return `
    <details class="tool-box" ${isActivePending ? 'open' : ''}>
      <summary class="tool-summary">
        <span>Tool usada: ${escapeHtml(toolUse.name)}</span>
        <span>${toolUse.status === 'pending_approval' ? 'aguardando aprovação' : result.timedOut ? 'timeout' : result.exitCode === undefined ? escapeHtml(result.action || result.method || 'ok') : `exit ${escapeHtml(String(result.exitCode))}`}</span>
      </summary>
      <div class="tool-body">
        ${approvalActions}
        ${
          command
            ? `<div><div class="message-label">Comando</div><pre>${escapeHtml(command)}</pre></div>`
            : `<div><div class="message-label">Input</div><pre>${escapeHtml(genericInput)}</pre></div>`
        }
        ${
          searchResults.length
            ? `<div><div class="message-label">Fontes encontradas</div>${searchResults
                .map(
                  (item) => `
                    <div class="search-result">
                      <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.url)}</a>
                      ${item.snippet ? `<small>${escapeHtml(item.snippet)}</small>` : ''}
                    </div>
                  `,
                )
                .join('')}</div>`
            : ''
        }
        ${result.stdout ? `<div><div class="message-label">stdout</div><pre>${escapeHtml(result.stdout)}</pre></div>` : ''}
        ${result.stderr ? `<div><div class="message-label">stderr</div><pre>${escapeHtml(result.stderr)}</pre></div>` : ''}
        ${!result.stdout && !result.stderr && !searchResults.length ? `<div><div class="message-label">Resultado</div><pre>${escapeHtml(genericResult)}</pre></div>` : ''}
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
  const videoPreview =
    attachment.kind === 'video' && contentUrl
      ? `<video class="attachment-video" src="${escapeAttr(contentUrl)}" controls preload="metadata"></video>`
      : '';
  const warning = getAttachmentWarning(attachment);
  const actions = options.pending
    ? `
      <div class="attachment-actions">
        <button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Visualizar</button>
        ${attachment.extractedText ? `<button type="button" class="paste-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Colar texto</button>` : ''}
        <button type="button" class="remove-pending-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Remover</button>
      </div>
    `
    : `<div class="attachment-actions"><button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Visualizar</button></div>`;
  return `
    <article class="attachment-card ${warning.level}" data-attachment-id="${escapeAttr(attachment.id)}">
      ${imagePreview || videoPreview}
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
  const liveEvents = state.activeChatEvents
    .filter((event) => event.type?.startsWith('tool.') || event.type?.startsWith('chat.context.auto'))
    .slice(0, 5);
  return `
    <article class="message assistant pending">
      <div class="message-label">Assistente</div>
      <div class="bubble">${escapeHtml(state.status || 'Pensando...')}</div>
      ${
        liveEvents.length
          ? `<div class="live-events">${liveEvents
              .map(
                (event) => `
                  <div>
                    <strong>${escapeHtml(event.type)}</strong>
                    <span>${escapeHtml(formatEventDetails(event.details))}</span>
                  </div>
                `,
              )
              .join('')}</div>`
          : ''
      }
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

function renderUpdateStatus() {
  const update = state.updateStatus;
  if (!update) {
    return '<p class="help-text">Nenhuma checagem feita nesta sessão.</p>';
  }

  const commits = update.commits?.length
    ? `<div><div class="message-label">Commits disponíveis</div><pre>${escapeHtml(update.commits.join('\n'))}</pre></div>`
    : '';
  const changedFiles = update.changedFiles?.length
    ? `<div><div class="message-label">Mudanças locais que bloqueiam update</div><pre>${escapeHtml(update.changedFiles.join('\n'))}</pre></div>`
    : '';

  return `
    <div class="update-status ${update.updateAvailable ? 'warn' : 'ok'}">
      <strong>${escapeHtml(update.reason || 'Status de atualização')}</strong>
      <span>Branch: ${escapeHtml(update.branch || 'n/a')} · Upstream: ${escapeHtml(update.upstream || 'n/a')}</span>
      <span>Atrás: ${escapeHtml(String(update.behind || 0))} · À frente: ${escapeHtml(String(update.ahead || 0))} · Local sujo: ${update.dirty ? 'sim' : 'não'}</span>
      <span>Remote: ${escapeHtml(update.remoteUrl || 'não configurado')}</span>
      ${commits}
      ${changedFiles}
    </div>
  `;
}

function formatEventDetails(details = {}) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
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

function renderTechnicalLevelOptions(selectedLevel = 'balanced') {
  const levels = [
    ['beginner', 'Iniciante: explica e confirma mais'],
    ['careful', 'Cuidadoso: transparente e cauteloso'],
    ['balanced', 'Equilibrado: padrão recomendado'],
    ['advanced', 'Avançado: direto e confiante'],
    ['expert', 'Especialista: mínimo de explicação'],
  ];
  return levels
    .map(([value, label]) => {
      const selected = selectedLevel === value ? 'selected' : '';
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

function getSearchMode(tools = {}) {
  const mode = String(tools.searchMode || '').trim();
  if (['off', 'native', 'terminal', 'both'].includes(mode)) return mode;
  if (tools.webSearch === false) return 'off';
  if (tools.searchTerminal === true) return 'terminal';
  return 'native';
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

function getActiveChatView() {
  if (!state.activeChat) return null;
  return state.chatSettingsDraft ? { ...state.activeChat, ...state.chatSettingsDraft } : state.activeChat;
}

function getChatSettingsPrefix() {
  return state.chatSettingsOpen ? 'mobile-' : '';
}

function captureChatSettingsDraftFromForm() {
  if (!state.activeChat) return state.chatSettingsDraft;
  const prefixes = state.chatSettingsOpen ? ['mobile-', ''] : ['', 'mobile-'];
  const findField = (suffix) => prefixes.map((prefix) => document.querySelector(`#${prefix}${suffix}`)).find(Boolean);
  const provider =
    findField('chat-provider-input')?.value ||
    state.chatSettingsDraft?.provider ||
    state.activeChat.provider ||
    state.config.provider;
  const title =
    findField('chat-title-input')?.value ??
    state.chatSettingsDraft?.title ??
    state.activeChat.title ??
    '';
  const prefix = document.querySelector(`#${getChatSettingsPrefix()}chat-model-input`) ? getChatSettingsPrefix() : prefixes[0];
  const modelSelect = findField('chat-model-input');
  let model = state.chatSettingsDraft?.model || state.activeChat.model || getProvider(provider).defaultModel;
  if (modelSelect) {
    const selected = modelSelect.value;
    model =
      selected === CUSTOM_MODEL_VALUE
        ? findField('chat-custom-model-input')?.value.trim() || getProvider(provider).defaultModel
        : selected || getProvider(provider).defaultModel;
  } else {
    model = getModelValue(`#${prefix}chat-model-input`, `#${prefix}chat-custom-model-input`, provider);
  }
  state.chatSettingsDraft = { title, provider, model };
  return state.chatSettingsDraft;
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

  if (attachment.kind === 'video') {
    return {
      level: 'warn',
      text:
        'Vídeo fica salvo no chat e é enviado como referência/caminho. Gemini pode aceitar vídeo por Files API, mas esse adapter nativo ainda não está implementado no MVP.',
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
  document.querySelector('#open-chat-settings-mobile')?.addEventListener('click', openChatSettings);
  document.querySelectorAll('[data-chat-id]').forEach((button) => {
    button.addEventListener('click', () => loadChat(button.dataset.chatId));
  });
  document.querySelector('#composer').addEventListener('submit', sendMessage);
  document.querySelector('#composer textarea').addEventListener('keydown', handleComposerKeydown);
  document.querySelector('#composer textarea').addEventListener('input', handleComposerInput);
  document.querySelector('#file-input')?.addEventListener('change', uploadSelectedFiles);
  document.querySelectorAll('.remove-pending-attachment').forEach((button) => {
    button.addEventListener('click', () => removePendingAttachment(button.dataset.attachmentId));
  });
  document.querySelectorAll('.paste-attachment').forEach((button) => {
    button.addEventListener('click', () => pasteAttachmentText(button.dataset.attachmentId));
  });
  document.querySelectorAll('.preview-attachment').forEach((button) => {
    button.addEventListener('click', () => openAttachmentViewer(button.dataset.attachmentId));
  });
  document.querySelector('#chat-provider-input')?.addEventListener('change', changeChatProviderDraft);
  document.querySelector('#chat-model-input')?.addEventListener('change', () => toggleChatCustomModel());
  document.querySelector('#chat-title-input')?.addEventListener('input', markChatSettingsDirty);
  document.querySelector('#chat-provider-input')?.addEventListener('change', markChatSettingsDirty);
  document.querySelector('#chat-model-input')?.addEventListener('change', markChatSettingsDirty);
  document.querySelector('#chat-custom-model-input')?.addEventListener('input', markChatSettingsDirty);
  document.querySelector('#chat-custom-model-images')?.addEventListener('change', markChatSettingsDirty);
  document.querySelector('#open-chat-context')?.addEventListener('click', openChatContext);
  document.querySelector('#open-model-settings')?.addEventListener('click', openModelSettings);
  document.querySelector('#save-chat-settings').addEventListener('click', saveChatSettings);
  document.querySelector('#delete-chat').addEventListener('click', deleteActiveChat);
  document.querySelector('#compact-context').addEventListener('click', compactContext);
  document.querySelector('#save-context').addEventListener('click', saveContext);
  document.querySelector('#edit-context').addEventListener('click', openContextEditor);
  document.querySelectorAll('.open-context-editor').forEach((button) => {
    button.addEventListener('click', openContextEditor);
  });
  document.querySelectorAll('.copy-message').forEach((button) => {
    button.addEventListener('click', () => copyMessage(button.dataset.messageId));
  });
  document.querySelectorAll('.retry-message').forEach((button) => {
    button.addEventListener('click', () => retryMessage(button.dataset.messageId));
  });
  document.querySelectorAll('.approve-tool').forEach((button) => {
    button.addEventListener('click', () => decideToolApproval(button.dataset.messageId, 'approve', button.dataset.toolCallId, button));
  });
  document.querySelectorAll('.deny-tool').forEach((button) => {
    button.addEventListener('click', () => decideToolApproval(button.dataset.messageId, 'deny', button.dataset.toolCallId, button));
  });
  document.querySelector('#retry-action')?.addEventListener('click', retryLastAction);
  document.querySelector('#retry-action-inline')?.addEventListener('click', retryLastAction);

  if (state.settingsOpen) {
    document.querySelector('#general-settings-form').addEventListener('submit', saveGeneralSettings);
    document.querySelector('#general-settings-form').addEventListener('input', markSettingsDirty);
    document.querySelector('#general-settings-form').addEventListener('change', markSettingsDirty);
    document.querySelector('#close-settings').addEventListener('click', closeSettings);
    document.querySelector('#cancel-settings').addEventListener('click', closeSettings);
    document.querySelectorAll('[data-settings-section]').forEach((button) => {
      button.addEventListener('click', () => {
        captureSettingsDraftFromForm();
        state.settingsSection = button.dataset.settingsSection;
        render();
      });
    });
    document.querySelector('#default-provider-input').addEventListener('change', changeDefaultProviderDraft);
    document.querySelector('#default-model-input').addEventListener('change', toggleDefaultCustomModel);
    document.querySelector('#settings-technical-guidance')?.addEventListener('change', () => toggleTechnicalLevelField('settings'));
    document.querySelector('#settings-network-enabled')?.addEventListener('change', () => toggleNetworkPasswordField('settings'));
    document.querySelector('#settings-search-enabled')?.addEventListener('change', () => toggleSearchModeField('settings'));
    document.querySelector('#api-provider-input').addEventListener('change', changeApiProviderDraft);
    document.querySelector('#toggle-api-key')?.addEventListener('click', toggleApiKeyVisibility);
    document.querySelector('#add-api-key')?.addEventListener('click', addApiKeyRow);
    document.querySelector('#add-provider-fallback')?.addEventListener('click', addProviderFallbackRow);
    document.querySelectorAll('.remove-api-key').forEach((button) => {
      button.addEventListener('click', () => removeApiKeyRow(Number(button.dataset.keyIndex)));
    });
    document.querySelectorAll('.remove-provider-fallback').forEach((button) => {
      button.addEventListener('click', () => removeProviderFallbackRow(Number(button.dataset.fallbackIndex)));
    });
    document.querySelector('#export-data').addEventListener('click', exportData);
    document.querySelector('#import-data').addEventListener('change', importData);
    document.querySelector('#check-update').addEventListener('click', checkUpdate);
    document.querySelector('#apply-update')?.addEventListener('click', applyUpdate);
    document.querySelector('#shutdown-app').addEventListener('click', shutdownApp);
    document.querySelector('#restart-tour')?.addEventListener('click', openSetupReview);
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
    document.querySelector('#chat-context-form').addEventListener('input', markChatContextDirty);
    document.querySelector('#chat-context-form').addEventListener('change', markChatContextDirty);
    document.querySelector('#close-chat-context').addEventListener('click', closeChatContext);
    document.querySelector('#cancel-chat-context').addEventListener('click', closeChatContext);
  }

  if (state.chatSettingsOpen) {
    document.querySelector('#mobile-chat-settings-form').addEventListener('submit', saveChatSettings);
    document.querySelector('#mobile-chat-provider-input')?.addEventListener('change', changeChatProviderDraft);
    document.querySelector('#mobile-chat-model-input')?.addEventListener('change', () => toggleChatCustomModel('mobile-'));
    document.querySelector('#mobile-chat-settings-form').addEventListener('input', markChatSettingsDirty);
    document.querySelector('#mobile-chat-settings-form').addEventListener('change', markChatSettingsDirty);
    document.querySelector('#mobile-open-chat-context')?.addEventListener('click', openChatContext);
    document.querySelector('#mobile-open-model-settings')?.addEventListener('click', openModelSettings);
    document.querySelector('#mobile-delete-chat')?.addEventListener('click', deleteActiveChat);
    document.querySelector('#close-chat-settings-mobile').addEventListener('click', closeChatSettings);
    document.querySelector('#cancel-chat-settings-mobile').addEventListener('click', closeChatSettings);
  }

  if (state.contextEditorOpen) {
    document.querySelector('#context-editor-form').addEventListener('submit', saveContextEditor);
    document.querySelector('#close-context-editor').addEventListener('click', closeContextEditor);
    document.querySelector('#cancel-context-editor').addEventListener('click', closeContextEditor);
  }

  if (state.modelSettingsOpen) {
    document.querySelector('#model-settings-form').addEventListener('submit', saveModelSettings);
    document.querySelector('#model-settings-form').addEventListener('input', markModelSettingsDirty);
    document.querySelector('#model-settings-form').addEventListener('change', markModelSettingsDirty);
    document.querySelector('#close-model-settings').addEventListener('click', closeModelSettings);
    document.querySelector('#cancel-model-settings').addEventListener('click', closeModelSettings);
    document.querySelector('#clear-model-settings').addEventListener('click', clearModelSettings);
  }

  if (state.confirmDialog) {
    document.querySelector('#confirm-cancel')?.addEventListener('click', () => {
      state.confirmDialog = null;
      render();
    });
    document.querySelector('#confirm-discard')?.addEventListener('click', discardPendingDialog);
    document.querySelector('#confirm-save')?.addEventListener('click', () => saveGeneralSettings(null, { closeAfter: true }));
    document.querySelector('#confirm-send-without-save')?.addEventListener('click', sendPendingMessageWithoutSaving);
    document.querySelector('#confirm-save-send')?.addEventListener('click', saveChatSettingsAndSend);
  }

  document.querySelector('#close-attachment-viewer')?.addEventListener('click', closeAttachmentViewer);
  document.querySelector('#close-import-modal')?.addEventListener('click', closeImportModal);
  document.querySelector('#cancel-import-modal')?.addEventListener('click', closeImportModal);
  document.querySelector('#confirm-import-modal')?.addEventListener('click', confirmImportData);

  autoResizeComposer();
}

async function saveSetup(event) {
  event.preventDefault();
  captureSetupDraftFromForm(event.currentTarget);
  const draft = state.setupDraft || buildSetupDraft();
  const provider = draft.provider || 'groq';
  const model = draft.model || getProvider(provider).defaultModel;
  if (draft.server?.networkEnabled && !String(draft.server?.authPassword || '').trim()) {
    state.error = 'Defina uma senha para abrir o painel na rede local.';
    render();
    return;
  }

  await runAction('Salvando configuração...', async () => {
    if (provider === 'ollama') {
      await ensureOllamaModelAvailable(model);
    }
    await api('/api/config', {
      method: 'PUT',
      body: {
        provider,
        model,
        providerSettings: draft.providerSettings,
        customModels: draft.customModels,
        modelCapabilities: draft.modelCapabilities,
        language: draft.language,
        userNickname: draft.userNickname,
        technicalLevel: draft.technicalLevel,
        technicalGuidanceEnabled: draft.technicalGuidanceEnabled,
        systemPromptExtra: draft.systemPromptExtra,
        tools: draft.tools,
        context: draft.context,
        routing: draft.routing,
        server: draft.server,
      },
    });
    state.setupReviewOpen = false;
    state.setupWizardStarted = false;
    state.setupDraft = null;
    state.setupStep = 'welcome';
    await bootstrap();
  });
}

async function skipSetup() {
  await runAction('Abrindo painel...', async () => {
    await api('/api/config', {
      method: 'PUT',
      body: {
        provider: state.config.provider || 'groq',
        model: state.config.model || getProvider(state.config.provider || 'groq').defaultModel,
        language: state.config.language || 'auto',
        userNickname: state.config.userNickname || '',
        technicalLevel: state.config.technicalLevel || 'balanced',
        technicalGuidanceEnabled: state.config.technicalGuidanceEnabled !== false,
        systemPromptExtra: state.config.systemPromptExtra || '',
        tools: state.config.tools,
        context: state.config.context,
        routing: state.config.routing,
        server: state.config.server,
        providerSettings: state.config.providerSettings,
        customModels: state.config.customModels,
        modelCapabilities: state.config.modelCapabilities,
      },
    });
    await bootstrap();
  });
}

function openSetupReview() {
  state.settingsOpen = false;
  state.settingsDraft = null;
  state.settingsDirty = false;
  state.setupReviewOpen = true;
  state.setupWizardStarted = false;
  state.setupDraft = buildSetupDraft();
  state.setupStep = 'welcome';
  render();
}

async function closeSetupReview() {
  state.setupReviewOpen = false;
  state.setupWizardStarted = false;
  state.setupDraft = null;
  state.setupStep = 'welcome';
  await bootstrap();
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
    if (!isSupportedUpload(file)) {
      state.error = `Formato ainda não compatível: ${file.name}. Envie imagens, vídeo, áudio, PDF, texto, código, JSON, CSV, HTML, XML, YAML ou Markdown.`;
      render();
      continue;
    }
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

function openAttachmentViewer(attachmentId) {
  const attachment =
    state.pendingAttachments.find((item) => item.id === attachmentId) ||
    state.activeChat?.attachments?.find((item) => item.id === attachmentId) ||
    state.activeChat?.messages?.flatMap((message) => message.attachments || []).find((item) => item.id === attachmentId);
  if (!attachment) return;
  state.attachmentViewer = attachment;
  render();
}

function closeAttachmentViewer() {
  state.attachmentViewer = null;
  render();
}

function getSupportedUploadAccept() {
  return [
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'text/*',
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
  ].join(',');
}

function isSupportedUpload(file) {
  const mimeType = file.type || guessMimeType(file.name);
  const extension = `.${String(file.name || '').split('.').pop()?.toLowerCase() || ''}`;
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return true;
  if (mimeType === 'application/pdf' || extension === '.pdf') return true;
  if (mimeType.startsWith('text/')) return true;
  return getSupportedUploadAccept().split(',').includes(extension) || ['application/json', 'application/xml', 'application/x-yaml'].includes(mimeType);
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
  captureChatSettingsDraftFromForm();
  state.chatSettingsDraft = {
    ...(state.chatSettingsDraft || {}),
    provider,
    model: getProvider(provider).defaultModel,
  };
  state.chatSettingsDirty = true;
  render();
}

function toggleChatCustomModel(prefix = '') {
  const select = document.querySelector(`#${prefix}chat-model-input`);
  const row = document.querySelector(`#${prefix}chat-custom-model-row`);
  const imagesRow = document.querySelector(`#${prefix}chat-custom-model-images-row`);
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
  if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
  state.settingsDraft.config = {
    ...state.settingsDraft.config,
    provider: event.target.value,
    model: getProvider(event.target.value).defaultModel,
  };
  state.settingsProvider = event.target.value;
  state.settingsDirty = true;
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

function toggleTechnicalLevelField(scope) {
  const guidance = document.querySelector(`#${scope}-technical-guidance`);
  const row = document.querySelector(`#${scope}-technical-level-row`);
  const select = document.querySelector(`#${scope}-technical-level`);
  const enabled = guidance?.checked !== false;
  row?.classList.toggle('hidden', !enabled);
  if (select) select.disabled = !enabled;
}

function toggleNetworkPasswordField(scope) {
  const enabledInput = document.querySelector(`#${scope}-network-enabled`);
  const row = document.querySelector(`#${scope}-network-password-row`);
  const password = row?.querySelector('input');
  const enabled = enabledInput?.checked === true;
  row?.classList.toggle('hidden', !enabled);
  if (password) {
    password.disabled = !enabled;
    password.required = enabled;
  }
}

function toggleSearchModeField(scope) {
  const enabledInput = document.querySelector(`#${scope}-search-enabled`);
  const row = document.querySelector(`#${scope}-search-mode-row`);
  row?.classList.toggle('hidden', enabledInput?.checked !== true);
}

function syncSetupApiDraft() {
  if (!state.setupDraft) state.setupDraft = buildSetupDraft();
  const provider = document.querySelector('#setup-provider')?.value || state.setupDraft?.provider || state.config?.provider || 'groq';
  const apiKeyInputs = [...document.querySelectorAll('.setup-api-key-input')];
  if (!apiKeyInputs.length) return;
  state.setupDraft.providerSettings = {
    ...(state.setupDraft.providerSettings || {}),
    [provider]: {
      ...(state.setupDraft.providerSettings?.[provider] || {}),
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
  const provider = document.querySelector('#setup-provider')?.value || state.setupDraft?.provider || state.config.provider;
  const settings = state.setupDraft.providerSettings?.[provider] || {};
  settings.apiKeys = [...(settings.apiKeys || []), { id: `setup-draft-${Date.now()}`, label: `Key ${(settings.apiKeys || []).length + 1}`, value: '' }];
  state.setupDraft.providerSettings = {
    ...(state.setupDraft.providerSettings || {}),
    [provider]: settings,
  };
  renderSetup();
}

function removeSetupApiKeyRow(index) {
  syncSetupApiDraft();
  const provider = document.querySelector('#setup-provider')?.value || state.setupDraft?.provider || state.config.provider;
  const settings = state.setupDraft.providerSettings?.[provider] || {};
  settings.apiKeys = (settings.apiKeys || []).filter((_, itemIndex) => itemIndex !== index);
  state.setupDraft.providerSettings = {
    ...(state.setupDraft.providerSettings || {}),
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
  if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
  const draftConfig = state.settingsDraft.config;
  const provider = state.settingsProvider || draftConfig.provider;
  const settings = draftConfig.providerSettings?.[provider] || {};
  settings.apiKeys = [...(settings.apiKeys || []), { id: `draft-${Date.now()}`, label: `Key ${(settings.apiKeys || []).length + 1}`, value: '' }];
  draftConfig.providerSettings = {
    ...(draftConfig.providerSettings || {}),
    [provider]: settings,
  };
  state.settingsDirty = true;
  render();
}

function removeApiKeyRow(index) {
  syncProviderApiDraft();
  if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
  const draftConfig = state.settingsDraft.config;
  const provider = state.settingsProvider || draftConfig.provider;
  const settings = draftConfig.providerSettings?.[provider] || {};
  settings.apiKeys = (settings.apiKeys || []).filter((_, itemIndex) => itemIndex !== index);
  draftConfig.providerSettings = {
    ...(draftConfig.providerSettings || {}),
    [provider]: settings,
  };
  state.settingsDirty = true;
  render();
}

async function createNewChat() {
  await runAction('Criando chat...', async () => {
    const data = await api('/api/chats', { method: 'POST' });
    state.chats = data.chats;
    state.activeChat = data.chat;
    state.activeChatEvents = [];
    state.chatSettingsDraft = null;
    state.chatSettingsDirty = false;
  });
}

async function loadChat(chatId) {
  await runAction('Abrindo chat...', async () => {
    const data = await api(`/api/chats/${chatId}`);
    state.activeChat = data.chat;
    state.activeChatEvents = data.activeChatEvents || [];
    state.chatSettingsDraft = null;
    state.chatSettingsDirty = false;
  });
}

async function sendMessage(event) {
  event.preventDefault();
  const textarea = event.currentTarget.elements.content;
  const content = textarea.value.trim();
  if ((!content && !state.pendingAttachments.length) || !state.activeChat) return;
  if (state.chatSettingsDirty || state.modelSettingsDirty) {
    saveComposerDraft();
    state.confirmDialog = { type: 'send-chat-settings' };
    render();
    return;
  }
  await sendMessageFromValues(textarea, content);
}

async function sendMessageFromComposerDraft() {
  const textarea = document.querySelector('#composer textarea');
  const content = (textarea?.value || getComposerDraft(state.activeChat?.id)).trim();
  if ((!content && !state.pendingAttachments.length) || !state.activeChat) return;
  await sendMessageFromValues(textarea, content);
}

async function sendMessageFromValues(textarea, content) {
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
  if (textarea) textarea.value = '';
  clearComposerDraft(state.activeChat.id);
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
  render();
  scrollMessagesToBottom();

  await runAction(
    `Enviando para ${providerLabel(state.activeChat.provider || state.config.provider)}...`,
    async () => {
      startEventPolling(chatId);
      let data;
      try {
        data = await api(`/api/chats/${chatId}/messages`, {
          method: 'POST',
          body: {
            content,
            retryMessageId: options.retryMessageId,
            attachmentIds: attachments.map((attachment) => attachment.id),
          },
        });
      } finally {
        stopEventPolling();
      }
      state.activeChat = data.chat;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
      const fresh = await api('/api/chats');
      state.chats = fresh.chats;
    },
    () => sendMessageContent(content, options),
  );
  if (!state.error && state.activeChat?.id === chatId) {
    scrollMessagesToBottom();
  }
  if (state.error && state.activeChat?.id === chatId) {
    await refreshActiveChatData();
    render();
  }
}

async function decideToolApproval(messageId, decision, toolCallId = null, button = null) {
  const decisionKey = `${messageId}:${toolCallId || 'next'}`;
  if (state.toolDecisionInFlight.has(decisionKey)) return;
  state.toolDecisionInFlight.add(decisionKey);
  button?.closest('.tool-approval-actions')?.querySelectorAll('button').forEach((item) => {
    item.disabled = true;
  });
  try {
    await runAction(decision === 'approve' ? 'Executando tool aprovada...' : 'Negando tool...', async () => {
      startEventPolling(state.activeChat.id);
      let data;
      try {
        data = await api(`/api/chats/${state.activeChat.id}/tool-approvals/${messageId}`, {
          method: 'POST',
          body: { decision, toolCallId },
        });
      } finally {
        stopEventPolling();
      }
      state.activeChat = data.chat;
      state.chats = data.chats || state.chats;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    });
  } finally {
    state.toolDecisionInFlight.delete(decisionKey);
  }
}

function startEventPolling(chatId) {
  stopEventPolling();
  const poll = async () => {
    try {
      const data = await api(`/api/chats/${chatId}`);
      if (state.activeChat?.id === chatId) {
        state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
        updateEventsUi();
      }
    } catch {
      // Polling is best-effort; the main request still owns errors.
    }
  };
  poll();
  state.eventPollingTimer = window.setInterval(poll, 1500);
}

function updateEventsUi() {
  const eventList = document.querySelector('.event-list');
  if (eventList) eventList.innerHTML = state.activeChatEvents.map(renderEvent).join('');
}

function stopEventPolling() {
  if (state.eventPollingTimer) {
    window.clearInterval(state.eventPollingTimer);
    state.eventPollingTimer = null;
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
  saveComposerDraft();
}

function handleComposerInput() {
  saveComposerDraft();
  autoResizeComposer();
}

function getComposerDraft(chatId) {
  if (!chatId) return '';
  return localStorage.getItem(getComposerDraftKey(chatId)) || '';
}

function saveComposerDraft() {
  const textarea = document.querySelector('#composer textarea');
  if (!textarea || !state.activeChat?.id) return;
  localStorage.setItem(getComposerDraftKey(state.activeChat.id), textarea.value);
}

function clearComposerDraft(chatId) {
  if (!chatId) return;
  localStorage.removeItem(getComposerDraftKey(chatId));
}

function getComposerDraftKey(chatId) {
  return `my-computer:draft:${chatId}`;
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
  });
}

function openChatContext() {
  state.chatSettingsOpen = false;
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
    state.chatContextDirty = false;
  });
}

function openModelSettings() {
  state.chatSettingsOpen = false;
  state.modelSettingsOpen = true;
  render();
}

function closeModelSettings() {
  state.modelSettingsOpen = false;
  render();
}

function openChatSettings() {
  state.chatSettingsOpen = true;
  render();
}

function closeChatSettings() {
  state.chatSettingsOpen = false;
  render();
}

async function openContextEditor() {
  if (!state.activeChat) return;
  await runAction('Carregando contexto compactado...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/context`);
    state.contextEditor = {
      content: data.content || '',
      path: data.path || '',
    };
    state.contextEditorOpen = true;
  });
}

function closeContextEditor() {
  state.contextEditorOpen = false;
  state.contextEditor = null;
  render();
}

async function saveContextEditor(event) {
  event.preventDefault();
  const content = document.querySelector('#context-editor-input').value;
  await runAction('Salvando contexto compactado...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/context`, {
      method: 'PUT',
      body: { content },
    });
    state.activeChat = data.chat;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    state.contextEditorOpen = false;
    state.contextEditor = null;
  });
}

async function clearModelSettings() {
  await saveModelSettings(null, {});
}

async function saveModelSettings(event, overrideSettings = null, options = {}) {
  event?.preventDefault();
  const settings = overrideSettings ?? readModelSettingsForm();
  const chat = getActiveChatView() || state.activeChat;
  await runAction('Salvando parâmetros do modelo...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        title: chat.title,
        provider: chat.provider,
        model: chat.model,
        modelSettings: settings,
        systemPromptExtra: state.activeChat.systemPromptExtra || '',
      },
    });
    state.activeChat = data.chat;
    state.chats = data.chats;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    state.modelSettingsDirty = false;
    if (options.closeAfter) state.modelSettingsOpen = false;
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

async function saveChatSettings(event, options = {}) {
  event?.preventDefault();
  const draft = captureChatSettingsDraftFromForm() || {};
  const prefix = getChatSettingsPrefix();
  const title = draft.title || '';
  const provider = draft.provider || state.activeChat.provider || state.config.provider;
  const model = draft.model || state.activeChat.model || getProvider(provider).defaultModel;
  const supportsImagesInput =
    document.querySelector(`#${prefix}chat-custom-model-images`) ||
    document.querySelector('#chat-custom-model-images') ||
    document.querySelector('#mobile-chat-custom-model-images');
  const modelCapabilities = withCustomModelCapabilities(
    state.config.modelCapabilities,
    provider,
    model,
    supportsImagesInput?.checked,
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
    state.chatSettingsDraft = null;
    state.chatSettingsDirty = false;
    if (options.closeAfter) state.chatSettingsOpen = false;
  });
}

async function saveGeneralSettings(event, options = {}) {
  event?.preventDefault();
  syncProviderApiDraft();
  const formElement = event?.currentTarget || document.querySelector('#general-settings-form');
  if (!formElement) return;
  const form = new FormData(formElement);
  const draftConfig = state.settingsDraft?.config || state.config;
  const provider = form.get('provider') || draftConfig.provider;
  const model = getModelValue('#default-model-input', '#default-custom-model-input', provider);
  const customModels = withCustomModel(draftConfig.customModels, provider, model);
  const modelCapabilities = withCustomModelCapabilities(
    draftConfig.modelCapabilities,
    provider,
    model,
    form.get('customModelImages') === 'on',
  );
  if (form.get('networkEnabled') === 'on' && !String(form.get('authPassword') || '').trim()) {
    state.error = 'Defina uma senha para abrir o painel na rede local.';
    render();
    return;
  }
  await runAction('Salvando configurações gerais...', async () => {
    const tools = {
      terminal: form.get('tool_terminal') === 'on',
      searchMode: form.get('searchEnabled') === 'on' ? form.get('searchMode') || 'native' : 'off',
      chatMemory: form.get('tool_chatMemory') === 'on',
      persistentMemory: form.get('tool_persistentMemory') === 'on',
      autoCompact: form.get('tool_autoCompact') === 'on',
      chatTitle: form.get('tool_chatTitle') === 'on',
      alwaysAllow: form.get('tool_alwaysAllow') === 'on',
      terminalMode: form.get('terminalMode') || 'standard',
    };
    tools.webSearch = tools.searchMode !== 'off';
    tools.searchTerminal = tools.searchMode === 'terminal' || tools.searchMode === 'both';
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
        technicalLevel: form.get('technicalLevel'),
        technicalGuidanceEnabled: form.get('technicalGuidanceEnabled') === 'on',
        systemPromptExtra: form.get('systemPromptExtra'),
        tools,
        context: {
          autoCompactEnabled: form.get('autoCompactEnabled') === 'on',
          autoCompactChars: Number(form.get('autoCompactChars')),
          autoCompactMinMessages: Number(form.get('autoCompactMinMessages')),
        },
        routing: {
          providerRotationEnabled: form.get('providerRotationEnabled') === 'on',
          maxProviderPasses: Number(form.get('maxProviderPasses') || 2),
          fallbacks: readRoutingFallbackRows(),
        },
        server: {
          networkEnabled: form.get('networkEnabled') === 'on',
          authPassword: form.get('authPassword'),
        },
        providerSettings: (state.settingsDraft?.config || state.config).providerSettings,
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
    state.settingsDirty = false;
    state.settingsDraft = buildSettingsDraft();
    if (options.closeAfter) {
      state.settingsOpen = false;
      state.settingsDraft = null;
      state.confirmDialog = null;
    }
  });
}

function syncProviderApiDraft() {
  if (!state.settingsOpen) return;
  if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
  const draftConfig = state.settingsDraft.config;
  const provider = state.settingsProvider || draftConfig.provider;
  const baseUrlInput = document.querySelector('#api-base-url-input');
  const apiKeyInputs = [...document.querySelectorAll('.api-key-input')];
  if (!baseUrlInput && !apiKeyInputs.length) return;

  draftConfig.providerSettings = {
    ...(draftConfig.providerSettings || {}),
    [provider]: {
      ...(draftConfig.providerSettings?.[provider] || {}),
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

function markSettingsDirty() {
  state.settingsDirty = true;
  captureSettingsDraftFromForm();
  updateDirtyIndicators();
}

function markChatSettingsDirty() {
  captureChatSettingsDraftFromForm();
  state.chatSettingsDirty = true;
  updateDirtyIndicators();
}

function markChatContextDirty() {
  state.chatContextDirty = true;
  updateDirtyIndicators();
}

function markModelSettingsDirty() {
  state.modelSettingsDirty = true;
  updateDirtyIndicators();
}

function captureSettingsDraftFromForm() {
  if (!state.settingsOpen) return;
  if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
  const formElement = document.querySelector('#general-settings-form');
  if (!formElement) return;
  syncProviderApiDraft();
  const form = new FormData(formElement);
  const draftConfig = state.settingsDraft.config;
  const provider = form.get('provider') || draftConfig.provider || state.config.provider;
  draftConfig.provider = provider;
  draftConfig.model = getModelValue('#default-model-input', '#default-custom-model-input', provider);
  draftConfig.language = form.get('language') || 'auto';
  draftConfig.userNickname = form.get('userNickname') || '';
  draftConfig.technicalLevel = form.get('technicalLevel') || draftConfig.technicalLevel || 'balanced';
  draftConfig.technicalGuidanceEnabled = form.get('technicalGuidanceEnabled') === 'on';
  draftConfig.systemPromptExtra = form.get('systemPromptExtra') || '';
  const searchMode = form.get('searchEnabled') === 'on' ? form.get('searchMode') || getSearchMode(draftConfig.tools) : 'off';
  draftConfig.tools = {
    ...(draftConfig.tools || {}),
    terminal: form.get('tool_terminal') === 'on',
    chatMemory: form.get('tool_chatMemory') === 'on',
    persistentMemory: form.get('tool_persistentMemory') === 'on',
    autoCompact: form.get('tool_autoCompact') === 'on',
    chatTitle: form.get('tool_chatTitle') === 'on',
    alwaysAllow: form.get('tool_alwaysAllow') === 'on',
    terminalMode: form.get('terminalMode') || 'standard',
    searchMode,
    webSearch: searchMode !== 'off',
    searchTerminal: searchMode === 'terminal' || searchMode === 'both',
  };
  draftConfig.context = {
    autoCompactEnabled: form.get('autoCompactEnabled') === 'on',
    autoCompactChars: Number(form.get('autoCompactChars') || 24000),
    autoCompactMinMessages: Number(form.get('autoCompactMinMessages') || 12),
  };
  draftConfig.routing = {
    providerRotationEnabled: form.get('providerRotationEnabled') === 'on',
    maxProviderPasses: Number(form.get('maxProviderPasses') || 2),
    fallbacks: readRoutingFallbackRows(),
  };
  draftConfig.server = {
    networkEnabled: form.get('networkEnabled') === 'on',
    authPassword: form.get('authPassword') || '',
  };
  state.settingsDraft.persistentMemory = form.get('persistentMemory') || state.settingsDraft.persistentMemory || '';
}

function updateDirtyIndicators() {
  document.querySelectorAll('.dirty-note').forEach((item) => {
    item.classList.toggle('hidden', !state.settingsDirty && !state.chatSettingsDirty && !state.chatContextDirty && !state.modelSettingsDirty);
  });
  document.querySelector('#general-settings-form button[type="submit"]')?.classList.toggle('dirty-save', state.settingsDirty);
  document.querySelector('#save-chat-settings')?.classList.toggle('dirty-save', state.chatSettingsDirty);
}

function readRoutingFallbackRows() {
  return [...document.querySelectorAll('.routing-fallback-row')]
    .map((row) => ({
      provider: row.querySelector('.fallback-provider')?.value || '',
      model: row.querySelector('.fallback-model')?.value.trim() || '',
    }))
    .filter((item) => item.provider && item.model);
}

function buildSettingsDraft() {
  return {
    config: structuredClone(state.config || {}),
    persistentMemory: state.persistentMemory || '',
  };
}

function addProviderFallbackRow() {
  captureSettingsDraftFromForm();
  const draftConfig = state.settingsDraft.config;
  const fallbackProvider = state.providers.find((provider) => provider.id !== draftConfig.provider)?.id || 'openai';
  draftConfig.routing = {
    ...(draftConfig.routing || {}),
    fallbacks: [
      ...(draftConfig.routing?.fallbacks || []),
      { provider: fallbackProvider, model: getProvider(fallbackProvider).defaultModel },
    ],
  };
  state.settingsDirty = true;
  render();
}

function removeProviderFallbackRow(index) {
  captureSettingsDraftFromForm();
  const draftConfig = state.settingsDraft.config;
  draftConfig.routing = {
    ...(draftConfig.routing || {}),
    fallbacks: (draftConfig.routing?.fallbacks || []).filter((_, itemIndex) => itemIndex !== index),
  };
  state.settingsDirty = true;
  render();
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
  event.target.value = '';
  if (!file) return;
  try {
    const content = await file.text();
    state.importDraft = {
      fileName: file.name,
      payload: JSON.parse(content),
      options: {
        config: true,
        persistentMemory: true,
        chats: true,
        attachments: true,
        events: false,
      },
    };
    state.importModalOpen = true;
    render();
  } catch (error) {
    state.error = `Backup inválido: ${error.message}`;
    render();
  }
}

function closeImportModal() {
  state.importModalOpen = false;
  state.importDraft = null;
  render();
}

async function confirmImportData() {
  if (!state.importDraft) return;
  state.importDraft.options = {
    ...state.importDraft.options,
    ...Object.fromEntries([...document.querySelectorAll('.import-option')].map((input) => [input.name, input.checked])),
  };
  await runAction('Importando dados...', async () => {
    const data = await api('/api/import', {
      method: 'POST',
      body: {
        data: state.importDraft.payload,
        options: state.importDraft.options,
      },
    });
    state.config = data.config;
    state.providers = data.providers || state.providers;
    state.models = data.models || state.models;
    state.ollamaInstalledModels = data.ollamaInstalledModels || state.ollamaInstalledModels;
    state.chats = data.chats;
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
    state.persistentMemory = data.persistentMemory || '';
    state.networkStatus = data.networkStatus || state.networkStatus;
    state.importModalOpen = false;
    state.importDraft = null;
  });
}

async function checkUpdate() {
  await runAction('Verificando atualização...', async () => {
    const data = await api('/api/update/status');
    state.updateStatus = data.update;
  });
}

async function applyUpdate() {
  const confirmed = window.confirm('Atualizar o My Computer agora? O servidor vai rodar git pull, npm install e reiniciar.');
  if (!confirmed) return;
  await runAction('Atualizando My Computer...', async () => {
    const data = await api('/api/update/apply', {
      method: 'POST',
      body: { confirm: true },
    });
    state.updateStatus = data.status || state.updateStatus;
    state.status = data.message || 'Atualização aplicada.';
  });
}

async function compactContext() {
  await runAction('Compactando contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/compact`, { method: 'POST' });
    state.activeChat = data.chat;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
  });
}

async function saveContext() {
  await runAction('Salvando snapshot de contexto...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}/save-context`, { method: 'POST' });
    state.activeChat = data.chat;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    state.status = `Snapshot salvo em ${data.path}`;
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
  state.networkStatus = data.networkStatus || state.networkStatus;
  if (!state.activeChat && data.activeChat) {
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
  }
}

async function refreshActiveChatData() {
  if (!state.activeChat) return;
  const data = await api(`/api/chats/${state.activeChat.id}`);
  state.activeChat = data.chat;
  state.activeChatEvents = data.activeChatEvents || [];
}

function openSettings() {
  state.settingsOpen = true;
  state.settingsDraft = buildSettingsDraft();
  state.settingsDirty = false;
  state.settingsProvider = state.settingsDraft.config.provider;
  state.settingsSection = state.settingsSection || 'identity';
  render();
}

function closeSettings() {
  captureSettingsDraftFromForm();
  if (state.settingsDirty) {
    state.confirmDialog = { type: 'close-settings' };
    render();
    return;
  }
  state.settingsOpen = false;
  state.settingsDraft = null;
  render();
}

function discardPendingDialog() {
  const type = state.confirmDialog?.type;
  state.confirmDialog = null;
  if (type === 'close-settings') {
    state.settingsOpen = false;
    state.settingsDirty = false;
    state.settingsDraft = null;
  }
  render();
}

async function saveChatSettingsAndSend() {
  state.confirmDialog = null;
  if (state.chatSettingsDirty) await saveChatSettings(null);
  if (state.modelSettingsDirty) await saveModelSettings(null);
  await sendMessageFromComposerDraft();
}

async function sendPendingMessageWithoutSaving() {
  state.confirmDialog = null;
  await sendMessageFromComposerDraft();
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
  captureOpenDrafts();
  const visualState = captureVisualState();
  state.busy = true;
  state.status = status;
  state.error = '';
  state.lastFailedAction = null;
  updateStatusUi();
  try {
    await action();
  } catch (error) {
    state.error = error.message;
    state.lastFailedAction = retry || (() => runAction(status, action));
  } finally {
    state.busy = false;
    const finalVisualState = captureVisualState() || visualState;
    render();
    restoreVisualState(finalVisualState);
  }
}

function updateStatusUi() {
  const statusElement = document.querySelector('.inspector .status');
  if (statusElement) {
    statusElement.textContent = state.error || state.status || 'Pronto';
    statusElement.classList.toggle('error', Boolean(state.error));
  }
}

function captureOpenDrafts() {
  if (state.settingsOpen) captureSettingsDraftFromForm();
  if (state.chatSettingsDirty) captureChatSettingsDraftFromForm();
  saveComposerDraft();
}

function captureVisualState() {
  return {
    settingsScrollTop: document.querySelector('.settings-layout')?.scrollTop || 0,
    modalScrollTop: document.querySelector('.modal-body')?.scrollTop || 0,
    messagesScrollTop: document.querySelector('#messages')?.scrollTop || 0,
    activeElementId: document.activeElement?.id || '',
    selectionStart: document.activeElement?.selectionStart ?? null,
    selectionEnd: document.activeElement?.selectionEnd ?? null,
  };
}

function restoreVisualState(snapshot) {
  if (!snapshot) return;
  const settingsLayout = document.querySelector('.settings-layout');
  if (settingsLayout) settingsLayout.scrollTop = snapshot.settingsScrollTop || 0;
  const modalBody = document.querySelector('.modal-body');
  if (modalBody) modalBody.scrollTop = snapshot.modalScrollTop || 0;
  const messages = document.querySelector('#messages');
  if (messages) messages.scrollTop = snapshot.messagesScrollTop || 0;
  if (snapshot.activeElementId) {
    const active = document.getElementById(snapshot.activeElementId);
    if (active && typeof active.focus === 'function') {
      active.focus({ preventScroll: true });
      if (snapshot.selectionStart !== null && 'selectionStart' in active) {
        active.selectionStart = snapshot.selectionStart;
        active.selectionEnd = snapshot.selectionEnd;
      }
    }
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

function formatContent(content, role = 'assistant') {
  const text = String(content || '');
  if (role !== 'assistant') return escapeHtml(text);
  return renderMarkdownLite(text);
}

function renderMarkdownLite(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${formatInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(`<${list.type}>${list.items.map((item) => `<li>${formatInline(item)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    const codeFence = /^```/.exec(line);
    if (codeFence) {
      if (code) {
        blocks.push(`<pre><code>${escapeHtml(code.lines.join('\n'))}</code></pre>`);
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = { lines: [] };
      }
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 2;
      blocks.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const numbered = /^\s*\d+\.\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (numbered || bullet) {
      flushParagraph();
      const type = numbered ? 'ol' : 'ul';
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(numbered?.[1] || bullet?.[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (code) blocks.push(`<pre><code>${escapeHtml(code.lines.join('\n'))}</code></pre>`);
  flushParagraph();
  flushList();
  return blocks.join('');
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
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
