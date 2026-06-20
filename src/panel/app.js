const state = {
  config: null,
  providers: [],
  models: [],
  ollamaInstalledModels: [],
  chats: [],
  chatSearch: '',
  activeChat: null,
  activeChatEvents: [],
  persistentMemory: '',
  userMemoryFiles: [],
  profiles: [],
  activeProfile: null,
  runtimeHome: '',
  rootRuntimeHome: '',
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
  chatContextDraft: null,
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
  attachmentDiff: null,
  userMemoryViewer: null,
  userMemoryDiff: null,
  messageDetailsOpen: false,
  messageDetailsMessageId: null,
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
  activeAgentChatId: null,
  stopInFlight: false,
  status: '',
  error: '',
};

const CUSTOM_MODEL_VALUE = '__custom__';
const DEFAULT_UI_LANGUAGE = 'en-US';
const SUPPORTED_UI_LANGUAGES = ['en-US', 'pt-BR'];
const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const EN_TEXT = new Map([
  ['Tour inicial', 'Initial tour'],
  ['My Computer', 'My Computer'],
  ['Revise as escolhas iniciais sem apagar chats, logs, anexos ou memórias.', 'Review the initial choices without deleting chats, logs, attachments, or memories.'],
  ['Um painel local para conversar com uma IA, usar tools do seu computador com controle e manter contexto entre chats.', 'A local panel to chat with AI, use your computer tools with control, and keep context across chats.'],
  ['Refazer tour', 'Restart tour'],
  ['Configurar agora', 'Set up now'],
  ['Escolher provider, API key, tema, nível técnico, busca, tools e rede.', 'Choose provider, API key, theme, technical level, search, tools, and network.'],
  ['Voltar ao painel', 'Back to panel'],
  ['Pular para o painel', 'Skip to panel'],
  ['Buscar chats', 'Search chats'],
  ['Filtrar por nome, provider ou modelo...', 'Filter by name, provider, or model...'],
  ['Ex.: Trabalho, Estudos, Ficção', 'Example: Work, Study, Fiction'],
  ['Nenhum chat encontrado.', 'No chat found.'],
  ['Não altera nada e retorna ao chat.', 'Does not change anything and returns to chat.'],
  ['Usar defaults agora e ajustar tudo depois em Configurações gerais.', 'Use defaults now and adjust everything later in General settings.'],
  ['Qual provider você pretende usar primeiro?', 'Which provider do you want to use first?'],
  ['Escolha o provider/modelo inicial, incluindo modo offline se quiser usar só Ollama local.', 'Choose the initial provider/model, including offline mode if you want to use only local Ollama.'],
  ['Agora ajuste como a IA deve falar com você e quanto contexto técnico deve assumir.', 'Now adjust how the AI should talk to you and how much technical context it should assume.'],
  ['Defina como busca e tools locais funcionam antes do primeiro chat.', 'Define how search and local tools work before the first chat.'],
  ['Por fim, escolha se o painel fica só neste computador ou também na rede local.', 'Finally, choose whether the panel stays on this computer only or opens to the local network.'],
  ['Configuração inicial guiada. Tudo pode ser alterado depois nas configurações gerais.', 'Guided initial setup. Everything can be changed later in General settings.'],
  ['Isso vira o padrão dos chats novos. Você pode trocar por chat depois.', 'This becomes the default for new chats. You can change it per chat later.'],
  ['Modo offline desta seção', 'Offline mode for this section'],
  ['Força Ollama local, bloqueia providers online, desliga busca nativa e remove rotatórias para serviços externos.', 'Forces local Ollama, blocks online providers, disables native search, and removes external-service routing.'],
  ['Provider', 'Provider'],
  ['Modelo padrão', 'Default model'],
  ['Modelo personalizado', 'Custom model'],
  ['Este modelo suporta imagens', 'This model supports images'],
  ['Ative apenas se o endpoint aceitar imagens no formato OpenAI vision.', 'Enable only if the endpoint accepts images in OpenAI vision format.'],
  ['Endpoint/base URL', 'Endpoint/base URL'],
  ['Adicionar key', 'Add key'],
  ['Ocultar keys', 'Hide keys'],
  ['Ver keys', 'Show keys'],
  ['Se houver mais de uma key, o backend alterna quando uma falha por rate limit, autenticação ou erro temporário.', 'If there is more than one key, the backend rotates when one fails because of rate limits, authentication, or temporary errors.'],
  ['Este provider não precisa de API key local.', 'This provider does not need a local API key.'],
  ['Como a IA deve adaptar as respostas?', 'How should the AI adapt its responses?'],
  ['Isso muda o nível de explicação, cautela e autonomia. Não altera segurança de tools.', 'This changes explanation level, caution, and autonomy. It does not change tool safety.'],
  ['Apelido', 'Nickname'],
  ['Idioma da IA', 'AI response language'],
  ['Idioma da interface', 'Interface language'],
  ['Tema do painel', 'Panel theme'],
  ['Nível técnico', 'Technical level'],
  ['Adaptar resposta ao nível', 'Adapt response to level'],
  ['Níveis mais baixos explicam mais e confirmam mais coisas; isso pode gastar mais tokens.', 'Lower levels explain more and confirm more things; this can spend more tokens.'],
  ['System prompt geral', 'General system prompt'],
  ['Como a IA pode usar tools?', 'How can the AI use tools?'],
  ['Busca nativa não executa comando local. Terminal e tools locais continuam sob aprovação quando “sempre permitir” estiver desligado.', 'Native search does not execute local commands. Terminal and local tools still require approval when “always allow” is off.'],
  ['Sempre permitir qualquer tool', 'Always allow any tool'],
  ['Desligado por padrão. Quando desligado, a IA precisa da sua aprovação na UI antes de executar tools.', 'Off by default. When off, the AI needs your approval in the UI before running tools.'],
  ['Incentivar a IA a fazer investigações mais profundas', 'Encourage deeper AI investigations'],
  ['Adiciona instruções para inspecionar arquivos, scripts, logs e outputs por mais rodadas antes da resposta final.', 'Adds instructions to inspect files, scripts, logs, and outputs across more rounds before the final answer.'],
  ['Memória persistente', 'Persistent memory'],
  ['Você pode adicionar arquivos Markdown/texto depois. O índice sempre ajuda a IA a saber que os arquivos existem; leitura e edição são permissões separadas.', 'You can add Markdown/text files later. The index helps the AI know the files exist; reading and editing are separate permissions.'],
  ['Permitir que a IA liste e leia arquivos adicionais', 'Allow the AI to list and read additional files'],
  ['Enviar arquivos adicionados a todo prompt', 'Send added files with every prompt'],
  ['Permitir edição de arquivos de memória', 'Allow memory file editing'],
  ['Lembrar a IA de manter esses arquivos atualizados', 'Remind the AI to keep these files updated'],
  ['Pesquisa web', 'Web search'],
  ['Busca nativa usa o provider e não pede confirmação. No modo Ambos, o app cai no terminal se a busca nativa falhar ou vier vazia. Busca via terminal usa a máquina local.', 'Native search uses the provider and does not ask for confirmation. In Both mode, the app falls back to terminal if native search fails or returns empty. Terminal search uses the local machine.'],
  ['Quer abrir o painel na rede local?', 'Open the panel on the local network?'],
  ['Se ligar, salve e reinicie. No outro dispositivo, use o IP mostrado depois em Configurações gerais > Rede.', 'If enabled, save and restart. On another device, use the IP shown later in General settings > Network.'],
  ['Abrir painel para a rede local', 'Open panel to local network'],
  ['Exige senha abaixo e só vale depois de reiniciar o servidor. Use apenas em rede confiável.', 'Requires the password below and only applies after restarting the server. Use only on trusted networks.'],
  ['Senha da rede local', 'Local network password'],
  ['Sem senha, o app não permite abrir o painel para a rede.', 'Without a password, the app will not allow opening the panel to the network.'],
  ['Voltar', 'Back'],
  ['Continuar', 'Continue'],
  ['Salvar e voltar ao painel', 'Save and return to panel'],
  ['Salvar e abrir chat', 'Save and open chat'],
  ['Novo chat', 'New chat'],
  ['Configurações gerais', 'General settings'],
  ['Comece uma conversa.', 'Start a conversation.'],
  ['Digite uma mensagem...', 'Type a message...'],
  ['Digite para criar o primeiro chat...', 'Type to create the first chat...'],
  ['Aprove ou negue a tool pendente antes de enviar outra mensagem.', 'Approve or deny the pending tool before sending another message.'],
  ['Parar agente', 'Stop agent'],
  ['Enviar', 'Send'],
  ['Você', 'You'],
  ['Assistente', 'Assistant'],
  ['Copiar', 'Copy'],
  ['Ver detalhes', 'View details'],
  ['Tentar novamente', 'Try again'],
  ['Permitir', 'Allow'],
  ['Negar', 'Deny'],
  ['Verificar execução', 'Check execution'],
  ['Permitir esta tool', 'Allow this tool'],
  ['Negar esta tool', 'Deny this tool'],
  ['Fontes', 'Sources'],
  ['Fontes usadas', 'Sources used'],
  ['Pensando...', 'Thinking...'],
  ['Configurações gerais', 'General settings'],
  ['Preferências globais, providers, segurança, tools e dados locais.', 'Global preferences, providers, security, tools, and local data.'],
  ['Seções', 'Sections'],
  ['Identidade', 'Identity'],
  ['Providers', 'Providers'],
  ['Modelos', 'Models'],
  ['Memória', 'Memory'],
  ['Tools', 'Tools'],
  ['Contexto', 'Context'],
  ['Rede', 'Network'],
  ['Atualizações', 'Updates'],
  ['Backup', 'Backup'],
  ['Servidor', 'Server'],
  ['Seção', 'Section'],
  ['Sem chat ativo', 'No active chat'],
  ['Salvar snapshot', 'Save snapshot'],
  ['Compactar contexto', 'Compact context'],
  ['Editar contexto compactado', 'Edit compacted context'],
  ['Configurações de chat', 'Chat settings'],
  ['Configurações do chat', 'Chat settings'],
  ['Nome do chat', 'Chat name'],
  ['Provider deste chat', 'This chat provider'],
  ['Modelo deste chat', 'This chat model'],
  ['Use para modelos personalizados vision. Se desligado, imagens ficam bloqueadas.', 'Use for custom vision models. If disabled, images are blocked.'],
  ['Se o modelo local não estiver instalado, o My Computer chama o pull do Ollama antes da primeira resposta.', 'If the local model is not installed, My Computer runs Ollama pull before the first response.'],
  ['Prompt e memória', 'Prompt and memory'],
  ['Configurações do modelo', 'Model settings'],
  ['Apagar chat', 'Delete chat'],
  ['Status', 'Status'],
  ['Pronto', 'Ready'],
  ['Eventos', 'Events'],
  ['Copiar eventos', 'Copy events'],
  ['Seções e usuários', 'Sections and users'],
  ['Cada seção usa chats, configurações, memória persistente, arquivos de memória e eventos isolados. A seção Default preserva o runtime antigo.', 'Each section uses isolated chats, settings, persistent memory, memory files, and events. The Default section preserves the old runtime.'],
  ['Criar seção', 'Create section'],
  ['Identidade e padrão', 'Identity and defaults'],
  ['Essas escolhas viram padrão para chats novos; cada chat ainda pode ter provider/modelo próprios.', 'These choices become defaults for new chats; each chat can still have its own provider/model.'],
  ['Força provider/modelo local via Ollama, bloqueia providers online, desliga busca nativa e impede rotatórias externas.', 'Forces local provider/model through Ollama, blocks online providers, disables native search, and prevents external routing.'],
  ['Idioma da IA', 'AI response language'],
  ['Tema do painel', 'Panel theme'],
  ['Providers e APIs', 'Providers and APIs'],
  ['Provider para editar', 'Provider to edit'],
  ['Adicionar API key', 'Add API key'],
  ['Rotatória de modelos', 'Model rotation'],
  ['Rotatória de providers', 'Provider rotation'],
  ['Limite de voltas da rotatória', 'Rotation pass limit'],
  ['Adicionar modelo alternativo', 'Add alternate model'],
  ['Adicionar fallback', 'Add fallback'],
  ['Índice de modelos', 'Model index'],
  ['Arquivos adicionais', 'Additional files'],
  ['Adicionar arquivos', 'Add files'],
  ['Permitir que a IA edite arquivos adicionais', 'Allow the AI to edit additional files'],
  ['Lembrar a IA de manter seus arquivos de memória atualizados', 'Remind the AI to keep your memory files updated'],
  ['Nível de isolamento', 'Isolation level'],
  ['Sudo no My Computer', 'Sudo in My Computer'],
  ['Compactar automaticamente', 'Auto-compact'],
  ['Limite estimado para compactar', 'Estimated compaction limit'],
  ['Mínimo de mensagens entre compactações', 'Minimum messages between compactions'],
  ['Rede local', 'Local network'],
  ['Como funciona', 'How it works'],
  ['Abrir painel para a rede', 'Open panel to network'],
  ['Senha de acesso', 'Access password'],
  ['Verificar atualização', 'Check update'],
  ['Atualizar e reiniciar', 'Update and restart'],
  ['Exportar dados', 'Export data'],
  ['Importar dados', 'Import data'],
  ['Limpeza de chats', 'Chat cleanup'],
  ['Excluir todos os chats', 'Delete all chats'],
  ['Servidor local', 'Local server'],
  ['Refazer tour inicial', 'Restart initial tour'],
  ['Encerrar My Computer', 'Shut down My Computer'],
  ['Cancelar', 'Cancel'],
  ['Salvar configurações', 'Save settings'],
  ['Alterações não salvas', 'Unsaved changes'],
  ['Claro', 'Light'],
  ['Escuro', 'Dark'],
  ['Sistema', 'System'],
  ['Automático', 'Automatic'],
  ['Português brasileiro', 'Brazilian Portuguese'],
  ['Mesmo idioma do usuário', 'Same as user'],
  ['Português', 'Portuguese'],
  ['Inglês', 'English'],
  ['Espanhol', 'Spanish'],
  ['Iniciante: explica e confirma mais', 'Beginner: explains and confirms more'],
  ['Cuidadoso: transparente e cauteloso', 'Careful: transparent and cautious'],
  ['Equilibrado: padrão recomendado', 'Balanced: recommended default'],
  ['Avançado: direto e confiante', 'Advanced: direct and confident'],
  ['Especialista: mínimo de explicação', 'Expert: minimal explanation'],
  ['Desligada', 'Off'],
  ['Nativa', 'Native'],
  ['Terminal', 'Terminal'],
  ['Ambos', 'Both'],
  ['enviando', 'sending'],
  ['aguardando aprovação', 'waiting for approval'],
  ['executando tool', 'running tool'],
  ['executando tools', 'running tools'],
  ['tool negada', 'tool denied'],
  ['falhou', 'failed'],
  ['incompleto', 'incomplete'],
  ['concluído', 'completed'],
  ['Título do chat', 'Chat title'],
  ['Permite que a IA renomeie o chat com rename_chat, normalmente depois da primeira mensagem.', 'Allows the AI to rename the chat with rename_chat, usually after the first message.'],
  ['Provider, modelo e atalhos deste chat.', 'Provider, model, and shortcuts for this chat.'],
  ['Use apenas se o endpoint aceitar imagens multimodais.', 'Use only if the endpoint accepts multimodal images.'],
  ['Prompt e memória do chat', 'Chat prompt and memory'],
  ['Preferências e notas duráveis específicas deste chat.', 'Preferences and durable notes specific to this chat.'],
  ['System prompt do chat', 'Chat system prompt'],
  ['Preferências específicas deste chat.', 'Specific preferences for this chat.'],
  ['Memória do chat', 'Chat memory'],
  ['A tool memory_chat usa este Markdown como base quando precisa ler, anexar ou reescrever memória do chat.', 'The memory_chat tool uses this Markdown when it needs to read, append, or rewrite chat memory.'],
  ['Contexto compactado', 'Compacted context'],
  ['Este Markdown entra no prompt das próximas mensagens como resumo durável do chat. Edite para corrigir fatos, remover ruído ou preservar decisões importantes.', 'This Markdown is added to the next prompts as a durable chat summary. Edit it to fix facts, remove noise, or preserve important decisions.'],
  ['Salvar contexto', 'Save context'],
  ['Esses parâmetros valem só para este chat. Campos não compatíveis com o provider ficam ocultos para reduzir erro de API.', 'These parameters apply only to this chat. Fields unsupported by the provider are hidden to reduce API errors.'],
  ['Nota do modelo', 'Model note'],
  ['Temperatura:', 'Temperature:'],
  ['aumenta ou reduz variação/criatividade. Valores baixos tendem a ser mais previsíveis.', 'increases or reduces variation/creativity. Lower values tend to be more predictable.'],
  ['Top P:', 'Top P:'],
  ['limita a amostragem por probabilidade acumulada. Use junto com temperatura só quando souber o motivo.', 'limits sampling by cumulative probability. Use it together with temperature only when you know why.'],
  ['Máximo de tokens:', 'Max tokens:'],
  ['teto da resposta do modelo. Alto demais pode custar mais ou falhar por limite do provider.', 'caps the model response. Too high can cost more or fail because of provider limits.'],
  ['Stop:', 'Stop:'],
  ['sequências que interrompem a geração quando aparecem.', 'sequences that stop generation when they appear.'],
  ['Temperatura', 'Temperature'],
  ['Máximo de tokens de saída', 'Max output tokens'],
  ['Esforço de raciocínio', 'Reasoning effort'],
  ['Padrão do provider', 'Provider default'],
  ['Uma sequência por linha', 'One sequence per line'],
  ['Limpar ajustes', 'Clear settings'],
  ['Salvar', 'Save'],
  ['Você editou as configurações gerais. Escolha o que fazer antes de fechar.', 'You edited general settings. Choose what to do before closing.'],
  ['Continuar editando', 'Keep editing'],
  ['Descartar', 'Discard'],
  ['Salvar e fechar', 'Save and close'],
  ['Configurações do chat pendentes', 'Pending chat settings'],
  ['Este chat tem ajustes não salvos. Você pode salvar antes de enviar ou enviar com as configurações já salvas no servidor.', 'This chat has unsaved settings. You can save before sending, or send with the settings already saved on the server.'],
  ['Enviar sem salvar', 'Send without saving'],
  ['Salvar e enviar', 'Save and send'],
  ['Arquivo de memória', 'Memory file'],
  ['cópia salva no My Computer', 'copy saved in My Computer'],
  ['Edite a cópia salva dentro do My Computer. O arquivo original enviado de fora não é alterado.', 'Edit the copy saved inside My Computer. The original file uploaded from outside is not changed.'],
  ['Este arquivo está como somente leitura para edição manual.', 'This file is read-only for manual editing.'],
  ['Salvar arquivo', 'Save file'],
  ['Diff da memória', 'Memory diff'],
  ['Ver arquivo', 'View file'],
  ['Arquivo não encontrado no índice da seção ativa. O diff ainda mostra o trecho que a IA tentou substituir.', 'File not found in the active section index. The diff still shows the text the AI tried to replace.'],
  ['Diff da alteração proposta', 'Proposed change diff'],
  ['Importar backup', 'Import backup'],
  ['Escolha o que importar. Chats com o mesmo id podem ser sobrescritos.', 'Choose what to import. Chats with the same id can be overwritten.'],
  ['Configurações e providers', 'Settings and providers'],
  ['Inclui provider padrão, API keys, tema, tools, contexto, rede e rotatórias.', 'Includes default provider, API keys, theme, tools, context, network, and routing.'],
  ['Substitui a memória global compartilhada entre chats.', 'Replaces the global memory shared between chats.'],
  ['Arquivos de memória persistente', 'Persistent memory files'],
  ['Restaura os arquivos adicionais adicionados pelo usuário nesta seção.', 'Restores additional files added by the user in this section.'],
  ['Chats e mensagens', 'Chats and messages'],
  ['Importa metadados, histórico, memória e contexto dos chats.', 'Imports chat metadata, history, memory, and context.'],
  ['Anexos', 'Attachments'],
  ['Inclui arquivos salvos dentro dos chats importados.', 'Includes files saved inside imported chats.'],
  ['Anexa eventos do backup ao log local para diagnóstico.', 'Appends backup events to the local diagnostic log.'],
  ['Importar selecionados', 'Import selected'],
  ['Nenhum modelo alternativo em', 'No alternate model in'],
  ['Modelo alternativo em', 'Alternate model in'],
  ['Selecione um modelo alternativo', 'Select an alternate model'],
  ['Remover', 'Remove'],
  ['Produção', 'Production'],
  ['Raciocínio', 'Reasoning'],
  ['Imagem', 'Image'],
  ['Padrão', 'Default'],
  ['visão', 'vision'],
  ['texto', 'text'],
  ['raciocínio', 'reasoning'],
  ['instalado', 'installed'],
  ['índice', 'index'],
  ['selecionável', 'selectable'],
  ['saída', 'output'],
  ['imagem(ns)', 'image(s)'],
  ['Modelo personalizado ou ainda não instalado', 'Custom model or not installed yet'],
  ['Erro na requisição', 'Request error'],
  ['Compactação automática', 'Automatic compaction'],
  ['Contexto compactado atualizado.', 'Compacted context updated.'],
  ['Editar contexto', 'Edit context'],
  ['Histórico da execução', 'Execution history'],
  ['Saída intermediária da IA', 'Intermediate AI output'],
  ['Tool solicitada:', 'Requested tool:'],
  ['Comando', 'Command'],
  ['Input', 'Input'],
  ['Output', 'Output'],
  ['Resultado', 'Result'],
  ['Fontes encontradas', 'Sources found'],
  ['Detalhes da execução', 'Execution details'],
  ['Tentativas', 'Attempts'],
  ['Prompt original', 'Original prompt'],
  ['Histórico desta tentativa', 'This attempt history'],
  ['Saída selecionada', 'Selected output'],
  ['Eventos relacionados', 'Related events'],
  ['Copiar eventos relacionados', 'Copy related events'],
  ['Os eventos abaixo pertencem a esta tentativa e ao prompt que a originou.', 'The events below belong to this attempt and to the prompt that created it.'],
  ['Desinstalar o Ollama do sistema? Pode pedir sudo e falhar pelo navegador se precisar de senha.', 'Uninstall Ollama from the system? It may ask for sudo and fail in the browser if a password is required.'],
  ['Trocar de seção e descartar alterações não salvas?', 'Switch section and discard unsaved changes?'],
  ['Nome da nova seção/usuário:', 'New section/user name:'],
  ['Nova seção', 'New section'],
  ['Novo nome da seção:', 'New section name:'],
  ['Descartar alterações não salvas neste arquivo de memória?', 'Discard unsaved changes in this memory file?'],
  ['Para confirmar, digite exatamente: APAGAR TODOS OS CHATS', 'To confirm, type exactly: APAGAR TODOS OS CHATS'],
  ['Atualizar o My Computer agora? O servidor vai rodar git pull, npm install e reiniciar.', 'Update My Computer now? The server will run git pull, npm install, and restart.'],
  ['Encerrar o servidor local do My Computer? Para iniciar depois, rode ./install.sh ou npm run start:open.', 'Shut down the local My Computer server? To start later, run ./install.sh or npm run start:open.'],
  ['Obrigatória para abrir na rede', 'Required to open on the network'],
  ['Como a IA deve chamar você', 'How the AI should call you'],
  ['Preferências gerais de tom, formato, limites e jeito de trabalhar.', 'General preferences for tone, format, limits, and working style.'],
  ['provider/model ou nome local', 'provider/model or local name'],
  ['https://api.exemplo.com/v1', 'https://api.example.com/v1'],
  ['arquivo', 'file'],
  ['documento', 'document'],
  ['editável', 'editable'],
  ['somente leitura', 'read-only'],
  ['Primeiro, escolha a IA principal e como o app deve se conectar a ela.', 'First, choose the main AI and how the app should connect to it.'],
  ['Provider padrão', 'Default provider'],
  ['Ative somente se o endpoint aceitar imagens. O app bloqueia imagem quando isso estiver desligado.', 'Enable only if the endpoint accepts images. The app blocks images when this is off.'],
  ['Quando ligado, adiciona uma instrução ao prompt para calibrar autonomia, explicações e cautela.', 'When enabled, adds a prompt instruction to calibrate autonomy, explanations, and caution.'],
  ['Cada provider guarda endpoint e keys próprias. Rotação entre keys já acontece por provider; a rotação abaixo troca também de provider/modelo quando uma chamada falha.', 'Each provider stores its own endpoint and keys. Key rotation already happens per provider; the routing below also switches provider/model when a call fails.'],
  ['Ollama local normalmente não usa API key. O endpoint padrão é http://127.0.0.1:11434/v1.', 'Local Ollama usually does not use an API key. The default endpoint is http://127.0.0.1:11434/v1.'],
  ['Modo offline ativo', 'Offline mode active'],
  ['Rotatórias de modelo/provider ficam desligadas nesta seção para evitar fallback em serviços online.', 'Model/provider routing stays disabled in this section to avoid fallback to online services.'],
  ['Antes de trocar API key, tenta outros modelos do mesmo provider. Útil quando um modelo específico cai em rate limit ou falha no meio das tools.', 'Before switching API keys, tries other models from the same provider. Useful when a specific model hits a rate limit or fails during tools.'],
  ['Se o provider/modelo atual falhar, tenta os fallbacks abaixo em ordem e registra tudo nos eventos do chat.', 'If the current provider/model fails, tries the fallbacks below in order and records everything in chat events.'],
  ['Use este provider para Minimax, Together, Fireworks, servidores próprios ou qualquer API que aceite o formato /v1/chat/completions.', 'Use this provider for Minimax, Together, Fireworks, self-hosted servers, or any API that accepts the /v1/chat/completions format.'],
  ['Revisado para o fim de maio de 2026. Modelos marcados como índice são informativos ou dependem de outra API, enquanto os selecionáveis entram nas rotatórias e no seletor do chat.', 'Reviewed for late May 2026. Models marked as index are informational or depend on another API, while selectable models appear in routing and chat selectors.'],
  ['O Markdown global entra no prompt de todos os chats desta seção. Arquivos adicionais podem entrar completos ou apenas como índice para leitura por tool.', 'The global Markdown is added to every chat prompt in this section. Additional files can be sent in full or only as an index for tool-based reading.'],
  ['Esses arquivos são memória persistente adicionada por você. O app pode só mostrar o índice no prompt, ou enviar o conteúdo completo quando você ligar essa opção.', 'These files are persistent memory added by you. The app can show only the index in the prompt, or send the full content when you enable that option.'],
  ['Habilita a tool', 'Enables the tool'],
  ['. Sem isso, a IA só usa o que já foi injetado no prompt e não consegue abrir arquivos por conta própria.', '. Without it, the AI only uses what was injected into the prompt and cannot open files by itself.'],
  ['Enviar os arquivos adicionados por você a todo prompt', 'Send the files you added with every prompt'],
  ['Quando desligado, a IA recebe só o índice. Se a leitura acima estiver ligada, ela usa', 'When off, the AI receives only the index. If reading above is enabled, it uses'],
  ['para abrir apenas o que precisar.', 'to open only what it needs.'],
  ['. Ela substitui um trecho exato em arquivos de texto/Markdown e pede aprovação quando tools automáticas estão desligadas.', '. It replaces an exact snippet in text/Markdown files and asks for approval when automatic tools are off.'],
  ['Só funciona quando a edição está ligada. Injeta uma instrução para atualizar arquivos editáveis conforme os chats avançam.', 'Only works when editing is enabled. Injects an instruction to update editable files as chats progress.'],
  ['Leitura/listagem desligada: edição também fica indisponível, porque a IA não tem como localizar arquivos nem confirmar trechos atuais.', 'Reading/listing is off: editing is also unavailable because the AI cannot locate files or confirm current snippets.'],
  ['Quando desligado, tools locais aparecem uma por vez para você permitir ou negar antes de executar.', 'When off, local tools appear one at a time for you to allow or deny before execution.'],
  ['Modo offline: busca nativa e modo Ambos ficam indisponíveis. Se habilitar pesquisa, use terminal com consulta neutra e sem dados privados.', 'Offline mode: native search and Both mode are unavailable. If you enable search, use terminal with a neutral query and no private data.'],
  ['Busca nativa roda no servidor do provider e não pede confirmação. No modo Ambos, o app cai no terminal se a busca nativa falhar ou vier vazia. Busca via terminal usa a tool local e segue permissão.', 'Native search runs on the provider server and does not ask for confirmation. In Both mode, the app falls back to terminal if native search fails or returns empty. Terminal search uses the local tool and follows permissions.'],
  ['Permite que a IA execute comandos no terminal por run_terminal_command.', 'Allows the AI to run terminal commands through run_terminal_command.'],
  ['Quando ligado, injeta instruções para usar mais rodadas de tools, seguir referências e olhar outputs antes da resposta final.', 'When enabled, injects instructions to use more tool rounds, follow references, and inspect outputs before the final answer.'],
  ['Permite que a IA edite o memory.md do chat atual por memory_chat.', 'Allows the AI to edit the current chat memory.md through memory_chat.'],
  ['Permite que a IA edite a memória global por persistent_memory.', 'Allows the AI to edit global memory through persistent_memory.'],
  ['Documentos anexados ao chat', 'Chat attachments as documents'],
  ['Permite que a IA liste, leia e edite anexos de texto do chat por chat_document. Edições alteram apenas a cópia salva no My Computer.', 'Allows the AI to list, read, and edit text attachments in the chat through chat_document. Edits change only the copy saved in My Computer.'],
  ['Tool de compactar contexto', 'Context compaction tool'],
  ['Permite que a IA chame compact_context quando o contexto estiver grande ou precisar preservar decisões.', 'Allows the AI to call compact_context when the context is large or decisions need to be preserved.'],
  ['O app executa comandos como seu usuário. Para permitir sudo sem digitar senha no navegador, configure uma regra NOPASSWD limitada aos comandos que você aceita delegar.', 'The app runs commands as your OS user. To allow sudo without typing a password in the browser, configure a NOPASSWD rule limited to commands you accept delegating.'],
  ['O método isolado é uma contenção leve por diretório e HOME, não uma VM/container. Comandos ainda podem acessar caminhos absolutos se forem instruídos a isso.', 'The isolated method is lightweight containment by directory and HOME, not a VM/container. Commands can still access absolute paths if instructed to do so.'],
  ['Depois de uma resposta, o app compacta o chat quando o contexto estimado passar do limite configurado.', 'After a response, the app compacts the chat when estimated context exceeds the configured limit.'],
  ['Janela interna do modelo:', 'Model internal window:'],
  ['limite real do modelo/provider em uso. O app ainda aproxima por caracteres, então um modelo menor pode rejeitar chamadas se o prompt ficar grande demais.', 'the real limit of the model/provider in use. The app still estimates by characters, so a smaller model can reject calls if the prompt gets too large.'],
  ['Salvar snapshot:', 'Save snapshot:'],
  ['salva uma fotografia Markdown do estado atual em context-snapshots e atualiza context-window.md. Não muda o prompt futuro por si só.', 'saves a Markdown snapshot of the current state in context-snapshots and updates context-window.md. It does not change future prompts by itself.'],
  ['Compactar contexto:', 'Compact context:'],
  ['pede ao modelo para resumir histórico, memória e decisões em context.md. Esse arquivo entra no prompt das próximas mensagens.', 'asks the model to summarize history, memory, and decisions into context.md. That file is added to future prompts.'],
  ['compact_context:', 'compact_context:'],
  ['tool opcional para a própria IA atualizar context.md quando perceber que a conversa está longa.', 'optional tool for the AI itself to update context.md when it notices the conversation is long.'],
  ['Por padrão o My Computer escuta só em 127.0.0.1. Ao abrir para a rede, o próximo restart passa a escutar em 0.0.0.0 e o navegador pede Basic Auth. Essa senha de rede é única; seções/usuários internos isolam dados do app, mas não criam contas de login separadas.', 'By default My Computer listens only on 127.0.0.1. When opened to the network, the next restart listens on 0.0.0.0 and the browser asks for Basic Auth. This network password is shared; internal sections/users isolate app data, but do not create separate login accounts.'],
  ['Endereços de acesso', 'Access addresses'],
  ['Na máquina:', 'On this machine:'],
  ['Na rede:', 'On the network:'],
  ['Rede local desligada. Ligue e reinicie para acessar por outro dispositivo.', 'Local network is off. Enable it and restart to access from another device.'],
  ['Permite acessar pelo IP local da máquina. Para acesso fora da rede, precisaremos projetar HTTPS, usuários e permissões com mais calma.', 'Allows access through the machine local IP. For access outside the local network, HTTPS, users, and permissions need a more careful design.'],
  ['Obrigatória para rede local', 'Required for local network'],
  ['Obrigatória para habilitar rede local. A mudança vale no próximo restart.', 'Required to enable local network. The change applies on next restart.'],
  ['Atualiza direto do repositório Git configurado nesta pasta: faz', 'Updates directly from the Git repository configured in this folder: runs'],
  [', compara com o upstream e, se você confirmar, roda', ', compares with upstream, and if you confirm, runs'],
  ['. O servidor reinicia depois da atualização.', '. The server restarts after the update.'],
  ['Exporta ou importa configurações, chats, memórias, arquivos adicionais, anexos e contexto salvo da seção atual.', 'Exports or imports settings, chats, memories, additional files, attachments, and saved context from the current section.'],
  ['Apaga todos os chats, mensagens, anexos e memórias de chat da seção atual. Configurações, memória persistente global e arquivos adicionais de memória ficam preservados.', 'Deletes all chats, messages, attachments, and chat memories from the current section. Settings, global persistent memory, and additional memory files are preserved.'],
  ['Encerrar para o processo do My Computer. Para iniciar de novo, rode', 'Stops the My Computer process. To start again, run'],
  ['ou', 'or'],
  ['nesta pasta.', 'in this folder.'],
  ['Ativar', 'Activate'],
  ['Renomear', 'Rename'],
  ['saída(s)', 'output(s)'],
  ['A IA quer usar uma tool', 'The AI wants to use a tool'],
  ['Tool aprovada em execução', 'Approved tool running'],
  ['Confira o resumo abaixo. O input completo e o histórico ficam em Ver detalhes.', 'Review the summary below. Full input and history are in View details.'],
  ['O app está aguardando o resultado. Use verificar se a execução ficou presa.', 'The app is waiting for the result. Use check execution if it got stuck.'],
  ['Think do modelo', 'Model thinking'],
  ['Think desta saída', 'This output thinking'],
  ['Resposta final do modelo', 'Final model response'],
  ['Linha do tempo da tentativa', 'Attempt timeline'],
  ['Copiar relacionados', 'Copy related'],
  ['Nenhum evento relacionado encontrado ainda.', 'No related events found yet.'],
  ['Aguardando decisão da tool anterior.', 'Waiting for the previous tool decision.'],
  ['Tool usada:', 'Tool used:'],
  ['Ver input completo', 'View full input'],
  ['Memória atualizada:', 'Memory updated:'],
  ['arquivo', 'file'],
  ['Ver diff', 'View diff'],
  ['Arquivo de memória atualizado', 'Memory file updated'],
  ['Alteração de memória proposta', 'Proposed memory change'],
  ['Arquivo de memória consultado', 'Memory file read'],
  ['Veja o diff antes/depois da substituição exata.', 'View the before/after diff for the exact replacement.'],
  ['Abra a cópia atual salva dentro do My Computer.', 'Open the current copy saved inside My Computer.'],
  ['Arquivo não encontrado no índice da seção ativa. Ele pode ter sido removido, estar em outra seção ou ter sido informado incorretamente pela IA.', 'File not found in the active section index. It may have been removed, be in another section, or have been incorrectly provided by the AI.'],
  ['Trecho', 'Chunk'],
  ['Resultado truncado; a IA deve continuar com offset', 'Result truncated; the AI should continue with offset'],
  ['Arquivo lido até o fim.', 'File read to the end.'],
  ['caractere(s).', 'character(s).'],
  ['Visualizar', 'Preview'],
  ['Colar texto', 'Paste text'],
  ['O histórico completo fica em Ver detalhes quando a resposta terminar.', 'The full history is available in View details when the response finishes.'],
  ['Atividade de tool', 'Tool activity'],
  ['Contexto sendo organizado', 'Context being organized'],
  ['Atividade', 'Activity'],
  ['Nenhuma checagem feita nesta sessão.', 'No checks made in this session.'],
  ['Commits disponíveis', 'Available commits'],
  ['Mudanças locais que bloqueiam update', 'Local changes blocking update'],
  ['Status de atualização', 'Update status'],
  ['Atrás:', 'Behind:'],
  ['À frente:', 'Ahead:'],
  ['Local sujo:', 'Dirty local:'],
  ['sim', 'yes'],
  ['não', 'no'],
  ['não configurado', 'not configured'],
  ['tentativa', 'attempt'],
  ['modelo', 'model'],
  ['volta', 'pass'],
  ['modelo(s)', 'model(s)'],
  ['rotatória de modelos ligada', 'model rotation enabled'],
  ['rotatória de providers ligada', 'provider rotation enabled'],
  ['stdout disponível', 'stdout available'],
  ['stderr disponível', 'stderr available'],
  ['Instale pelo terminal usando o comando oficial abaixo e depois clique em verificar. Se o comando pedir sudo/senha, rode no terminal; o navegador não consegue digitar essa senha por você. O painel baixa/remove modelos quando detectar o Ollama instalado.', 'Install from the terminal using the official command below, then click check. If the command asks for sudo/password, run it in the terminal; the browser cannot type that password for you. The panel downloads/removes models when it detects Ollama installed.'],
  ['Verificar Ollama', 'Check Ollama'],
  ['Modelo instalado', 'Model installed'],
  ['Baixar modelo selecionado', 'Pull selected model'],
  ['Nenhum modelo local encontrado ainda.', 'No local model found yet.'],
  ['Quando a verificação encontrar o Ollama, esta área mostra botões para baixar o modelo escolhido e remover modelos locais.', 'When the check finds Ollama, this area shows buttons to pull the chosen model and remove local models.'],
  ['Sem texto extraído para visualizar.', 'No extracted text to preview.'],
  ['Carregando conteúdo do arquivo...', 'Loading file content...'],
  ['Abrir/editar', 'Open/edit'],
  ['Diff do documento', 'Document diff'],
  ['Documento do chat', 'Chat document'],
  ['Documento do chat atualizado', 'Chat document updated'],
  ['Documento do chat consultado', 'Chat document read'],
  ['Documentos do chat listados', 'Chat documents listed'],
  ['Documento não encontrado no chat atual. O diff ainda mostra o trecho que a IA tentou alterar.', 'Document not found in the current chat. The diff still shows the snippet the AI tried to change.'],
  ['Veja o diff ou abra a cópia salva neste chat.', 'Review the diff or open the copy saved in this chat.'],
  ['Anexo removido. A cópia e o conteúdo não serão enviados para a IA.', 'Attachment removed. The copy and content will not be sent to the AI.'],
  ['Lista arquivos texto anexados ao chat atual.', 'Lists text files attached to the current chat.'],
  ['Edite a cópia salva dentro deste chat. O arquivo original enviado de fora não é alterado.', 'Edit the copy saved inside this chat. The original file sent from outside is not changed.'],
  ['Salvar documento', 'Save document'],
  ['Esta imagem excede o limite informado do modelo', 'This image exceeds the model reported limit'],
  ['Será enviado ao modelo como imagem multimodal', 'Will be sent to the model as a multimodal image'],
  ['Este modelo não está marcado como vision. Troque de modelo ou ative suporte para modelos personalizados.', 'This model is not marked as vision-capable. Switch models or enable support for custom models.'],
  ['Texto extraído será enviado em uma seção de documentos, com truncamento.', 'Extracted text will be sent in a documents section, with truncation.'],
  ['Texto extraído será enviado em uma seção de documentos.', 'Extracted text will be sent in a documents section.'],
  ['Vídeo fica salvo no chat e é enviado como referência/caminho. Gemini pode aceitar vídeo por Files API, mas esse adapter nativo ainda não está implementado no MVP.', 'Video stays saved in the chat and is sent as a reference/path. Gemini may accept video through Files API, but this native adapter is not implemented in the MVP yet.'],
  ['Arquivo salvo no chat. A IA verá caminho e metadados; para ler o conteúdo, pode usar o terminal.', 'File saved in the chat. The AI will see path and metadata; to read content, it can use the terminal.'],
]);

