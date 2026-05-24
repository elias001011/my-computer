import { runtimeHome } from './paths.js';
import { callProviderChat } from './provider-client.js';
import { getModelMetadata, modelSupportsImages } from './models.js';
import {
  appendEvent,
  appendMessages,
  createMessage,
  readChat,
  readContextSummary,
  readMemory,
  readPersistentMemory,
  loadConfig,
  readAttachmentFile,
  saveContextSnapshot,
  saveCurrentContextWindow,
  updateChatMetadata,
  updateMessage,
  writeMemory,
  writePersistentMemory,
  writeContextSummary,
} from './store.js';
import {
  compactContextToolDefinition,
  memoryChatToolDefinition,
  persistentMemoryToolDefinition,
  renameChatToolDefinition,
  runTerminalCommand,
  runWebSearch,
  terminalToolDefinition,
  webSearchToolDefinition,
} from './tools.js';

const MAX_CONTEXT_CHARS = 28000;
const MAX_CONTEXT_SAVE_CHARS = 120000;
const MAX_TOOL_ROUNDS = 4;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;

export async function sendUserMessage(chatId, content, options = {}) {
  const config = await loadConfig();
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    const error = new Error('Mensagem vazia.');
    error.statusCode = 400;
    throw error;
  }

  const chatBefore = await readChat(chatId);
  const selectedAttachments = await resolveMessageAttachments(chatBefore, options);
  const userMessage = await saveUserMessageForRequest(
    chatId,
    chatBefore,
    trimmed,
    options.retryMessageId,
    selectedAttachments,
  );
  const chatWithUserMessage = await readChat(chatId);
  const chat = {
    ...chatWithUserMessage,
    messages: chatWithUserMessage.messages.map((message) =>
      message.id === userMessage.id ? { ...message, status: 'sent', error: undefined } : message,
    ),
  };
  const persistentMemory = await readPersistentMemory();
  const effectiveConfig = {
    ...config,
    provider: chat.provider || config.provider,
    model: chat.model || config.model,
    modelSettings: chat.modelSettings || {},
  };
  const toolUses = [];
  const enabledTools = buildEnabledToolDefinitions(effectiveConfig.tools);
  let finalContent = '';

  try {
    const workingMessages = await buildProviderMessages(chat, effectiveConfig, persistentMemory, {
      strictImageSupportForMessageId: userMessage.id,
    });
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const assistantMessage = await callProviderChat({
        config: effectiveConfig,
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        messages: workingMessages,
        tools: enabledTools,
        modelSettings: effectiveConfig.modelSettings,
      });

      const toolCalls = assistantMessage.tool_calls || [];
      if (!toolCalls.length) {
        finalContent = assistantMessage.content || '';
        break;
      }

      workingMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: toolCalls,
      });

      if (effectiveConfig.tools?.alwaysAllow !== true) {
        if (chatBefore.title === 'Novo chat' && !toolCalls.some((toolCall) => toolCall.function?.name === 'rename_chat')) {
          await updateChatMetadata(chatId, { title: trimmed });
        }
        const pendingAssistantMessage = createToolApprovalMessage(assistantMessage, toolCalls, workingMessages, effectiveConfig);
        await appendMessages(chatId, [pendingAssistantMessage]);
        await updateMessage(chatId, userMessage.id, {
          status: 'sent',
          error: null,
          sentAt: new Date().toISOString(),
        });
        await appendEvent({
          type: 'tool.approval.requested',
          chatId,
          details: {
            messageId: pendingAssistantMessage.id,
            toolCount: toolCalls.length,
            tools: toolCalls.map((toolCall) => toolCall.function?.name).filter(Boolean),
          },
        });
        return {
          userMessage,
          assistantMessage: pendingAssistantMessage,
          awaitingApproval: true,
          chat: await readChat(chatId),
        };
      }

      for (const toolCall of toolCalls) {
        const toolUse = await executeToolCall(chatId, toolCall, effectiveConfig);
        toolUses.push(toolUse);
        workingMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolUse.name,
          content: truncate(JSON.stringify(toolUse.result), 12000),
        });
      }
    }

    if (!finalContent) {
      const assistantMessage = await callProviderChat({
        config: effectiveConfig,
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        messages: workingMessages,
        tools: [],
        modelSettings: effectiveConfig.modelSettings,
      });
      finalContent = assistantMessage.content || 'Terminei a execução das tools, mas não recebi texto final.';
    }
  } catch (error) {
    await updateMessage(chatId, userMessage.id, {
      status: 'failed',
      error: error.message || 'Erro ao gerar resposta.',
      failedAt: new Date().toISOString(),
    });
    await appendEvent({
      type: 'chat.message.failed',
      chatId,
      details: { messageId: userMessage.id, error: error.message },
    });
    throw error;
  }

  if (chatBefore.title === 'Novo chat' && !toolUses.some((toolUse) => toolUse.name === 'rename_chat')) {
    await updateChatMetadata(chatId, { title: trimmed });
  }

  const savedAssistantMessage = createMessage('assistant', finalContent, {
    modelUsed: effectiveConfig.model,
    providerUsed: effectiveConfig.provider,
    toolUses,
  });
  await updateMessage(chatId, userMessage.id, {
    status: 'sent',
    error: null,
    sentAt: new Date().toISOString(),
  });
  await appendMessages(chatId, [savedAssistantMessage]);

  const updatedChat = await readChat(chatId);
  const latestPersistentMemory = await readPersistentMemory();
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, latestPersistentMemory));
  const autoCompact = await maybeAutoCompactChat(chatId, updatedChat, effectiveConfig, latestPersistentMemory);
  await appendEvent({ type: 'chat.message.completed', chatId, details: { toolCount: toolUses.length } });

  return {
    userMessage,
    assistantMessage: savedAssistantMessage,
    autoCompact,
    chat: await readChat(chatId),
  };
}

