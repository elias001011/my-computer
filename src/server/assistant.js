import { runtimeHome } from './paths.js';
import { callProviderChat, callProviderNativeWebSearch } from './provider-client.js';
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
  let providerUsed = effectiveConfig.provider;
  let modelUsed = effectiveConfig.model;

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
        chatId,
      });
      providerUsed = assistantMessage.providerUsed || providerUsed;
      modelUsed = assistantMessage.modelUsed || modelUsed;

      const toolCalls = normalizeAssistantToolCalls(assistantMessage.tool_calls || [], assistantMessage.content, effectiveConfig.tools);
      if (!toolCalls.length) {
        finalContent = sanitizeAssistantToolLikeText(assistantMessage.content || '');
        break;
      }

      workingMessages.push({
        role: 'assistant',
        content: sanitizeAssistantToolLikeText(assistantMessage.content || ''),
        tool_calls: toolCalls,
      });

      if (effectiveConfig.tools?.alwaysAllow !== true) {
        const safeToolCalls = toolCalls.filter((toolCall) => !toolRequiresApproval(toolCall, effectiveConfig));
        const approvalToolCalls = toolCalls.filter((toolCall) => toolRequiresApproval(toolCall, effectiveConfig));
        for (const toolCall of safeToolCalls) {
          const toolUse = await executeToolCall(chatId, toolCall, effectiveConfig);
          toolUses.push(toolUse);
          appendToolResultForModel(workingMessages, toolCall, toolUse);
          if (toolUse.name === 'web_search' && toolUse.result?.error && toolUse.result?.method === 'native') {
            finalContent = renderToolFailureMessage(toolUse);
            break;
          }
        }
        if (finalContent) break;
        if (!approvalToolCalls.length) continue;

        if (chatBefore.title === 'Novo chat' && !toolCalls.some((toolCall) => toolCall.function?.name === 'rename_chat')) {
          await updateChatMetadata(chatId, { title: trimmed });
        }
        const pendingAssistantMessage = createToolApprovalMessage(assistantMessage, toolCalls, workingMessages, effectiveConfig, {
          preapprovedToolUses: safeToolCalls.map((toolCall) => toolUses.find((toolUse) => toolUse.id === toolCall.id)).filter(Boolean),
          approvalToolCalls,
          providerUsed,
          modelUsed,
        });
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
            toolCount: approvalToolCalls.length,
            tools: approvalToolCalls.map((toolCall) => toolCall.function?.name).filter(Boolean),
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
        appendToolResultForModel(workingMessages, toolCall, toolUse);
        if (toolUse.name === 'web_search' && toolUse.result?.error && toolUse.result?.method === 'native') {
          finalContent = renderToolFailureMessage(toolUse);
          break;
        }
      }
      if (finalContent) break;
      if (toolCalls.every((toolCall) => !shouldReturnToolOutput(toolCall))) {
        finalContent = sanitizeAssistantToolLikeText(assistantMessage.content || '') || 'Ação executada.';
        break;
      }
    }

    if (!finalContent) {
      try {
        const assistantMessage = await callProviderChat({
          config: effectiveConfig,
          provider: effectiveConfig.provider,
          model: effectiveConfig.model,
          messages: workingMessages,
          tools: [],
          modelSettings: effectiveConfig.modelSettings,
          chatId,
        });
        providerUsed = assistantMessage.providerUsed || providerUsed;
        modelUsed = assistantMessage.modelUsed || modelUsed;
        finalContent =
          sanitizeAssistantToolLikeText(assistantMessage.content || '') ||
          'Terminei a execução das tools, mas não recebi texto final.';
      } catch (error) {
        const searchToolUse = [...toolUses].reverse().find((toolUse) => toolUse.name === 'web_search');
        if (!searchToolUse) throw error;
        finalContent = renderWebSearchFallbackAnswer(searchToolUse, error.message);
      }
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
    modelUsed,
    providerUsed,
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

export async function continueToolApproval(chatId, messageId, decision = 'approve', options = {}) {
  const chat = await readChat(chatId);
  const pendingMessage = chat.messages.find((message) => message.id === messageId && message.role === 'assistant');
  if (!pendingMessage?.pendingToolApproval) {
    const error = new Error('Aprovação de tool não encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const pendingState = pendingMessage.pendingToolApproval || {};
  const approvalToolCalls = pendingState.approvalToolCalls || pendingState.toolCalls || [];
  const decisions = { ...(pendingState.decisions || {}) };
  const targetToolCall =
    approvalToolCalls.find((toolCall) => toolCall.id === options.toolCallId) ||
    approvalToolCalls.find((toolCall) => !decisions[toolCall.id]);
  if (!targetToolCall) {
    const error = new Error('Nenhuma tool pendente para aprovar.');
    error.statusCode = 400;
    throw error;
  }
  if (options.toolCallId && decisions[targetToolCall.id]) {
    return { chat: await readChat(chatId) };
  }
  const normalizedDecision = decision === 'approve' ? 'approve' : 'deny';
  decisions[targetToolCall.id] = normalizedDecision;

  const interimToolUses = (pendingMessage.toolUses || []).map((toolUse) => {
    if (toolUse.id !== targetToolCall.id) return toolUse;
    if (normalizedDecision === 'approve') {
      return {
        ...toolUse,
        status: 'approved_pending_execution',
        result: { action: 'approved_pending_execution' },
      };
    }
    return {
      ...toolUse,
      status: 'denied',
      result: { action: 'denied_by_user', reason: 'Negado pelo usuário na UI.' },
    };
  });

  await appendEvent({
    type: normalizedDecision === 'approve' ? 'tool.approval.item_approved' : 'tool.approval.item_denied',
    chatId,
    details: {
      messageId,
      toolCallId: targetToolCall.id,
      toolName: targetToolCall.function?.name,
    },
  });

  const remaining = approvalToolCalls.filter((toolCall) => !decisions[toolCall.id]);
  if (remaining.length) {
    await updateMessage(chatId, messageId, {
      status: 'needs_tool_approval',
      content: pendingMessage.content || 'A IA solicitou tools e está aguardando aprovação.',
      toolUses: interimToolUses,
      pendingToolApproval: {
        ...pendingState,
        decisions,
      },
    });
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
  const workingMessages = pendingState.providerMessages || [];
  const toolCalls = pendingState.toolCalls || approvalToolCalls;
  const toolUses = [...(pendingState.preapprovedToolUses || [])];

  await updateMessage(chatId, messageId, {
    status: 'running_tools',
    content: pendingMessage.content || 'Executando tools aprovadas e registrando negativas...',
    toolUses: interimToolUses,
  });
  await appendEvent({ type: 'tool.approval.completed', chatId, details: { messageId, toolCount: approvalToolCalls.length } });

  for (const toolCall of toolCalls) {
    if (!approvalToolCalls.some((approvalToolCall) => approvalToolCall.id === toolCall.id)) continue;
    const toolUse =
      decisions[toolCall.id] === 'approve'
        ? await executeToolCall(chatId, toolCall, effectiveConfig)
        : createDeniedToolUse(toolCall);
    toolUses.push(toolUse);
    appendToolResultForModel(workingMessages, toolCall, toolUse);
  }

  const toolOutputsRequested = approvalToolCalls.some((toolCall) => shouldReturnToolOutput(toolCall));
  if (!toolOutputsRequested) {
    await updateMessage(chatId, messageId, {
      status: 'sent',
      content: sanitizeAssistantToolLikeText(pendingMessage.content || '') || 'Ação de tool concluída.',
      toolUses,
      pendingToolApproval: null,
      modelUsed: pendingMessage.modelUsed || effectiveConfig.model,
      providerUsed: pendingMessage.providerUsed || effectiveConfig.provider,
    });
    await appendEvent({ type: 'chat.message.completed', chatId, details: { approvedToolCount: toolUses.filter((toolUse) => toolUse.status !== 'denied').length, skippedFollowup: true } });
    return { chat: await readChat(chatId) };
  }

  const assistantMessage = await callProviderChat({
    config: effectiveConfig,
    provider: effectiveConfig.provider,
    model: effectiveConfig.model,
    messages: workingMessages,
    tools: [],
    modelSettings: effectiveConfig.modelSettings,
    chatId,
  });
  const finalContent = sanitizeAssistantToolLikeText(assistantMessage.content || '') || 'Tools executadas, mas o provider não retornou texto final.';
  await updateMessage(chatId, messageId, {
    status: 'sent',
    content: finalContent,
    toolUses,
    pendingToolApproval: null,
    modelUsed: assistantMessage.modelUsed || effectiveConfig.model,
    providerUsed: assistantMessage.providerUsed || effectiveConfig.provider,
  });

  const updatedChat = await readChat(chatId);
  const latestPersistentMemory = await readPersistentMemory();
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, latestPersistentMemory));
  await maybeAutoCompactChat(chatId, updatedChat, effectiveConfig, latestPersistentMemory);
  await appendEvent({ type: 'chat.message.completed', chatId, details: { approvedToolCount: toolUses.length } });
  return { chat: await readChat(chatId) };
}

function createToolApprovalMessage(assistantMessage, toolCalls, providerMessages, config, options = {}) {
  const preapprovedToolUses = options.preapprovedToolUses || [];
  const approvalToolCalls = options.approvalToolCalls || toolCalls;
  return createMessage(
    'assistant',
    sanitizeAssistantToolLikeText(assistantMessage.content || '') || 'A IA solicitou uma tool e está aguardando aprovação.',
    {
      status: 'needs_tool_approval',
      modelUsed: options.modelUsed || assistantMessage.modelUsed || config.model,
      providerUsed: options.providerUsed || assistantMessage.providerUsed || config.provider,
      toolUses: [
        ...preapprovedToolUses,
        ...approvalToolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function?.name || 'unknown_tool',
          input: normalizeToolInput(toolCall.function?.name, parseToolArguments(toolCall.function?.arguments)),
          status: 'pending_approval',
          approvalRequired: true,
          result: { action: 'pending_approval' },
          createdAt: new Date().toISOString(),
        })),
      ],
      pendingToolApproval: {
        toolCalls,
        approvalToolCalls,
        providerMessages,
        preapprovedToolUses,
        decisions: {},
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
    chatId,
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
    'For every tool call, set returnOutput to true only when you need the tool result to continue reasoning. Use returnOutput false for pure side effects such as rename_chat, successful memory writes, or compacting when you do not need the summary.',
    getSearchMode(config.tools) !== 'off'
      ? `Use web_search when current or source-backed information matters. Search mode is "${getSearchMode(config.tools)}": native means provider-side search, terminal means local terminal search, and both means native first with terminal fallback. If web_search returns sources, include a final "Fontes" section with the URLs and briefly say which search method was used.`
      : 'Web search is disabled by user settings.',
    getSearchMode(config.tools) === 'native'
      ? 'Terminal-backed search is disabled; web_search will not execute local terminal commands in this mode.'
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
      ? 'If the chat title is generic, call rename_chat after the first user message with a short descriptive title. For rename_chat, normally set returnOutput false.'
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
    return executeWebSearchToolCall(chatId, toolCall.id, normalizeWebSearchInput(input), config);
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
    getSearchMode(tools) !== 'off' ? webSearchToolDefinition : null,
    tools.chatMemory !== false ? memoryChatToolDefinition : null,
    tools.persistentMemory !== false ? persistentMemoryToolDefinition : null,
    tools.autoCompact !== false ? compactContextToolDefinition : null,
    tools.chatTitle !== false ? renameChatToolDefinition : null,
  ].filter(Boolean);
}

export function normalizeAssistantToolCalls(toolCalls = [], content = '', tools = {}) {
  const normalized = (Array.isArray(toolCalls) ? toolCalls : [])
    .map((toolCall, index) => normalizeToolCall(toolCall, index))
    .filter(Boolean);
  if (normalized.length) return normalized;
  if (getSearchMode(tools) === 'off') return [];

  const fakeWebSearchInput = extractFakeWebSearchInput(content);
  if (!fakeWebSearchInput) return [];
  return [
    {
      id: `synthetic_web_search_${Date.now()}`,
      type: 'function',
      function: {
        name: 'web_search',
        arguments: JSON.stringify(normalizeWebSearchInput(fakeWebSearchInput)),
      },
      synthetic: true,
    },
  ];
}

function normalizeToolCall(toolCall, index = 0) {
  if (!toolCall?.function) return null;
  const rawName = String(toolCall.function.name || '').trim();
  const rawArguments = String(toolCall.function.arguments || '{}').trim();
  const recovered = recoverMalformedToolCall(rawName, rawArguments);
  const name = recovered.name || rawName;
  if (!name) return null;
  return {
    ...toolCall,
    id: toolCall.id || `tool_call_${Date.now()}_${index}`,
    type: toolCall.type || 'function',
    function: {
      ...toolCall.function,
      name,
      arguments: JSON.stringify(normalizeToolInput(name, parseToolArguments(recovered.arguments || rawArguments))),
    },
  };
}

function recoverMalformedToolCall(name, args) {
  const trimmedName = String(name || '').trim();
  const trimmedArgs = String(args || '').trim();
  const directTool = trimmedName.match(/^(web_search|run_terminal_command|memory_chat|persistent_memory|compact_context|rename_chat)(?:\s*=?\s*|\s+)(\{[\s\S]*\})$/);
  if (directTool) return { name: directTool[1], arguments: directTool[2] };
  if (trimmedName === 'web_search' || trimmedName.endsWith('.web_search')) return { name: 'web_search', arguments: trimmedArgs };
  return { name: trimmedName, arguments: trimmedArgs };
}

function normalizeToolInput(name, input = {}) {
  if (name === 'web_search') return normalizeWebSearchInput(input);
  return input && typeof input === 'object' ? input : {};
}

export function normalizeWebSearchInput(input = {}) {
  const parsed = input?.parseError && input.raw ? extractJsonObject(input.raw) || {} : input;
  const query = String(parsed.query || parsed.q || '').trim();
  const reason = String(parsed.reason || parsed.why || 'Busca web solicitada pela IA.').trim();
  return {
    ...parsed,
    query,
    reason,
    maxResults: clampInteger(parsed.maxResults ?? parsed.max_results, 1, 8, 5),
  };
}

function extractFakeWebSearchInput(content = '') {
  const text = String(content || '');
  const tagged = text.match(/<web_search>\s*([\s\S]*?)\s*<\/web_search>/i);
  if (tagged) return extractJsonObject(tagged[1]);
  const inline = text.match(/\bweb_search\b\s*=?\s*(\{[\s\S]*?\})(?:\s*$|\s*<\/|\s*\n)/i);
  if (inline) return extractJsonObject(inline[1]);
  return null;
}

export function sanitizeAssistantToolLikeText(content = '') {
  return String(content || '')
    .replace(/<web_search>\s*[\s\S]*?\s*<\/web_search>/gi, '[Busca web solicitada como texto; o app processou isso como tool quando possível.]')
    .replace(/\bweb_search\b\s*=?\s*\{[\s\S]*?\}(?=\s*$|\s*<\/|\s*\n)/gi, '[Busca web solicitada como texto; o app processou isso como tool quando possível.]')
    .replace(/^Tool used:\s*\w+[\s\S]*?(?:\n\s*\n|$)/gi, '')
    .trim();
}

function extractJsonObject(value) {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function describeEnabledTools(tools = {}) {
  return [
    tools.terminal !== false ? 'run_terminal_command' : null,
    getSearchMode(tools) !== 'off' ? 'web_search' : null,
    tools.chatMemory !== false ? 'memory_chat' : null,
    tools.persistentMemory !== false ? 'persistent_memory' : null,
    tools.autoCompact !== false ? 'compact_context' : null,
    tools.chatTitle !== false ? 'rename_chat' : null,
  ].filter(Boolean);
}

function isToolEnabled(name, tools = {}) {
  if (name === 'run_terminal_command') return tools.terminal !== false;
  if (name === 'web_search') return getSearchMode(tools) !== 'off';
  if (name === 'memory_chat') return tools.chatMemory !== false;
  if (name === 'persistent_memory') return tools.persistentMemory !== false;
  if (name === 'compact_context') return tools.autoCompact !== false;
  if (name === 'rename_chat') return tools.chatTitle !== false;
  return true;
}

function toolRequiresApproval(toolCall, config = {}) {
  const name = toolCall?.function?.name;
  if (config.tools?.alwaysAllow === true) return false;
  if (name === 'run_terminal_command') return true;
  if (name === 'memory_chat' || name === 'persistent_memory' || name === 'compact_context' || name === 'rename_chat') {
    return true;
  }
  if (name === 'web_search') {
    const searchMode = getSearchMode(config.tools);
    if (searchMode === 'terminal') return true;
    if (searchMode === 'both' && !nativeSearchSupported(config.provider)) return true;
  }
  return false;
}

function createDeniedToolUse(toolCall) {
  return {
    id: toolCall.id,
    name: toolCall.function?.name || 'unknown_tool',
    input: normalizeToolInput(toolCall.function?.name, parseToolArguments(toolCall.function?.arguments)),
    status: 'denied',
    approvalRequired: true,
    result: { action: 'denied_by_user', reason: 'Negado pelo usuário na UI.' },
    createdAt: new Date().toISOString(),
  };
}

function shouldReturnToolOutput(toolCall) {
  const name = toolCall?.function?.name;
  const input = normalizeToolInput(name, parseToolArguments(toolCall?.function?.arguments));
  if (typeof input.returnOutput === 'boolean') return input.returnOutput;
  return name !== 'rename_chat';
}

function appendToolResultForModel(messages, toolCall, toolUse) {
  if (!shouldReturnToolOutput(toolCall)) return false;
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: toolUse.name,
    content: truncate(JSON.stringify(toolUse.result), 12000),
  });
  return true;
}