const app = document.querySelector('#app');
const themeMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

themeMediaQuery?.addEventListener?.('change', () => {
  const selectedTheme = state.settingsDraft?.config?.appearance?.theme || state.config?.appearance?.theme;
  if (selectedTheme === 'system') applyTheme('system');
});

bootstrap();

async function bootstrap() {
  try {
    const data = await api('/api/bootstrap');
    applyBootstrapData(data);
    applyTheme(state.config?.appearance?.theme);
    render();
  } catch (error) {
    renderError(error);
  }
}

function applyBootstrapData(data = {}) {
  Object.assign(state, data);
  state.userMemoryFiles = data.userMemoryFiles || state.userMemoryFiles || [];
  state.scheduledTasks = data.scheduledTasks || state.scheduledTasks || [];
  state.profiles = data.profiles || state.profiles || [];
  state.activeProfile = data.activeProfile || state.activeProfile || null;
  state.rootRuntimeHome = data.rootRuntimeHome || state.rootRuntimeHome || '';
  state.serverLocalTimezone = data.serverLocalTimezone || state.serverLocalTimezone || 'UTC';
}

function render() {
  applyTheme(state.settingsDraft?.config?.appearance?.theme || state.config?.appearance?.theme);
  if (!state.config?.setupComplete || state.setupReviewOpen) {
    renderSetup();
    applyPanelLanguage();
    return;
  }
  renderApp();
  applyPanelLanguage();
}

function applyTheme(theme = 'light') {
  const selected = ['light', 'dark', 'system'].includes(theme) ? theme : 'light';
  const resolved = selected === 'system'
    ? window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : selected;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = selected;
}

function getUiLanguage() {
  const draftLanguage =
    state.settingsDraft?.config?.appearance?.uiLanguage ||
    state.setupDraft?.appearance?.uiLanguage ||
    state.config?.appearance?.uiLanguage;
  return normalizeUiLanguage(draftLanguage);
}

function normalizeUiLanguage(language) {
  return SUPPORTED_UI_LANGUAGES.includes(language) ? language : DEFAULT_UI_LANGUAGE;
}

function applyPanelLanguage(root = app) {
  const language = getUiLanguage();
  document.documentElement.lang = language === 'pt-BR' ? 'pt-BR' : 'en';
  if (language !== 'en-US' || !root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      if (shouldSkipTranslationNode(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    node.textContent = translateUiValue(node.textContent);
  });

  root.querySelectorAll('[placeholder], [title], [aria-label], [alt]').forEach((element) => {
    for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, translateUiValue(value));
    }
  });
}

function shouldSkipTranslationNode(element) {
  return Boolean(
    element?.closest?.(
      'pre, code, textarea, .message:not(.pending) .bubble, .viewer-text, .diff-viewer, .event-list, .message-source-card',
    ),
  );
}

function translateUiValue(value) {
  const raw = String(value || '');
  const leading = raw.match(/^\s*/)?.[0] || '';
  const trailing = raw.match(/\s*$/)?.[0] || '';
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized) return raw;
  const translated = EN_TEXT.get(normalized) || translateDynamicUiValue(normalized);
  return translated ? `${leading}${translated}${trailing}` : raw;
}

function translateDynamicUiValue(value) {
  const replacements = [
    [/^Defina uma senha para abrir o painel na rede local\.$/, 'Set a password before opening the panel to the local network.'],
    [/^Defina o endpoint\/base URL de (.+)\.$/, (_match, provider) => `Set the endpoint/base URL for ${provider}.`],
    [/^Adicione ao menos uma API key de (.+)\.$/, (_match, provider) => `Add at least one API key for ${provider}.`],
    [/^Defina o endpoint\/base URL de (.+) antes de salvar esse provider como padrão\.$/, (_match, provider) => `Set the endpoint/base URL for ${provider} before saving it as the default provider.`],
    [/^Adicione ao menos uma API key de (.+) antes de salvar esse provider como padrão\.$/, (_match, provider) => `Add at least one API key for ${provider} before saving it as the default provider.`],
    [/^Criando primeiro chat\.\.\.$/, 'Creating first chat...'],
    [/^Criando chat para anexos\.\.\.$/, 'Creating chat for attachments...'],
    [/^Criando chat\.\.\.$/, 'Creating chat...'],
    [/^Salvando configurações gerais\.\.\.$/, 'Saving general settings...'],
    [/^Salvando configuração\.\.\.$/, 'Saving configuration...'],
    [/^Abrindo painel\.\.\.$/, 'Opening panel...'],
    [/^Verificando Ollama\.\.\.$/, 'Checking Ollama...'],
    [/^Instalando Ollama\.\.\.$/, 'Installing Ollama...'],
    [/^Desinstalando Ollama\.\.\.$/, 'Uninstalling Ollama...'],
    [/^Trocando seção\.\.\.$/, 'Switching section...'],
    [/^Criando seção\.\.\.$/, 'Creating section...'],
    [/^Renomeando seção\.\.\.$/, 'Renaming section...'],
    [/^Apagando seção\.\.\.$/, 'Deleting section...'],
    [/^Removendo arquivo de memória\.\.\.$/, 'Removing memory file...'],
    [/^Removendo anexo\.\.\.$/, 'Removing attachment...'],
    [/^Carregando arquivo de memória\.\.\.$/, 'Loading memory file...'],
    [/^Salvando arquivo de memória\.\.\.$/, 'Saving memory file...'],
    [/^Salvando documento\.\.\.$/, 'Saving document...'],
    [/^Criando chat\.\.\.$/, 'Creating chat...'],
    [/^Abrindo chat\.\.\.$/, 'Opening chat...'],
    [/^Atualizando chat\.\.\.$/, 'Updating chat...'],
    [/^Apagando chat\.\.\.$/, 'Deleting chat...'],
    [/^Salvando memória\.\.\.$/, 'Saving memory...'],
    [/^Salvando prompt e memória\.\.\.$/, 'Saving prompt and memory...'],
    [/^Salvando parâmetros do modelo\.\.\.$/, 'Saving model parameters...'],
    [/^Salvando configurações do chat\.\.\.$/, 'Saving chat settings...'],
    [/^Exportando dados\.\.\.$/, 'Exporting data...'],
    [/^Verificando atualização\.\.\.$/, 'Checking update...'],
    [/^Resposta recebida\.$/, 'Response received.'],
    [/^Mensagem copiada\.$/, 'Message copied.'],
    [/^Eventos copiados\.$/, 'Events copied.'],
    [/^Eventos relacionados copiados\.$/, 'Related events copied.'],
    [/^Diff da edição de documento não encontrado\.$/, 'Document edit diff not found.'],
    [/^Falha ao carregar documento\.$/, 'Failed to load document.'],
    [/^Exclusão de todos os chats cancelada\.$/, 'Delete all chats canceled.'],
    [/^A IA pediu aprovação de tool\.$/, 'The AI requested tool approval.'],
    [/^A IA falhou antes de concluir\. Use Tentar novamente ou Continuar\.$/, 'The AI failed before finishing. Use Try again or Continue.'],
    [/^A IA parou antes do final\. Use Continuar para retomar\.$/, 'The AI stopped before the end. Use Continue to resume.'],
    [/^Interrompendo agente\.\.\.$/, 'Stopping agent...'],
    [/^Execução interrompida\.$/, 'Execution stopped.'],
    [/^Interrupção solicitada\. Salvando tentativa interrompida\.\.\.$/, 'Stop requested. Saving interrupted attempt...'],
    [/^Nenhuma execução em andamento\.$/, 'No execution is running.'],
    [/^A tool aprovada falhou antes de concluir\.$/, 'The approved tool failed before finishing.'],
    [/^A tool aprovada parou antes do final\. Use Continuar\.$/, 'The approved tool stopped before the end. Use Continue.'],
    [/^A tool aprovada foi concluída\.$/, 'The approved tool completed.'],
    [/^A tool ainda está em execução\.$/, 'The tool is still running.'],
    [/^My Computer está encerrando\. Para iniciar novamente, rode \.\/install\.sh\.$/, 'My Computer is shutting down. To start again, run ./install.sh.'],
    [/^Seção ativa: (.+)$/, (_match, section) => `Active section: ${section}`],
    [/^Seção criada: (.+)$/, (_match, section) => `Section created: ${section}`],
    [/^Arquivo "(.+)" salvo\.$/, (_match, file) => `File "${file}" saved.`],
    [/^Documento "(.+)" salvo\.$/, (_match, file) => `Document "${file}" saved.`],
    [/^Anexo "(.+)" removido\.$/, (_match, file) => `Attachment "${file}" removed.`],
    [/^Documento atualizado: (.+)$/, (_match, file) => `Document updated: ${file}`],
    [/^(.+) · ([^·]+) · ([^·]+) · cópia salva no My Computer$/, (_match, size, mimeType, kind) => `${size} · ${mimeType.trim()} · ${uiText(kind.trim())} · copy saved in My Computer`],
    [/^(\d+) chat\(s\) excluído\(s\)\.$/, (_match, count) => `${count} chat(s) deleted.`],
    [/^Snapshot salvo em (.+)$/, (_match, filePath) => `Snapshot saved at ${filePath}`],
    [/^Enviando para (.+)\.\.\.$/, (_match, provider) => `Sending to ${provider}...`],
    [/^Baixando (.+) no Ollama\.\.\.$/, (_match, model) => `Pulling ${model} in Ollama...`],
    [/^Adicionando (.+) à memória\.\.\.$/, (_match, file) => `Adding ${file} to memory...`],
    [/^Formato ainda não compatível: (.+)\. Envie imagens, vídeo, áudio, PDF, texto, código, JSON, CSV, HTML, XML, YAML ou Markdown\.$/, (_match, file) => `Unsupported format for now: ${file}. Send images, video, audio, PDF, text, code, JSON, CSV, HTML, XML, YAML, or Markdown.`],
    [/^O modelo atual não aceita imagens: (.+)\. Troque para um modelo vision ou marque o modelo personalizado como compatível\.$/, (_match, file) => `The current model does not accept images: ${file}. Switch to a vision model or mark the custom model as compatible.`],
    [/^O modelo atual aceita até (.+) imagem\(ns\) por mensagem\.$/, (_match, count) => `The current model accepts up to ${count} image(s) per message.`],
    [/^(.+) excede o limite de (.+) MB deste modelo\.$/, (_match, file, mb) => `${file} exceeds this model's ${mb} MB limit.`],
    [/^Remover o modelo Ollama "(.+)" da máquina\?$/, (_match, model) => `Remove Ollama model "${model}" from this machine?`],
    [/^Apagar a seção "(.+)" e todos os seus chats, configurações e memórias\?$/, (_match, section) => `Delete section "${section}" and all its chats, settings, and memories?`],
    [/^Remover "(.+)" dos arquivos de memória persistente\?$/, (_match, file) => `Remove "${file}" from persistent memory files?`],
    [/^Descartar alterações não salvas neste documento\?$/, 'Discard unsaved changes in this document?'],
    [/^Descartar alterações não salvas neste chat\?$/, 'Discard unsaved changes in this chat?'],
    [/^Descartar alterações não salvas nos parâmetros do modelo\?$/, 'Discard unsaved model parameter changes?'],
    [/^Apagar o chat "(.+)"\?$/, (_match, title) => `Delete chat "${displayChatTitle(title)}"?`],
    [/^Excluir todos os (\d+) chat\(s\) desta seção\? Isso apaga mensagens, anexos, memória e contexto dos chats\. Faça um backup antes se quiser preservar algo\.$/, (_match, count) => `Delete all ${count} chat(s) in this section? This deletes chat messages, attachments, memory, and context. Make a backup first if you want to preserve anything.`],
    [/^(\d+) saída\(s\) · (\d+) tool\(s\)$/, (_match, outputs, tools) => `${outputs} output(s) · ${tools} tool(s)`],
    [/^(\d+) tool\(s\) · (\d+) saída\(s\) da IA$/, (_match, tools, outputs) => `${tools} tool(s) · ${outputs} AI output(s)`],
    [/^Trecho (\d+)-(\d+) de (\d+) caractere\(s\)\. Resultado truncado; a IA deve continuar com offset (\d+)\.$/, (_match, start, end, total, offset) => `Chunk ${start}-${end} of ${total} character(s). Result truncated; the AI should continue with offset ${offset}.`],
    [/^Trecho (\d+)-(\d+) de (\d+) caractere\(s\)\. Arquivo lido até o fim\.$/, (_match, start, end, total) => `Chunk ${start}-${end} of ${total} character(s). File read to the end.`],
    [/^Trecho a partir de (\d+)\. Resultado truncado; a IA deve continuar com offset (\d+)\.$/, (_match, start, offset) => `Chunk starting at ${start}. Result truncated; the AI should continue with offset ${offset}.`],
    [/^Trecho a partir de (\d+)\. Arquivo lido até o fim\.$/, (_match, start) => `Chunk starting at ${start}. File read to the end.`],
    [/^Esta imagem excede o limite informado do modelo \((.+) MB\)\.$/, (_match, mb) => `This image exceeds the model reported limit (${mb} MB).`],
    [/^Será enviado ao modelo como imagem multimodal(?: \((.+)\))?\.$/, (_match, limits) => `Will be sent to the model as a multimodal image${limits ? ` (${uiText(limits)})` : ''}.`],
    [/^até (.+) imagem\(ns\)$/, (_match, count) => `up to ${count} image(s)`],
    [/^Branch: (.+) · Upstream: (.+)$/, (_match, branch, upstream) => `Branch: ${branch} · Upstream: ${upstream}`],
    [/^Atrás: (.+) · À frente: (.+) · Local sujo: (sim|não)$/, (_match, behind, ahead, dirty) => `Behind: ${behind} · Ahead: ${ahead} · Dirty local: ${dirty === 'sim' ? 'yes' : 'no'}`],
    [/^Remote: não configurado$/, 'Remote: not configured'],
  ];
  for (const [pattern, replacement] of replacements) {
    const match = value.match(pattern);
    if (!match) continue;
    return typeof replacement === 'function' ? replacement(...match) : replacement;
  }
  return '';
}

function uiText(value) {
  const text = String(value || '');
  return getUiLanguage() === 'en-US' ? translateUiValue(text) : text;
}

function displayChatTitle(title = '') {
  const clean = String(title || '').trim();
  if (!isGenericChatTitle(clean)) return clean;
  return getUiLanguage() === 'pt-BR' ? 'Novo chat' : 'New chat';
}

function isGenericChatTitle(title = '') {
  return ['Novo chat', 'New chat'].includes(String(title || '').trim());
}

function confirmUi(message) {
  return window.confirm(uiText(message));
}

function promptUi(message, defaultValue = '') {
  return window.prompt(uiText(message), isGenericChatTitle(defaultValue) ? displayChatTitle(defaultValue) : defaultValue);
}

function displayModelKind(kind = '') {
  const text = String(kind || '');
  if (getUiLanguage() !== 'en-US') return text;
  return {
    Produção: 'Production',
    Raciocínio: 'Reasoning',
    Imagem: 'Image',
    Padrão: 'Default',
  }[text] || text;
}