export async function continueToolApproval(chatId, messageId, decision = 'approve') {
  const chat = await readChat(chatId);
  const pendingMessage = chat.messages.find((message) => message.id === messageId && message.role === 'assistant');
  if (!pendingMessage?.pendingToolApproval) {
    const error = new Error('Aprovação de tool não encontrada.');
    error.statusCode = 404;
    throw error;
  }

  if (decision !== 'approve') {
    const deniedToolUses = (pendingMessage.toolUses || []).map((toolUse) => ({
      ...toolUse,
      status: 'denied',
      result: { action: 'denied', reason: 'Negado pelo usuário na UI.' },
    }));
    await updateMessage(chatId, messageId, {
      status: 'tool_denied',
      content: 'Execução de tool negada pelo usuário.',
      toolUses: deniedToolUses,
      pendingToolApproval: null,
    });
    await appendEvent({ type: 'tool.approval.denied', chatId, details: { messageId } });
    return { chat: await readChat(chatId) };
  }

  const config = await loadConfig();
  const currentChat = await readChat(chatId);
  const effectiveConfig = {
    ...config,
    provider: currentChat.provider || config.provider,
    model: currentChat.model || config.model,
    modelSettings: currentChat.modelSettings || {},
  };
  const workingMessages = pendingMessage.pendingToolApproval.providerMessages || [];
  const toolCalls = pendingMessage.pendingToolApproval.toolCalls || [];
  const toolUses = [];

  await updateMessage(chatId, messageId, {
    status: 'running_tools',
    content: pendingMessage.content || 'Executando tools aprovadas...',
  });
  await appendEvent({ type: 'tool.approval.approved', chatId, details: { messageId, toolCount: toolCalls.length } });

  for (const toolCall of toolCalls) {
    const toolUse = await executeToolCall(chatId, toolCall, effectiveConfig);
    toolUses.push(toolUse);
    workingMessages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      name: toolUse.name,
      content: truncate(JSON.stringify(toolUse.result), 12000),
    });
  }

  const assistantMessage = await callProviderChat({
    config: effectiveConfig,
    provider: effectiveConfig.provider,
    model: effectiveConfig.model,
    messages: workingMessages,
    tools: [],
    modelSettings: effectiveConfig.modelSettings,
  });
  const finalContent = assistantMessage.content || 'Tools executadas, mas o provider não retornou texto final.';
  await updateMessage(chatId, messageId, {
    status: 'sent',
    content: finalContent,
    toolUses,
    pendingToolApproval: null,
    modelUsed: effectiveConfig.model,
    providerUsed: effectiveConfig.provider,
  });

  const updatedChat = await readChat(chatId);
  const latestPersistentMemory = await readPersistentMemory();
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, latestPersistentMemory));
  await maybeAutoCompactChat(chatId, updatedChat, effectiveConfig, latestPersistentMemory);
  await appendEvent({ type: 'chat.message.completed', chatId, details: { approvedToolCount: toolUses.length } });
  return { chat: await readChat(chatId) };
}