function renderToolFailureMessage(toolUse) {
  if (toolUse.name !== 'web_search') {
    return `A tool ${toolUse.name} falhou: ${toolUse.result?.error || 'erro desconhecido'}`;
  }
  return [
    'A busca web nativa falhou antes de retornar fontes.',
    '',
    `Erro: ${toolUse.result?.error || 'erro desconhecido'}`,
    '',
    'Você pode tentar novamente em alguns segundos, trocar para Pesquisa via terminal ou usar o modo Ambos para fallback automático.',
  ].join('\n');
}

function renderWebSearchFallbackAnswer(toolUse, providerError) {
  const results = Array.isArray(toolUse.result?.results) ? toolUse.result.results : [];
  if (!results.length) {
    return [
      'A busca foi executada, mas não consegui gerar uma resposta final com o provider.',
      '',
      `Erro do provider: ${providerError}`,
      toolUse.result?.error ? `Erro da busca: ${toolUse.result.error}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const lines = [
    'Encontrei estas fontes, mas o provider falhou antes de redigir a resposta final.',
    '',
    '## Fontes',
    ...results.map((result, index) => {
      const title = result.title || result.url;
      const snippet = result.snippet ? ` - ${result.snippet}` : '';
      return `${index + 1}. [${title}](${result.url})${snippet}`;
    }),
    '',
    `Método de busca: ${toolUse.result.method || 'web_search'}.`,
    `Erro do provider após a busca: ${providerError}`,
  ];
  return lines.join('\n');
}

async function executeWebSearchToolCall(chatId, toolCallId, input, config = {}) {
  const query = String(input.query || '').trim();
  const maxResults = clampInteger(input.maxResults, 1, 8, 5);
  const searchMode = getSearchMode(config.tools);
  await appendEvent({
    type: 'tool.web_search.requested',
    chatId,
    details: {
      query,
      reason: input.reason,
      maxResults,
      method: searchMode,
    },
  });

  if (searchMode === 'off') {
    const result = {
      error: 'Pesquisa web está desligada nas configurações.',
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

  let nativeError = null;
  if (searchMode === 'native' || searchMode === 'both') {
    try {
      const nativeResult = await callProviderNativeWebSearch({
        config,
        provider: config.provider,
        model: config.model,
        query,
        maxResults,
        chatId,
      });
      await appendEvent({
        type: 'tool.web_search.completed',
        chatId,
        details: {
          query,
          resultCount: nativeResult.results?.length || 0,
          method: nativeResult.method,
        },
      });
      return {
        id: toolCallId,
        name: 'web_search',
        input,
        result: nativeResult,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      nativeError = error;
      await appendEvent({
        type: 'tool.web_search.native_failed',
        chatId,
        details: {
          query,
          provider: config.provider,
          method: 'native',
          error: error.message,
          statusCode: error.statusCode || null,
        },
      });
      if (searchMode !== 'both') {
        return {
          id: toolCallId,
          name: 'web_search',
          input,
          result: {
            query,
            method: 'native',
            results: [],
            error: error.message,
          },
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  const result = await runWebSearch(query, {
    maxResults,
    terminalMode: config.tools?.terminalMode,
  });
  if (nativeError) {
    result.nativeError = nativeError.message;
    result.fallbackFrom = 'native';
  }
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

function getSearchMode(tools = {}) {
  const mode = String(tools.searchMode || '').trim();
  if (['off', 'native', 'terminal', 'both'].includes(mode)) return mode;
  if (tools.webSearch === false) return 'off';
  if (tools.searchTerminal === true) return 'terminal';
  return 'native';
}

function nativeSearchSupported(providerId) {
  return ['openai', 'groq', 'gemini', 'anthropic', 'xai', 'openrouter'].includes(providerId);
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
  if (message.role === 'assistant') return sanitizeAssistantToolLikeText(message.content || '');
  return [message.content, renderAttachmentsForModel(message.attachments)].filter(Boolean).join('\n\n');
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
        attachment.kind === 'pdf'
          ? '\nPDF is available for UI preview and local terminal inspection, but its text was not extracted into this prompt.'
          : '',
        attachment.kind === 'audio'
          ? '\nAudio is available as a saved file reference, but it was not transcribed into this prompt.'
          : '',
        attachment.kind === 'video'
          ? '\nVideo is available as a saved file reference, but it is not sent natively to the provider in this MVP.'
          : '',
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