function renderSetup() {
  const setupConfig = state.setupDraft || state.config || {};
  const setupOffline = isOfflineMode(setupConfig);
  const providerId = setupOffline ? 'ollama' : setupConfig.provider || 'groq';
  const provider = getProvider(providerId);
  const model = setupOffline && setupConfig.provider !== 'ollama' ? provider.defaultModel : setupConfig.model || provider.defaultModel;
  const providerSettings = setupConfig.providerSettings?.[providerId] || {};
  const setupApiKeys = providerSettings.apiKeys?.length ? providerSettings.apiKeys : [{ id: 'setup-empty', value: '' }];
  const showCustomModel = !isKnownModel(providerId, model);
  const showBaseUrl = provider.id === 'openai-compatible' || provider.id === 'ollama';
  const modelCanSeeImages = modelSupportsImages(providerId, model);
  const setupUserMemoryReadEnabled = setupConfig.tools?.userMemory !== false;
  const setupUserMemoryEditEnabled = setupUserMemoryReadEnabled && setupConfig.tools?.userMemoryEdit === true;
  const setupUserMemoryReminderEnabled = setupUserMemoryEditEnabled && setupConfig.userMemory?.remindModelToUpdateFiles === true;
  if (!state.setupWizardStarted) {
    app.innerHTML = `
      <main class="setup-screen">
        <section class="setup-panel setup-choice-panel">
          <div>
            <h1>${state.setupReviewOpen ? 'Tour inicial' : 'My Computer'}</h1>
            <p>${state.setupReviewOpen ? 'Revise as escolhas iniciais sem apagar chats, logs, anexos ou memórias.' : 'Um painel local para conversar com uma IA, usar tools do seu computador com controle e manter contexto entre chats.'}</p>
          </div>
          <div class="setup-choice-grid">
            <button type="button" class="setup-choice primary" id="start-guided-setup" ${state.busy ? 'disabled' : ''}>
              <strong>${state.setupReviewOpen ? 'Refazer tour' : 'Configurar agora'}</strong>
              <span>Escolher provider, API key, tema, nível técnico, busca, tools e rede.</span>
            </button>
            <button type="button" class="setup-choice" id="skip-guided-setup" ${state.busy ? 'disabled' : ''}>
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
    applyPanelLanguage();
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
              <label class="toggle-row switch-row">
                <input type="checkbox" name="offlineMode" id="setup-offline-mode" ${setupOffline ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Modo offline desta seção</strong>
                  <small>Força Ollama local, bloqueia providers online, desliga busca nativa e remove rotatórias para serviços externos.</small>
                </span>
              </label>
              <div class="setup-grid">
            <label>
              Provider
              <select name="provider" id="setup-provider">
                ${renderProviderOptions(providerId, { offlineOnly: setupOffline })}
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
          <label>
            Tema do painel
            <select name="theme">
              ${renderThemeOptions(setupConfig.appearance?.theme || 'light')}
            </select>
          </label>
          <label>
            Idioma da interface
            <select name="uiLanguage">
              ${renderUiLanguageOptions(setupConfig.appearance?.uiLanguage || DEFAULT_UI_LANGUAGE)}
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
            <p class="help-text">${setupOffline ? 'Modo offline: busca nativa fica indisponível. Se habilitar pesquisa, use apenas busca via terminal com consulta neutra, sem dados privados.' : 'Busca nativa não executa comando local. Terminal e tools locais continuam sob aprovação quando “sempre permitir” estiver desligado.'}</p>
            <label class="toggle-row switch-row">
              <input type="checkbox" name="alwaysAllowTools" ${setupConfig.tools?.alwaysAllow ? 'checked' : ''} />
              <span class="switch" aria-hidden="true"></span>
              <span>
                <strong>Sempre permitir qualquer tool</strong>
                <small>Desligado por padrão. Quando desligado, a IA precisa da sua aprovação na UI antes de executar tools.</small>
              </span>
            </label>
            <label class="toggle-row switch-row">
              <input type="checkbox" name="deepInvestigation" ${setupConfig.tools?.deepInvestigation ? 'checked' : ''} />
              <span class="switch" aria-hidden="true"></span>
              <span>
                <strong>Incentivar a IA a fazer investigações mais profundas</strong>
                <small>Adiciona instruções para inspecionar arquivos, scripts, logs e outputs por mais rodadas antes da resposta final.</small>
              </span>
            </label>
            <div class="settings-subpanel">
              <h2>Memória persistente</h2>
              <p class="help-text">Você pode adicionar arquivos Markdown/texto depois. O índice sempre ajuda a IA a saber que os arquivos existem; leitura e edição são permissões separadas.</p>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="userMemoryReadTool" id="setup-user-memory-read-tool" ${setupUserMemoryReadEnabled ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Permitir que a IA liste e leia arquivos adicionais</strong>
                  <small>Habilita <code>persistent_memory_user</code>. Sem isso, ela não abre arquivos por conta própria; usa só o que foi enviado ao prompt.</small>
                </span>
              </label>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="userMemorySendFilesToPrompt" ${setupConfig.userMemory?.sendFilesToPrompt ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Enviar arquivos adicionados a todo prompt</strong>
                  <small>Útil para poucos arquivos curtos. Desligado economiza contexto; se a leitura acima estiver ligada, a IA abre só o que precisar.</small>
                </span>
              </label>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="userMemoryEditTool" id="setup-user-memory-edit-tool" ${setupUserMemoryEditEnabled ? 'checked' : ''} ${setupUserMemoryReadEnabled ? '' : 'disabled'} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Permitir edição de arquivos de memória</strong>
                  <small>Habilita <code>edit_persistent_memory_user</code>. A IA propõe substituições em arquivos texto; você aprova ou nega antes de aplicar.</small>
                </span>
              </label>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="userMemoryUpdateReminder" ${setupUserMemoryReminderEnabled ? 'checked' : ''} ${setupUserMemoryEditEnabled ? '' : 'disabled'} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Lembrar a IA de manter esses arquivos atualizados</strong>
                  <small>Só funciona com edição ligada. Reforça no prompt que decisões duráveis devem ser gravadas nos arquivos editáveis.</small>
                </span>
              </label>
              ${!setupUserMemoryReadEnabled ? '<p class="help-text">Leitura/listagem desligada: edição fica indisponível porque a IA não consegue localizar nem conferir o trecho atual dos arquivos.</p>' : ''}
            </div>
            <div class="settings-subpanel">
              <h2>Pesquisa web</h2>
            <p class="help-text">Busca nativa usa o provider e não pede confirmação. No modo Ambos, o app cai no terminal se a busca nativa falhar ou vier vazia. Busca via terminal usa a máquina local.</p>
              ${renderSearchModeControl(getSearchMode(setupConfig.tools), { setup: true, offlineMode: setupOffline })}
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
            ${step !== 'provider' ? `<button type="button" id="setup-back" ${state.busy ? 'disabled' : ''}>Voltar</button>` : ''}
            <button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${step === 'network' ? (state.setupReviewOpen ? 'Salvar e voltar ao painel' : 'Salvar e abrir chat') : 'Continuar'}</button>
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
  document.querySelector('#setup-offline-mode')?.addEventListener('change', (event) => {
    syncSetupApiDraft();
    if (!state.setupDraft) state.setupDraft = buildSetupDraft();
    state.setupDraft.privacy = {
      ...(state.setupDraft.privacy || {}),
      offlineMode: event.target.checked,
    };
    if (event.target.checked) {
      state.setupDraft.provider = 'ollama';
      state.setupDraft.model = getProvider('ollama').defaultModel;
      state.setupDraft.tools = normalizeOfflineToolsForClient(state.setupDraft.tools || {});
      state.setupDraft.routing = normalizeOfflineRoutingForClient();
    }
    renderSetup();
  });
  document.querySelector('[name="uiLanguage"]')?.addEventListener('change', (event) => {
    captureSetupDraftFromForm(document.querySelector('#setup-form'));
    if (!state.setupDraft) state.setupDraft = buildSetupDraft();
    state.setupDraft.appearance = {
      ...(state.setupDraft.appearance || {}),
      uiLanguage: normalizeUiLanguage(event.target.value),
    };
    renderSetup();
  });
  document.querySelector('#setup-model')?.addEventListener('change', toggleSetupCustomModel);
  document.querySelector('#setup-technical-guidance')?.addEventListener('change', () => toggleTechnicalLevelField('setup'));
  document.querySelector('#setup-network-enabled')?.addEventListener('change', () => toggleNetworkPasswordField('setup'));
  document.querySelector('#setup-search-enabled')?.addEventListener('change', () => toggleSearchModeField('setup'));
  document.querySelector('#setup-user-memory-read-tool')?.addEventListener('change', () => {
    captureSetupDraftFromForm();
    renderSetup();
  });
  document.querySelector('#setup-user-memory-edit-tool')?.addEventListener('change', () => {
    captureSetupDraftFromForm();
    renderSetup();
  });
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
  applyPanelLanguage();
}

function renderApp() {
  const chat = getActiveChatView();
  const offlineMode = isOfflineMode(state.config);
  const { provider: chatProviderId, model: chatModel } = getEffectiveChatRuntime(chat);
  const toolApprovalBlocksComposer = chatHasActiveToolApproval(chat);
  const agentRunning = Boolean(chat?.id && state.busy && state.activeAgentChatId === chat.id);
  const composerDisabled = state.busy || toolApprovalBlocksComposer;
  const composerActionDisabled = toolApprovalBlocksComposer || (state.busy && !agentRunning) || state.stopInFlight;
  const composerPlaceholder = toolApprovalBlocksComposer
    ? 'Aprove ou negue a tool pendente antes de enviar outra mensagem.'
    : chat
      ? 'Digite uma mensagem...'
      : 'Digite para criar o primeiro chat...';
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>My Computer</h1>
          <span>${escapeHtml(providerLabel(state.config.provider))} · ${escapeHtml(state.config.model || '')}</span>
        </div>
        <div class="profile-switcher">
          <label>
            Seção
            <select id="active-profile-select" ${state.busy ? 'disabled' : ''}>
              ${renderProfileOptions()}
            </select>
          </label>
          <button type="button" class="icon-button small-icon" id="quick-create-profile" title="Criar seção" aria-label="Criar seção">+</button>
        </div>
        <div class="sidebar-actions">
          <button class="primary" id="new-chat">Novo chat</button>
          <button id="open-settings">Configurações gerais</button>
        </div>
        <label class="chat-search">
          <span>Buscar chats</span>
          <input id="chat-search-input" value="${escapeAttr(state.chatSearch)}" placeholder="Filtrar por nome, provider ou modelo..." />
        </label>
        <div class="chat-list">
          ${renderChatList()}
        </div>
        <div class="runtime">${escapeHtml(state.runtimeHome)}</div>
      </aside>

      <main class="chat-main">
        <header class="chat-header">
          <div>
            <h2 class="chat-title">${escapeHtml(displayChatTitle(chat?.title || 'Chat'))}</h2>
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
          ${chat?.messages?.length ? getVisibleChatMessages(chat).map(renderMessage).join('') : '<p class="empty">Comece uma conversa.</p>'}
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
              <input id="file-input" type="file" multiple accept="${escapeAttr(getSupportedUploadAccept())}" ${composerDisabled ? 'disabled' : ''} />
            </label>
            <textarea name="content" placeholder="${escapeAttr(composerPlaceholder)}" ${composerDisabled ? 'disabled' : ''}>${escapeHtml(getComposerDraft(chat?.id))}</textarea>
            <button class="primary icon-button ${agentRunning ? 'danger-button' : ''}" id="${agentRunning ? 'stop-agent' : 'send-message'}" type="${agentRunning ? 'button' : 'submit'}" aria-label="${agentRunning ? 'Parar agente' : 'Enviar'}" title="${agentRunning ? 'Parar agente' : 'Enviar'}" ${composerActionDisabled ? 'disabled' : ''}>
              <span aria-hidden="true">${agentRunning ? '■' : '↑'}</span>
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
              <input id="chat-title-input" value="${escapeAttr(displayChatTitle(chat?.title || ''))}" ${!chat ? 'disabled' : ''} />
            </label>
            <label>
              Provider deste chat
              <select id="chat-provider-input" ${!chat ? 'disabled' : ''}>
                ${renderProviderOptions(chatProviderId, { offlineOnly: offlineMode })}
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
          <div class="section-heading">
            <h2>Eventos</h2>
            <button type="button" id="copy-events" class="event-copy-button" ${!state.activeChatEvents.length ? 'disabled' : ''}>Copiar eventos</button>
          </div>
          <div class="event-list">${state.activeChatEvents.map(renderEvent).join('')}</div>
        </section>
      </aside>
    </div>
    ${state.settingsOpen ? renderSettingsModal() : ''}
    ${state.chatSettingsOpen ? renderChatSettingsModal() : ''}
    ${state.chatContextOpen ? renderChatContextModal() : ''}
    ${state.contextEditorOpen ? renderContextEditorModal() : ''}
    ${state.modelSettingsOpen ? renderModelSettingsModal() : ''}
    ${state.messageDetailsOpen ? renderMessageDetailsModal() : ''}
    ${state.attachmentViewer ? renderAttachmentViewerModal() : ''}
    ${state.attachmentDiff ? renderAttachmentDiffModal() : ''}
    ${state.userMemoryDiff ? renderUserMemoryDiffModal() : ''}
    ${state.userMemoryViewer ? renderUserMemoryViewerModal() : ''}
    ${state.importModalOpen ? renderImportModal() : ''}
    ${state.confirmDialog ? renderConfirmDialog() : ''}
  `;

  bindAppEvents();
}

function renderSettingsModal() {
  const draftConfig = state.settingsDraft?.config || state.config;
  const draftMemory = state.settingsDraft?.persistentMemory ?? state.persistentMemory;
  const offlineMode = isOfflineMode(draftConfig);
  const defaultProvider = offlineMode ? 'ollama' : draftConfig.provider || 'groq';
  const defaultModel = offlineMode && draftConfig.provider !== 'ollama' ? getProvider('ollama').defaultModel : draftConfig.model || getProvider(defaultProvider).defaultModel;
  const apiProvider = offlineMode ? 'ollama' : state.settingsProvider || defaultProvider;
  const apiProviderInfo = getProvider(apiProvider);
  const apiSettings = draftConfig.providerSettings?.[apiProvider] || {};
  const apiKeys = apiSettings.apiKeys?.length ? apiSettings.apiKeys : [];
  const ollamaModelForSettings = defaultProvider === 'ollama' ? defaultModel : getProvider('ollama').defaultModel;
  const activeSection = state.settingsSection || 'identity';
  const dirtyText = state.settingsDirty ? '<span class="dirty-note">Alterações não salvas</span>' : '';
  const userMemoryReadEnabled = draftConfig.tools?.userMemory !== false;
  const userMemoryEditEnabled = userMemoryReadEnabled && draftConfig.tools?.userMemoryEdit === true;
  const userMemoryReminderEnabled = userMemoryEditEnabled && draftConfig.userMemory?.remindModelToUpdateFiles === true;
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
            <section class="modal-section settings-panel ${activeSection === 'profiles' ? 'active' : ''}" data-section="profiles">
              <h3>Seções e usuários</h3>
              <p class="help-text">Cada seção usa chats, configurações, memória persistente, arquivos de memória e eventos isolados. A seção Default preserva o runtime antigo.</p>
              <div class="profile-list">
                ${renderProfileRows()}
              </div>
              <div class="button-row">
                <button type="button" id="create-profile">Criar seção</button>
              </div>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'identity' ? 'active' : ''}" data-section="identity">
              <h3>Identidade e padrão</h3>
              <p class="help-text">Essas escolhas viram padrão para chats novos; cada chat ainda pode ter provider/modelo próprios.</p>
              <label class="toggle-row switch-row">
                <input type="checkbox" name="offlineMode" id="settings-offline-mode" ${offlineMode ? 'checked' : ''} />
                <span class="switch" aria-hidden="true"></span>
                <span>
                  <strong>Modo offline desta seção</strong>
                  <small>Força provider/modelo local via Ollama, bloqueia providers online, desliga busca nativa e impede rotatórias externas.</small>
                </span>
              </label>
              <div class="setup-grid">
                <label>
                  Apelido
                  <input name="userNickname" value="${escapeAttr(draftConfig.userNickname || '')}" placeholder="Como a IA deve chamar você" />
                </label>
                <label>
                  Provider padrão
                  <select name="provider" id="default-provider-input">
                    ${renderProviderOptions(defaultProvider, { offlineOnly: offlineMode })}
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
              <label>
                Tema do painel
                <select name="theme">
                  ${renderThemeOptions(draftConfig.appearance?.theme || 'light')}
                </select>
              </label>
              <label>
                Idioma da interface
                <select name="uiLanguage">
                  ${renderUiLanguageOptions(draftConfig.appearance?.uiLanguage || DEFAULT_UI_LANGUAGE)}
                </select>
              </label>
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
                    ${renderProviderOptions(apiProvider, { offlineOnly: offlineMode })}
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
              ${offlineMode ? '<div class="notice-card"><strong>Modo offline ativo</strong><p>Rotatórias de modelo/provider ficam desligadas nesta seção para evitar fallback em serviços online.</p></div>' : `
              <div class="settings-subpanel">
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="modelRotationEnabled" ${draftConfig.routing?.modelRotationEnabled ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Rotatória de modelos</strong>
                    <small>Antes de trocar API key, tenta outros modelos do mesmo provider. Útil quando um modelo específico cai em rate limit ou falha no meio das tools.</small>
                  </span>
                </label>
                <div class="routing-list">
                  ${renderModelFallbackRows(draftConfig.routing?.modelFallbacks || [], apiProvider)}
                </div>
                <button type="button" id="add-model-fallback">Adicionar modelo alternativo</button>
              </div>
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
              `}
              ${
                apiProviderInfo.id === 'openai-compatible'
                  ? '<p class="help-text">Use este provider para Minimax, Together, Fireworks, servidores próprios ou qualquer API que aceite o formato /v1/chat/completions.</p>'
                  : ''
              }
            </section>

            <section class="modal-section settings-panel ${activeSection === 'modelIndex' ? 'active' : ''}" data-section="modelIndex">
              <h3>Índice de modelos</h3>
              <p class="help-text">Revisado para o fim de maio de 2026. Modelos marcados como índice são informativos ou dependem de outra API, enquanto os selecionáveis entram nas rotatórias e no seletor do chat.</p>
              <div class="model-index-list">
                ${renderModelIndex(draftConfig)}
              </div>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'memory' ? 'active' : ''}" data-section="memory">
              <h3>Memória persistente</h3>
              <p class="help-text">O Markdown global entra no prompt de todos os chats desta seção. Arquivos adicionais podem entrar completos ou apenas como índice para leitura por tool.</p>
              <textarea name="persistentMemory" class="memory-editor persistent-memory-editor">${escapeHtml(draftMemory || '')}</textarea>
              <div class="settings-subpanel">
                <h4>Arquivos adicionais</h4>
                <p class="help-text">Esses arquivos são memória persistente adicionada por você. O app pode só mostrar o índice no prompt, ou enviar o conteúdo completo quando você ligar essa opção.</p>
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="tool_userMemory" id="memory-user-read-toggle" ${userMemoryReadEnabled ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Permitir que a IA liste e leia arquivos adicionais</strong>
                    <small>Habilita a tool <code>persistent_memory_user</code>. Sem isso, a IA só usa o que já foi injetado no prompt e não consegue abrir arquivos por conta própria.</small>
                  </span>
                </label>
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="userMemorySendFilesToPrompt" ${draftConfig.userMemory?.sendFilesToPrompt ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Enviar os arquivos adicionados por você a todo prompt</strong>
                    <small>Quando desligado, a IA recebe só o índice. Se a leitura acima estiver ligada, ela usa <code>persistent_memory_user</code> para abrir apenas o que precisar.</small>
                  </span>
                </label>
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="tool_userMemoryEdit" id="memory-user-edit-toggle" ${userMemoryEditEnabled ? 'checked' : ''} ${userMemoryReadEnabled ? '' : 'disabled'} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Permitir que a IA edite arquivos adicionais</strong>
                    <small>Habilita a tool <code>edit_persistent_memory_user</code>. Ela substitui um trecho exato em arquivos de texto/Markdown e pede aprovação quando tools automáticas estão desligadas.</small>
                  </span>
                </label>
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="userMemoryUpdateReminder" ${userMemoryReminderEnabled ? 'checked' : ''} ${userMemoryEditEnabled ? '' : 'disabled'} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Lembrar a IA de manter seus arquivos de memória atualizados</strong>
                    <small>Só funciona quando a edição está ligada. Injeta uma instrução para atualizar arquivos editáveis conforme os chats avançam.</small>
                  </span>
                </label>
                ${!userMemoryReadEnabled ? '<p class="help-text">Leitura/listagem desligada: edição também fica indisponível, porque a IA não tem como localizar arquivos nem confirmar trechos atuais.</p>' : ''}
              </div>
              <div class="settings-subpanel">
                <h4>As 4 camadas de memória, em ordem do que entra sempre completo</h4>
                <div class="explain-list">
                  <p><strong>Memória persistente global</strong> (este editor acima): texto completo, sempre, em todos os chats desta seção/perfil.</p>
                  <p><strong>Memória de arquivos do usuário</strong> (lista abaixo): por padrão só o índice (nome/resumo) entra no prompt; conteúdo completo entra sempre se "Enviar os arquivos a todo prompt" estiver ligado, ou só quando a IA pede via tool <code>persistent_memory_user</code> (inclui a ação <code>search</code>, que busca um trecho sem precisar ler o arquivo inteiro).</p>
                  <p><strong>Memória do chat</strong> (memory.md de cada chat): texto completo, sempre, só naquele chat — editável pela IA via <code>memory_chat</code> se a tool estiver ligada na seção Tools.</p>
                  <p><strong>Contexto compactado</strong> (context.md de cada chat): texto completo quando existir, gerado por compactação manual ou automática (seção Contexto) — resume histórico antigo que já saiu do orçamento de mensagens enviado.</p>
                </div>
              </div>
              <div class="settings-subpanel">
                <div class="button-row">
                  <label class="file-button">
                    Adicionar arquivos
                    <input type="file" id="user-memory-file-input" multiple accept="${escapeAttr(getUserMemoryAccept())}" ${state.busy ? 'disabled' : ''} />
                  </label>
                </div>
                <div class="user-memory-file-list">
                  ${renderUserMemoryFileRows()}
                </div>
              </div>
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
              <p class="help-text">${offlineMode ? 'Modo offline: busca nativa e modo Ambos ficam indisponíveis. Se habilitar pesquisa, use terminal com consulta neutra e sem dados privados.' : 'Busca nativa roda no servidor do provider e não pede confirmação. No modo Ambos, o app cai no terminal se a busca nativa falhar ou vier vazia. Busca via terminal usa a tool local e segue permissão.'}</p>
                ${renderSearchModeControl(getSearchMode(draftConfig.tools), { offlineMode })}
              </div>
              <div class="toggle-list">
                ${renderToolToggle('terminal', 'Terminal local', 'Permite que a IA execute comandos no terminal por run_terminal_command.')}
                ${renderToolToggle('deepInvestigation', 'Incentivar a IA a fazer investigações mais profundas', 'Quando ligado, injeta instruções para usar mais rodadas de tools, seguir referências e olhar outputs antes da resposta final.')}
                ${renderToolToggle('chatMemory', 'Memória do chat', 'Permite que a IA edite o memory.md do chat atual por memory_chat.')}
                ${renderToolToggle('persistentMemory', 'Memória persistente', 'Permite que a IA edite a memória global por persistent_memory.')}
                ${renderToolToggle('chatDocuments', 'Documentos anexados ao chat', 'Permite que a IA liste, leia e edite anexos de texto do chat por chat_document. Edições alteram apenas a cópia salva no My Computer.')}
                ${renderToolToggle('autoCompact', 'Tool de compactar contexto', 'Permite que a IA chame compact_context quando o contexto estiver grande ou precisar preservar decisões.')}
                ${renderToolToggle('chatTitle', 'Título do chat', 'Permite que a IA renomeie o chat com rename_chat, normalmente depois da primeira mensagem.')}
              </div>
              <div class="settings-subpanel">
                <h4>Nível de isolamento</h4>
                <div class="choice-grid">
                  ${renderTerminalModeCards(draftConfig.tools?.terminalMode || 'standard')}
                </div>
              </div>
              <div class="settings-subpanel">
                <h4>Sudo no My Computer</h4>
                <p class="help-text">O app executa comandos como seu usuário. Para permitir sudo sem digitar senha no navegador, configure uma regra NOPASSWD limitada aos comandos que você aceita delegar.</p>
                <pre>${escapeHtml([
                  '# Exemplo seguro: crie um arquivo dedicado com sudo visudo -f /etc/sudoers.d/my-computer',
                  '# Troque elias pelo seu usuário e limite os binários ao que faz sentido no seu caso.',
                  'elias ALL=(root) NOPASSWD: /usr/bin/systemctl status *, /usr/bin/journalctl *, /usr/bin/apt-get update',
                  '',
                  '# Evite liberar ALL sem senha. O app mostrará stdout/stderr no histórico da execução.',
                ].join('\n'))}</pre>
              </div>
              <p class="help-text">O método isolado é uma contenção leve por diretório e HOME, não uma VM/container. Comandos ainda podem acessar caminhos absolutos se forem instruídos a isso.</p>
              <div class="settings-subpanel">
                <h4>Como o app decide o que a IA pode usar</h4>
                <div class="explain-list">
                  <p><strong>Duas camadas, sempre sincronizadas:</strong> a função (definição que o provider recebe e pode chamar de fato) e o texto narrativo do prompt (instruções em linguagem natural dizendo quando/como usar cada tool). Cada toggle aqui liga/desliga as duas ao mesmo tempo — uma tool nunca fica só "narrada" sem existir de verdade (isso já causou alucinação de uso de tool em tarefas agendadas com allowlist restrita, corrigido mascarando o texto narrativo também).</p>
                  <p><strong>"Sempre permitir qualquer tool":</strong> pula a aprovação manual de toda tool, incluindo o terminal — não é por tool, é global. Com isso desligado, cada chamada de tool aparece para você aprovar ou negar antes de executar (exceto em tarefas agendadas, que usam a allowlist própria da tarefa em vez de aprovação humana, já que ninguém fica presente).</p>
                  <p><strong>Busca web "Ambos":</strong> tenta a busca nativa do provider primeiro; se falhar ou vier vazia, cai automaticamente para a busca via terminal (DuckDuckGo), sem você precisar perceber a troca — o resultado final indica qual método foi usado.</p>
                </div>
              </div>
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
              <div class="settings-subpanel">
                <h4>Histórico de mensagens enviado à IA</h4>
                <p class="help-text">A cada mensagem, o app reenvia parte do histórico desse chat para o modelo "lembrar" da conversa — o provider não guarda estado entre chamadas, então sem isso cada mensagem chegaria sem contexto nenhum.</p>
                <div class="toggle-list">
                  <label class="toggle-row switch-row">
                    <input type="checkbox" name="historyBudgetEnabled" id="history-budget-toggle" ${draftConfig.context?.historyBudgetEnabled !== false ? 'checked' : ''} />
                    <span class="switch" aria-hidden="true"></span>
                    <span>
                      <strong>Enviar histórico de mensagens anteriores</strong>
                      <small>Quando desligado, só a sua mensagem atual é enviada (sem as anteriores deste chat); memória do chat, memória persistente/de usuário e contexto compactado continuam normais.</small>
                    </span>
                  </label>
                </div>
                <label>
                  Limite de histórico enviado
                  <input name="historyBudgetChars" id="history-budget-chars" type="number" min="2000" max="120000" step="1000" value="${escapeAttr(draftConfig.context?.historyBudgetChars || 28000)}" ${draftConfig.context?.historyBudgetEnabled === false ? 'disabled' : ''} />
                </label>
                <p class="help-text">Em caracteres, não tokens reais (o app não usa um tokenizer; ~4 caracteres ≈ 1 token é uma aproximação comum, mas varia por modelo). Mensagens mais antigas vão sendo descartadas primeiro até caber no limite; a mensagem atual nunca é cortada por esse limite.</p>
              </div>
              <div class="explain-list">
                <p><strong>Janela interna do modelo:</strong> limite real do modelo/provider em uso. O app ainda aproxima por caracteres, então um modelo menor pode rejeitar chamadas se o prompt ficar grande demais.</p>
                <p><strong>Salvar snapshot:</strong> salva uma fotografia Markdown do estado atual em context-snapshots e atualiza context-window.md. Não muda o prompt futuro por si só.</p>
                <p><strong>Compactar contexto:</strong> pede ao modelo para resumir histórico, memória e decisões em context.md. Esse arquivo entra no prompt das próximas mensagens.</p>
                <p><strong>compact_context:</strong> tool opcional para a própria IA atualizar context.md quando perceber que a conversa está longa.</p>
              </div>
              <div class="settings-subpanel">
                <h4>O que entra no prompt, sempre ou condicionalmente</h4>
                <div class="explain-list">
                  <p><strong>Sempre:</strong> instruções fixas do app (papel do MC, idioma, nível técnico, runtime atual), memória persistente global, índice/conteúdo da memória de usuário conforme os toggles da seção Memória, memória do chat atual, contexto compactado (se existir), e o texto narrativo de cada tool conforme os toggles da seção Tools.</p>
                  <p><strong>Condicional:</strong> histórico bruto de mensagens anteriores deste chat — controlado pelo toggle "Enviar histórico" acima. Em tarefa agendada, memória persistente e de usuário podem ser puladas pelo toggle "Não incluir memórias" da própria tarefa (sem afetar o histórico do chat reusado).</p>
                  <p><strong>Nunca sem você pedir:</strong> conteúdo de arquivos de memória de usuário que não estejam marcados para ir completos no prompt — a IA só os lê via tool quando precisa.</p>
                </div>
              </div>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'scheduledTasks' ? 'active' : ''}" data-section="scheduledTasks">
              <h3>Tarefas agendadas</h3>
              <p class="help-text">Executa um prompt fixo automaticamente, num horário ou intervalo, com provider/modelo e tools próprios. Como ninguém fica presente pra aprovar nada, cada tarefa só pode usar as tools marcadas explicitamente na lista abaixo.</p>
              <div class="scheduled-task-list">
                ${renderScheduledTaskRows()}
              </div>
              <div class="button-row">
                <button type="button" id="create-scheduled-task" ${state.busy ? 'disabled' : ''}>Criar tarefa</button>
              </div>
              ${state.scheduledTaskEditorId ? renderScheduledTaskEditor() : ''}
            </section>

            <section class="modal-section settings-panel ${activeSection === 'email' ? 'active' : ''}" data-section="email">
              <h3>Email</h3>
              <p class="help-text">Envio de email via Resend, só envio por enquanto (sem receber/responder ainda). O destino é sempre o endereço configurado abaixo — nunca um endereço escolhido pela IA.</p>
              <div class="toggle-list">
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="emailEnabled" ${draftConfig.email?.enabled ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Ativar envio de email</strong>
                    <small>Sem isso ligado (e sem chave + email de destino preenchidos), a tool send_email não fica disponível em nenhum chat nem tarefa agendada, mesmo que marcada na allowlist de uma tarefa.</small>
                  </span>
                </label>
              </div>
              <div class="setup-grid">
                <label>
                  Chave de API do Resend
                  <input name="emailResendApiKey" type="password" value="${escapeAttr(draftConfig.email?.resendApiKey || '')}" placeholder="re_..." />
                </label>
                <label>
                  Email de destino
                  <input name="emailDestination" type="email" value="${escapeAttr(draftConfig.email?.destinationEmail || '')}" placeholder="voce@exemplo.com" />
                </label>
              </div>
              <div class="toggle-list">
                <label class="toggle-row switch-row">
                  <input type="checkbox" name="emailNotifyOnScheduledTaskFailure" ${draftConfig.email?.notifyOnScheduledTaskFailure !== false ? 'checked' : ''} />
                  <span class="switch" aria-hidden="true"></span>
                  <span>
                    <strong>Notificar por email quando uma tarefa agendada falhar</strong>
                    <small>Usa o evento de falha que o app já registra hoje; não depende de nenhuma tool, dispara mesmo se a tarefa não tiver send_email na allowlist.</small>
                  </span>
                </label>
              </div>
              <div class="button-row">
                <button type="button" id="send-test-email" ${state.busy ? 'disabled' : ''}>Enviar email de teste</button>
              </div>
              <div class="explain-list">
                <p><strong>Por que enviar não expõe nada à rede:</strong> é uma chamada de saída do MC pra API do Resend, igual qualquer chamada de provider de IA. Funciona idêntico local ou na VPS, sem domínio público.</p>
                <p><strong>Endereço de envio:</strong> sem verificar um domínio próprio, o Resend exige usar o endereço sandbox dele (<code>onboarding@resend.dev</code>) como remetente — é uma limitação da plataforma, não uma configuração.</p>
                <p><strong>Destino fixo:</strong> a tool send_email não tem parâmetro de destinatário — a IA nunca escolhe pra onde mandar, só o assunto e o corpo.</p>
                <p><strong>Onde aparece:</strong> disponível em qualquer chat (com aprovação manual, a menos que "Sempre permitir qualquer tool" esteja ligado) sempre que estiver ativada e configurada acima. Em tarefa agendada, ainda precisa estar marcada na allowlist daquela tarefa, igual qualquer outra tool.</p>
              </div>
            </section>

            <section class="modal-section settings-panel ${activeSection === 'network' ? 'active' : ''}" data-section="network">
              <h3>Rede local</h3>
              <div class="notice-card">
                <strong>Como funciona</strong>
                <p>Por padrão o My Computer escuta só em 127.0.0.1. Ao abrir para a rede, o próximo restart passa a escutar em 0.0.0.0 e o navegador pede Basic Auth. Essa senha de rede é única; seções/usuários internos isolam dados do app, mas não criam contas de login separadas.</p>
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
              <p class="help-text">Exporta ou importa configurações, chats, memórias, arquivos adicionais, anexos e contexto salvo da seção atual.</p>
              <div class="button-row">
                <button type="button" id="export-data" ${state.busy ? 'disabled' : ''}>Exportar dados</button>
                <label class="file-button">
                  Importar dados
                  <input type="file" id="import-data" accept="application/json" ${state.busy ? 'disabled' : ''} />
                </label>
              </div>
              <div class="settings-subpanel danger-subpanel">
                <h4>Limpeza de chats</h4>
                <p class="help-text">Apaga todos os chats, mensagens, anexos e memórias de chat da seção atual. Configurações, memória persistente global e arquivos adicionais de memória ficam preservados.</p>
                <button type="button" id="delete-all-chats" class="danger-button" ${(state.busy || !(state.chats || []).length) ? 'disabled' : ''}>Excluir todos os chats</button>
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
    ['profiles', 'Seções'],
    ['identity', 'Identidade'],
    ['providers', 'Providers'],
    ['modelIndex', 'Modelos'],
    ['memory', 'Memória'],
    ['tools', 'Tools'],
    ['context', 'Contexto'],
    ['scheduledTasks', 'Tarefas agendadas'],
    ['email', 'Email'],
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

function renderProfileOptions() {
  const profiles = state.profiles?.length ? state.profiles : [{ id: 'default', name: 'Default' }];
  const activeId = state.activeProfile?.id || 'default';
  return profiles
    .map(
      (profile) => `
        <option value="${escapeAttr(profile.id)}" ${profile.id === activeId ? 'selected' : ''}>
          ${escapeHtml(profile.name || profile.id)}
        </option>
      `,
    )
    .join('');
}

function renderProfileRows() {
  const profiles = state.profiles?.length ? state.profiles : [{ id: 'default', name: 'Default', runtimeHome: state.runtimeHome }];
  const activeId = state.activeProfile?.id || 'default';
  return profiles
    .map(
      (profile) => `
        <div class="profile-row ${profile.id === activeId ? 'active' : ''}">
          <div>
            <strong>${escapeHtml(profile.name || profile.id)}</strong>
            <small>${escapeHtml(profile.id)} · ${escapeHtml(profile.runtimeHome || '')}</small>
          </div>
          <div class="profile-row-actions">
            <button type="button" class="activate-profile" data-profile-id="${escapeAttr(profile.id)}" ${profile.id === activeId || state.busy ? 'disabled' : ''}>Ativar</button>
            <button type="button" class="rename-profile" data-profile-id="${escapeAttr(profile.id)}" ${state.busy ? 'disabled' : ''}>Renomear</button>
            <button type="button" class="delete-profile danger-button" data-profile-id="${escapeAttr(profile.id)}" ${profile.id === 'default' || state.busy ? 'disabled' : ''}>Apagar</button>
          </div>
        </div>
      `,
    )
    .join('');
}

const SCHEDULED_TASK_TOOL_LABELS = {
  run_terminal_command: 'Terminal',
  web_search: 'Busca web',
  memory_chat: 'Memória do chat',
  persistent_memory: 'Memória persistente global',
  persistent_memory_user: 'Memória de arquivos do usuário',
  edit_persistent_memory_user: 'Editar arquivos de memória do usuário',
  chat_document: 'Documentos do chat',
  compact_context: 'Compactar contexto',
  rename_chat: 'Renomear chat',
  send_email: 'Enviar email',
};

const SCHEDULED_TASK_WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const SCHEDULED_TASK_TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Europe/London', 'Asia/Tokyo'];
  }
})();