function createToolApprovalMessage(assistantMessage, toolCalls, providerMessages, config) {
  return createMessage(
    'assistant',
    assistantMessage.content || 'A IA solicitou uma tool e está aguardando aprovação.',
    {
      status: 'needs_tool_approval',
      modelUsed: config.model,
      providerUsed: config.provider,
      toolUses: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function?.name || 'unknown_tool',
        input: parseToolArguments(toolCall.function?.arguments),
        status: 'pending_approval',
        approvalRequired: true,
        result: { action: 'pending_approval' },
        createdAt: new Date().toISOString(),
      })),
      pendingToolApproval: {
        toolCalls,
        providerMessages,
      },
    },
  );
}

async function saveUserMessageForRequest(chatId, chat, content, retryMessageId, attachments = []) {
  if (retryMessageId) {
    const existing = chat.messages.find((message) => message.id === retryMessageId && message.role === 'user');
    if (!existing) {
      const error = new Error('Mensagem para retry não encontrada.');
      error.statusCode = 404;
      throw error;
    }

    return updateMessage(chatId, retryMessageId, {
      content: existing.content || content,
      attachments: existing.attachments || [],
      status: 'pending',
      error: null,
      retryCount: Number(existing.retryCount || 0) + 1,
      retriedAt: new Date().toISOString(),
    });
  }

  const userMessage = createMessage('user', content, {
    attachments,
    status: 'pending',
  });
  await appendMessages(chatId, [userMessage]);
  return userMessage;
}

export async function compactChat(chatId, options = {}) {
  const config = await loadConfig();
  const chat = await readChat(chatId);
  const persistentMemory = await readPersistentMemory();
  const effectiveConfig = {
    ...config,
    provider: chat.provider || config.provider,
    model: chat.model || config.model,
  };
  const transcript = renderTranscript(chat.messages, MAX_CONTEXT_SAVE_CHARS);
  const contextSummary = await readContextSummary(chatId);

  const response = await callProviderChat({
    config: effectiveConfig,
    provider: effectiveConfig.provider,
    model: effectiveConfig.model,
    tools: [],
    temperature: 0.1,
    maxTokens: 1800,
    messages: [
      {
        role: 'system',
        content:
          'You compact chat history into durable Markdown context. Preserve decisions, user preferences, paths, commands run, unresolved tasks, and important facts. Do not invent details.',
      },
      {
        role: 'user',
        content: [
          `Existing saved context:\n${contextSummary}`,
          `Persistent memory:\n${persistentMemory}`,
          `Chat memory:\n${chat.memory}`,
          `Transcript:\n${transcript}`,
        ].join('\n\n---\n\n'),
      },
    ],
  });

  const summary = response.content || '# Context summary\n\nNenhum resumo retornado.';
  const updatedChat = await writeContextSummary(chatId, summary);
  if (options.automatic) {
    await updateChatMetadata(chatId, {
      lastAutoCompactMessageCount: chat.messages?.length || 0,
    });
    await appendEvent({
      type: 'chat.context.auto_compacted',
      chatId,
      details: {
        reason: options.reason || 'threshold',
        path: updatedChat.paths.context,
        messageCount: chat.messages?.length || 0,
        summaryPreview: truncate(summary, 1200),
      },
    });
  }
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, persistentMemory));
  return { summary, path: updatedChat.paths.context, chat: await readChat(chatId), automatic: Boolean(options.automatic) };
}

export async function editContextSummary(chatId, content) {
  const updatedChat = await writeContextSummary(chatId, content);
  const config = await loadConfig();
  const persistentMemory = await readPersistentMemory();
  const effectiveConfig = {
    ...config,
    provider: updatedChat.provider || config.provider,
    model: updatedChat.model || config.model,
  };
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, persistentMemory));
  return { chat: await readChat(chatId), path: updatedChat.paths.context };
}

export async function saveContextWindow(chatId) {
  const config = await loadConfig();
  const chat = await readChat(chatId);
  const persistentMemory = await readPersistentMemory();
  const effectiveConfig = {
    ...config,
    provider: chat.provider || config.provider,
    model: chat.model || config.model,
  };
  const content = buildContextWindowMarkdown(chat, effectiveConfig, persistentMemory);
  const path = await saveContextSnapshot(chatId, content);
  await saveCurrentContextWindow(chatId, content);
  return { path, chat: await readChat(chatId) };
}

async function maybeAutoCompactChat(chatId, chat, config, persistentMemory) {
  const settings = config.context || {};
  if (!settings.autoCompactEnabled) return null;
  const messageCount = chat.messages?.length || 0;
  const lastCount = Number(chat.lastAutoCompactMessageCount || 0);
  const minMessages = Number(settings.autoCompactMinMessages || 12);
  if (messageCount - lastCount < minMessages) return null;

  const contextWindow = buildContextWindowMarkdown(chat, config, persistentMemory);
  if (contextWindow.length < Number(settings.autoCompactChars || 24000)) return null;

  await appendEvent({
    type: 'chat.context.auto_compaction_requested',
    chatId,
    details: {
      messageCount,
      chars: contextWindow.length,
      threshold: settings.autoCompactChars,
    },
  });
  return compactChat(chatId, {
    automatic: true,
    reason: `context window reached ${contextWindow.length} chars`,
  });
}

export function buildContextWindowMarkdown(chat, config, persistentMemory = '') {
  return [
    `# Context window - ${chat.title}`,
    '',
    `- Chat: ${chat.id}`,
    `- Runtime: ${runtimeHome}`,
    `- Provider: ${config.provider}`,
    `- Model: ${chat.model || config.model}`,
    `- Language: ${config.language}`,
    `- User nickname: ${config.userNickname || 'Não definido'}`,
    '',
    '## General system prompt',
    '',
    config.systemPromptExtra || 'Nenhuma preferência geral configurada.',
    '',
    '## Persistent memory',
    '',
    persistentMemory || 'Sem memória persistente.',
    '',
    '## Chat preferences',
    '',
    chat.systemPromptExtra || 'Nenhuma preferência específica do chat.',
    '',
    '## Chat memory',
    '',
    chat.memory || 'Sem memória de chat.',
    '',
    '## Compacted context',
    '',
    chat.contextSummary || 'Sem contexto compactado.',
    '',
    '## Recent transcript',
    '',
    renderTranscript(chat.messages, MAX_CONTEXT_SAVE_CHARS),
  ].join('\n');
}

async function buildProviderMessages(chat, config, persistentMemory, options = {}) {
  const systemPrompt = buildSystemPrompt(chat, config, persistentMemory);
  return [{ role: 'system', content: systemPrompt }, ...(await selectRecentMessages(chat, config, options))];
}

function buildSystemPrompt(chat, config, persistentMemory) {
  const languageInstruction =
    config.language === 'auto'
      ? 'Respond in the same language the user is using.'
      : `Respond in this language unless the user explicitly asks otherwise: ${config.language}.`;

  return [
    'You are My Computer, a self-hosted AI assistant running on the user machine.',
    config.userNickname ? `Call the user by this preferred name when natural: ${config.userNickname}.` : '',
    languageInstruction,
    buildTechnicalLevelInstruction(config),
    `Available tools: ${describeEnabledTools(config.tools).join(', ') || 'none'}.`,
    'Final answer formatting: write clean Markdown. Start with the direct answer, then use short sections, bullets, numbered steps, tables, or fenced code blocks only when they make the answer easier to scan. Avoid dumping raw logs unless the user asked for them.',
    config.tools?.terminal
      ? 'When local state, files, commands, or host actions matter, call run_terminal_command before your final answer. Avoid interactive commands unless you make them non-interactive; for package managers prefer flags like -y/--assumeyes when safe. Do not retry a failing or rate-limited command repeatedly.'
      : 'Terminal execution is disabled by user settings.',
    config.tools?.terminalMode === 'isolated'
      ? 'Terminal mode is soft-isolated: commands run from a My Computer sandbox HOME. This is not a full VM/container isolation; absolute paths can still touch the host.'
      : 'Terminal mode is standard: commands run on the user machine with the normal user environment.',
    config.tools?.alwaysAllow
      ? 'The user enabled automatic tool execution. Tools may run without an extra confirmation step.'
      : 'The user disabled automatic tool execution. The app may ask the user to approve a tool before it actually runs.',
    config.tools?.webSearch
      ? 'Use web_search when current or source-backed information matters. If web_search returns sources, include a final "Fontes" section with the URLs and briefly say which search method was used.'
      : 'Web search is disabled by user settings.',
    config.tools?.webSearch && !config.tools?.searchTerminal
      ? 'The terminal-backed search method is disabled; web_search may report that it needs the setting enabled.'
      : '',
    config.tools?.chatMemory
      ? 'When stable user preferences, decisions, file paths, facts, or TODOs appear inside this chat, use memory_chat to read or update the current chat memory.'
      : 'Chat memory editing through tools is disabled by user settings.',
    config.tools?.persistentMemory
      ? 'When stable information should survive across all chats, use persistent_memory to read or update the global memory.'
      : 'Persistent memory editing through tools is disabled by user settings.',
    config.tools?.autoCompact
      ? 'When the current conversation is getting long or important context should be preserved, use compact_context to update the durable compacted context.'
      : 'Automatic context compaction through tools is disabled by user settings.',
    config.tools?.chatTitle
      ? 'If the chat title is generic, call rename_chat after the first user message with a short descriptive title. You may rename it later if the topic changes.'
      : 'Chat title editing through tools is disabled by user settings.',
    config.tools?.chatMemory
      ? 'For memory_chat write operations, send the full edited Markdown memory file, using the current memory below as the base.'
      : '',
    config.tools?.persistentMemory
      ? 'For persistent_memory write operations, send the full edited Markdown memory file, using the current persistent memory below as the base.'
      : '',
    'Be careful with host actions, explain risky commands before choosing them, and prefer read-only commands when inspection is enough.',
    `Runtime folder: ${runtimeHome}`,
    `Current chat title: ${chat.title}`,
    `Chat memory file: ${chat.paths.memory}`,
    `Saved context file: ${chat.paths.context}`,
    `Current context window file: ${chat.paths.contextWindow}`,
    '',
    'Always use the persistent memory, chat memory, and compacted context below as durable context.',
    '',
    '<persistent_memory_md>',
    persistentMemory || 'Sem memória persistente.',
    '</persistent_memory_md>',
    '',
    '<chat_memory_md>',
    chat.memory || 'Sem memória de chat.',
    '</chat_memory_md>',
    '',
    '<compacted_context_md>',
    chat.contextSummary || 'Sem contexto compactado.',
    '</compacted_context_md>',
    '',
    '<extra_user_preferences>',
    config.systemPromptExtra || 'Nenhuma preferencia extra configurada.',
    '</extra_user_preferences>',
    '',
    '<chat_specific_preferences>',
    chat.systemPromptExtra || 'Nenhuma preferência específica do chat.',
    '</chat_specific_preferences>',
  ].join('\n');
}