function describeScheduledTaskSchedule(schedule = {}) {
  const hour = String(schedule.hour ?? 9).padStart(2, '0');
  const minute = String(schedule.minute ?? 0).padStart(2, '0');
  const timezoneLabel = !schedule.timezone || schedule.timezone === 'local' ? `local, ${state.serverLocalTimezone || 'UTC'}` : schedule.timezone;
  const time = `${hour}:${minute} (${timezoneLabel})`;
  if (schedule.type === 'interval') {
    return `A cada ${schedule.everyHours}h`;
  }
  if (schedule.type === 'weekly') {
    const days = (schedule.daysOfWeek || []).map((day) => SCHEDULED_TASK_WEEKDAY_LABELS[day]).join(', ') || '—';
    return `Toda(s) ${days} às ${time}`;
  }
  if (schedule.type === 'monthly') {
    return `Todo dia ${schedule.dayOfMonth ?? 1} às ${time}`;
  }
  return `Diariamente às ${time}`;
}

function renderScheduledTaskRows() {
  const tasks = state.scheduledTasks || [];
  if (!tasks.length) return '<p class="help-text">Nenhuma tarefa agendada ainda.</p>';
  return tasks
    .map((task) => {
      const nextRun = task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '—';
      const lastRun = task.lastRunAt ? `${new Date(task.lastRunAt).toLocaleString()} (${task.lastRunStatus || '—'})` : 'Nunca executou';
      return `
        <div class="profile-row">
          <div>
            <strong>${escapeHtml(task.name)}</strong>
            <span class="status-pill ${task.enabled ? 'active' : 'inactive'}">${task.enabled ? 'Ativa' : 'Desativada'}</span>
            <small>${escapeHtml(describeScheduledTaskSchedule(task.schedule))}</small>
            <small>Próxima execução: ${escapeHtml(nextRun)} · Última: ${escapeHtml(lastRun)}</small>
          </div>
          <div class="profile-row-actions">
            <button type="button" class="run-scheduled-task" data-task-id="${escapeAttr(task.id)}" ${state.busy ? 'disabled' : ''}>Executar agora</button>
            <button type="button" class="edit-scheduled-task" data-task-id="${escapeAttr(task.id)}" ${state.busy ? 'disabled' : ''}>Editar</button>
            <button type="button" class="delete-scheduled-task danger-button" data-task-id="${escapeAttr(task.id)}" ${state.busy ? 'disabled' : ''}>Apagar</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderScheduledTaskEditor() {
  const editingId = state.scheduledTaskEditorId;
  const isNew = editingId === 'new';
  const task = isNew ? null : (state.scheduledTasks || []).find((item) => item.id === editingId);
  if (!isNew && !task) return '';
  const provider = task?.provider || state.config?.provider || 'groq';
  const model = task?.model || state.config?.model || '';
  const schedule = task?.schedule || { type: 'daily', hour: 9, minute: 0, timezone: 'local' };
  const scheduleType = schedule.type || 'daily';
  const allowedTools = new Set(task?.allowedTools || []);
  const selectedWeekdays = new Set(schedule.daysOfWeek || [1]);
  const timeValue = `${String(schedule.hour ?? 9).padStart(2, '0')}:${String(schedule.minute ?? 0).padStart(2, '0')}`;
  const timeFieldsVisible = scheduleType !== 'interval';
  return `
    <div class="scheduled-task-editor notice-card">
      <h4>${isNew ? 'Nova tarefa agendada' : 'Editar tarefa'}</h4>
      <label>
        Nome
        <input id="sched-task-name" value="${escapeAttr(task?.name || '')}" placeholder="Ex.: Resumo diário" />
      </label>
      <label>
        Prompt enviado a cada execução
        <textarea id="sched-task-prompt" rows="4" placeholder="O que a IA deve fazer nesta execução?">${escapeHtml(task?.prompt || '')}</textarea>
      </label>
      <label>
        System prompt (instruções fixas, além do prompt acima)
        <textarea id="sched-task-system-prompt" rows="3" placeholder="Ex.: Responda sempre em tom descontraído, em português, sem emojis em excesso.">${escapeHtml(task?.systemPrompt || '')}</textarea>
        <small class="help-text">Opcional. Entra como instrução fixa de sistema em toda execução desta tarefa, separado do prompt principal -- útil pra regras que não mudam (tom, formato, restrições), em vez de repetir no prompt.</small>
      </label>
      <div class="setup-grid">
        <label>
          Provider
          <select id="sched-task-provider">${renderProviderOptions(provider)}</select>
        </label>
        <label>
          Modelo
          <select id="sched-task-model">${renderModelOptions(provider, model)}</select>
        </label>
      </div>
      <label>
        Tipo de agendamento
        <select id="sched-task-schedule-type">
          <option value="daily" ${scheduleType === 'daily' ? 'selected' : ''}>Diário</option>
          <option value="weekly" ${scheduleType === 'weekly' ? 'selected' : ''}>Semanal</option>
          <option value="monthly" ${scheduleType === 'monthly' ? 'selected' : ''}>Mensal</option>
          <option value="interval" ${scheduleType === 'interval' ? 'selected' : ''}>Intervalo</option>
        </select>
      </label>
      <div class="setup-grid" id="sched-task-time-fields" style="${timeFieldsVisible ? '' : 'display:none'}">
        <label>
          Horário
          <input id="sched-task-time" type="time" value="${escapeAttr(timeValue)}" />
        </label>
        <label>
          Fuso horário
          <select id="sched-task-timezone">
            <option value="local" ${!schedule.timezone || schedule.timezone === 'local' ? 'selected' : ''}>Horário local (${escapeHtml(state.serverLocalTimezone || 'UTC')})</option>
            ${SCHEDULED_TASK_TIMEZONES.map(
              (tz) => `<option value="${escapeAttr(tz)}" ${tz === schedule.timezone ? 'selected' : ''}>${escapeHtml(tz)}</option>`,
            ).join('')}
          </select>
          <small class="help-text">"Horário local" acompanha o fuso da máquina onde o My Computer está rodando, mesmo se ela mudar de fuso depois. Escolher um fuso específico da lista fixa esse fuso para esta tarefa.</small>
        </label>
      </div>
      <div class="weekday-chip-grid" id="sched-task-weekday-fields" style="${scheduleType === 'weekly' ? '' : 'display:none'}">
        ${SCHEDULED_TASK_WEEKDAY_LABELS.map(
          (label, day) => `
            <label class="weekday-chip">
              <input type="checkbox" class="sched-task-weekday-checkbox" value="${day}" ${selectedWeekdays.has(day) ? 'checked' : ''} />
              ${label}
            </label>
          `,
        ).join('')}
      </div>
      <div class="setup-grid" id="sched-task-month-fields" style="${scheduleType === 'monthly' ? '' : 'display:none'}">
        <label>
          Dia do mês
          <select id="sched-task-day-of-month">
            ${Array.from({ length: 31 }, (_, index) => index + 1)
              .map((day) => `<option value="${day}" ${(schedule.dayOfMonth ?? 1) === day ? 'selected' : ''}>${day}</option>`)
              .join('')}
          </select>
          <small>Se o mês não tiver esse dia, a tarefa roda no último dia do mês.</small>
        </label>
      </div>
      <div class="setup-grid" id="sched-task-interval-fields" style="${scheduleType === 'interval' ? '' : 'display:none'}">
        <label>
          A cada quantas horas
          <input id="sched-task-every-hours" type="number" min="0.5" step="0.5" value="${escapeAttr(schedule.everyHours ?? 6)}" />
        </label>
      </div>
      <div class="toggle-list">
        <label class="toggle-row switch-row">
          <input type="checkbox" id="sched-task-enabled" ${task?.enabled !== false ? 'checked' : ''} />
          <span class="switch" aria-hidden="true"></span>
          <span><strong>Ativa</strong></span>
        </label>
        <label class="toggle-row switch-row">
          <input type="checkbox" id="sched-task-reuse-chat" ${task?.reuseChat !== false ? 'checked' : ''} />
          <span class="switch" aria-hidden="true"></span>
          <span>
            <strong>Reusar o mesmo chat</strong>
            <small>Quando desligado, cria um chat novo a cada execução.</small>
          </span>
        </label>
        <label class="toggle-row switch-row">
          <input type="checkbox" id="sched-task-skip-memory" ${task?.skipMemoryInPrompt !== false ? 'checked' : ''} />
          <span class="switch" aria-hidden="true"></span>
          <span>
            <strong>Não incluir memórias nesta tarefa</strong>
            <small>Pula a memória persistente global e os arquivos de memória do usuário no prompt, pra economizar tokens. O histórico do chat reusado (se "Reusar o mesmo chat" estiver ligado) e a memória desse chat continuam normais.</small>
          </span>
        </label>
      </div>
      <fieldset class="scheduled-task-tools">
        <legend>Tools permitidas (sem aprovação manual, já que ninguém estará presente)</legend>
        ${Object.entries(SCHEDULED_TASK_TOOL_LABELS)
          .map(
            ([name, label]) => `
              <label class="toggle-row">
                <input type="checkbox" class="sched-task-tool-checkbox" value="${escapeAttr(name)}" ${allowedTools.has(name) ? 'checked' : ''} />
                ${escapeHtml(label)}
              </label>
            `,
          )
          .join('')}
      </fieldset>
      <div class="button-row">
        <button type="button" id="save-scheduled-task" ${state.busy ? 'disabled' : ''}>${isNew ? 'Criar' : 'Salvar'}</button>
        <button type="button" id="cancel-scheduled-task-edit">Cancelar</button>
      </div>
    </div>
  `;
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
  if (state.busy) return;
  captureSetupDraftFromForm(event.currentTarget);
  const currentIndex = SETUP_STEPS.indexOf(state.setupStep || 'provider');
  state.setupStep = SETUP_STEPS[Math.min(currentIndex + 1, SETUP_STEPS.length - 1)];
  renderSetup();
}

function previousSetupStep() {
  if (state.busy) return;
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
    const offlineMode = form.get('offlineMode') === 'on';
    draft.privacy = {
      ...(draft.privacy || {}),
      offlineMode,
    };
    const provider = offlineMode ? 'ollama' : form.get('provider') || draft.provider || 'groq';
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
    draft.appearance = {
      ...(draft.appearance || {}),
      theme: form.get('theme') || draft.appearance?.theme || 'light',
      uiLanguage: normalizeUiLanguage(form.get('uiLanguage') || draft.appearance?.uiLanguage),
    };
  }
  if (form.has('alwaysAllowTools') || form.has('searchEnabled') || form.has('searchMode')) {
    const offlineMode = isOfflineMode(draft);
    const searchMode = form.get('searchEnabled') === 'on' ? form.get('searchMode') || getSearchMode(draft.tools) : 'off';
    const safeSearchMode = offlineMode && searchMode === 'both' ? 'off' : searchMode;
    const userMemoryRead = form.has('userMemoryReadTool') ? form.get('userMemoryReadTool') === 'on' : draft.tools?.userMemory !== false;
    const userMemoryEdit = userMemoryRead && form.get('userMemoryEditTool') === 'on';
    draft.tools = {
      ...(draft.tools || {}),
      alwaysAllow: form.get('alwaysAllowTools') === 'on',
      deepInvestigation: form.get('deepInvestigation') === 'on',
      userMemory: userMemoryRead,
      userMemoryEdit,
      searchMode: safeSearchMode,
      webSearch: safeSearchMode !== 'off',
      searchTerminal: safeSearchMode === 'terminal' || safeSearchMode === 'both',
    };
    draft.userMemory = {
      ...(draft.userMemory || {}),
      sendFilesToPrompt: form.get('userMemorySendFilesToPrompt') === 'on',
      remindModelToUpdateFiles: userMemoryEdit && form.get('userMemoryUpdateReminder') === 'on',
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
    ['terminal', 'Terminal', 'Usa terminal local e pede permissão quando necessário.'],
    ['both', 'Ambos', 'Tenta web nativa primeiro (quando o provider suporta) e cai no terminal se a busca falhar ou vier vazia.'],
  ];
  const filtered = isOfflineMode(state.settingsDraft?.config || state.setupDraft || state.config)
    ? options.filter(([value]) => value === 'terminal')
    : options;
  return filtered
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
  const offlineMode = options.offlineMode === true;
  const safeSelectedMode = offlineMode && selectedMode === 'both' ? 'off' : selectedMode;
  const enabled = safeSelectedMode !== 'off';
  const mode = enabled && safeSelectedMode !== 'off' ? safeSelectedMode : offlineMode ? 'terminal' : 'both';
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
  if (!fallbacks.length) {
    return '<div class="empty-routing-state">Nenhum fallback de provider configurado.</div>';
  }
  return fallbacks
    .map(
      (fallback, index) => {
        const provider = fallback.provider || '';
        const model = fallback.model || '';
        const showCustomModel = Boolean(model) && !isKnownModel(provider, model);
        return `
          <div class="routing-fallback-row" data-fallback-index="${index}">
            <label>
              Provider
              <select class="fallback-provider">
                <option value="" ${provider ? '' : 'selected'} disabled>Selecione um provider</option>
                ${renderProviderOptions(provider)}
              </select>
            </label>
            <label>
              Modelo
              <select class="fallback-model">
                ${renderModelOptionsWithPlaceholder(provider || state.config.provider, model, 'Selecione um modelo')}
              </select>
            </label>
            <label class="fallback-custom-model-row ${showCustomModel ? '' : 'hidden'}">
              Modelo personalizado
              <input class="fallback-custom-model-input" value="${showCustomModel ? escapeAttr(model) : ''}" placeholder="provider/model ou nome local" />
            </label>
            <button type="button" class="remove-provider-fallback danger-button" data-fallback-index="${index}">Remover</button>
          </div>
        `;
      },
    )
    .join('');
}

function renderModelIndex(config = {}) {
  const providers = isOfflineMode(config) ? (state.providers || []).filter((provider) => provider.id === 'ollama') : state.providers || [];
  return providers
    .map((provider) => `
      <section class="model-index-provider">
        <div class="model-index-provider-header">
          <div>
            <h4>${escapeHtml(provider.label)}</h4>
            <p>${escapeHtml(provider.catalogSummary || 'Catálogo do provider')}</p>
          </div>
          <span>${escapeHtml(provider.catalogMode || 'static')}</span>
        </div>
        <div class="model-index-grid">
          ${(provider.models || []).map((model) => renderModelIndexCard(provider, model, config)).join('')}
        </div>
      </section>
    `)
    .join('');
}

function renderModelIndexCard(provider, model, config = {}) {
  const chips = [
    model.selectable === false ? uiText('índice') : uiText('selecionável'),
    displayModelKind(model.kind),
    model.contextTokens ? `${formatCompactNumber(model.contextTokens)} ctx` : '',
    model.maxOutputTokens ? `${formatCompactNumber(model.maxOutputTokens)} ${uiText('saída')}` : '',
    model.supportsImages ? uiText('visão') : uiText('texto'),
    model.supportsReasoning ? uiText('raciocínio') : '',
    provider.id === 'ollama' && model.installed ? uiText('instalado') : '',
  ].filter(Boolean);
  return `
    <article class="model-index-card">
      <div>
        <strong>${escapeHtml(model.label || model.id)}</strong>
        <code>${escapeHtml(model.id)}</code>
      </div>
      <div class="model-chip-row">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>
      ${model.reasoningEfforts?.length ? `<p>${escapeHtml(uiText('Raciocínio'))}: ${escapeHtml(model.reasoningEfforts.join(', '))}</p>` : ''}
      ${model.maxInputImages || model.maxFileSizeMB ? `<p>${escapeHtml(uiText('Imagem'))}: ${escapeHtml([model.maxInputImages ? `${model.maxInputImages} ${uiText('imagem(ns)')}` : '', model.maxFileSizeMB ? `${model.maxFileSizeMB} MB` : ''].filter(Boolean).join(', '))}</p>` : ''}
      ${model.description ? `<p>${escapeHtml(model.description)}</p>` : ''}
      ${model.apiNotes ? `<p><strong>API:</strong> ${escapeHtml(model.apiNotes)}</p>` : ''}
    </article>
  `;
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${Math.round(number / 100000) / 10}M`;
  if (number >= 1000) return `${Math.round(number / 1000)}k`;
  return String(number);
}

function renderModelFallbackRows(fallbacks = [], providerId = '') {
  const provider = providerId || state.settingsProvider || state.config?.provider || 'groq';
  const rows = fallbacks.filter((fallback) => fallback.provider === provider);
  if (!rows.length) {
    return `<div class="empty-routing-state">Nenhum modelo alternativo em ${escapeHtml(providerLabel(provider))}.</div>`;
  }
  return rows
    .map((fallback, index) => {
      const model = fallback.model || '';
      const showCustomModel = Boolean(model) && !isKnownModel(provider, model);
      return `
        <div class="model-fallback-row" data-provider="${escapeAttr(provider)}" data-model-fallback-index="${index}">
          <label>
            Modelo alternativo em ${escapeHtml(providerLabel(provider))}
            <select class="model-fallback-model">
              ${renderModelOptionsWithPlaceholder(provider, model, 'Selecione um modelo alternativo')}
            </select>
          </label>
          <label class="fallback-custom-model-row ${showCustomModel ? '' : 'hidden'}">
            Modelo personalizado
            <input class="model-fallback-custom-input" value="${showCustomModel ? escapeAttr(model) : ''}" placeholder="provider/model ou nome local" />
          </label>
          <button type="button" class="remove-model-fallback danger-button" data-model-fallback-index="${index}">Remover</button>
        </div>
      `;
    })
    .join('');
}

function renderChatSettingsModal() {
  const chat = getActiveChatView();
  const offlineMode = isOfflineMode(state.config);
  const { provider: chatProviderId, model: chatModel } = getEffectiveChatRuntime(chat);
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
                  <input id="mobile-chat-title-input" value="${escapeAttr(displayChatTitle(chat?.title || ''))}" ${!chat ? 'disabled' : ''} />
                </label>
                <label>
                  Provider deste chat
                  <select id="mobile-chat-provider-input" ${!chat ? 'disabled' : ''}>
                    ${renderProviderOptions(chatProviderId, { offlineOnly: offlineMode })}
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
  const draft = getChatContextDraft(chat);
  const linkedScheduledTask = (state.scheduledTasks || []).find((task) => task.chatId === chat?.id);
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
                <textarea id="chat-prompt-modal-input" rows="7" placeholder="Preferências específicas deste chat.">${escapeHtml(draft.systemPromptExtra || '')}</textarea>
              </label>
              ${
                linkedScheduledTask
                  ? `<p class="help-text">Este chat é reutilizado pela tarefa agendada <strong>${escapeHtml(linkedScheduledTask.name)}</strong>. O system prompt acima é específico deste chat; o system prompt fixo da própria tarefa (campo separado, editado na tarefa agendada) é injetado à parte em toda execução agendada, somado a este -- os dois não são o mesmo campo e não se sobrescrevem.${
                      linkedScheduledTask.systemPrompt
                        ? `<br />System prompt atual da tarefa: <em>${escapeHtml(linkedScheduledTask.systemPrompt)}</em>`
                        : ' A tarefa não tem um system prompt próprio configurado agora.'
                    }</p>`
                  : ''
              }
            </section>
            <section class="modal-section">
              <label>
                Memória do chat
                <textarea id="chat-memory-modal-input" class="memory-editor">${escapeHtml(draft.memory || '')}</textarea>
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
  const { provider: providerId, model: modelId } = getEffectiveChatRuntime(chat);
  const settings = chat?.modelSettings || {};
  const support = getModelSettingSupport(providerId, modelId);
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
              ${metadata.apiNotes ? `<div class="notice-card"><strong>Nota do modelo</strong><p>${escapeHtml(metadata.apiNotes)}</p></div>` : ''}
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
                        ${['', ...(support.reasoningEfforts || ['none', 'low', 'medium', 'high', 'xhigh'])]
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
  const contentUrl = withProfileQuery(`/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(attachment.id)}/content`);
  const editable = isEditableAttachment(attachment);
  let preview = '';
  if (editable) {
    const text = attachment.viewerLoading
      ? uiText('Carregando conteúdo do arquivo...')
      : attachment.draftContent ?? attachment.content ?? attachment.extractedText ?? attachment.previewText ?? '';
    preview = `<textarea id="attachment-viewer-input" class="viewer-text user-memory-viewer-text" ${attachment.viewerLoading || state.busy ? 'disabled' : ''}>${escapeHtml(text)}</textarea>`;
  } else if (attachment.kind === 'image') {
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
        ${editable ? '<form id="attachment-viewer-form">' : ''}
        <header class="modal-header">
          <div>
            <h2 id="attachment-viewer-title">${escapeHtml(attachment.name)}</h2>
            <p>${escapeHtml(formatBytes(attachment.size))} · ${escapeHtml(attachment.mimeType || 'arquivo')} · ${escapeHtml(attachment.kind || 'documento')} · cópia salva no My Computer</p>
          </div>
          <button type="button" id="close-attachment-viewer" aria-label="Fechar">×</button>
        </header>
        <div class="modal-body viewer-body">
          ${preview}
          <p class="help-text">${escapeHtml(
            editable
              ? 'Edite a cópia salva dentro deste chat. O arquivo original enviado de fora não é alterado.'
              : getAttachmentWarning(attachment).text,
          )}</p>
        </div>
        ${
          editable
            ? `<footer class="modal-footer">
                <button type="button" id="cancel-attachment-viewer">Cancelar</button>
                <button type="submit" class="primary" ${attachment.viewerLoading || state.busy ? 'disabled' : ''}>Salvar arquivo</button>
              </footer>`
            : ''
        }
        ${editable ? '</form>' : ''}
      </section>
    </div>
  `;
}

function renderAttachmentDiffModal() {
  const diff = state.attachmentDiff;
  if (!diff) return '';
  const lines = buildLineDiff(diff.oldText || '', diff.newText || '');
  const knownAttachment = resolveAvailableAttachment(diff.attachmentId || diff.fileName);
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal wide-modal attachment-diff-modal" role="dialog" aria-modal="true" aria-labelledby="attachment-diff-title">
        <header class="modal-header">
          <div>
            <h2 id="attachment-diff-title">Diff do documento</h2>
            <p>${escapeHtml(diff.fileName || diff.attachmentId || 'Documento do chat')} ${diff.reason ? `· ${escapeHtml(diff.reason)}` : ''}</p>
          </div>
          <div class="modal-header-actions">
            ${knownAttachment ? `<button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(knownAttachment.id)}">Ver arquivo</button>` : ''}
            <button type="button" id="close-attachment-diff" aria-label="Fechar">×</button>
          </div>
        </header>
        <div class="modal-body">
          ${diff.attachmentId && !knownAttachment ? '<p class="help-text">Documento não encontrado no chat atual. O diff ainda mostra o trecho que a IA tentou alterar.</p>' : ''}
          <div class="diff-viewer" role="table" aria-label="Diff da alteração proposta">
            ${lines.map(renderDiffLine).join('')}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderUserMemoryViewerModal() {
  const file = state.userMemoryViewer;
  if (!file) return '';
  const editable = file.editable !== false;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal wide-modal user-memory-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="user-memory-viewer-title">
        <form id="user-memory-viewer-form">
          <header class="modal-header">
            <div>
              <h2 id="user-memory-viewer-title">${escapeHtml(file.displayName || file.name || 'Arquivo de memória')}</h2>
              <p>${escapeHtml(file.title || file.id || '')} · ${escapeHtml(formatBytes(file.size || file.content?.length || 0))} · cópia salva no My Computer</p>
            </div>
            <button type="button" id="close-user-memory-viewer" aria-label="Fechar">×</button>
          </header>
          <div class="modal-body viewer-body">
            <textarea id="user-memory-viewer-input" class="viewer-text user-memory-viewer-text" ${editable ? '' : 'readonly'}>${escapeHtml(file.content || '')}</textarea>
            <p class="help-text">${editable ? 'Edite a cópia salva dentro do My Computer. O arquivo original enviado de fora não é alterado.' : 'Este arquivo está como somente leitura para edição manual.'}</p>
          </div>
          <footer class="modal-footer">
            <button type="button" id="cancel-user-memory-viewer">Cancelar</button>
            <button type="submit" class="primary" ${!editable || state.busy ? 'disabled' : ''}>Salvar arquivo</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderUserMemoryDiffModal() {
  const diff = state.userMemoryDiff;
  if (!diff) return '';
  const lines = buildLineDiff(diff.oldText || '', diff.newText || '');
  const fileIdentifier = diff.fileId || diff.fileName || '';
  const knownFile = resolveKnownUserMemoryFile(fileIdentifier);
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal wide-modal user-memory-diff-modal" role="dialog" aria-modal="true" aria-labelledby="user-memory-diff-title">
        <header class="modal-header">
          <div>
            <h2 id="user-memory-diff-title">Diff da memória</h2>
            <p>${escapeHtml(diff.fileName || diff.fileId || 'Arquivo de memória')} ${diff.reason ? `· ${escapeHtml(diff.reason)}` : ''}</p>
          </div>
          <div class="modal-header-actions">
            ${knownFile ? `<button type="button" class="preview-user-memory-file" data-file-id="${escapeAttr(knownFile.id)}">Ver arquivo</button>` : ''}
            <button type="button" id="close-user-memory-diff" aria-label="Fechar">×</button>
          </div>
        </header>
        <div class="modal-body">
          ${fileIdentifier && !knownFile ? '<p class="help-text">Arquivo não encontrado no índice da seção ativa. O diff ainda mostra o trecho que a IA tentou substituir.</p>' : ''}
          <div class="diff-viewer" role="table" aria-label="Diff da alteração proposta">
            ${lines.map(renderDiffLine).join('')}
          </div>
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
              ${renderImportOption('config', 'Configurações e providers', 'Inclui provider padrão, API keys, tema, tools, contexto, rede e rotatórias.', true)}
              ${renderImportOption('persistentMemory', 'Memória persistente', 'Substitui a memória global compartilhada entre chats.', true)}
              ${renderImportOption('persistentMemoryUser', 'Arquivos de memória persistente', 'Restaura os arquivos adicionais adicionados pelo usuário nesta seção.', true)}
              ${renderImportOption('chats', 'Chats e mensagens', 'Importa metadados, histórico, memória e contexto dos chats.', true)}
              ${renderImportOption('attachments', 'Anexos', 'Inclui arquivos salvos dentro dos chats importados.', true)}
              ${renderImportOption('events', 'Eventos', 'Anexa eventos do backup ao log local para diagnóstico.', false)}
            </div>
          </section>
        </div>
        <footer class="modal-footer">
          <button type="button" id="cancel-import-modal">Cancelar</button>
          <button type="button" class="primary" id="confirm-import-modal" ${state.busy ? 'disabled' : ''}>Importar selecionados</button>
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
  const isInstalled = status?.installed === true;
  const statusText = status
    ? status.installed
      ? `Ollama encontrado${status.version ? `: ${status.version}` : ''}. Modelos locais: ${installedModels.length || 0}.`
      : 'Ollama ainda não foi encontrado no sistema.'
    : 'Verifique o Ollama antes de salvar se quiser usar IA local.';
  const installed = installedModels.includes(model) || installedModels.includes(`${model}:latest`);
  const installCommand = status?.installCommand || 'curl -fsSL https://ollama.com/install.sh | sh';
  return `
    <section class="setup-assist">
      <h2>Ollama local</h2>
      <p>${escapeHtml(statusText)}</p>
      <p>Instale pelo terminal usando o comando oficial abaixo e depois clique em verificar. Se o comando pedir sudo/senha, rode no terminal; o navegador não consegue digitar essa senha por você. O painel baixa/remove modelos quando detectar o Ollama instalado.</p>
      <div class="button-row">
        <button type="button" id="check-ollama">Verificar Ollama</button>
        ${isInstalled ? `<button type="button" id="pull-ollama-model">${installed ? 'Modelo instalado' : 'Baixar modelo selecionado'}</button>` : ''}
      </div>
      ${!isInstalled ? `<pre>${escapeHtml(installCommand)}</pre>` : ''}
      ${
        isInstalled && installedModels.length
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
          : isInstalled ? '<p class="help-text">Nenhum modelo local encontrado ainda.</p>' : '<p class="help-text">Quando a verificação encontrar o Ollama, esta área mostra botões para baixar o modelo escolhido e remover modelos locais.</p>'
      }
    </section>
  `;
}

function renderToolToggle(name, title, description) {
  const config = state.settingsDraft?.config || state.config;
  const checked = name === 'deepInvestigation'
    ? config.tools?.[name] === true ? 'checked' : ''
    : config.tools?.[name] !== false ? 'checked' : '';
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

function renderChatList() {
  const needle = normalizeSearchText(state.chatSearch);
  const chats = (state.chats || []).filter((chat) => {
    const haystack = normalizeSearchText([chat.title, chat.provider, chat.model].filter(Boolean).join(' '));
    return !needle || haystack.includes(needle);
  });
  if (!chats.length) return '<p class="empty chat-list-empty">Nenhum chat encontrado.</p>';
  return chats.map(renderChatItem).join('');
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function updateChatSearch(event) {
  state.chatSearch = event.target.value || '';
  renderPreservingVisualState();
}

function renderChatItem(chat) {
  const active = state.activeChat?.id === chat.id ? 'active' : '';
  return `
    <button class="chat-item ${active}" data-chat-id="${escapeAttr(chat.id)}">
      <strong>${escapeHtml(displayChatTitle(chat.title))}</strong>
      <span class="meta">${escapeHtml(providerLabel(chat.provider || state.config.provider))} · ${escapeHtml(chat.model || state.config.model)} · ${new Date(chat.updatedAt).toLocaleString()}</span>
    </button>
  `;
}

function getMessageContinuationGroupId(message) {
  return message?.continuationGroupId || message?.sourceUserMessageId || message?.id || null;
}

function getVisibleChatMessages(chat) {
  const messages = chat?.messages || [];
  const latestAssistantByGroup = new Map();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    latestAssistantByGroup.set(getMessageContinuationGroupId(message), message.id);
  }
  return messages.filter((message) => message.role !== 'assistant' || latestAssistantByGroup.get(getMessageContinuationGroupId(message)) === message.id);
}

function chatHasActiveToolApproval(chat) {
  return Boolean(
    chat?.messages?.some(
      (message) =>
        message.role === 'assistant' &&
        (message.pendingToolApproval || message.status === 'needs_tool_approval' || message.status === 'running_tools'),
    ),
  );
}

function getAssistantAttemptsForMessage(message) {
  if (!state.activeChat?.messages?.length || message?.role !== 'assistant') return [];
  const groupId = getMessageContinuationGroupId(message);
  return state.activeChat.messages
    .filter((item) => item.role === 'assistant' && getMessageContinuationGroupId(item) === groupId)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function getSourceUserMessageForAttempt(message) {
  if (!state.activeChat?.messages?.length) return null;
  if (message?.role === 'user') return message;
  const groupId = message?.sourceUserMessageId || message?.continuationGroupId || null;
  const direct = groupId ? state.activeChat.messages.find((item) => item.id === groupId && item.role === 'user') : null;
  if (direct) return direct;
  const index = state.activeChat.messages.findIndex((item) => item.id === message?.id);
  if (index === -1) return null;
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    const candidate = state.activeChat.messages[currentIndex];
    if (candidate.role === 'user') return candidate;
  }
  return null;
}

function shouldShowMessageDetails(message) {
  if (message?.role !== 'assistant') return false;
  const attempts = getAssistantAttemptsForMessage(message);
  return Boolean(
    attempts.length > 1 ||
      (Array.isArray(message.toolUses) && message.toolUses.length) ||
      (Array.isArray(message.executionTrace) && message.executionTrace.length) ||
      String(message.thinking || '').trim() ||
      ['failed', 'incomplete', 'needs_tool_approval', 'running_tools'].includes(message.status) ||
      message.continuationAvailable,
  );
}

function renderAttemptBadge(message) {
  const attempts = getAssistantAttemptsForMessage(message);
  if (attempts.length <= 1) return '';
  const index = attempts.findIndex((item) => item.id === message.id);
  if (index === -1) return '';
  return `<span class="message-attempt">${index + 1}/${attempts.length}</span>`;
}

function formatAttemptTraceSummary(message = {}) {
  const trace = Array.isArray(message.executionTrace) ? message.executionTrace : [];
  const toolUses = Array.isArray(message.toolUses) ? message.toolUses : [];
  const modelSteps = trace.filter((entry) => entry.type === 'assistant_output').length;
  const toolCount = toolUses.length || trace.filter((entry) => entry.type === 'tool_result').length;
  return [`${modelSteps} saída(s)`, `${toolCount} tool(s)`].join(' · ');
}

function isLatestAssistantAttempt(message) {
  if (message?.role !== 'assistant') return true;
  const attempts = getAssistantAttemptsForMessage(message);
  const latest = attempts[attempts.length - 1];
  return !latest || latest.id === message.id;
}

function renderMessageActions(message) {
  const actions = [];
  const disabled = state.busy ? 'disabled' : '';
  if (message.role === 'assistant' && ['failed', 'incomplete'].includes(message.status) && isLatestAssistantAttempt(message)) {
    actions.push(`<button type="button" class="retry-message danger-button" data-message-id="${escapeAttr(message.id)}" ${disabled}>Tentar novamente</button>`);
    actions.push(`<button type="button" class="continue-message primary" data-message-id="${escapeAttr(message.id)}" ${disabled}>Continuar</button>`);
  } else if (message.role === 'user' && message.status === 'failed') {
    actions.push(`<button type="button" class="retry-message danger-button" data-message-id="${escapeAttr(message.id)}" ${disabled}>Tentar novamente</button>`);
  }
  if (!actions.length) return '';
  return `<div class="message-actions">${actions.join('')}</div>`;
}

function renderToolApprovalPanel(message) {
  if (message?.role !== 'assistant') return '';
  const toolUses = Array.isArray(message.toolUses) ? message.toolUses : [];
  const pendingTool = toolUses.find((toolUse) => toolUse.status === 'pending_approval');
  const runningTool = toolUses.find((toolUse) => ['approved_pending_execution', 'pending_approval'].includes(toolUse.status));
  const toolUse = pendingTool || (message.status === 'running_tools' ? runningTool : null);
  if (!toolUse) return '';

  const decisionBusy = state.toolDecisionInFlight.has(`${message.id}:${toolUse.id}`);
  const disabled = state.busy || decisionBusy ? 'disabled' : '';
  const isPending = toolUse.status === 'pending_approval' && message.status !== 'running_tools';
  const inputSummary = formatToolInputSummary(toolUse);
  const title = isPending ? 'A IA quer usar uma tool' : 'Tool aprovada em execução';
  const description = isPending
    ? 'Confira o resumo abaixo. O input completo e o histórico ficam em Ver detalhes.'
    : 'O app está aguardando o resultado. Use verificar se a execução ficou presa.';
  const actions = isPending
    ? `
      <button type="button" class="primary approve-tool" data-message-id="${escapeAttr(message.id)}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${disabled}>Permitir</button>
      <button type="button" class="danger-button deny-tool" data-message-id="${escapeAttr(message.id)}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${disabled}>Negar</button>
      ${renderUserMemoryToolButtons(toolUse)}
      ${renderChatDocumentToolButtons(toolUse)}
    `
    : `
      <button type="button" class="primary approve-tool" data-message-id="${escapeAttr(message.id)}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${disabled}>Verificar execução</button>
      ${renderUserMemoryToolButtons(toolUse)}
      ${renderChatDocumentToolButtons(toolUse)}
    `;
  return `
    <div class="tool-approval-panel ${isPending ? 'needs-decision' : 'running'}">
      <div class="tool-approval-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(toolUse.name)} · ${escapeHtml(formatToolUseState(toolUse))}</span>
        <small>${escapeHtml(description)}</small>
        ${inputSummary ? `<code title="${escapeAttr(formatToolInputFullSummary(toolUse))}">${escapeHtml(inputSummary)}</code>` : ''}
        ${renderToolInputDetails(toolUse)}
      </div>
      <div class="tool-approval-actions">${actions}</div>
    </div>
  `;
}

function renderMessage(message) {
  const label = message.role === 'user' ? 'Você' : 'Assistente';
  const sources = collectMessageSources(message);
  const visibleContent = getVisibleMessageContent(message, { stripSources: sources.length > 0 });
  const modelUsed = message.modelUsed
    ? `<span class="message-model">${escapeHtml(message.providerUsed ? `${providerLabel(message.providerUsed)} · ` : '')}${escapeHtml(message.modelUsed)}</span>`
    : '';
  const statusLabel = renderMessageStatus(message.status);
  const status = statusLabel ? `<span class="message-status ${escapeAttr(message.status)}">${statusLabel}</span>` : '';
  const attemptBadge = renderAttemptBadge(message);
  const copyButton =
    message.role === 'assistant'
      ? `<button class="copy-message" data-message-id="${escapeAttr(message.id)}">Copiar</button>`
      : '';
  const detailsButton = shouldShowMessageDetails(message)
    ? `<button type="button" class="open-message-details" data-message-id="${escapeAttr(message.id)}">Ver detalhes</button>`
    : '';
  const bubbleContent = `${renderMessageSources(sources)}${formatContent(visibleContent, message.role)}`;
  return `
    <article class="message ${escapeAttr(message.role)} ${escapeAttr(message.status || '')}">
      <div class="message-label">${label}${attemptBadge}${modelUsed}${status}${detailsButton}${copyButton}</div>
      <div class="bubble">${bubbleContent}</div>
      ${renderToolApprovalPanel(message)}
      ${renderUserMemoryChangeChips(message)}
      ${renderDocumentChangeChips(message)}
      ${message.error ? `<div class="message-error">${escapeHtml(message.error)}</div>` : ''}
      ${renderMessageActions(message)}
      ${message.attachments?.length ? `<div class="message-attachments">${message.attachments.map((attachment) => renderAttachmentCard(attachment)).join('')}</div>` : ''}
    </article>
  `;
}

function collectMessageSources(message) {
  if (message?.role !== 'assistant') return [];
  const sources = [];
  for (const toolUse of message.toolUses || []) {
    if (toolUse.name !== 'web_search' || !Array.isArray(toolUse.result?.results)) continue;
    for (const result of toolUse.result.results) {
      if (!result.url || sources.some((item) => item.url === result.url)) continue;
      sources.push({
        url: result.url,
        title: result.title || formatSourceHost(result.url),
        snippet: result.snippet || '',
      });
    }
  }
  return sources;
}

function renderMessageSources(sources = []) {
  if (!sources.length) return '';
  const visibleSources = sources.slice(0, 6);
  const hiddenCount = Math.max(0, sources.length - visibleSources.length);
  return `
    <div class="message-source-strip" aria-label="Fontes usadas">
      <span class="message-source-label">Fontes</span>
      <div class="message-source-list">
        ${visibleSources
        .map(
            (source, index) => `
            <a class="message-source-card" href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer" title="${escapeAttr(source.title)}">
              <strong>${index + 1}</strong>
              <span>${escapeHtml(source.title)}</span>
              <small>${escapeHtml(formatSourceHost(source.url))}</small>
            </a>
          `,
        )
        .join('')}
        ${hiddenCount ? `<span class="message-source-more">+${hiddenCount}</span>` : ''}
      </div>
    </div>
  `;
}

function renderThinkingBlock(thinking, label = 'Think do modelo') {
  const content = String(thinking || '').trim();
  if (!content) return '';
  return `
    <details class="thinking-block">
      <summary>${escapeHtml(label)}</summary>
      <pre>${escapeHtml(content)}</pre>
    </details>
  `;
}

function getVisibleMessageContent(message = {}, options = {}) {
  if (message.role !== 'assistant') return message.content || '';
  const visible = splitThinkTags(message.content || '').visible.trim();
  return options.stripSources ? stripTrailingSourcesSection(visible) : visible;
}

function getMessageThinking(message = {}) {
  const fromField = String(message.thinking || '').trim();
  const fromContent = splitThinkTags(message.content || '').thinking.join('\n\n').trim();
  return [fromField, fromContent].filter(Boolean).join('\n\n');
}

function splitThinkTags(content = '') {
  let visible = String(content || '');
  const thinking = [];
  visible = visible.replace(/<think>\s*([\s\S]*?)\s*<\/think>/gi, (_match, inner) => {
    const clean = String(inner || '').trim();
    if (clean) thinking.push(clean);
    return '';
  });
  const danglingThinkIndex = visible.toLowerCase().lastIndexOf('<think>');
  if (danglingThinkIndex >= 0) {
    const clean = visible.slice(danglingThinkIndex + '<think>'.length).trim();
    if (clean) thinking.push(clean);
    visible = visible.slice(0, danglingThinkIndex);
  }
  return { visible, thinking };
}

function formatSourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function stripTrailingSourcesSection(content = '') {
  const lines = String(content || '').split('\n');
  let sourceStart = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (/^(#{1,4}\s*)?(fontes|sources|refer[eê]ncias|references)\s*:?\s*$/i.test(line)) {
      sourceStart = index;
      break;
    }
  }
  if (sourceStart === -1) return content;
  const tail = lines.slice(sourceStart + 1).join('\n');
  if (!/https?:\/\/|\[[^\]]+\]\([^)]+\)|^\s*(?:[-*]|\d+\.)\s+/im.test(tail)) return content;
  return lines.slice(0, sourceStart).join('\n').trimEnd();
}

function renderMessageStatus(status) {
  if (status === 'pending') return 'enviando';
  if (status === 'failed') return 'falhou';
  if (status === 'incomplete') return 'incompleto';
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

function renderExecutionHistory(message, options = {}) {
  if (message.role !== 'assistant') return '';
  const trace = Array.isArray(message.executionTrace) ? message.executionTrace : [];
  const toolUses = Array.isArray(message.toolUses) ? message.toolUses : [];
  if (!trace.length && !toolUses.length) return '';
  const traceToolIds = new Set(trace.map((entry) => entry.toolUse?.id).filter(Boolean));
  const extraToolUses = toolUses.filter((toolUse) => !traceToolIds.has(toolUse.id));
  const toolCount = toolUses.length || trace.filter((entry) => entry.type === 'tool_result').length;
  const modelSteps = trace.filter((entry) => entry.type === 'assistant_output').length;
  const shouldOpen =
    ['needs_tool_approval', 'running_tools', 'failed', 'incomplete'].includes(message.status) ||
    toolUses.some((toolUse) => toolUse.status === 'pending_approval') ||
    message.continuationAvailable;
  const open = options.forceOpen || shouldOpen;
  const title = options.title || 'Histórico da execução';
  return `
    <details class="execution-history ${options.forceOpen ? 'pinned-history' : ''}" ${open ? 'open' : ''}>
      <summary class="execution-summary">
        <span>${escapeHtml(title)}</span>
        <span>${escapeHtml(String(toolCount))} tool(s) · ${escapeHtml(String(modelSteps))} saída(s) da IA</span>
      </summary>
      <div class="execution-body">
        ${trace.map((entry) => renderExecutionTraceEntry(entry, message)).join('')}
        ${extraToolUses.map((toolUse) => renderToolUse(toolUse, message)).join('')}
      </div>
    </details>
  `;
}

function renderExecutionTraceEntry(entry, message) {
  if (entry.type === 'tool_result') {
    return renderToolUse(entry.toolUse || {}, message);
  }
  if (entry.type !== 'assistant_output') return '';
  const title = entry.phase === 'final' ? 'Resposta final do modelo' : 'Saída intermediária da IA';
  const toolCalls = Array.isArray(entry.toolCalls) ? entry.toolCalls : [];
  const metadata = [entry.provider && providerLabel(entry.provider), entry.model, entry.round ? `rodada ${entry.round}` : '']
    .filter(Boolean)
    .join(' · ');
  const open = entry.phase === 'final';
  return `
    <details class="trace-entry model-trace" ${open ? 'open' : ''}>
      <summary class="trace-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(metadata)}</span>
      </summary>
      <div class="trace-body">
        ${renderThinkingBlock(entry.thinking, 'Think desta saída')}
        ${entry.content ? `<div><div class="message-label">Output</div><pre>${escapeHtml(entry.content)}</pre></div>` : ''}
        ${
          toolCalls.length
            ? `<div class="trace-tool-calls">${toolCalls
                .map(
                  (toolCall) => `
                    <div>
                      <div class="message-label">Tool solicitada: ${escapeHtml(toolCall.name)}</div>
                      <pre>${escapeHtml(JSON.stringify(toolCall.input || {}, null, 2))}</pre>
                    </div>
                  `,
                )
                .join('')}</div>`
            : ''
        }
      </div>
    </details>
  `;
}

function renderToolUse(toolUse, message = null) {
  const result = toolUse.result || {};
  const command = toolUse.input?.command || '';
  const searchResults = toolUse.name === 'web_search' && Array.isArray(result.results) ? result.results : [];
  const genericInput = JSON.stringify(toolUse.input || {}, null, 2);
  const genericResult = JSON.stringify(result || {}, null, 2);
  const nextPending = message?.toolUses?.find((item) => item.status === 'pending_approval');
  const isActivePending = toolUse.status === 'pending_approval' && nextPending?.id === toolUse.id;
  const canCheckRunningTool =
    message?.status === 'running_tools' && ['approved_pending_execution', 'pending_approval'].includes(toolUse.status);
  const decisionBusy = state.toolDecisionInFlight.has(`${message?.id || ''}:${toolUse.id}`);
  const approvalActions =
    isActivePending
      ? `
        <div class="tool-approval-actions">
          <button type="button" class="primary approve-tool" data-message-id="${escapeAttr(message?.id || '')}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${state.busy || decisionBusy ? 'disabled' : ''}>Permitir esta tool</button>
          <button type="button" class="danger-button deny-tool" data-message-id="${escapeAttr(message?.id || '')}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${state.busy || decisionBusy ? 'disabled' : ''}>Negar esta tool</button>
        </div>
      `
      : canCheckRunningTool
        ? `
        <div class="tool-approval-actions">
          <button type="button" class="primary approve-tool" data-message-id="${escapeAttr(message?.id || '')}" data-tool-call-id="${escapeAttr(toolUse.id)}" ${state.busy || decisionBusy ? 'disabled' : ''}>Verificar execução</button>
        </div>
      `
      : toolUse.status === 'pending_approval'
        ? '<p class="help-text">Aguardando decisão da tool anterior.</p>'
      : '';
  return `
    <details class="tool-box" ${isActivePending ? 'open' : ''}>
      <summary class="tool-summary">
        <span>Tool usada: ${escapeHtml(toolUse.name)}</span>
        <span class="tool-state ${toolUseHasFailure(toolUse) ? 'failed' : ''}">${escapeHtml(formatToolUseState(toolUse))}</span>
      </summary>
      <div class="tool-body">
        ${approvalActions}
        ${renderUserMemoryToolCard(toolUse)}
        ${renderChatDocumentToolCard(toolUse)}
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

function formatToolInputSummary(toolUse = {}) {
  const input = toolUse.input || {};
  const parts = [];
  if (toolUse.name === 'run_terminal_command' && input.command) parts.push(input.command);
  if (toolUse.name === 'web_search' && input.query) parts.push(`query: ${input.query}`);
  if (toolUse.name === 'persistent_memory_user') {
    if (input.action) parts.push(`ação: ${input.action}`);
    if (input.fileId) parts.push(`arquivo: ${input.fileId}`);
  }
  if (toolUse.name === 'edit_persistent_memory_user') {
    if (input.fileId) parts.push(`arquivo: ${input.fileId}`);
    if (input.oldText) parts.push(`trocar trecho de ${String(input.oldText).length} caractere(s)`);
  }
  if (toolUse.name === 'chat_document') {
    if (input.action) parts.push(`ação: ${input.action}`);
    if (input.attachmentId || input.fileName) parts.push(`documento: ${input.attachmentId || input.fileName}`);
    if (input.oldText) parts.push(`trocar trecho de ${String(input.oldText).length} caractere(s)`);
  }
  if (!parts.length) {
    try {
      parts.push(JSON.stringify(input));
    } catch {
      parts.push('');
    }
  }
  return compactText(parts.filter(Boolean).join(' · '), 180);
}

function formatToolInputFullSummary(toolUse = {}) {
  try {
    return JSON.stringify(toolUse.input || {}, null, 2);
  } catch {
    return String(toolUse.input || '');
  }
}

function renderToolInputDetails(toolUse = {}) {
  const full = formatToolInputFullSummary(toolUse);
  if (!full || full.length <= 220) return '';
  return `
    <details class="tool-input-details">
      <summary>Ver input completo</summary>
      <pre>${escapeHtml(full)}</pre>
    </details>
  `;
}

function renderUserMemoryChangeChips(message = {}) {
  if (message.role !== 'assistant') return '';
  const edits = (message.toolUses || []).filter((toolUse) => toolUse.name === 'edit_persistent_memory_user' && toolUse.result?.action === 'replace');
  if (!edits.length) return '';
  return `
    <div class="memory-change-chips">
      ${edits
        .slice(0, 3)
        .map((toolUse) => {
          const file = getUserMemoryToolFile(toolUse);
          const knownFile = resolveKnownUserMemoryFile(file.identifier);
          return `
            <div class="memory-change-chip">
              <span>Memória atualizada: ${escapeHtml(file.label || 'arquivo')}</span>
              <button type="button" class="open-user-memory-diff" data-tool-use-id="${escapeAttr(toolUse.id)}">Ver diff</button>
              ${knownFile ? `<button type="button" class="preview-user-memory-file" data-file-id="${escapeAttr(knownFile.id)}">Ver arquivo</button>` : ''}
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderUserMemoryToolCard(toolUse = {}) {
  if (!['persistent_memory_user', 'edit_persistent_memory_user'].includes(toolUse.name)) return '';
  const file = getUserMemoryToolFile(toolUse);
  const isEdit = toolUse.name === 'edit_persistent_memory_user';
  const title = isEdit
    ? toolUse.result?.action === 'replace'
      ? 'Arquivo de memória atualizado'
      : 'Alteração de memória proposta'
    : 'Arquivo de memória consultado';
  const detail = isEdit
    ? 'Veja o diff antes/depois da substituição exata.'
    : getUserMemoryReadRangeLabel(toolUse) || 'Abra a cópia atual salva dentro do My Computer.';
  const buttons = renderUserMemoryToolButtons(toolUse);
  const missingFileNote = file.identifier && !resolveKnownUserMemoryFile(file.identifier)
    ? '<small>Arquivo não encontrado no índice da seção ativa. Ele pode ter sido removido, estar em outra seção ou ter sido informado incorretamente pela IA.</small>'
    : '';
  if (!buttons && !missingFileNote) return '';
  return `
    <div class="user-memory-tool-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(file.label || 'Arquivo de memória')} ${toolUse.input?.reason ? `· ${escapeHtml(toolUse.input.reason)}` : ''}</span>
        <small>${escapeHtml(detail)}</small>
        ${missingFileNote}
      </div>
      <div class="button-row">${buttons}</div>
    </div>
  `;
}

function renderUserMemoryToolButtons(toolUse = {}) {
  const file = getUserMemoryToolFile(toolUse);
  const buttons = [];
  if (toolUse.name === 'edit_persistent_memory_user' && getUserMemoryEditDiffData(toolUse)) {
    buttons.push(`<button type="button" class="open-user-memory-diff" data-tool-use-id="${escapeAttr(toolUse.id)}">Ver diff</button>`);
  }
  const knownFile = resolveKnownUserMemoryFile(file.identifier);
  if (knownFile) {
    buttons.push(`<button type="button" class="preview-user-memory-file" data-file-id="${escapeAttr(knownFile.id)}">Ver arquivo</button>`);
  }
  return buttons.join('');
}

function getUserMemoryToolFile(toolUse = {}) {
  const input = toolUse.input || {};
  const result = toolUse.result || {};
  const file = result.file || {};
  const identifier = input.fileId || file.id || input.fileName || file.name || '';
  const label = input.fileName || file.name || input.fileId || file.id || '';
  return { identifier, label };
}

function getUserMemoryReadRangeLabel(toolUse = {}) {
  if (toolUse.name !== 'persistent_memory_user' || toolUse.result?.action !== 'read') return '';
  const result = toolUse.result || {};
  const offset = Number(result.offset || 0);
  const contentLength = String(result.content || '').length;
  const total = Number(result.totalChars || 0);
  const end = offset + contentLength;
  const range = total ? `Trecho ${offset}-${end} de ${total} caractere(s).` : `Trecho a partir de ${offset}.`;
  return result.truncated ? `${range} Resultado truncado; a IA deve continuar com offset ${result.nextOffset}.` : `${range} Arquivo lido até o fim.`;
}

function resolveKnownUserMemoryFile(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return (
    (state.userMemoryFiles || []).find(
      (file) =>
        file.id === value ||
        file.name === value ||
        file.displayName === value ||
        file.storageName === value ||
        String(file.path || '').split('/').pop() === value,
    ) ||
    null
  );
}

function getUserMemoryEditDiffData(toolUse = {}) {
  if (toolUse.name !== 'edit_persistent_memory_user') return null;
  const input = toolUse.input || {};
  const result = toolUse.result || {};
  const file = getUserMemoryToolFile(toolUse);
  const oldText = input.oldText ?? result.previousContent ?? '';
  const newText = input.newText ?? result.content ?? '';
  if (!String(oldText) && !String(newText)) return null;
  return {
    toolUseId: toolUse.id,
    fileId: file.identifier,
    fileName: file.label,
    reason: input.reason || '',
    oldText: String(oldText),
    newText: String(newText),
  };
}

function renderDocumentChangeChips(message = {}) {
  if (message.role !== 'assistant') return '';
  const edits = (message.toolUses || []).filter((toolUse) => toolUse.name === 'chat_document' && ['replace', 'write'].includes(toolUse.result?.action));
  if (!edits.length) return '';
  return `
    <div class="memory-change-chips">
      ${edits
        .slice(0, 3)
        .map((toolUse) => {
          const file = getChatDocumentToolFile(toolUse);
          const knownAttachment = resolveAvailableAttachment(file.identifier);
          return `
            <div class="memory-change-chip">
              <span>Documento atualizado: ${escapeHtml(file.label || 'arquivo')}</span>
              <button type="button" class="open-attachment-diff" data-tool-use-id="${escapeAttr(toolUse.id)}">Ver diff</button>
              ${knownAttachment ? `<button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(knownAttachment.id)}">Ver arquivo</button>` : ''}
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderChatDocumentToolCard(toolUse = {}) {
  if (toolUse.name !== 'chat_document') return '';
  const action = toolUse.result?.action || toolUse.input?.action || '';
  const file = getChatDocumentToolFile(toolUse);
  const title =
    action === 'replace' || action === 'write'
      ? 'Documento do chat atualizado'
      : action === 'read'
        ? 'Documento do chat consultado'
        : 'Documentos do chat listados';
  const detail =
    action === 'replace' || action === 'write'
      ? 'Veja o diff ou abra a cópia salva neste chat.'
      : getChatDocumentReadRangeLabel(toolUse) || 'Lista arquivos texto anexados ao chat atual.';
  const buttons = renderChatDocumentToolButtons(toolUse);
  if (!buttons && action !== 'read') return '';
  return `
    <div class="user-memory-tool-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(file.label || 'Documento do chat')} ${toolUse.input?.reason ? `· ${escapeHtml(toolUse.input.reason)}` : ''}</span>
        <small>${escapeHtml(detail)}</small>
      </div>
      <div class="button-row">${buttons}</div>
    </div>
  `;
}

function renderChatDocumentToolButtons(toolUse = {}) {
  const file = getChatDocumentToolFile(toolUse);
  const buttons = [];
  if (getChatDocumentEditDiffData(toolUse)) {
    buttons.push(`<button type="button" class="open-attachment-diff" data-tool-use-id="${escapeAttr(toolUse.id)}">Ver diff</button>`);
  }
  const knownAttachment = resolveAvailableAttachment(file.identifier);
  if (knownAttachment) {
    buttons.push(`<button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(knownAttachment.id)}">Ver arquivo</button>`);
  }
  return buttons.join('');
}

function getChatDocumentToolFile(toolUse = {}) {
  const input = toolUse.input || {};
  const result = toolUse.result || {};
  const documentFile = result.document || {};
  const identifier = input.attachmentId || documentFile.id || input.fileName || documentFile.name || '';
  const label = input.fileName || documentFile.name || input.attachmentId || documentFile.id || '';
  return { identifier, label };
}

function getChatDocumentReadRangeLabel(toolUse = {}) {
  if (toolUse.name !== 'chat_document' || toolUse.result?.action !== 'read') return '';
  const result = toolUse.result || {};
  const offset = Number(result.offset || 0);
  const contentLength = String(result.content || '').length;
  const total = Number(result.totalChars || 0);
  const end = offset + contentLength;
  const range = total ? `Trecho ${offset}-${end} de ${total} caractere(s).` : `Trecho a partir de ${offset}.`;
  return result.truncated ? `${range} Resultado truncado; a IA deve continuar com offset ${result.nextOffset}.` : `${range} Arquivo lido até o fim.`;
}

function getChatDocumentEditDiffData(toolUse = {}) {
  if (toolUse.name !== 'chat_document') return null;
  const input = toolUse.input || {};
  const result = toolUse.result || {};
  const action = result.action || input.action;
  if (!['replace', 'write'].includes(action)) return null;
  const file = getChatDocumentToolFile(toolUse);
  const oldText = action === 'replace' ? input.oldText : result.previousContent ?? '';
  const newText = action === 'replace' ? input.newText : input.content ?? result.content ?? '';
  if (!String(oldText) && !String(newText)) return null;
  return {
    toolUseId: toolUse.id,
    attachmentId: file.identifier,
    fileName: file.label,
    reason: input.reason || '',
    oldText: String(oldText),
    newText: String(newText),
  };
}

function toolUseHasFailure(toolUse = {}) {
  const result = toolUse.result || {};
  if (result.error) return true;
  if (result.timedOut || result.signal) return true;
  return typeof result.exitCode === 'number' && result.exitCode !== 0;
}

function formatToolUseState(toolUse = {}) {
  const result = toolUse.result || {};
  if (toolUse.status === 'pending_approval') return 'aguardando aprovação';
  if (result.error) return 'erro';
  if (result.timedOut) return 'timeout';
  if (result.signal) return `signal ${result.signal}`;
  if (typeof result.exitCode === 'number') return `exit ${result.exitCode}`;
  return result.action || result.method || toolUse.status || 'ok';
}

function renderAttachmentCard(attachment, options = {}) {
  if (!attachment) return '';
  attachment = resolveAttachment(attachment.id) || attachment;
  const deleted = Boolean(attachment.deletedAt || attachment.sendMode === 'deleted');
  const chatId = state.activeChat?.id || '';
  const contentUrl = !deleted && chatId ? withProfileQuery(`/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(attachment.id)}/content`) : '';
  const actionLabel = isEditableAttachment(attachment) ? 'Abrir/editar' : 'Visualizar';
  const imagePreview =
    attachment.kind === 'image' && contentUrl
      ? `<img class="attachment-thumb" src="${escapeAttr(contentUrl)}" alt="${escapeAttr(attachment.name)}" />`
      : '';
  const videoPreview =
    attachment.kind === 'video' && contentUrl
      ? `<video class="attachment-video" src="${escapeAttr(contentUrl)}" controls preload="metadata"></video>`
      : '';
  const warning = deleted
    ? { level: 'warning', text: uiText('Anexo removido. A cópia e o conteúdo não serão enviados para a IA.') }
    : getAttachmentWarning(attachment);
  const actions = options.pending
    ? `
      <div class="attachment-actions">
        <button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(attachment.id)}">${escapeHtml(actionLabel)}</button>
        ${attachment.extractedText ? `<button type="button" class="paste-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Colar texto</button>` : ''}
        <button type="button" class="remove-pending-attachment" data-attachment-id="${escapeAttr(attachment.id)}">Remover</button>
      </div>
    `
    : deleted
      ? ''
      : `<div class="attachment-actions"><button type="button" class="preview-attachment" data-attachment-id="${escapeAttr(attachment.id)}">${escapeHtml(actionLabel)}</button></div>`;
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
  const liveEvents = state.activeChatEvents.filter((event) => event.type?.startsWith('tool.') || event.type?.startsWith('chat.context.auto'));
  const latestEvent = liveEvents[0];
  return `
    <article class="message assistant pending">
      <div class="message-label">Assistente</div>
      <div class="bubble">${escapeHtml(state.status || 'Pensando...')}</div>
      ${
        latestEvent
          ? `<div class="live-activity">
              <strong>${escapeHtml(formatLiveEventTitle(latestEvent))}</strong>
              <span>${escapeHtml(formatEventSummary(latestEvent) || latestEvent.type)}</span>
              <small>O histórico completo fica em Ver detalhes quando a resposta terminar.</small>
            </div>`
          : ''
      }
    </article>
  `;
}

function formatLiveEventTitle(event = {}) {
  if (event.type?.startsWith('tool.')) return 'Atividade de tool';
  if (event.type?.startsWith('chat.context.auto')) return 'Contexto sendo organizado';
  return 'Atividade';
}

function renderEvent(event) {
  const details = event.details && Object.keys(event.details || {}).length
    ? `<details class="event-details"><summary>${escapeHtml(formatEventSummary(event)) || 'Detalhes'}</summary><pre>${escapeHtml(JSON.stringify(event.details, null, 2))}</pre></details>`
    : '';
  return `
    <div class="event-item">
      <strong>${escapeHtml(event.type)}</strong><br />
      ${escapeHtml(new Date(event.createdAt).toLocaleString())}
      ${details}
    </div>
  `;
}

function getRelatedEventsForAttempt(selectedAttempt) {
  if (!selectedAttempt || !state.activeChat) return [];
  const sourceUserMessage = getSourceUserMessageForAttempt(selectedAttempt);
  const groupId = getMessageContinuationGroupId(selectedAttempt);
  const sourceUserMessageId = sourceUserMessage?.id || null;
  const startedAt = new Date(sourceUserMessage?.createdAt || selectedAttempt.createdAt).getTime();
  const finishedAt = new Date(
    selectedAttempt.updatedAt ||
      selectedAttempt.completedAt ||
      selectedAttempt.interruptedAt ||
      selectedAttempt.failedAt ||
      selectedAttempt.createdAt,
  ).getTime();
  return (state.activeChatEvents || []).filter((event) => {
    const eventTime = new Date(event.createdAt).getTime();
    if (event.chatId !== state.activeChat?.id) return false;
    const details = event.details || {};
    if (details.messageId === selectedAttempt.id) return true;
    if (sourceUserMessageId && details.messageId === sourceUserMessageId) return true;
    if (details.groupId && details.groupId === groupId) return true;
    if (sourceUserMessageId && details.sourceUserMessageId === sourceUserMessageId) return true;
    if (details.retryOfMessageId === selectedAttempt.id || details.continuedFromMessageId === selectedAttempt.id) return true;
    if (!Number.isFinite(eventTime) || !Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return false;
    return eventTime >= startedAt - 1000 && eventTime <= finishedAt + 3000;
  });
}

function renderMessageDetailsModal() {
  const selectedMessage = state.activeChat?.messages?.find((message) => message.id === state.messageDetailsMessageId);
  if (!selectedMessage || selectedMessage.role !== 'assistant') return '';
  const attempts = getAssistantAttemptsForMessage(selectedMessage);
  const selectedAttempt = attempts.find((attempt) => attempt.id === selectedMessage.id) || attempts[attempts.length - 1] || selectedMessage;
  const sourceUserMessage = getSourceUserMessageForAttempt(selectedAttempt);
  const relatedEvents = getRelatedEventsForAttempt(selectedAttempt);
  const selectedIndex = attempts.findIndex((attempt) => attempt.id === selectedAttempt.id);
  const selectedStatus = renderMessageStatus(selectedAttempt.status) || 'concluído';
  const selectedSources = collectMessageSources(selectedAttempt);
  return `
    <div class="modal-backdrop details-backdrop" role="presentation">
      <section class="modal wide-modal details-modal" role="dialog" aria-modal="true" aria-labelledby="message-details-title">
        <header class="modal-header">
          <div>
            <h2 id="message-details-title">Detalhes da execução</h2>
            <p>${escapeHtml(sourceUserMessage ? sourceUserMessage.content.slice(0, 240) : 'Histórico desta tentativa')}${sourceUserMessage && sourceUserMessage.content.length > 240 ? '…' : ''}</p>
          </div>
          <button type="button" id="close-message-details" aria-label="Fechar">×</button>
        </header>

        <div class="modal-body message-details-layout">
          <aside class="message-details-sidebar">
            <section class="details-panel">
              <h3>Tentativas</h3>
              <div class="attempt-selector-list">
                ${attempts
                  .map(
                    (attempt, index) => `
                      <button type="button" class="attempt-selector ${attempt.id === selectedAttempt.id ? 'active' : ''}" data-message-id="${escapeAttr(attempt.id)}">
                        <strong>${index + 1}/${attempts.length}</strong>
                        <span>${escapeHtml(renderMessageStatus(attempt.status) || 'concluído')} · ${escapeHtml(formatAttemptTraceSummary(attempt))}</span>
                      </button>
                    `,
                  )
                  .join('')}
              </div>
            </section>

            ${sourceUserMessage ? `
              <section class="details-panel">
                <h3>Prompt original</h3>
                <div class="bubble user">${formatContent(sourceUserMessage.content, 'user')}</div>
                ${sourceUserMessage.attachments?.length ? `<div class="message-attachments">${sourceUserMessage.attachments.map((attachment) => renderAttachmentCard(attachment)).join('')}</div>` : ''}
              </section>
            ` : ''}
          </aside>

          <section class="message-details-main">
            <article class="details-panel">
              <div class="message-label">
                <span>Saída selecionada</span>
                <span class="message-attempt">${escapeHtml(String((selectedIndex >= 0 ? selectedIndex + 1 : attempts.length) || 1))}/${escapeHtml(String(Math.max(attempts.length, 1)))}</span>
                ${selectedAttempt.providerUsed ? `<span class="message-model">${escapeHtml(providerLabel(selectedAttempt.providerUsed))}${selectedAttempt.modelUsed ? ` · ${escapeHtml(selectedAttempt.modelUsed)}` : ''}</span>` : ''}
                <span class="message-status ${escapeAttr(selectedAttempt.status || '')}">${escapeHtml(selectedStatus)}</span>
                ${selectedAttempt.finishReason ? `<span class="message-status">${escapeHtml(selectedAttempt.finishReason)}</span>` : ''}
              </div>
              ${renderThinkingBlock(getMessageThinking(selectedAttempt))}
              <div class="bubble assistant details-selected-output ${escapeAttr(selectedAttempt.status || '')}">
                ${renderMessageSources(selectedSources)}
                ${formatContent(getVisibleMessageContent(selectedAttempt, { stripSources: selectedSources.length > 0 }), 'assistant')}
              </div>
              ${selectedAttempt.error ? `<div class="message-error">${escapeHtml(selectedAttempt.error)}</div>` : ''}
              ${renderExecutionHistory(selectedAttempt, { forceOpen: true, title: 'Linha do tempo da tentativa' })}
            </article>

            <article class="details-panel">
              <div class="section-heading">
                <h3>Eventos relacionados</h3>
                <button type="button" id="copy-related-events" class="event-copy-button" ${!relatedEvents.length ? 'disabled' : ''}>Copiar relacionados</button>
              </div>
              <p class="help-text">Os eventos abaixo pertencem a esta tentativa e ao prompt que a originou.</p>
              ${relatedEvents.length ? `<div class="event-list details-event-list">${relatedEvents.map(renderEvent).join('')}</div>` : '<p class="help-text">Nenhum evento relacionado encontrado ainda.</p>'}
            </article>
          </section>
        </div>
      </section>
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

function formatEventSummary(event = {}) {
  const details = event.details || {};
  if (event.type === 'provider.request.started') {
    return [
      details.provider && providerLabel(details.provider),
      details.model,
      details.keyIndex && details.keyCount ? `key ${details.keyIndex}/${details.keyCount}` : '',
      details.modelAttemptIndex && details.modelAttemptCount
        ? `tentativa ${details.modelAttemptIndex}/${details.modelAttemptCount}`
        : details.modelIndex && details.modelCount ? `modelo ${details.modelIndex}/${details.modelCount}` : '',
      details.pass ? `volta ${details.pass}` : '',
    ].filter(Boolean).join(' · ');
  }
  if (event.type === 'provider.route.started') {
    return [
      details.provider && providerLabel(details.provider),
      Array.isArray(details.models) ? `${details.models.length} modelo(s)` : '',
      details.source,
      details.pass ? `volta ${details.pass}` : '',
      details.modelRotationEnabled ? 'rotatória de modelos ligada' : '',
      details.providerRotationEnabled ? 'rotatória de providers ligada' : '',
    ].filter(Boolean).join(' · ');
  }
  if (event.type === 'provider.model_attempt.fallback') {
    return `${details.fromModel || 'modelo'} -> ${details.toModel || 'fallback'}${details.reason ? ` · ${details.reason}` : ''}`;
  }
  if (event.type === 'tool.run_terminal_command.completed') {
    return [
      details.exitCode !== undefined ? `exit ${details.exitCode}` : '',
      details.durationMs !== undefined ? `${details.durationMs}ms` : '',
      details.timedOut ? 'timeout' : '',
      details.stdoutPreview ? 'stdout disponível' : '',
      details.stderrPreview ? 'stderr disponível' : '',
    ].filter(Boolean).join(' · ');
  }
  return formatEventDetails(details);
}

function formatEventDetails(details = {}) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}

function compactText(text, maxLength = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function buildLineDiff(oldText = '', newText = '') {
  const oldLines = String(oldText).split('\n');
  const newLines = String(newText).split('\n');
  if (oldLines.length * newLines.length > 40000) {
    return [
      ...oldLines.map((content, index) => ({ type: 'remove', oldNumber: index + 1, newNumber: null, content })),
      ...newLines.map((content, index) => ({ type: 'add', oldNumber: null, newNumber: index + 1, content })),
    ];
  }

  const dp = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      dp[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? dp[oldIndex + 1][newIndex + 1] + 1
          : Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1]);
    }
  }

  const lines = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({ type: 'context', oldNumber: oldIndex + 1, newNumber: newIndex + 1, content: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (newIndex < newLines.length && (oldIndex === oldLines.length || dp[oldIndex][newIndex + 1] >= dp[oldIndex + 1]?.[newIndex])) {
      lines.push({ type: 'add', oldNumber: null, newNumber: newIndex + 1, content: newLines[newIndex] });
      newIndex += 1;
    } else if (oldIndex < oldLines.length) {
      lines.push({ type: 'remove', oldNumber: oldIndex + 1, newNumber: null, content: oldLines[oldIndex] });
      oldIndex += 1;
    }
  }
  return lines;
}

function renderDiffLine(line = {}) {
  const sign = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
  const content = line.content === '' ? ' ' : line.content;
  return `
    <div class="diff-line ${escapeAttr(line.type || 'context')}" role="row">
      <span class="diff-number">${line.oldNumber || ''}</span>
      <span class="diff-number">${line.newNumber || ''}</span>
      <span class="diff-code"><span class="diff-sign">${escapeHtml(sign)}</span>${escapeHtml(content)}</span>
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

function renderProviderOptions(selectedProvider, options = {}) {
  const providers = options.offlineOnly
    ? (state.providers?.length ? state.providers : [{ id: 'ollama', label: 'Ollama' }]).filter((provider) => provider.id === 'ollama')
    : state.providers?.length
      ? state.providers
      : [{ id: 'groq', label: 'Groq' }];
  return providers
    .map((provider) => {
      const selected = provider.id === selectedProvider ? 'selected' : '';
      return `<option value="${escapeAttr(provider.id)}" ${selected}>${escapeHtml(provider.label)}</option>`;
    })
    .join('');
}

function renderThemeOptions(selectedTheme = 'light') {
  const themes = [
    ['light', 'Claro'],
    ['dark', 'Escuro'],
    ['system', 'Sistema'],
  ];
  return themes
    .map(([value, label]) => {
      const selected = selectedTheme === value ? 'selected' : '';
      return `<option value="${escapeAttr(value)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function renderUiLanguageOptions(selectedLanguage = DEFAULT_UI_LANGUAGE) {
  const languages = [
    ['en-US', 'English'],
    ['pt-BR', 'Português'],
  ];
  return languages
    .map(([value, label]) => {
      const selected = normalizeUiLanguage(selectedLanguage) === value ? 'selected' : '';
      return `<option value="${escapeAttr(value)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function renderModelOptions(providerId, selectedModel) {
  const provider = getProvider(providerId);
  const models = getSelectableModels(providerId);
  const selectableModels = models.length
    ? models
    : [{ id: provider.defaultModel, label: provider.defaultModel, kind: 'Padrão' }];
  const known = new Set(selectableModels.map((model) => model.id));
  const options = selectableModels
    .map((model) => {
      const selected = model.id === selectedModel ? 'selected' : '';
      const installed = provider.id === 'ollama' && model.installed ? '&#10003; ' : '';
      const vision = model.supportsImages ? ` · ${uiText('visão')}` : '';
      const reasoning = model.supportsReasoning ? ` · ${uiText('raciocínio')}` : '';
      return `<option value="${escapeAttr(model.id)}" ${selected}>${installed}${escapeHtml(model.label)} · ${escapeHtml(displayModelKind(model.kind))}${escapeHtml(vision)}${escapeHtml(reasoning)} · ${escapeHtml(model.id)}</option>`;
    })
    .join('');
  const customSelected = selectedModel && !known.has(selectedModel) ? 'selected' : '';
  const customLabel = provider.id === 'ollama' ? uiText('Modelo personalizado ou ainda não instalado') : uiText('Modelo personalizado');
  const customOption = `<option value="${CUSTOM_MODEL_VALUE}" ${customSelected}>${escapeHtml(customLabel)}</option>`;

  return `${options}${customOption}`;
}

function renderModelOptionsWithPlaceholder(providerId, selectedModel, placeholder) {
  const selected = selectedModel ? '' : 'selected';
  return `<option value="" ${selected} disabled>${escapeHtml(placeholder)}</option>${renderModelOptions(providerId, selectedModel)}`;
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
  return Boolean(getSelectableModels(providerId).some((item) => item.id === model));
}

function getSelectableModels(providerId) {
  return (getProvider(providerId).models || []).filter((item) => item.selectable !== false);
}

function modelSupportsImages(providerId, model) {
  const known = getProvider(providerId).models?.find((item) => item.id === model);
  const custom = state.config?.modelCapabilities?.[providerId]?.[model];
  return Boolean(custom?.images ?? known?.supportsImages);
}

function getSearchMode(tools = {}) {
  const mode = String(tools.searchMode || '').trim();
  if (mode === 'off' || mode === 'terminal' || mode === 'both') return mode;
  if (tools.webSearch === false) return 'off';
  if (tools.searchTerminal === true) return 'terminal';
  return 'both';
}

function isOfflineMode(config = {}) {
  return config?.privacy?.offlineMode === true;
}

function normalizeOfflineToolsForClient(tools = {}) {
  const mode = getSearchMode(tools);
  const searchMode = mode === 'both' ? 'off' : mode;
  return {
    ...(tools || {}),
    searchMode,
    webSearch: searchMode !== 'off',
    searchTerminal: searchMode === 'terminal',
  };
}

function normalizeOfflineRoutingForClient() {
  return {
    modelRotationEnabled: false,
    modelFallbacks: [],
    providerRotationEnabled: false,
    maxProviderPasses: 1,
    fallbacks: [],
  };
}

function getModelMetadata(providerId, model) {
  return getProvider(providerId).models?.find((item) => item.id === model) || {};
}

function getModelSettingSupport(providerId, modelId = '') {
  const metadata = getModelMetadata(providerId, modelId);
  const reasoningEfforts = Array.isArray(metadata.reasoningEfforts) ? metadata.reasoningEfforts : null;
  if (providerId === 'anthropic') {
    const samplingAllowed = modelId !== 'claude-opus-4-7';
    return {
      temperature: samplingAllowed,
      topP: samplingAllowed,
      maxTokens: true,
      stop: true,
      penalties: false,
      seed: false,
      reasoningEffort: false,
      reasoningEfforts: null,
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
      reasoningEffort: Boolean(metadata.supportsReasoning),
      reasoningEfforts,
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
      reasoningEffort: Boolean(metadata.supportsReasoning),
      reasoningEfforts,
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
      reasoningEffort: Boolean(metadata.supportsReasoning),
      reasoningEfforts,
    };
  }

  if (providerId === 'openai' || providerId === 'openrouter' || providerId === 'xai') {
    return {
      temperature: true,
      topP: true,
      maxTokens: true,
      stop: true,
      penalties: true,
      seed: true,
      reasoningEffort: Boolean(metadata.supportsReasoning),
      reasoningEfforts,
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
    reasoningEfforts,
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

function getEffectiveChatRuntime(chat = state.activeChat, draft = null) {
  const offlineMode = isOfflineMode(state.config);
  const provider = offlineMode ? 'ollama' : draft?.provider || chat?.provider || state.config.provider;
  const model = offlineMode
    ? draft?.model || (chat?.provider === 'ollama' ? chat?.model : state.config.model) || getProvider('ollama').defaultModel
    : draft?.model || chat?.model || state.config.model || getProvider(provider).defaultModel;
  return { provider, model };
}

function getChatContextDraft(chat = state.activeChat) {
  if (!chat) return { systemPromptExtra: '', memory: '' };
  if (state.chatContextDraft?.chatId === chat.id) return state.chatContextDraft;
  return {
    chatId: chat.id,
    systemPromptExtra: chat.systemPromptExtra || '',
    memory: chat.memory || '',
  };
}

function captureChatContextDraftFromForm() {
  if (!state.activeChat) return state.chatContextDraft;
  const systemPromptExtra =
    document.querySelector('#chat-prompt-modal-input')?.value ??
    state.chatContextDraft?.systemPromptExtra ??
    state.activeChat.systemPromptExtra ??
    '';
  const memory =
    document.querySelector('#chat-memory-modal-input')?.value ??
    state.chatContextDraft?.memory ??
    state.activeChat.memory ??
    '';
  state.chatContextDraft = {
    chatId: state.activeChat.id,
    systemPromptExtra,
    memory,
  };
  return state.chatContextDraft;
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
    const { provider, model } = getEffectiveChatRuntime();
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

function renderUserMemoryFileRows() {
  const files = state.userMemoryFiles || [];
  if (!files.length) {
    return '<p class="empty small-empty">Nenhum arquivo adicional de memória.</p>';
  }
  return files
    .map(
      (file) => {
        const title = file.title && file.title !== file.name ? file.title : '';
        const preview = file.preview && file.preview !== title ? file.preview : '';
        return `
          <div class="user-memory-file-row">
            <div>
              <strong>${escapeHtml(file.displayName || file.name)}</strong>
              ${title ? `<span class="user-memory-file-title">${escapeHtml(title)}</span>` : ''}
              ${preview ? `<span class="user-memory-file-preview">${escapeHtml(preview)}</span>` : ''}
              <small>ID interno: ${escapeHtml(file.id)} · ${formatBytes(file.size)} · ${file.editable ? 'editável' : 'somente leitura'}</small>
            </div>
            <div class="profile-row-actions">
              <button type="button" class="preview-user-memory-file" data-file-id="${escapeAttr(file.id)}" ${state.busy ? 'disabled' : ''}>Ver arquivo</button>
              <button type="button" class="remove-user-memory-file danger-button" data-file-id="${escapeAttr(file.id)}" ${state.busy ? 'disabled' : ''}>Remover</button>
            </div>
          </div>
        `;
      },
    )
    .join('');
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
    pdf: 'application/pdf',
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
  return byExtension[extension] || 'application/octet-stream';
}

function getUserMemoryAccept() {
  return [
    'text/*',
    '.md',
    '.markdown',
    '.txt',
    '.log',
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
    '.ini',
    '.toml',
  ].join(',');
}

function bindAppEvents() {
  document.querySelector('#new-chat').addEventListener('click', createNewChat);
  document.querySelector('#open-settings').addEventListener('click', openSettings);
  document.querySelector('#active-profile-select')?.addEventListener('change', (event) => switchProfile(event.target.value));
  document.querySelector('#quick-create-profile')?.addEventListener('click', createProfileFromPrompt);
  document.querySelector('#chat-search-input')?.addEventListener('input', updateChatSearch);
  document.querySelector('#open-chat-settings-mobile')?.addEventListener('click', openChatSettings);
  document.querySelectorAll('[data-chat-id]').forEach((button) => {
    button.addEventListener('click', () => loadChat(button.dataset.chatId));
  });
  document.querySelector('#composer').addEventListener('submit', sendMessage);
  document.querySelector('#stop-agent')?.addEventListener('click', stopActiveAgent);
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
  document.querySelectorAll('.preview-user-memory-file').forEach((button) => {
    button.addEventListener('click', () => openUserMemoryFileViewer(button.dataset.fileId));
  });
  document.querySelectorAll('.open-user-memory-diff').forEach((button) => {
    button.addEventListener('click', () => openUserMemoryDiff(button.dataset.toolUseId));
  });
  document.querySelectorAll('.open-attachment-diff').forEach((button) => {
    button.addEventListener('click', () => openAttachmentDiff(button.dataset.toolUseId));
  });
  document.querySelector('#user-memory-viewer-form')?.addEventListener('submit', saveUserMemoryViewer);
  document.querySelector('#close-user-memory-viewer')?.addEventListener('click', closeUserMemoryViewer);
  document.querySelector('#cancel-user-memory-viewer')?.addEventListener('click', closeUserMemoryViewer);
  document.querySelector('#close-user-memory-diff')?.addEventListener('click', closeUserMemoryDiff);
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
  document.querySelectorAll('.open-message-details').forEach((button) => {
    button.addEventListener('click', () => openMessageDetails(button.dataset.messageId));
  });
  document.querySelectorAll('.retry-message').forEach((button) => {
    button.addEventListener('click', () => retryMessage(button.dataset.messageId));
  });
  document.querySelectorAll('.continue-message').forEach((button) => {
    button.addEventListener('click', () => continueMessage(button.dataset.messageId));
  });
  document.querySelectorAll('.approve-tool').forEach((button) => {
    button.addEventListener('click', () => decideToolApproval(button.dataset.messageId, 'approve', button.dataset.toolCallId, button));
  });
  document.querySelectorAll('.deny-tool').forEach((button) => {
    button.addEventListener('click', () => decideToolApproval(button.dataset.messageId, 'deny', button.dataset.toolCallId, button));
  });
  document.querySelector('#copy-events')?.addEventListener('click', copyEvents);
  document.querySelector('#copy-related-events')?.addEventListener('click', copyRelatedEvents);
  document.querySelector('#close-message-details')?.addEventListener('click', closeMessageDetails);
  document.querySelectorAll('.attempt-selector').forEach((button) => {
    button.addEventListener('click', () => openMessageDetails(button.dataset.messageId));
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
        renderPreservingVisualState();
      });
    });
    document.querySelector('#default-provider-input').addEventListener('change', changeDefaultProviderDraft);
    document.querySelector('#settings-offline-mode')?.addEventListener('change', toggleSettingsOfflineMode);
    document.querySelector('#default-model-input').addEventListener('change', toggleDefaultCustomModel);
    document.querySelector('#settings-technical-guidance')?.addEventListener('change', () => toggleTechnicalLevelField('settings'));
    document.querySelector('#settings-network-enabled')?.addEventListener('change', () => toggleNetworkPasswordField('settings'));
    document.querySelector('#settings-search-enabled')?.addEventListener('change', () => toggleSearchModeField('settings'));
    document.querySelector('#memory-user-read-toggle')?.addEventListener('change', () => {
      captureSettingsDraftFromForm();
      state.settingsDirty = true;
      renderPreservingVisualState();
    });
    document.querySelector('#memory-user-edit-toggle')?.addEventListener('change', () => {
      captureSettingsDraftFromForm();
      state.settingsDirty = true;
      renderPreservingVisualState();
    });
    document.querySelector('#history-budget-toggle')?.addEventListener('change', () => {
      captureSettingsDraftFromForm();
      state.settingsDirty = true;
      renderPreservingVisualState();
    });
    document.querySelector('#api-provider-input').addEventListener('change', changeApiProviderDraft);
    document.querySelector('#toggle-api-key')?.addEventListener('click', toggleApiKeyVisibility);
    document.querySelector('#add-api-key')?.addEventListener('click', addApiKeyRow);
    document.querySelector('#add-model-fallback')?.addEventListener('click', addModelFallbackRow);
    document.querySelector('#add-provider-fallback')?.addEventListener('click', addProviderFallbackRow);
    document.querySelector('#create-profile')?.addEventListener('click', createProfileFromPrompt);
    document.querySelectorAll('.activate-profile').forEach((button) => {
      button.addEventListener('click', () => switchProfile(button.dataset.profileId));
    });
    document.querySelectorAll('.rename-profile').forEach((button) => {
      button.addEventListener('click', () => renameProfileFromPrompt(button.dataset.profileId));
    });
    document.querySelectorAll('.delete-profile').forEach((button) => {
      button.addEventListener('click', () => deleteProfileFromButton(button.dataset.profileId));
    });
    document.querySelector('#create-scheduled-task')?.addEventListener('click', () => openScheduledTaskEditor('new'));
    document.querySelectorAll('.edit-scheduled-task').forEach((button) => {
      button.addEventListener('click', () => openScheduledTaskEditor(button.dataset.taskId));
    });
    document.querySelectorAll('.delete-scheduled-task').forEach((button) => {
      button.addEventListener('click', () => deleteScheduledTaskFromButton(button.dataset.taskId));
    });
    document.querySelectorAll('.run-scheduled-task').forEach((button) => {
      button.addEventListener('click', () => runScheduledTaskNowFromButton(button.dataset.taskId));
    });
    document.querySelector('#save-scheduled-task')?.addEventListener('click', saveScheduledTaskFromEditor);
    document.querySelector('#cancel-scheduled-task-edit')?.addEventListener('click', closeScheduledTaskEditor);
    document.querySelector('#send-test-email')?.addEventListener('click', sendTestEmail);
    document.querySelector('#sched-task-schedule-type')?.addEventListener('change', toggleScheduledTaskScheduleFields);
    document.querySelector('#sched-task-provider')?.addEventListener('change', (event) => {
      const select = document.getElementById('sched-task-model');
      if (select) select.innerHTML = renderModelOptions(event.target.value, '');
    });
    document.querySelector('#user-memory-file-input')?.addEventListener('change', uploadUserMemoryFiles);
    document.querySelectorAll('.remove-user-memory-file').forEach((button) => {
      button.addEventListener('click', () => deleteUserMemoryFile(button.dataset.fileId));
    });
    document.querySelectorAll('.fallback-provider').forEach((select) => {
      select.addEventListener('change', () => {
        captureSettingsDraftFromForm();
        renderPreservingVisualState();
      });
    });
    document.querySelectorAll('.fallback-model').forEach((select) => {
      select.addEventListener('change', () => {
        captureSettingsDraftFromForm();
        renderPreservingVisualState();
      });
    });
    document.querySelectorAll('.model-fallback-model').forEach((select) => {
      select.addEventListener('change', () => {
        captureSettingsDraftFromForm();
        renderPreservingVisualState();
      });
    });
    document.querySelectorAll('.remove-api-key').forEach((button) => {
      button.addEventListener('click', () => removeApiKeyRow(Number(button.dataset.keyIndex)));
    });
    document.querySelectorAll('.remove-provider-fallback').forEach((button) => {
      button.addEventListener('click', () => removeProviderFallbackRow(Number(button.dataset.fallbackIndex)));
    });
    document.querySelectorAll('.remove-model-fallback').forEach((button) => {
      button.addEventListener('click', () => removeModelFallbackRow(Number(button.dataset.modelFallbackIndex)));
    });
    document.querySelector('#export-data').addEventListener('click', exportData);
    document.querySelector('#import-data').addEventListener('change', importData);
    document.querySelector('#delete-all-chats')?.addEventListener('click', deleteAllChatsWithDoubleConfirm);
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
      renderPreservingVisualState();
    });
    document.querySelector('#confirm-discard')?.addEventListener('click', discardPendingDialog);
    document.querySelector('#confirm-save')?.addEventListener('click', () => saveGeneralSettings(null, { closeAfter: true }));
    document.querySelector('#confirm-send-without-save')?.addEventListener('click', sendPendingMessageWithoutSaving);
    document.querySelector('#confirm-save-send')?.addEventListener('click', saveChatSettingsAndSend);
  }

  document.querySelector('#attachment-viewer-form')?.addEventListener('submit', saveAttachmentViewer);
  document.querySelector('#close-attachment-viewer')?.addEventListener('click', closeAttachmentViewer);
  document.querySelector('#cancel-attachment-viewer')?.addEventListener('click', closeAttachmentViewer);
  document.querySelector('#close-attachment-diff')?.addEventListener('click', closeAttachmentDiff);
  document.querySelector('#close-import-modal')?.addEventListener('click', closeImportModal);
  document.querySelector('#cancel-import-modal')?.addEventListener('click', closeImportModal);
  document.querySelector('#confirm-import-modal')?.addEventListener('click', confirmImportData);

  autoResizeComposer();
}

async function saveSetup(event) {
  event.preventDefault();
  if (state.busy) return;
  captureSetupDraftFromForm(event.currentTarget);
  const draft = state.setupDraft || buildSetupDraft();
  const offlineMode = isOfflineMode(draft);
  const provider = offlineMode ? 'ollama' : draft.provider || 'groq';
  const model = draft.model || getProvider(provider).defaultModel;
  if (draft.server?.networkEnabled && !String(draft.server?.authPassword || '').trim()) {
    state.error = 'Defina uma senha para abrir o painel na rede local.';
    renderPreservingVisualState();
    return;
  }
  const providerInfo = getProvider(provider);
  const providerSettings = draft.providerSettings?.[provider] || {};
  const baseUrl = String(providerSettings.baseUrl || providerInfo.baseUrl || '').trim();
  const apiKeys = (providerSettings.apiKeys || []).filter((item) => String(item.value || item || '').trim());
  if (!baseUrl) {
    state.error = `Defina o endpoint/base URL de ${providerInfo.label}.`;
    state.setupStep = 'provider';
    renderPreservingVisualState();
    return;
  }
  if (providerInfo.requiresApiKey && !apiKeys.length) {
    state.error = `Adicione ao menos uma API key de ${providerInfo.label}.`;
    state.setupStep = 'provider';
    renderPreservingVisualState();
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
        appearance: draft.appearance,
        tools: draft.tools,
        userMemory: draft.userMemory,
        privacy: draft.privacy,
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
  if (state.busy) return;
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
        appearance: state.config.appearance,
        tools: state.config.tools,
        userMemory: state.config.userMemory,
        privacy: state.config.privacy,
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
  renderPreservingVisualState();
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
  const confirmed = confirmUi(`Remover o modelo Ollama "${model}" da máquina?`);
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
  const confirmed = confirmUi('Desinstalar o Ollama do sistema? Pode pedir sudo e falhar pelo navegador se precisar de senha.');
  if (!confirmed) return;
  await runAction('Desinstalando Ollama...', async () => {
    const data = await api('/api/ollama/uninstall', { method: 'POST' });
    state.status = data.message || 'Comando de desinstalação concluído.';
    state.ollamaStatus = await api('/api/ollama/status');
    await refreshBootstrapData();
  });
}

async function switchProfile(profileId) {
  if (!profileId || profileId === state.activeProfile?.id || state.busy) return;
  if ((state.settingsDirty || state.chatSettingsDirty || state.chatContextDirty || state.modelSettingsDirty) && !confirmUi('Trocar de seção e descartar alterações não salvas?')) {
    renderPreservingVisualState();
    return;
  }
  await runAction('Trocando seção...', async () => {
    const data = await api(`/api/profiles/${encodeURIComponent(profileId)}/activate`, { method: 'POST' });
    applyBootstrapData(data);
    state.settingsOpen = false;
    state.settingsDraft = null;
    state.settingsDirty = false;
    state.chatSettingsOpen = false;
    state.chatSettingsDraft = null;
    state.chatSettingsDirty = false;
    state.chatContextOpen = false;
    state.chatContextDirty = false;
    state.modelSettingsOpen = false;
    state.modelSettingsDirty = false;
    state.pendingAttachments = [];
    state.status = `Seção ativa: ${state.activeProfile?.name || profileId}`;
  });
}

async function createProfileFromPrompt() {
  if (state.busy) return;
  const name = promptUi('Nome da nova seção/usuário:', 'Nova seção');
  if (!name?.trim()) return;
  await runAction('Criando seção...', async () => {
    const data = await api('/api/profiles', {
      method: 'POST',
      body: { name: name.trim() },
    });
    applyBootstrapData(data);
    state.settingsOpen = false;
    state.settingsDraft = null;
    state.settingsDirty = false;
    state.status = `Seção criada: ${state.activeProfile?.name || name.trim()}`;
  });
}

async function renameProfileFromPrompt(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  const name = promptUi('Novo nome da seção:', profile.name || profile.id);
  if (!name?.trim()) return;
  await runAction('Renomeando seção...', async () => {
    const data = await api(`/api/profiles/${encodeURIComponent(profileId)}`, {
      method: 'PUT',
      body: { name: name.trim() },
    });
    state.profiles = data.profiles || state.profiles;
    state.activeProfile = data.activeProfile || state.activeProfile;
    state.runtimeHome = data.runtimeHome || state.runtimeHome;
  });
}

async function deleteProfileFromButton(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  const confirmed = confirmUi(`Apagar a seção "${profile.name}" e todos os seus chats, configurações e memórias?`);
  if (!confirmed) return;
  await runAction('Apagando seção...', async () => {
    const data = await api(`/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
    applyBootstrapData(data);
    state.settingsOpen = false;
    state.settingsDraft = null;
    state.settingsDirty = false;
  });
}

function openScheduledTaskEditor(id) {
  if (state.busy) return;
  state.scheduledTaskEditorId = id;
  renderPreservingVisualState();
}

function closeScheduledTaskEditor() {
  state.scheduledTaskEditorId = null;
  renderPreservingVisualState();
}

function toggleScheduledTaskScheduleFields() {
  const type = document.getElementById('sched-task-schedule-type')?.value;
  const time = document.getElementById('sched-task-time-fields');
  const weekday = document.getElementById('sched-task-weekday-fields');
  const month = document.getElementById('sched-task-month-fields');
  const interval = document.getElementById('sched-task-interval-fields');
  if (time) time.style.display = type === 'interval' ? 'none' : '';
  if (weekday) weekday.style.display = type === 'weekly' ? '' : 'none';
  if (month) month.style.display = type === 'monthly' ? '' : 'none';
  if (interval) interval.style.display = type === 'interval' ? '' : 'none';
}

function readScheduledTaskFormValues() {
  const scheduleType = document.getElementById('sched-task-schedule-type')?.value || 'daily';
  const [hour, minute] = (document.getElementById('sched-task-time')?.value || '09:00').split(':').map(Number);
  const timezone = document.getElementById('sched-task-timezone')?.value || 'UTC';
  let schedule;
  if (scheduleType === 'interval') {
    schedule = { type: 'interval', everyHours: Number(document.getElementById('sched-task-every-hours')?.value || 6) };
  } else if (scheduleType === 'weekly') {
    schedule = {
      type: 'weekly',
      daysOfWeek: Array.from(document.querySelectorAll('.sched-task-weekday-checkbox:checked')).map((el) => Number(el.value)),
      hour,
      minute,
      timezone,
    };
  } else if (scheduleType === 'monthly') {
    schedule = {
      type: 'monthly',
      dayOfMonth: Number(document.getElementById('sched-task-day-of-month')?.value || 1),
      hour,
      minute,
      timezone,
    };
  } else {
    schedule = { type: 'daily', hour, minute, timezone };
  }
  const allowedTools = Array.from(document.querySelectorAll('.sched-task-tool-checkbox:checked')).map((el) => el.value);
  return {
    name: document.getElementById('sched-task-name')?.value || 'Tarefa agendada',
    enabled: document.getElementById('sched-task-enabled')?.checked !== false,
    prompt: document.getElementById('sched-task-prompt')?.value || '',
    systemPrompt: document.getElementById('sched-task-system-prompt')?.value || '',
    provider: document.getElementById('sched-task-provider')?.value,
    model: document.getElementById('sched-task-model')?.value,
    schedule,
    allowedTools,
    reuseChat: document.getElementById('sched-task-reuse-chat')?.checked !== false,
    skipMemoryInPrompt: document.getElementById('sched-task-skip-memory')?.checked !== false,
  };
}

async function saveScheduledTaskFromEditor() {
  if (state.busy) return;
  const editingId = state.scheduledTaskEditorId;
  if (!editingId) return;
  const payload = readScheduledTaskFormValues();
  await runAction(editingId === 'new' ? 'Criando tarefa agendada...' : 'Salvando tarefa agendada...', async () => {
    const data =
      editingId === 'new'
        ? await api('/api/scheduled-tasks', { method: 'POST', body: payload })
        : await api(`/api/scheduled-tasks/${encodeURIComponent(editingId)}`, { method: 'PUT', body: payload });
    state.scheduledTasks = data.scheduledTasks || state.scheduledTasks;
    state.scheduledTaskEditorId = null;
    state.status = 'Tarefa agendada salva.';
  });
}

async function deleteScheduledTaskFromButton(taskId) {
  if (state.busy) return;
  const task = (state.scheduledTasks || []).find((item) => item.id === taskId);
  if (!task) return;
  const confirmed = confirmUi(`Apagar a tarefa agendada "${task.name}"?`);
  if (!confirmed) return;
  await runAction('Apagando tarefa agendada...', async () => {
    const data = await api(`/api/scheduled-tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    state.scheduledTasks = data.scheduledTasks || state.scheduledTasks;
    if (state.scheduledTaskEditorId === taskId) state.scheduledTaskEditorId = null;
  });
}

async function runScheduledTaskNowFromButton(taskId) {
  if (state.busy) return;
  await runAction('Executando tarefa agora...', async () => {
    const data = await api(`/api/scheduled-tasks/${encodeURIComponent(taskId)}/run`, { method: 'POST' });
    state.scheduledTasks = data.scheduledTasks || state.scheduledTasks;
    state.status = data.started === false ? 'Tarefa já estava em execução.' : 'Tarefa executada agora.';
  });
}

async function sendTestEmail() {
  if (state.busy) return;
  const resendApiKey = document.querySelector('[name="emailResendApiKey"]')?.value || '';
  const destinationEmail = document.querySelector('[name="emailDestination"]')?.value || '';
  const enabled = document.querySelector('[name="emailEnabled"]')?.checked === true;
  await runAction('Enviando email de teste...', async () => {
    await api('/api/email/test', { method: 'POST', body: { resendApiKey, destinationEmail, enabled } });
    state.status = 'Email de teste enviado.';
  });
}

async function uploadUserMemoryFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length || state.busy) return;
  for (const file of files) {
    await runAction(`Adicionando ${file.name} à memória...`, async () => {
      const dataBase64 = await fileToBase64(file);
      const data = await api('/api/persistent-memory-user', {
        method: 'POST',
        body: {
          name: file.name,
          mimeType: file.type || guessMimeType(file.name),
          size: file.size,
          dataBase64,
        },
      });
      state.userMemoryFiles = data.files || state.userMemoryFiles;
      if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
    });
  }
}

async function deleteUserMemoryFile(fileId) {
  const file = state.userMemoryFiles.find((item) => item.id === fileId);
  if (!file) return;
  const confirmed = confirmUi(`Remover "${file.name}" dos arquivos de memória persistente?`);
  if (!confirmed) return;
  await runAction('Removendo arquivo de memória...', async () => {
    const data = await api(`/api/persistent-memory-user/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    state.userMemoryFiles = data.files || [];
  });
}

async function uploadSelectedFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length || state.busy) return;
  if (!state.activeChat) {
    const draftContent = document.querySelector('#composer textarea')?.value || getComposerDraft();
    try {
      await ensureActiveChat({ draftContent, status: 'Criando chat para anexos...' });
    } catch (error) {
      state.error = error.message;
      renderPreservingVisualState();
      return;
    }
  }
  if (!state.activeChat) return;

  for (const file of files) {
    if (!isSupportedUpload(file)) {
      state.error = `Formato ainda não compatível: ${file.name}. Envie imagens, vídeo, áudio, PDF, texto, código, JSON, CSV, HTML, XML, YAML ou Markdown.`;
      renderPreservingVisualState();
      continue;
    }
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      state.error = `${file.name} é grande demais (${formatBytes(file.size)}). Limite atual: ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)} por arquivo.`;
      renderPreservingVisualState();
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

async function openAttachmentViewer(attachmentId) {
  const attachment = resolveAttachment(attachmentId);
  if (!attachment) return;
  if (isDeletedAttachment(attachment)) {
    state.error = 'Anexo removido. A cópia e o conteúdo não serão enviados para a IA.';
    state.attachmentDiff = null;
    state.attachmentViewer = null;
    renderPreservingVisualState();
    return;
  }
  state.attachmentDiff = null;
  state.attachmentViewer = {
    ...attachment,
    viewerLoading: isEditableAttachment(attachment),
  };
  renderPreservingVisualState();
  if (!isEditableAttachment(attachment) || !state.activeChat?.id) return;
  try {
    const data = await api(`/api/chats/${encodeURIComponent(state.activeChat.id)}/attachments/${encodeURIComponent(attachment.id)}/text`);
    if (state.attachmentViewer?.id !== attachment.id) return;
    state.attachmentViewer = {
      ...data.attachment,
      content: data.content || '',
      draftContent: data.content || '',
      viewerLoading: false,
    };
    updateAttachmentEverywhere(data.attachment);
    renderPreservingVisualState();
  } catch (error) {
    if (state.attachmentViewer?.id === attachment.id) {
      state.attachmentViewer = {
        ...state.attachmentViewer,
        content: state.attachmentViewer.extractedText || state.attachmentViewer.previewText || '',
        draftContent: state.attachmentViewer.extractedText || state.attachmentViewer.previewText || '',
        viewerLoading: false,
      };
    }
    state.error = error.message || 'Falha ao carregar documento.';
    renderPreservingVisualState();
  }
}

function closeAttachmentViewer() {
  if (hasAttachmentViewerUnsavedChanges()) {
    const confirmed = confirmUi('Descartar alterações não salvas neste documento?');
    if (!confirmed) return;
  }
  state.attachmentViewer = null;
  renderPreservingVisualState();
}

function hasAttachmentViewerUnsavedChanges() {
  const textarea = document.querySelector('#attachment-viewer-input');
  if (!state.attachmentViewer || !textarea || state.attachmentViewer.viewerLoading) return false;
  return textarea.value !== String(state.attachmentViewer.content || '');
}

async function saveAttachmentViewer(event) {
  event.preventDefault();
  const attachment = state.attachmentViewer;
  const textarea = document.querySelector('#attachment-viewer-input');
  if (!attachment || !textarea || state.busy || !state.activeChat?.id) return;
  const nextContent = textarea.value;
  state.attachmentViewer = {
    ...attachment,
    draftContent: nextContent,
    viewerLoading: false,
  };
  await runAction('Salvando documento...', async () => {
    const data = await api(`/api/chats/${encodeURIComponent(state.activeChat.id)}/attachments/${encodeURIComponent(attachment.id)}/text`, {
      method: 'PUT',
      body: { content: nextContent },
    });
    state.activeChat = data.chat || state.activeChat;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    updateAttachmentEverywhere(data.attachment);
    state.attachmentViewer = {
      ...data.attachment,
      content: data.content || '',
      draftContent: data.content || '',
      viewerLoading: false,
    };
    state.status = `Documento "${data.attachment?.name || attachment.name}" salvo.`;
  });
}

function closeAttachmentDiff() {
  state.attachmentDiff = null;
  renderPreservingVisualState();
}

function resolveAttachment(attachmentId) {
  const value = String(attachmentId || '').trim();
  if (!value) return null;
  return (
    state.pendingAttachments.find((item) => item.id === value || item.name === value) ||
    state.activeChat?.attachments?.find((item) => item.id === value || item.name === value) ||
    state.activeChat?.messages?.flatMap((message) => message.attachments || []).find((item) => item.id === value || item.name === value) ||
    null
  );
}

function resolveAvailableAttachment(attachmentId) {
  const attachment = resolveAttachment(attachmentId);
  return attachment && !isDeletedAttachment(attachment) ? attachment : null;
}

function isDeletedAttachment(attachment = {}) {
  return Boolean(attachment?.deletedAt || attachment?.sendMode === 'deleted');
}

function updateAttachmentEverywhere(updatedAttachment) {
  if (!updatedAttachment?.id) return;
  const replace = (attachment) => (attachment?.id === updatedAttachment.id ? { ...attachment, ...updatedAttachment } : attachment);
  state.pendingAttachments = (state.pendingAttachments || []).map(replace);
  if (state.activeChat) {
    state.activeChat.attachments = (state.activeChat.attachments || []).map(replace);
    state.activeChat.messages = (state.activeChat.messages || []).map((message) => ({
      ...message,
      attachments: (message.attachments || []).map(replace),
    }));
  }
}

function isEditableAttachment(attachment = {}) {
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const name = String(attachment.name || '').toLowerCase();
  return (
    attachment.kind === 'text' ||
    mimeType.startsWith('text/') ||
    /\.(md|markdown|txt|json|jsonl|csv|tsv|html?|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|css|py|rb|go|rs|java|c|cpp|h|hpp|sh|sql|log|ini|toml)$/i.test(name) ||
    ['application/json', 'application/xml', 'application/x-yaml'].includes(mimeType)
  );
}

async function openUserMemoryFileViewer(fileId) {
  if (!fileId || state.busy) return;
  await runAction('Carregando arquivo de memória...', async () => {
    const data = await api(`/api/persistent-memory-user/${encodeURIComponent(fileId)}`);
    state.userMemoryViewer = data.file;
  });
}

function hasUserMemoryViewerUnsavedChanges() {
  const textarea = document.querySelector('#user-memory-viewer-input');
  if (!state.userMemoryViewer || !textarea) return false;
  return textarea.value !== String(state.userMemoryViewer.content || '');
}

async function saveUserMemoryViewer(event) {
  event.preventDefault();
  const file = state.userMemoryViewer;
  const textarea = document.querySelector('#user-memory-viewer-input');
  if (!file || !textarea || state.busy) return;
  await runAction('Salvando arquivo de memória...', async () => {
    const data = await api(`/api/persistent-memory-user/${encodeURIComponent(file.id)}`, {
      method: 'PUT',
      body: { content: textarea.value },
    });
    state.userMemoryViewer = data.file;
    state.userMemoryFiles = data.files || state.userMemoryFiles || [];
    state.status = `Arquivo "${data.file?.name || file.name}" salvo.`;
  });
}

function closeUserMemoryViewer() {
  if (hasUserMemoryViewerUnsavedChanges()) {
    const confirmed = confirmUi('Descartar alterações não salvas neste arquivo de memória?');
    if (!confirmed) return;
  }
  state.userMemoryViewer = null;
  renderPreservingVisualState();
}

function openUserMemoryDiff(toolUseId) {
  const toolUse = findToolUseById(toolUseId);
  const diff = getUserMemoryEditDiffData(toolUse);
  if (!diff) {
    state.error = 'Diff da edição de memória não encontrado.';
    renderPreservingVisualState();
    return;
  }
  state.userMemoryDiff = diff;
  renderPreservingVisualState();
}

function openAttachmentDiff(toolUseId) {
  const toolUse = findToolUseById(toolUseId);
  const diff = getChatDocumentEditDiffData(toolUse);
  if (!diff) {
    state.error = 'Diff da edição de documento não encontrado.';
    renderPreservingVisualState();
    return;
  }
  state.attachmentDiff = diff;
  renderPreservingVisualState();
}

function closeUserMemoryDiff() {
  state.userMemoryDiff = null;
  renderPreservingVisualState();
}

function findToolUseById(toolUseId) {
  const id = String(toolUseId || '');
  if (!id) return null;
  const messages = state.activeChat?.messages || [];
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (const toolUse of message.toolUses || []) {
      if (toolUse.id === id) return toolUse;
    }
    for (const entry of message.executionTrace || []) {
      if (entry.toolUse?.id === id) return entry.toolUse;
    }
  }
  return null;
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

async function removePendingAttachment(attachmentId) {
  const attachment = state.pendingAttachments.find((item) => item.id === attachmentId);
  if (!attachment) return;
  if (!state.activeChat?.id) {
    state.pendingAttachments = state.pendingAttachments.filter((item) => item.id !== attachmentId);
    renderPreservingVisualState();
    return;
  }
  await runAction('Removendo anexo...', async () => {
    const data = await api(`/api/chats/${encodeURIComponent(state.activeChat.id)}/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
    });
    state.pendingAttachments = state.pendingAttachments.filter((item) => item.id !== attachmentId);
    state.activeChat = data.chat || state.activeChat;
    state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    state.status = `Anexo "${attachment.name}" removido.`;
  });
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
  renderPreservingVisualState();
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
  if (isOfflineMode(state.settingsDraft.config)) {
    state.settingsDraft.config.provider = 'ollama';
    state.settingsDraft.config.model = getProvider('ollama').defaultModel;
    state.settingsProvider = 'ollama';
    state.settingsDirty = true;
    renderPreservingVisualState();
    return;
  }
  state.settingsDraft.config = {
    ...state.settingsDraft.config,
    provider: event.target.value,
    model: getProvider(event.target.value).defaultModel,
  };
  state.settingsProvider = event.target.value;
  state.settingsDirty = true;
  renderPreservingVisualState();
}

function toggleSettingsOfflineMode(event) {
  captureSettingsDraftFromForm();
  if (!state.settingsDraft) state.settingsDraft = buildSettingsDraft();
  const enabled = event.target.checked;
  const draftConfig = state.settingsDraft.config;
  draftConfig.privacy = {
    ...(draftConfig.privacy || {}),
    offlineMode: enabled,
  };
  if (enabled) {
    draftConfig.provider = 'ollama';
    draftConfig.model = getProvider('ollama').defaultModel;
    draftConfig.tools = normalizeOfflineToolsForClient(draftConfig.tools || {});
    draftConfig.routing = normalizeOfflineRoutingForClient();
    state.settingsProvider = 'ollama';
  }
  state.settingsDirty = true;
  renderPreservingVisualState();
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
  captureSettingsDraftFromForm();
  state.settingsProvider = isOfflineMode(state.settingsDraft?.config) ? 'ollama' : event.target.value;
  renderPreservingVisualState();
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
  renderPreservingVisualState();
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
  renderPreservingVisualState();
}

async function createNewChat() {
  if (!canLeaveActiveChatDraft()) return;
  await runAction('Criando chat...', async () => {
    const data = await api('/api/chats', { method: 'POST' });
    applyCreatedChat(data);
  });
}

async function ensureActiveChat(options = {}) {
  if (state.activeChat?.id) return state.activeChat;
  const draftId = getCurrentComposerDraftId();
  const previousBusy = state.busy;
  state.busy = true;
  state.status = options.status || 'Criando chat...';
  renderPreservingVisualState();
  try {
    const data = await api('/api/chats', { method: 'POST' });
    applyCreatedChat(data);
    if (options.draftContent) {
      setComposerDraft(state.activeChat.id, options.draftContent);
      clearComposerDraft(draftId);
    }
  } finally {
    state.busy = previousBusy;
  }
  renderPreservingVisualState();
  return state.activeChat;
}

function applyCreatedChat(data = {}) {
  state.chats = data.chats || state.chats;
  state.activeChat = data.chat || state.activeChat;
  state.chatSearch = '';
  state.activeChatEvents = [];
  state.messageDetailsOpen = false;
  state.messageDetailsMessageId = null;
  state.chatSettingsDraft = null;
  state.chatSettingsDirty = false;
}

async function loadChat(chatId) {
  if (state.activeChat?.id === chatId) return;
  if (!canLeaveActiveChatDraft()) return;
  await runAction('Abrindo chat...', async () => {
    const data = await api(`/api/chats/${chatId}`);
    state.activeChat = data.chat;
    state.activeChatEvents = data.activeChatEvents || [];
    state.messageDetailsOpen = false;
    state.messageDetailsMessageId = null;
    state.chatSettingsDraft = null;
    state.chatSettingsDirty = false;
  });
}

function canLeaveActiveChatDraft() {
  if (!state.chatSettingsDirty && !state.chatContextDirty && !state.modelSettingsDirty) return true;
  const confirmed = confirmUi('Descartar alterações não salvas neste chat?');
  if (!confirmed) return false;
  state.chatSettingsDraft = null;
  state.chatSettingsDirty = false;
  state.chatContextDirty = false;
  state.chatContextDraft = null;
  state.chatContextOpen = false;
  state.modelSettingsDirty = false;
  state.modelSettingsOpen = false;
  return true;
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.busy) return;
  const textarea = event.currentTarget.elements.content;
  const content = textarea.value.trim();
  if (!content && !state.pendingAttachments.length) return;
  if (!state.activeChat) {
    try {
      await ensureActiveChat({ draftContent: content, status: 'Criando primeiro chat...' });
    } catch (error) {
      state.error = error.message;
      renderPreservingVisualState();
      return;
    }
  }
  if (state.chatSettingsDirty || state.chatContextDirty || state.modelSettingsDirty) {
    saveComposerDraft();
    state.confirmDialog = { type: 'send-chat-settings' };
    renderPreservingVisualState();
    return;
  }
  await sendMessageFromValues(document.querySelector('#composer textarea') || textarea, content);
}

async function sendMessageFromComposerDraft() {
  const textarea = document.querySelector('#composer textarea');
  const content = (textarea?.value || getComposerDraft(state.activeChat?.id)).trim();
  if (!content && !state.pendingAttachments.length) return;
  if (!state.activeChat) {
    try {
      await ensureActiveChat({ draftContent: content, status: 'Criando primeiro chat...' });
    } catch (error) {
      state.error = error.message;
      renderPreservingVisualState();
      return;
    }
  }
  await sendMessageFromValues(document.querySelector('#composer textarea') || textarea, content);
}

async function sendMessageFromValues(textarea, content) {
  if (!state.activeChat) return;
  const chatId = state.activeChat?.id;
  if (chatHasActiveToolApproval(state.activeChat)) {
    state.error = 'Aprove ou negue a tool pendente antes de enviar outra mensagem neste chat.';
    renderPreservingVisualState();
    return;
  }
  if (state.pendingAttachments.length > 8) {
    state.error = 'Envie no máximo 8 anexos por mensagem neste MVP.';
    renderPreservingVisualState();
    return;
  }
  const { provider: activeProvider, model: activeModel } = getEffectiveChatRuntime();
  const activeModelMetadata = getModelMetadata(activeProvider, activeModel);
  const unsupportedImage = state.pendingAttachments.find(
    (attachment) =>
      attachment.kind === 'image' &&
      !modelSupportsImages(activeProvider, activeModel),
  );
  if (unsupportedImage) {
    state.error = `O modelo atual não aceita imagens: ${unsupportedImage.name}. Troque para um modelo vision ou marque o modelo personalizado como compatível.`;
    renderPreservingVisualState();
    return;
  }
  const imageAttachments = state.pendingAttachments.filter((attachment) => attachment.kind === 'image');
  if (activeModelMetadata.maxInputImages && imageAttachments.length > activeModelMetadata.maxInputImages) {
    state.error = `O modelo atual aceita até ${activeModelMetadata.maxInputImages} imagem(ns) por mensagem.`;
    renderPreservingVisualState();
    return;
  }
  const oversizedImage = imageAttachments.find(
    (attachment) =>
      activeModelMetadata.maxFileSizeMB && attachment.size > activeModelMetadata.maxFileSizeMB * 1024 * 1024,
  );
  if (oversizedImage) {
    state.error = `${oversizedImage.name} excede o limite de ${activeModelMetadata.maxFileSizeMB} MB deste modelo.`;
    renderPreservingVisualState();
    return;
  }
  if (textarea) textarea.value = '';
  clearComposerDraft(chatId);
  autoResizeComposer();
  const attachments = state.pendingAttachments;
  state.pendingAttachments = [];
  const sendResult = await sendMessageContent(content || 'Analise os anexos enviados.', { attachments });
  if (state.error && !sendResult?.messageAccepted && state.activeChat?.id === chatId) {
    state.pendingAttachments = attachments;
    setComposerDraft(chatId, content);
    state.lastFailedAction = () => sendMessageFromComposerDraft();
    renderPreservingVisualState();
    autoResizeComposer();
  }
}

async function sendMessageContent(content, options = {}) {
  if (state.busy) return { messageAccepted: false };
  if (chatHasActiveToolApproval(state.activeChat)) {
    state.error = 'Aprove ou negue a tool pendente antes de enviar outra mensagem neste chat.';
    renderPreservingVisualState();
    return { messageAccepted: false };
  }
  const chatId = state.activeChat.id;
  const attachments = options.attachments || [];
  const isContinuationRequest = Boolean(options.retryMessageId || options.continueMessageId);
  let messageAccepted = false;
  if (!isContinuationRequest) {
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
  renderPreservingVisualState();
  scrollMessagesToBottom();

  state.activeAgentChatId = chatId;
  state.stopInFlight = false;
  await runAction(
    `Enviando para ${providerLabel(getEffectiveChatRuntime().provider)}...`,
    async () => {
      startEventPolling(chatId);
      let data;
      try {
        data = await api(`/api/chats/${chatId}/messages`, {
          method: 'POST',
          body: {
            content,
            retryMessageId: options.retryMessageId,
            continueMessageId: options.continueMessageId,
            attachmentIds: attachments.map((attachment) => attachment.id),
          },
        });
        messageAccepted = true;
      } finally {
        stopEventPolling();
      }
      state.activeChat = data.chat;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
      const latestMessage = state.activeChat?.messages?.[Math.max(0, (state.activeChat?.messages?.length || 1) - 1)];
      if (messageHasCompletedUserMemoryEdit(latestMessage)) await refreshUserMemoryFiles();
      const fresh = await api('/api/chats');
      state.chats = fresh.chats;
      if (data.assistantStatus === 'failed') {
        state.status = 'A IA falhou antes de concluir. Use Tentar novamente ou Continuar.';
      } else if (data.assistantStatus === 'incomplete') {
        state.status = 'A IA parou antes do final. Use Continuar para retomar.';
      } else if (data.awaitingApproval) {
        state.status = 'A IA pediu aprovação de tool.';
      } else {
        state.status = 'Resposta recebida.';
      }
    },
    () => sendMessageContent(content, options),
  );
  if (state.activeAgentChatId === chatId) state.activeAgentChatId = null;
  state.stopInFlight = false;
  if (!state.error && state.activeChat?.id === chatId) {
    scrollMessagesToBottom();
  }
  if (state.error && state.activeChat?.id === chatId) {
    if (messageAccepted) {
      state.lastFailedAction = () => refreshChatAfterAcceptedMessage(chatId);
    }
    try {
      await refreshActiveChatData();
    } catch {
      // The retry action can refresh again; preserve the original request outcome.
    }
    renderPreservingVisualState();
  }
  return { messageAccepted };
}

async function stopActiveAgent() {
  const chatId = state.activeAgentChatId || state.activeChat?.id;
  if (!chatId || state.stopInFlight) return;
  state.stopInFlight = true;
  state.status = 'Interrompendo agente...';
  renderPreservingVisualState();
  try {
    const data = await api(`/api/chats/${chatId}/stop`, {
      method: 'POST',
      body: { reason: 'user_requested' },
    });
    if (state.activeChat?.id === chatId) {
      state.activeChat = data.chat || state.activeChat;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
    }
    state.status = data.stopped
      ? data.settled
        ? 'Execução interrompida.'
        : 'Interrupção solicitada. Salvando tentativa interrompida...'
      : data.message || 'Nenhuma execução em andamento.';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.stopInFlight = false;
    renderPreservingVisualState();
  }
}

async function decideToolApproval(messageId, decision, toolCallId = null, button = null) {
  if (state.busy) return;
  const decisionKey = `${messageId}:${toolCallId || 'next'}`;
  if (state.toolDecisionInFlight.has(decisionKey)) return;
  state.toolDecisionInFlight.add(decisionKey);
  button?.closest('.tool-approval-actions')?.querySelectorAll('button').forEach((item) => {
    item.disabled = true;
  });
  try {
    const chatId = state.activeChat?.id;
    state.activeAgentChatId = chatId;
    state.stopInFlight = false;
    await runAction(decision === 'approve' ? 'Executando tool aprovada...' : 'Negando tool...', async () => {
      startEventPolling(chatId);
      let data;
      try {
        data = await api(`/api/chats/${chatId}/tool-approvals/${messageId}`, {
          method: 'POST',
          body: { decision, toolCallId },
        });
      } finally {
        stopEventPolling();
      }
      state.activeChat = data.chat;
      state.chats = data.chats || state.chats;
      state.activeChatEvents = data.activeChatEvents || state.activeChatEvents;
      const updatedMessage = state.activeChat?.messages?.find((message) => message.id === messageId);
      if (messageHasCompletedUserMemoryEdit(updatedMessage)) await refreshUserMemoryFiles();
      if (updatedMessage?.status === 'failed') {
        state.status = 'A tool aprovada falhou antes de concluir.';
      } else if (updatedMessage?.status === 'incomplete') {
        state.status = 'A tool aprovada parou antes do final. Use Continuar.';
      } else if (updatedMessage?.status === 'sent') {
        state.status = 'A tool aprovada foi concluída.';
      } else if (updatedMessage?.status === 'running_tools') {
        state.status = 'A tool ainda está em execução.';
      }
    });
    if (state.activeAgentChatId === chatId) state.activeAgentChatId = null;
    state.stopInFlight = false;
  } finally {
    state.toolDecisionInFlight.delete(decisionKey);
  }
}

async function refreshChatAfterAcceptedMessage(chatId) {
  await runAction('Atualizando chat...', async () => {
    if (state.activeChat?.id === chatId) {
      await refreshActiveChatData();
    }
    const fresh = await api('/api/chats');
    state.chats = fresh.chats;
  });
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
  const draftId = chatId || getCurrentComposerDraftId();
  if (!draftId) return '';
  return localStorage.getItem(getComposerDraftKey(draftId)) || '';
}

function saveComposerDraft() {
  const textarea = document.querySelector('#composer textarea');
  const draftId = getCurrentComposerDraftId();
  if (!textarea || !draftId) return;
  localStorage.setItem(getComposerDraftKey(draftId), textarea.value);
}

function clearComposerDraft(chatId) {
  if (!chatId) return;
  localStorage.removeItem(getComposerDraftKey(chatId));
}

function setComposerDraft(chatId, content) {
  if (!chatId) return;
  localStorage.setItem(getComposerDraftKey(chatId), content);
}

function getComposerDraftKey(chatId) {
  return `my-computer:draft:${chatId}`;
}

function getCurrentComposerDraftId() {
  return state.activeChat?.id || `new:${state.activeProfile?.id || 'default'}`;
}

async function retryLastAction() {
  if (state.busy) return;
  if (!state.lastFailedAction) return;
  const retry = state.lastFailedAction;
  state.lastFailedAction = null;
  await retry();
}

async function retryMessage(messageId) {
  if (state.busy) return;
  const message = state.activeChat?.messages?.find((item) => item.id === messageId);
  if (!message) return;
  if (message.role === 'assistant' && !isLatestAssistantAttempt(message)) return;
  await sendMessageContent('', { retryMessageId: message.id });
}

async function continueMessage(messageId) {
  if (state.busy) return;
  const message = state.activeChat?.messages?.find((item) => item.id === messageId);
  if (!message) return;
  if (message.role !== 'assistant') return;
  if (!isLatestAssistantAttempt(message)) return;
  await sendMessageContent('', { continueMessageId: message.id });
}

async function copyMessage(messageId) {
  const message = state.activeChat?.messages?.find((item) => item.id === messageId);
  if (!message) return;
  try {
    await navigator.clipboard.writeText(getVisibleMessageContent(message));
    state.status = 'Mensagem copiada.';
    renderPreservingVisualState();
  } catch (error) {
    state.error = error.message || 'Falha ao copiar mensagem.';
    renderPreservingVisualState();
  }
}

function openMessageDetails(messageId) {
  if (!messageId) return;
  state.messageDetailsOpen = true;
  state.messageDetailsMessageId = messageId;
  renderPreservingVisualState();
}

function closeMessageDetails() {
  state.messageDetailsOpen = false;
  state.messageDetailsMessageId = null;
  renderPreservingVisualState();
}

async function copyEvents() {
  const events = Array.isArray(state.activeChatEvents) ? state.activeChatEvents : [];
  if (!events.length) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    state.status = 'Eventos copiados.';
    renderPreservingVisualState();
  } catch (error) {
    state.error = error.message || 'Falha ao copiar eventos.';
    renderPreservingVisualState();
  }
}

async function copyRelatedEvents() {
  const selectedMessage = state.activeChat?.messages?.find((message) => message.id === state.messageDetailsMessageId);
  if (!selectedMessage || selectedMessage.role !== 'assistant') return;
  const attempts = getAssistantAttemptsForMessage(selectedMessage);
  const selectedAttempt = attempts.find((attempt) => attempt.id === selectedMessage.id) || attempts[attempts.length - 1] || selectedMessage;
  const events = getRelatedEventsForAttempt(selectedAttempt);
  if (!events.length) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    state.status = 'Eventos relacionados copiados.';
    renderPreservingVisualState();
  } catch (error) {
    state.error = error.message || 'Falha ao copiar eventos relacionados.';
    renderPreservingVisualState();
  }
}

async function deleteActiveChat() {
  if (!state.activeChat) return;
  const confirmed = confirmUi(`Apagar o chat "${state.activeChat.title}"?`);
  if (!confirmed) return;

  await runAction('Apagando chat...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'DELETE',
    });
    state.chats = data.chats;
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
    state.messageDetailsOpen = false;
    state.messageDetailsMessageId = null;
  });
}

async function deleteAllChatsWithDoubleConfirm() {
  const count = (state.chats || []).length;
  if (!count || state.busy) return;
  const firstConfirm = confirmUi(
    `Excluir todos os ${count} chat(s) desta seção? Isso apaga mensagens, anexos, memória e contexto dos chats. Faça um backup antes se quiser preservar algo.`,
  );
  if (!firstConfirm) return;
  const phrase = promptUi('Para confirmar, digite exatamente: APAGAR TODOS OS CHATS');
  if (phrase !== 'APAGAR TODOS OS CHATS') {
    state.status = 'Exclusão de todos os chats cancelada.';
    renderPreservingVisualState();
    return;
  }
  await runAction('Excluindo todos os chats...', async () => {
    const data = await api('/api/chats', {
      method: 'DELETE',
      body: { confirmText: phrase },
    });
    state.chats = data.chats || [];
    state.activeChat = null;
    state.activeChatEvents = [];
    state.pendingAttachments = [];
    state.chatSettingsOpen = false;
    state.chatContextOpen = false;
    state.messageDetailsOpen = false;
    state.messageDetailsMessageId = null;
    state.status = `${data.deleted?.count ?? count} chat(s) excluído(s).`;
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
  state.chatContextDraft = getChatContextDraft(state.activeChat);
  state.chatContextOpen = true;
  renderPreservingVisualState();
}

function closeChatContext() {
  if (state.chatContextDirty) {
    captureChatContextDraftFromForm();
    const confirmed = confirmUi('Descartar alterações não salvas neste chat?');
    if (!confirmed) return;
    state.chatContextDirty = false;
  }
  state.chatContextOpen = false;
  state.chatContextDraft = null;
  renderPreservingVisualState();
}

async function saveChatContext(event) {
  event?.preventDefault();
  const draft = captureChatContextDraftFromForm() || {};
  const { provider, model } = getEffectiveChatRuntime();
  await runAction('Salvando prompt e memória...', async () => {
    const chatResponse = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        title: state.activeChat.title,
        folder: state.activeChat.folder || '',
        provider,
        model,
        modelSettings: state.activeChat.modelSettings || {},
        systemPromptExtra: draft.systemPromptExtra || '',
      },
    });
    const memoryResponse = await api(`/api/chats/${state.activeChat.id}/memory`, {
      method: 'PUT',
      body: { content: draft.memory || '' },
    });
    state.activeChat = memoryResponse.chat || chatResponse.chat;
    state.chats = chatResponse.chats || state.chats;
    state.activeChatEvents = memoryResponse.activeChatEvents || chatResponse.activeChatEvents || state.activeChatEvents;
    state.chatContextDirty = false;
    state.chatContextDraft = null;
  });
}

function openModelSettings() {
  state.chatSettingsOpen = false;
  state.modelSettingsOpen = true;
  renderPreservingVisualState();
}

function closeModelSettings() {
  if (state.modelSettingsDirty) {
    const confirmed = confirmUi('Descartar alterações não salvas nos parâmetros do modelo?');
    if (!confirmed) return;
    state.modelSettingsDirty = false;
  }
  state.modelSettingsOpen = false;
  renderPreservingVisualState();
}

function openChatSettings() {
  state.chatSettingsOpen = true;
  renderPreservingVisualState();
}

function closeChatSettings() {
  state.chatSettingsOpen = false;
  renderPreservingVisualState();
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
  renderPreservingVisualState();
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
  const { provider, model } = getEffectiveChatRuntime(chat);
  await runAction('Salvando parâmetros do modelo...', async () => {
    const data = await api(`/api/chats/${state.activeChat.id}`, {
      method: 'PUT',
      body: {
        title: chat.title,
        folder: chat.folder || state.activeChat.folder || '',
        provider,
        model,
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
  if (!form) return { ...(state.activeChat?.modelSettings || {}) };
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
  const offlineMode = isOfflineMode(state.config);
  const provider = offlineMode ? 'ollama' : draft.provider || state.activeChat.provider || state.config.provider;
  const model = getEffectiveChatRuntime(state.activeChat, { provider, model: draft.model }).model;
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
        folder: state.activeChat.folder || '',
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
  const offlineMode = form.get('offlineMode') === 'on';
  const provider = offlineMode ? 'ollama' : form.get('provider') || draftConfig.provider;
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
    renderPreservingVisualState();
    return;
  }
  const validationError = shouldValidateProviderSensitiveSettings(form, provider, model)
    ? validateGeneralSettingsForm(form, provider)
    : '';
  if (validationError) {
    state.error = validationError;
    state.settingsSection = 'providers';
    renderPreservingVisualState();
    return;
  }
  await runAction('Salvando configurações gerais...', async () => {
    const userMemoryRead = form.get('tool_userMemory') === 'on';
    const userMemoryEdit = userMemoryRead && form.get('tool_userMemoryEdit') === 'on';
    const tools = {
      terminal: form.get('tool_terminal') === 'on',
      deepInvestigation: form.get('tool_deepInvestigation') === 'on',
      searchMode: form.get('searchEnabled') === 'on' ? form.get('searchMode') || (offlineMode ? 'terminal' : 'both') : 'off',
      chatMemory: form.get('tool_chatMemory') === 'on',
      persistentMemory: form.get('tool_persistentMemory') === 'on',
      chatDocuments: form.get('tool_chatDocuments') === 'on',
      autoCompact: form.get('tool_autoCompact') === 'on',
      chatTitle: form.get('tool_chatTitle') === 'on',
      userMemory: userMemoryRead,
      userMemoryEdit,
      alwaysAllow: form.get('tool_alwaysAllow') === 'on',
      terminalMode: form.get('terminalMode') || 'standard',
    };
    tools.webSearch = tools.searchMode !== 'off';
    tools.searchTerminal = tools.searchMode === 'terminal' || tools.searchMode === 'both';
    if (offlineMode) {
      Object.assign(tools, normalizeOfflineToolsForClient(tools));
    }
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
        appearance: {
          theme: form.get('theme') || draftConfig.appearance?.theme || 'light',
          uiLanguage: normalizeUiLanguage(form.get('uiLanguage') || draftConfig.appearance?.uiLanguage),
        },
        tools,
        userMemory: {
          sendFilesToPrompt: form.get('userMemorySendFilesToPrompt') === 'on',
          remindModelToUpdateFiles: userMemoryEdit && form.get('userMemoryUpdateReminder') === 'on',
        },
        privacy: {
          offlineMode,
        },
        context: {
          autoCompactEnabled: form.get('autoCompactEnabled') === 'on',
          autoCompactChars: Number(form.get('autoCompactChars')),
          autoCompactMinMessages: Number(form.get('autoCompactMinMessages')),
          historyBudgetEnabled: form.get('historyBudgetEnabled') === 'on',
          historyBudgetChars: Number(form.get('historyBudgetChars')),
        },
        email: {
          enabled: form.get('emailEnabled') === 'on',
          resendApiKey: form.get('emailResendApiKey'),
          destinationEmail: form.get('emailDestination'),
          notifyOnScheduledTaskFailure: form.get('emailNotifyOnScheduledTaskFailure') === 'on',
        },
        routing: {
          ...(offlineMode
            ? normalizeOfflineRoutingForClient()
            : {
                modelRotationEnabled: form.get('modelRotationEnabled') === 'on',
                modelFallbacks: readModelFallbackRows(),
                providerRotationEnabled: form.get('providerRotationEnabled') === 'on',
                maxProviderPasses: Number(form.get('maxProviderPasses') || 2),
                fallbacks: readRoutingFallbackRows(),
              }),
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
    state.providers = configResponse.providers || state.providers;
    state.models = configResponse.models || state.models;
    state.ollamaInstalledModels = configResponse.ollamaInstalledModels || state.ollamaInstalledModels;
    state.networkStatus = configResponse.networkStatus || state.networkStatus;
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

function markSettingsDirty(event) {
  if (event?.target?.id === 'user-memory-file-input') return;
  if (['theme', 'uiLanguage'].includes(event?.target?.name)) {
    captureSettingsDraftFromForm();
    state.settingsDirty = true;
    updateDirtyIndicators();
    renderPreservingVisualState();
    return;
  }
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
  captureChatContextDraftFromForm();
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
  const offlineMode = form.get('offlineMode') === 'on';
  const provider = offlineMode ? 'ollama' : form.get('provider') || draftConfig.provider || state.config.provider;
  draftConfig.privacy = {
    ...(draftConfig.privacy || {}),
    offlineMode,
  };
  draftConfig.provider = provider;
  draftConfig.model = getModelValue('#default-model-input', '#default-custom-model-input', provider);
  draftConfig.language = form.get('language') || 'auto';
  draftConfig.userNickname = form.get('userNickname') || '';
  draftConfig.technicalLevel = form.get('technicalLevel') || draftConfig.technicalLevel || 'balanced';
  draftConfig.technicalGuidanceEnabled = form.get('technicalGuidanceEnabled') === 'on';
  draftConfig.systemPromptExtra = form.get('systemPromptExtra') || '';
  draftConfig.appearance = {
    ...(draftConfig.appearance || {}),
    theme: form.get('theme') || draftConfig.appearance?.theme || 'light',
    uiLanguage: normalizeUiLanguage(form.get('uiLanguage') || draftConfig.appearance?.uiLanguage),
  };
  const rawSearchMode = form.get('searchEnabled') === 'on' ? form.get('searchMode') || getSearchMode(draftConfig.tools) : 'off';
  const searchMode = offlineMode && rawSearchMode === 'both' ? 'off' : rawSearchMode;
  const userMemoryRead = form.get('tool_userMemory') === 'on';
  const userMemoryEdit = userMemoryRead && form.get('tool_userMemoryEdit') === 'on';
  draftConfig.tools = {
    ...(draftConfig.tools || {}),
    terminal: form.get('tool_terminal') === 'on',
    deepInvestigation: form.get('tool_deepInvestigation') === 'on',
    chatMemory: form.get('tool_chatMemory') === 'on',
    persistentMemory: form.get('tool_persistentMemory') === 'on',
    chatDocuments: form.get('tool_chatDocuments') === 'on',
    autoCompact: form.get('tool_autoCompact') === 'on',
    chatTitle: form.get('tool_chatTitle') === 'on',
    userMemory: userMemoryRead,
    userMemoryEdit,
    alwaysAllow: form.get('tool_alwaysAllow') === 'on',
    terminalMode: form.get('terminalMode') || 'standard',
    searchMode,
    webSearch: searchMode !== 'off',
    searchTerminal: searchMode === 'terminal' || searchMode === 'both',
  };
  draftConfig.userMemory = {
    ...(draftConfig.userMemory || {}),
    sendFilesToPrompt: form.get('userMemorySendFilesToPrompt') === 'on',
    remindModelToUpdateFiles: userMemoryEdit && form.get('userMemoryUpdateReminder') === 'on',
  };
  draftConfig.context = {
    autoCompactEnabled: form.get('autoCompactEnabled') === 'on',
    autoCompactChars: Number(form.get('autoCompactChars') || 24000),
    autoCompactMinMessages: Number(form.get('autoCompactMinMessages') || 12),
    historyBudgetEnabled: form.get('historyBudgetEnabled') === 'on',
    historyBudgetChars: Number(form.get('historyBudgetChars') || 28000),
  };
  draftConfig.email = {
    enabled: form.get('emailEnabled') === 'on',
    resendApiKey: form.get('emailResendApiKey') || '',
    destinationEmail: form.get('emailDestination') || '',
    notifyOnScheduledTaskFailure: form.get('emailNotifyOnScheduledTaskFailure') === 'on',
  };
  draftConfig.routing = offlineMode
    ? normalizeOfflineRoutingForClient()
    : {
        modelRotationEnabled: form.get('modelRotationEnabled') === 'on',
        modelFallbacks: readModelFallbackRows(),
        providerRotationEnabled: form.get('providerRotationEnabled') === 'on',
        maxProviderPasses: Number(form.get('maxProviderPasses') || 2),
        fallbacks: readRoutingFallbackRows(),
      };
  draftConfig.server = {
    networkEnabled: form.get('networkEnabled') === 'on',
    authPassword: form.get('authPassword') || '',
  };
  state.settingsDraft.persistentMemory = form.has('persistentMemory')
    ? String(form.get('persistentMemory') ?? '')
    : state.settingsDraft.persistentMemory || '';
}

function updateDirtyIndicators() {
  document.querySelectorAll('.dirty-note').forEach((item) => {
    item.classList.toggle('hidden', !state.settingsDirty && !state.chatSettingsDirty && !state.chatContextDirty && !state.modelSettingsDirty);
  });
  document.querySelector('#general-settings-form button[type="submit"]')?.classList.toggle('dirty-save', state.settingsDirty);
  document.querySelector('#save-chat-settings')?.classList.toggle('dirty-save', state.chatSettingsDirty);
}

function shouldValidateProviderSensitiveSettings(form, provider, model) {
  const currentConfig = state.config || {};
  const draftConfig = state.settingsDraft?.config || currentConfig;
  const offlineMode = form.get('offlineMode') === 'on';
  const currentOfflineMode = isOfflineMode(currentConfig);
  const currentProvider = currentOfflineMode ? 'ollama' : currentConfig.provider || 'groq';
  const currentModel =
    currentOfflineMode && currentConfig.provider !== 'ollama'
      ? getProvider('ollama').defaultModel
      : currentConfig.model || getProvider(currentProvider).defaultModel;

  if (offlineMode !== currentOfflineMode) return true;
  if (provider !== currentProvider || model !== currentModel) return true;

  const currentProviderSettings = comparableProviderSettings(currentConfig.providerSettings?.[provider]);
  const draftProviderSettings = comparableProviderSettings(draftConfig.providerSettings?.[provider]);
  if (stableJson(currentProviderSettings) !== stableJson(draftProviderSettings)) return true;

  const nextRouting = offlineMode
    ? normalizeOfflineRoutingForClient()
    : {
        modelRotationEnabled: form.get('modelRotationEnabled') === 'on',
        modelFallbacks: readModelFallbackRows(),
        providerRotationEnabled: form.get('providerRotationEnabled') === 'on',
        maxProviderPasses: Number(form.get('maxProviderPasses') || 2),
        fallbacks: readRoutingFallbackRows(),
      };
  const currentRouting = comparableRouting(currentConfig.routing);
  return stableJson(comparableRouting(nextRouting)) !== stableJson(currentRouting);
}

function comparableProviderSettings(settings = {}) {
  return {
    baseUrl: String(settings.baseUrl || '').trim(),
    apiKeys: (settings.apiKeys || [])
      .map((item) => ({
        value: String(item.value || item || '').trim(),
      }))
      .filter((item) => item.value),
  };
}

function comparableRouting(routing = {}) {
  return {
    modelRotationEnabled: routing.modelRotationEnabled === true,
    modelFallbacks: (routing.modelFallbacks || []).map((item) => ({
      provider: item.provider || '',
      model: item.model || '',
    })),
    providerRotationEnabled: routing.providerRotationEnabled === true,
    maxProviderPasses: Number(routing.maxProviderPasses || 2),
    fallbacks: (routing.fallbacks || []).map((item) => ({
      provider: item.provider || '',
      model: item.model || '',
    })),
  };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function validateGeneralSettingsForm(form, defaultProvider) {
  const draftConfig = state.settingsDraft?.config || state.config;
  if (form.get('offlineMode') === 'on') return '';
  const providerInfo = getProvider(defaultProvider);
  const providerSettings = draftConfig.providerSettings?.[defaultProvider] || {};
  const baseUrl = String(providerSettings.baseUrl || providerInfo.baseUrl || '').trim();
  const apiKeys = (providerSettings.apiKeys || []).filter((item) => String(item.value || item || '').trim());
  if (!baseUrl) {
    return `Defina o endpoint/base URL de ${providerInfo.label} antes de salvar esse provider como padrão.`;
  }
  if (providerInfo.requiresApiKey && !apiKeys.length) {
    return `Adicione ao menos uma API key de ${providerInfo.label} antes de salvar esse provider como padrão.`;
  }

  const invalidModelRow = getModelFallbackRowValues().find((row) => !row.model);
  if (invalidModelRow) {
    return `Escolha um modelo alternativo em ${providerLabel(invalidModelRow.provider)} ou remova essa linha da rotatória de modelos.`;
  }
  const invalidProviderRow = getRoutingFallbackRowValues().find((row) => !row.provider || !row.model);
  if (invalidProviderRow) {
    return 'Escolha provider e modelo em todos os fallbacks, ou remova a linha incompleta da rotatória de providers.';
  }

  const modelFallbacks = readModelFallbackRows();
  if (form.get('modelRotationEnabled') === 'on' && !modelFallbacks.length) {
    return 'A rotatória de modelos está ligada, mas não há nenhum modelo alternativo configurado.';
  }
  const providerFallbacks = readRoutingFallbackRows();
  if (form.get('providerRotationEnabled') === 'on' && !providerFallbacks.length) {
    return 'A rotatória de providers está ligada, mas não há nenhum fallback configurado.';
  }
  for (const fallback of providerFallbacks) {
    const fallbackInfo = getProvider(fallback.provider);
    const fallbackSettings = draftConfig.providerSettings?.[fallback.provider] || {};
    const fallbackBaseUrl = String(fallbackSettings.baseUrl || fallbackInfo.baseUrl || '').trim();
    const fallbackKeys = (fallbackSettings.apiKeys || []).filter((item) => String(item.value || item || '').trim());
    if (!fallbackBaseUrl) return `Defina o endpoint/base URL de ${fallbackInfo.label} antes de usar esse provider na rotatória.`;
    if (fallbackInfo.requiresApiKey && !fallbackKeys.length) {
      return `Adicione ao menos uma API key de ${fallbackInfo.label} antes de usar esse provider na rotatória.`;
    }
  }
  return '';
}

function getRoutingFallbackRowValues() {
  return [...document.querySelectorAll('.routing-fallback-row')].map((row) => ({
    provider: row.querySelector('.fallback-provider')?.value || '',
    model:
      row.querySelector('.fallback-model')?.value === CUSTOM_MODEL_VALUE
        ? row.querySelector('.fallback-custom-model-input')?.value.trim() || ''
        : row.querySelector('.fallback-model')?.value.trim() || '',
  }));
}

function getModelFallbackRowValues() {
  const visibleProvider = state.settingsProvider || state.settingsDraft?.config?.provider || state.config.provider;
  return [...document.querySelectorAll('.model-fallback-row')].map((row) => ({
    provider: row.dataset.provider || visibleProvider,
    model:
      row.querySelector('.model-fallback-model')?.value === CUSTOM_MODEL_VALUE
        ? row.querySelector('.model-fallback-custom-input')?.value.trim() || ''
        : row.querySelector('.model-fallback-model')?.value.trim() || '',
  }));
}

function readRoutingFallbackRows() {
  return getRoutingFallbackRowValues().filter((item) => item.provider && item.model);
}

function readModelFallbackRows() {
  const visibleProvider = state.settingsProvider || state.settingsDraft?.config?.provider || state.config.provider;
  const existing = (state.settingsDraft?.config?.routing?.modelFallbacks || state.config.routing?.modelFallbacks || []).filter(
    (item) => item.provider !== visibleProvider,
  );
  const visible = getModelFallbackRowValues().filter((item) => item.provider && item.model);
  return [...existing, ...visible];
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
      {
        provider: fallbackProvider,
        model: getSelectableModels(fallbackProvider)[0]?.id || getProvider(fallbackProvider).defaultModel,
      },
    ],
  };
  state.settingsDirty = true;
  renderPreservingVisualState();
}

function addModelFallbackRow() {
  captureSettingsDraftFromForm();
  const draftConfig = state.settingsDraft.config;
  const provider = state.settingsProvider || draftConfig.provider;
  const existing = draftConfig.routing?.modelFallbacks || [];
  draftConfig.routing = {
    ...(draftConfig.routing || {}),
    modelFallbacks: [
      ...existing,
      {
        provider,
        model:
          getSelectableModels(provider).find((model) => model.id !== draftConfig.model)?.id ||
          getSelectableModels(provider)[0]?.id ||
          getProvider(provider).defaultModel,
      },
    ],
  };
  state.settingsDirty = true;
  renderPreservingVisualState();
}

function removeModelFallbackRow(index) {
  captureSettingsDraftFromForm();
  const draftConfig = state.settingsDraft.config;
  const provider = state.settingsProvider || draftConfig.provider;
  const providerRows = (draftConfig.routing?.modelFallbacks || []).filter((item) => item.provider === provider);
  const target = providerRows[index];
  draftConfig.routing = {
    ...(draftConfig.routing || {}),
    modelFallbacks: (draftConfig.routing?.modelFallbacks || []).filter((item) => item !== target),
  };
  state.settingsDirty = true;
  renderPreservingVisualState();
}

function removeProviderFallbackRow(index) {
  captureSettingsDraftFromForm();
  const draftConfig = state.settingsDraft.config;
  draftConfig.routing = {
    ...(draftConfig.routing || {}),
    fallbacks: (draftConfig.routing?.fallbacks || []).filter((_, itemIndex) => itemIndex !== index),
  };
  state.settingsDirty = true;
  renderPreservingVisualState();
}

async function exportData() {
  if (state.busy) return;
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
  if (state.busy) return;
  if (!file) return;
  try {
    const content = await file.text();
    state.importDraft = {
      fileName: file.name,
      payload: JSON.parse(content),
      options: {
        config: true,
        persistentMemory: true,
        persistentMemoryUser: true,
        chats: true,
        attachments: true,
        events: false,
      },
    };
    state.importModalOpen = true;
    renderPreservingVisualState();
  } catch (error) {
    state.error = `Backup inválido: ${error.message}`;
    renderPreservingVisualState();
  }
}

function closeImportModal() {
  state.importModalOpen = false;
  state.importDraft = null;
  renderPreservingVisualState();
}

async function confirmImportData() {
  if (state.busy || !state.importDraft) return;
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
    state.userMemoryFiles = data.userMemoryFiles || [];
    state.profiles = data.profiles || state.profiles;
    state.activeProfile = data.activeProfile || state.activeProfile;
    state.runtimeHome = data.runtimeHome || state.runtimeHome;
    state.rootRuntimeHome = data.rootRuntimeHome || state.rootRuntimeHome;
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
  const confirmed = confirmUi('Atualizar o My Computer agora? O servidor vai rodar git pull, npm install e reiniciar.');
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
  applyBootstrapData(data);
  if (!state.activeChat && data.activeChat) {
    state.activeChat = data.activeChat;
    state.activeChatEvents = data.activeChatEvents || [];
  }
}

async function refreshUserMemoryFiles() {
  const data = await api('/api/persistent-memory-user');
  state.userMemoryFiles = data.files || state.userMemoryFiles || [];
}

function messageHasCompletedUserMemoryEdit(message) {
  return Boolean((message?.toolUses || []).some((toolUse) => toolUse.name === 'edit_persistent_memory_user' && toolUse.result?.action === 'replace'));
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
  state.settingsProvider = isOfflineMode(state.settingsDraft.config) ? 'ollama' : state.settingsDraft.config.provider;
  state.settingsSection = state.settingsSection || 'identity';
  renderPreservingVisualState();
}

function closeSettings() {
  captureSettingsDraftFromForm();
  if (state.settingsDirty) {
    state.confirmDialog = { type: 'close-settings' };
    renderPreservingVisualState();
    return;
  }
  state.settingsOpen = false;
  state.settingsDraft = null;
  renderPreservingVisualState();
}

function discardPendingDialog() {
  const type = state.confirmDialog?.type;
  state.confirmDialog = null;
  if (type === 'close-settings') {
    state.settingsOpen = false;
    state.settingsDirty = false;
    state.settingsDraft = null;
  }
  renderPreservingVisualState();
}

async function saveChatSettingsAndSend() {
  state.confirmDialog = null;
  if (state.chatSettingsDirty) await saveChatSettings(null);
  if (state.chatContextDirty) await saveChatContext(null);
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
  renderPreservingVisualState();
}

async function shutdownApp() {
  const confirmed = confirmUi('Encerrar o servidor local do My Computer? Para iniciar depois, rode ./install.sh ou npm run start:open.');
  if (!confirmed) return;
  await api('/api/shutdown', { method: 'POST' });
  state.status = 'My Computer está encerrando. Para iniciar novamente, rode ./install.sh.';
  renderPreservingVisualState();
}

async function runAction(status, action, retry = null) {
  if (state.busy) return;
  captureOpenDrafts();
  const visualState = captureVisualState();
  state.busy = true;
  state.status = status;
  state.error = '';
  state.lastFailedAction = null;
  render();
  restoreVisualState(visualState);
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
    statusElement.textContent = uiText(state.error || state.status || 'Pronto');
    statusElement.classList.toggle('error', Boolean(state.error));
  }
}

function captureOpenDrafts() {
  if (state.settingsOpen) captureSettingsDraftFromForm();
  if (state.chatSettingsDirty) captureChatSettingsDraftFromForm();
  captureAttachmentViewerDraft();
  saveComposerDraft();
}

function captureAttachmentViewerDraft() {
  const textarea = document.querySelector('#attachment-viewer-input');
  if (!state.attachmentViewer || !textarea || state.attachmentViewer.viewerLoading) return;
  state.attachmentViewer = {
    ...state.attachmentViewer,
    draftContent: textarea.value,
  };
}

function captureVisualState() {
  return {
    settingsScrollTop: document.querySelector('.settings-layout')?.scrollTop || 0,
    modalScrollTop: document.querySelector('.modal-body')?.scrollTop || 0,
    messagesScrollTop: document.querySelector('#messages')?.scrollTop || 0,
    chatListScrollTop: document.querySelector('.chat-list')?.scrollTop || 0,
    inspectorScrollTop: document.querySelector('.inspector')?.scrollTop || 0,
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
  const chatList = document.querySelector('.chat-list');
  if (chatList) chatList.scrollTop = snapshot.chatListScrollTop || 0;
  const inspector = document.querySelector('.inspector');
  if (inspector) inspector.scrollTop = snapshot.inspectorScrollTop || 0;
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

function renderPreservingVisualState() {
  const visualState = captureVisualState();
  render();
  restoreVisualState(visualState);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-My-Computer-Request': 'panel',
        ...(state.activeProfile?.id ? { 'X-Profile-Id': state.activeProfile.id } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new Error(`Falha de rede ao falar com o servidor local. Verifique se o My Computer ainda está rodando e tente de novo. ${error.message || ''}`.trim());
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function withProfileQuery(path) {
  if (!state.activeProfile?.id) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}profileId=${encodeURIComponent(state.activeProfile.id)}`;
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
  applyPanelLanguage();
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
  let quote = null;

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
  const flushQuote = () => {
    if (!quote) return;
    blocks.push(`<blockquote><p>${formatInline(quote.join(' '))}</p></blockquote>`);
    quote = null;
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
        flushQuote();
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
      flushQuote();
      continue;
    }

    const rule = /^\s*([-*_])\s*(?:\1\s*){2,}$/.exec(line);
    if (rule) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push('<hr />');
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = heading[1].length + 2;
      blocks.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const quoteLine = /^\s*>\s?(.*)$/.exec(line);
    if (quoteLine) {
      flushParagraph();
      flushList();
      if (!quote) quote = [];
      if (quoteLine[1].trim()) quote.push(quoteLine[1].trim());
      continue;
    }
    flushQuote();

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
  flushQuote();
  return blocks.join('');
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
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