function buildTechnicalLevelInstruction(config) {
  if (config.technicalGuidanceEnabled === false) return '';

  const level = String(config.technicalLevel || 'balanced');
  const shared =
    'Adapt your explanations and autonomy to the user technical level. This changes tone and decision-making transparency, but never bypasses tool safety, user approval settings, or explicit user constraints.';
  const instructions = {
    beginner:
      'User technical level: beginner. Explain technical terms in simple language, name risks before commands, prefer a short plan before host-changing work, and ask for clarification or confirmation when a request is ambiguous, destructive, expensive, or likely to affect system configuration. Do not assume the user understands terminal side effects.',
    careful:
      'User technical level: careful intermediate. Be transparent about commands and tradeoffs, explain non-obvious terms, and ask before risky or ambiguous host-changing actions. For clear low-risk requests, proceed with concise explanation.',
    balanced:
      'User technical level: balanced. This is the default. Ask clarifying questions when the request is genuinely ambiguous, explain when useful, and execute clear instructions without unnecessary ceremony.',
    advanced:
      'User technical level: advanced. Trust precise instructions, keep explanations concise, and proceed on clear commands. Mention risks briefly when a command changes the system, installs software, deletes files, or exposes credentials.',
    expert:
      'User technical level: expert. Assume strong technical fluency, avoid basic explanations, and be direct. Ask questions only when needed to avoid a wrong or unsafe action. Still summarize commands and material side effects.',
  };

  return `${shared}\n${instructions[level] || instructions.balanced}`;
}

async function selectRecentMessages(chat, config, options = {}) {
  const selected = [];
  let total = 0;

  for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
    const message = chat.messages[index];
    if (!['user', 'assistant'].includes(message.role)) continue;
    if (message.status === 'failed') continue;
    const rendered = await renderProviderMessage(chat, message, config, options);
    const size = estimateMessageSize(rendered.content) + 20;
    if (selected.length && total + size > MAX_CONTEXT_CHARS) break;
    selected.unshift(rendered);
    total += size;
  }

  return selected;
}

async function executeToolCall(chatId, toolCall, config = {}) {
  const name = toolCall?.function?.name;
  let input = {};
  try {
    input = JSON.parse(toolCall?.function?.arguments || '{}');
  } catch (error) {
    input = { parseError: error.message, raw: toolCall?.function?.arguments || '' };
  }

  if (!isToolEnabled(name, config.tools || {})) {
    return {
      id: toolCall.id,
      name: name || 'unknown_tool',
      input,
      result: { error: `Tool desabilitada nas configurações: ${name}` },
      createdAt: new Date().toISOString(),
    };
  }

  if (name === 'memory_chat') {
    return executeMemoryToolCall(chatId, toolCall.id, input);
  }

  if (name === 'persistent_memory') {
    return executePersistentMemoryToolCall(chatId, toolCall.id, input);
  }

  if (name === 'compact_context') {
    return executeCompactContextToolCall(chatId, toolCall.id, input);
  }

  if (name === 'rename_chat') {
    return executeRenameChatToolCall(chatId, toolCall.id, input);
  }

  if (name === 'web_search') {
    return executeWebSearchToolCall(chatId, toolCall.id, input, config);
  }

  if (name !== 'run_terminal_command') {
    return {
      id: toolCall.id,
      name: name || 'unknown_tool',
      input,
      result: { error: `Unknown tool: ${name}` },
      createdAt: new Date().toISOString(),
    };
  }

  await appendEvent({
    type: 'tool.run_terminal_command.requested',
    chatId,
    details: {
      command: input.command,
      timeoutSeconds: input.timeoutSeconds,
      terminalMode: config.tools?.terminalMode || 'standard',
    },
  });
  const result = await runTerminalCommand(input.command, {
    timeoutSeconds: input.timeoutSeconds,
    terminalMode: config.tools?.terminalMode,
  });
  await appendEvent({
    type: 'tool.run_terminal_command.completed',
    chatId,
    details: {
      command: input.command,
      timeoutSeconds: input.timeoutSeconds,
      terminalMode: result.terminalMode,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
    },
  });

  return {
    id: toolCall.id,
    name,
    input: { command: input.command },
    result,
    createdAt: new Date().toISOString(),
  };
}

async function executeRenameChatToolCall(chatId, toolCallId, input) {
  const title = String(input.title || '').trim();
  if (!title) {
    return {
      id: toolCallId,
      name: 'rename_chat',
      input,
      result: { error: 'title is required' },
      createdAt: new Date().toISOString(),
    };
  }

  const metadata = await updateChatMetadata(chatId, { title });
  await appendEvent({
    type: 'tool.rename_chat',
    chatId,
    details: { title: metadata.title, reason: input.reason },
  });

  return {
    id: toolCallId,
    name: 'rename_chat',
    input,
    result: {
      action: 'rename',
      title: metadata.title,
    },
    createdAt: new Date().toISOString(),
  };
}

async function executeCompactContextToolCall(chatId, toolCallId, input) {
  const compacted = await compactChat(chatId);
  await appendEvent({
    type: 'tool.compact_context',
    chatId,
    details: { reason: input.reason },
  });
  return {
    id: toolCallId,
    name: 'compact_context',
    input,
    result: {
      action: 'compact',
      summary: truncate(compacted.summary, 12000),
    },
    createdAt: new Date().toISOString(),
  };
}

function buildEnabledToolDefinitions(tools = {}) {
  return [
    tools.terminal !== false ? terminalToolDefinition : null,
    tools.webSearch !== false ? webSearchToolDefinition : null,
    tools.chatMemory !== false ? memoryChatToolDefinition : null,
    tools.persistentMemory !== false ? persistentMemoryToolDefinition : null,
    tools.autoCompact !== false ? compactContextToolDefinition : null,
    tools.chatTitle !== false ? renameChatToolDefinition : null,
  ].filter(Boolean);
}

function describeEnabledTools(tools = {}) {
  return [
    tools.terminal !== false ? 'run_terminal_command' : null,
    tools.webSearch !== false ? 'web_search' : null,
    tools.chatMemory !== false ? 'memory_chat' : null,
    tools.persistentMemory !== false ? 'persistent_memory' : null,
    tools.autoCompact !== false ? 'compact_context' : null,
    tools.chatTitle !== false ? 'rename_chat' : null,
  ].filter(Boolean);
}

function isToolEnabled(name, tools = {}) {
  if (name === 'run_terminal_command') return tools.terminal !== false;
  if (name === 'web_search') return tools.webSearch !== false;
  if (name === 'memory_chat') return tools.chatMemory !== false;
  if (name === 'persistent_memory') return tools.persistentMemory !== false;
  if (name === 'compact_context') return tools.autoCompact !== false;
  if (name === 'rename_chat') return tools.chatTitle !== false;
  return true;
}

async function executeWebSearchToolCall(chatId, toolCallId, input, config = {}) {
  const query = String(input.query || '').trim();
  await appendEvent({
    type: 'tool.web_search.requested',
    chatId,
    details: {
      query,
      reason: input.reason,
      method: config.tools?.searchTerminal ? 'terminal' : 'disabled',
    },
  });

  if (!config.tools?.searchTerminal) {
    const result = {
      error:
        'A pesquisa via terminal está desligada nas configurações. Ative "Pesquisa via terminal" para permitir web_search neste MVP.',
      query,
      method: 'disabled',
      results: [],
    };
    await appendEvent({ type: 'tool.web_search.blocked', chatId, details: { query } });
    return {
      id: toolCallId,
      name: 'web_search',
      input,
      result,
      createdAt: new Date().toISOString(),
    };
  }

  const result = await runWebSearch(query, {
    maxResults: input.maxResults,
    terminalMode: config.tools?.terminalMode,
  });
  await appendEvent({
    type: 'tool.web_search.completed',
    chatId,
    details: {
      query,
      resultCount: result.results?.length || 0,
      method: result.method,
      durationMs: result.terminal?.durationMs,
      exitCode: result.terminal?.exitCode,
    },
  });

  return {
    id: toolCallId,
    name: 'web_search',
    input,
    result,
    createdAt: new Date().toISOString(),
  };
}

async function executePersistentMemoryToolCall(chatId, toolCallId, input) {
  const action = input.action || 'read';
  const previous = await readPersistentMemory();

  if (action === 'read') {
    await appendEvent({ type: 'tool.persistent_memory.read', chatId, details: { reason: input.reason } });
    return {
      id: toolCallId,
      name: 'persistent_memory',
      input,
      result: {
        action,
        content: truncate(previous, 12000),
      },
      createdAt: new Date().toISOString(),
    };
  }

  const content = String(input.content || '').trim();
  if (!content) {
    return {
      id: toolCallId,
      name: 'persistent_memory',
      input,
      result: {
        action,
        error: 'content is required for write and append actions',
      },
      createdAt: new Date().toISOString(),
    };
  }

  const next =
    action === 'append'
      ? `${previous.trim()}\n\n${content}\n`
      : content.endsWith('\n')
        ? content
        : `${content}\n`;

  await writePersistentMemory(next);
  await appendEvent({
    type: `tool.persistent_memory.${action}`,
    chatId,
    details: { reason: input.reason },
  });

  return {
    id: toolCallId,
    name: 'persistent_memory',
    input,
    result: {
      action,
      previousContent: truncate(previous, 4000),
      content: truncate(next, 12000),
    },
    createdAt: new Date().toISOString(),
  };
}

async function executeMemoryToolCall(chatId, toolCallId, input) {
  const action = input.action || 'read';
  const previous = await readMemory(chatId);
  const chat = await readChat(chatId);

  if (action === 'read') {
    await appendEvent({ type: 'tool.memory_chat.read', chatId, details: { reason: input.reason } });
    return {
      id: toolCallId,
      name: 'memory_chat',
      input,
      result: {
        action,
        path: chat.paths.memory,
        content: truncate(previous, 12000),
      },
      createdAt: new Date().toISOString(),
    };
  }

  const content = String(input.content || '').trim();
  if (!content) {
    return {
      id: toolCallId,
      name: 'memory_chat',
      input,
      result: {
        action,
        path: chat.paths.memory,
        error: 'content is required for write and append actions',
      },
      createdAt: new Date().toISOString(),
    };
  }

  const next =
    action === 'append'
      ? `${previous.trim()}\n\n${content}\n`
      : content.endsWith('\n')
        ? content
        : `${content}\n`;

  await writeMemory(chatId, next);
  await appendEvent({
    type: `tool.memory_chat.${action}`,
    chatId,
    details: { reason: input.reason, path: chat.paths.memory },
  });

  return {
    id: toolCallId,
    name: 'memory_chat',
    input,
    result: {
      action,
      path: chat.paths.memory,
      previousContent: truncate(previous, 4000),
      content: truncate(next, 12000),
    },
    createdAt: new Date().toISOString(),
  };
}

function renderMessageForModel(message) {
  const toolText = (message.toolUses || [])
    .map((toolUse) =>
      [
        `Tool used: ${toolUse.name}`,
        toolUse.input?.command ? `Command: ${toolUse.input.command}` : `Input: ${JSON.stringify(toolUse.input || {})}`,
        `Exit code: ${toolUse.result?.exitCode ?? 'unknown'}`,
        toolUse.result?.stdout ? `Stdout:\n${truncate(toolUse.result.stdout, 4000)}` : '',
        toolUse.result?.stderr ? `Stderr:\n${truncate(toolUse.result.stderr, 2000)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  return [toolText, message.content, renderAttachmentsForModel(message.attachments)].filter(Boolean).join('\n\n');
}

async function renderProviderMessage(chat, message, config, options = {}) {
  if (message.role !== 'user') {
    return { role: message.role, content: renderMessageForModel(message) };
  }

  const attachments = message.attachments || [];
  const supportsImages = modelSupportsImages(config.provider, config.model, config);
  const modelMetadata = getModelMetadata(config.provider, config.model, config);
  if (options.strictImageSupportForMessageId === message.id) {
    const unsupportedImage = attachments.find((attachment) => attachment.kind === 'image' && !supportsImages);
    if (unsupportedImage) {
      const error = new Error(
        `O modelo ${config.model} não está marcado como compatível com imagens. Troque para um modelo vision ou ative "este modelo suporta imagens" no modelo personalizado.`,
      );
      error.statusCode = 400;
      throw error;
    }

    const imageAttachments = attachments.filter((attachment) => attachment.kind === 'image');
    if (modelMetadata.maxInputImages && imageAttachments.length > modelMetadata.maxInputImages) {
      const error = new Error(
        `O modelo ${config.model} aceita até ${modelMetadata.maxInputImages} imagem(ns) por mensagem. Remova anexos ou escolha outro modelo.`,
      );
      error.statusCode = 400;
      throw error;
    }
    const oversizedImage = imageAttachments.find(
      (attachment) => modelMetadata.maxFileSizeMB && attachment.size > modelMetadata.maxFileSizeMB * 1024 * 1024,
    );
    if (oversizedImage) {
      const error = new Error(
        `A imagem ${oversizedImage.name} excede o limite deste modelo (${modelMetadata.maxFileSizeMB} MB).`,
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const text = renderMessageForModel(message);
  const imageAttachments = attachments.filter((attachment) => attachment.kind === 'image' && supportsImages);
  if (!imageAttachments.length) {
    return { role: 'user', content: text };
  }

  const content = [{ type: 'text', text }];
  for (const attachment of imageAttachments) {
    try {
      const file = await readAttachmentFile(chat.id, attachment.id);
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${attachment.mimeType};base64,${file.data.toString('base64')}`,
        },
      });
    } catch (error) {
      content[0].text += `\n\n[Imagem não enviada: ${attachment.name} - ${error.message}]`;
    }
  }

  return { role: 'user', content };
}

async function resolveMessageAttachments(chat, options = {}) {
  if (options.retryMessageId) {
    const existing = chat.messages.find((message) => message.id === options.retryMessageId && message.role === 'user');
    return existing?.attachments || [];
  }

  const ids = Array.isArray(options.attachmentIds) ? options.attachmentIds : [];
  if (!ids.length) return [];
  if (ids.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    const error = new Error(`Envie no máximo ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem neste MVP.`);
    error.statusCode = 400;
    throw error;
  }
  const attachmentsById = new Map((chat.attachments || []).map((attachment) => [attachment.id, attachment]));
  return ids
    .map((id) => attachmentsById.get(id))
    .filter(Boolean)
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: attachment.path,
      kind: attachment.kind,
      sendMode: attachment.sendMode,
      extractedText: attachment.extractedText,
      previewText: attachment.previewText,
      extractionStatus: attachment.extractionStatus,
      extractionNote: attachment.extractionNote,
    }));
}

function renderAttachmentsForModel(attachments = []) {
  if (!attachments.length) return '';
  const parts = ['<attachments>'];
  for (const attachment of attachments) {
    parts.push(
      [
        `## ${attachment.name}`,
        `- id: ${attachment.id}`,
        `- type: ${attachment.mimeType || 'application/octet-stream'}`,
        `- kind: ${attachment.kind}`,
        `- saved_path: ${attachment.path}`,
        `- send_mode: ${attachment.sendMode}`,
        attachment.extractionNote ? `- note: ${attachment.extractionNote}` : '',
        attachment.extractedText
          ? `\n<document_text name="${escapeXmlAttribute(attachment.name)}">\n${truncate(attachment.extractedText, 60000)}\n</document_text>`
          : '\nSem texto extraído. A IA pode usar o terminal para ler o arquivo salvo se a tool de terminal estiver ligada.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  parts.push('</attachments>');
  return parts.join('\n\n');
}

function renderTranscript(messages, maxChars) {
  const parts = messages.map((message) => {
    const label = message.role === 'assistant' ? 'Assistant' : 'User';
    return `### ${label} - ${message.createdAt}\n\n${renderMessageForModel(message)}`;
  });
  return truncate(parts.join('\n\n'), maxChars);
}

function estimateMessageSize(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item.type === 'text') return item.text?.length || 0;
        if (item.type === 'image_url') return 4000;
        return JSON.stringify(item).length;
      })
      .reduce((sum, value) => sum + value, 0);
  }
  return JSON.stringify(content || '').length;
}

function escapeXmlAttribute(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function parseToolArguments(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return { raw: String(value || '') };
  }
}

function truncate(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated]`;
}
