import { getRuntimeHome } from './paths.js';
import { callProviderChat, callProviderNativeWebSearch } from './provider-client.js';
import { getDefaultModelForProvider, getModelMetadata, modelSupportsImages } from './models.js';
import {
  appendEvent,
  appendMessages,
  createMessage,
  buildUserMemoryPromptContext,
  getRuntimeInfo,
  listUserMemoryFilesWithHints,
  readChat,
  readContextSummary,
  readMemory,
  readPersistentMemory,
  readAttachmentTextContent,
  readUserMemoryFile,
  replaceTextInAttachment,
  replaceTextInUserMemoryFile,
  searchUserMemoryFiles,
  loadConfig,
  readAttachmentFile,
  saveContextSnapshot,
  saveCurrentContextWindow,
  updateMemory,
  updatePersistentMemory,
  updateChatMetadata,
  updateMessage,
  writeContextSummary,
  writeAttachmentTextContent,
} from './store.js';
import {
  chatDocumentToolDefinition,
  compactContextToolDefinition,
  editPersistentMemoryUserToolDefinition,
  memoryChatToolDefinition,
  persistentMemoryToolDefinition,
  persistentMemoryUserToolDefinition,
  renameChatToolDefinition,
  runTerminalCommand,
  runWebSearch,
  sendEmailToolDefinition,
  terminalToolDefinition,
  webSearchToolDefinition,
} from './tools.js';
import { sendEmail } from './email.js';

const MAX_CONTEXT_CHARS = 28000;
const MAX_CONTEXT_SAVE_CHARS = 120000;
const MAX_TOOL_ROUNDS = 4;
const MAX_DEEP_INVESTIGATION_TOOL_ROUNDS = 8;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const INCOMPLETE_FINISH_REASONS = new Set(['length', 'max_tokens', 'model_length', 'token_limit']);
const MEMORY_TOOL_ACTIONS = new Set(['read', 'write', 'append']);
const DEFAULT_RUNNING_TOOL_STALE_MS = 20 * 60 * 1000;
const chatTurnLocks = new Map();
const toolApprovalLocks = new Map();
const activeChatRuns = new Map();
const GENERIC_CHAT_TITLES = new Set(['Novo chat', 'New chat']);

export async function sendUserMessage(chatId, content, options = {}) {
  return withChatTurnLock(chatId, () =>
    withActiveChatRun(chatId, 'message', (signal) => sendUserMessageLocked(chatId, content, { ...options, signal })),
  );
}

export async function stopChatRun(chatId, options = {}) {
  const key = String(chatId || '');
  const activeRun = activeChatRuns.get(key);
  if (!activeRun) {
    return {
      stopped: false,
      message: 'Nenhuma execução em andamento neste chat.',
    };
  }
  const reason = createUserStopError(options.reason);
  activeRun.controller.abort(reason);
  await appendEvent({
    type: 'chat.run.stop_requested',
    chatId,
    details: {
      operation: activeRun.operation,
      reason: options.reason || 'user_requested',
      startedAt: activeRun.startedAt,
    },
  });
  const waitMs = clampStopWaitMs(options.waitMs);
  const settled = await waitForRunSettle(activeRun.promise, waitMs);
  return {
    stopped: true,
    operation: activeRun.operation,
    settled,
    message: 'Solicitação de interrupção enviada.',
  };
}

async function sendUserMessageLocked(chatId, content, options = {}) {
  const operationSignal = options.signal;
  const scheduledTaskContext = options.scheduledTaskContext || null;
  const config = await loadConfig();
  throwIfStopped(operationSignal);
  const trimmed = String(content || '').trim();
  if (!trimmed && !options.retryMessageId && !options.continueMessageId) {
    const error = new Error('Mensagem vazia.');
    error.statusCode = 400;
    throw error;
  }

  const chatBefore = await readChat(chatId);
  ensureNoActiveToolApproval(chatBefore);
  const requestSource = resolveRequestSourceMessage(chatBefore, options);
  if ((options.retryMessageId || options.continueMessageId) && !requestSource) {
    const error = new Error('Mensagem para retry/continue não encontrada.');
    error.statusCode = 404;
    throw error;
  }
  ensureRequestSourceIsActionable(chatBefore, requestSource);
  const selectedAttachments = requestSource?.sourceUserMessage?.attachments || (await resolveMessageAttachments(chatBefore, options));
  const userMessage = requestSource?.sourceUserMessage
    ? await saveUserMessageForRequest(chatId, chatBefore, trimmed || requestSource.sourceUserMessage.content || '', requestSource.sourceUserMessage.id, selectedAttachments)
    : await saveUserMessageForRequest(chatId, chatBefore, trimmed, options.retryMessageId, selectedAttachments);
  if (userMessage.status !== 'sent') {
    await updateMessage(chatId, userMessage.id, {
      status: 'sent',
      error: null,
      sentAt: new Date().toISOString(),
    });
  }
  const chat = await readChat(chatId);
  const persistentMemory = scheduledTaskContext?.skipMemory ? null : await readPersistentMemory();
  const runtimeInfo = await getRuntimeInfo();
  const effectiveConfig = buildEffectiveConfig(config, chat, runtimeInfo, { modelSettings: chat.modelSettings || {} });
  const userMemoryContext = scheduledTaskContext?.skipMemory ? null : await buildUserMemoryPromptContext(effectiveConfig);
  const toolUses = [];
  const executionTrace = [];
  const enabledTools = buildEnabledToolDefinitions(effectiveConfig.tools, scheduledTaskContext, effectiveConfig.email);
  let providerUsed = effectiveConfig.provider;
  let modelUsed = effectiveConfig.model;
  const continuationGroupId = getMessageContinuationGroupId(userMessage);
  const attemptIndex = getNextAssistantAttemptIndex(chat.messages, continuationGroupId);
  const continuationReason = requestSource?.continuationReason || 'initial';
  const continuationMode = requestSource?.continuationMode || 'initial';
  const sourceAssistantMessage = requestSource?.sourceAssistantMessage || null;
  const retryOfMessageId = continuationMode === 'retry' ? sourceAssistantMessage?.id || null : null;
  const continuedFromMessageId = continuationMode === 'continue' ? sourceAssistantMessage?.id || null : null;
  const titleSeed = trimmed || userMessage.content || '';
  let assistantOutcome = null;

  try {
    const workingMessages = await buildProviderMessages(chat, effectiveConfig, persistentMemory, {
      strictImageSupportForMessageId: userMessage.id,
      userMemoryContext,
      skipMemory: scheduledTaskContext?.skipMemory === true,
      scheduledTaskContext,
    });
    if (continuationMode === 'continue') {
      workingMessages.push({
        role: 'user',
        content: buildContinuationPrompt(userMessage, sourceAssistantMessage),
      });
    }
    for (let round = 0; round < getMaxToolRounds(effectiveConfig); round += 1) {
      throwIfStopped(operationSignal);
      const assistantMessage = await callProviderChat({
        config: effectiveConfig,
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        messages: workingMessages,
        tools: enabledTools,
        modelSettings: effectiveConfig.modelSettings,
        chatId,
        signal: operationSignal,
      });
      throwIfStopped(operationSignal);
      providerUsed = assistantMessage.providerUsed || providerUsed;
      modelUsed = assistantMessage.modelUsed || modelUsed;
      const selectedConfig = withSelectedProviderConfig(effectiveConfig, providerUsed, modelUsed);

      const toolCalls = normalizeAssistantToolCalls(assistantMessage.tool_calls || [], assistantMessage.content, effectiveConfig.tools);
      if (toolCalls.length || assistantMessage.content) {
        executionTrace.push(createAssistantTraceEntry(assistantMessage, toolCalls, round + 1, 'tool_round'));
      }
      if (!toolCalls.length) {
        const finalContent = cleanAssistantContent(assistantMessage.content || '');
        assistantOutcome = {
          status: isIncompleteFinishReason(assistantMessage.finishReason) ? 'incomplete' : 'sent',
          content:
            finalContent.content ||
            (isIncompleteFinishReason(assistantMessage.finishReason)
              ? 'A resposta foi interrompida antes de concluir.'
              : 'Terminei a execução, mas não recebi texto final.'),
          thinking: finalContent.thinking,
          finishReason: assistantMessage.finishReason || null,
          continuationAvailable: isIncompleteFinishReason(assistantMessage.finishReason),
          error: null,
        };
        break;
      }

      workingMessages.push({
        role: 'assistant',
        content: sanitizeAssistantToolLikeText(assistantMessage.content || ''),
        tool_calls: toolCalls,
      });

      if (scheduledTaskContext) {
        // Unattended run: no user is present to approve anything. A tool either
        // sits in the task's own allowlist (treated as pre-approved) or it is
        // denied outright -- it never reaches the interactive approval pause.
        for (const toolCall of toolCalls) {
          throwIfStopped(operationSignal);
          const toolUse = isToolAllowedForScheduledTask(toolCall, scheduledTaskContext)
            ? await executeToolCallSafely(chatId, toolCall, {
                ...selectedConfig,
                // isToolEnabled() below reads config.tools directly; tools like send_email
                // that have no global on/off flag are gated purely by this mask (allowlist +
                // isEmailConfigured), so execution must see the masked tools, not the raw ones.
                tools: applyScheduledTaskToolMask(selectedConfig.tools, scheduledTaskContext, selectedConfig.email),
                signal: operationSignal,
              })
            : createScheduledTaskDeniedToolUse(toolCall);
          throwIfStopped(operationSignal);
          toolUses.push(toolUse);
          executionTrace.push(createToolTraceEntry(toolUse));
          appendToolResultForModel(workingMessages, toolCall, toolUse);
          if (toolUseHasExecutionFailure(toolUse)) {
            const failedContent = cleanAssistantContent(assistantMessage.content || '');
            assistantOutcome = {
              status: 'incomplete',
              content: renderToolFailureMessage(toolUse),
              thinking: failedContent.thinking,
              finishReason: assistantMessage.finishReason || null,
              continuationAvailable: true,
              error: toolUse.result?.error || describeToolFailure(toolUse),
            };
            break;
          }
        }
        if (assistantOutcome) break;
        if (toolCalls.every((toolCall) => !shouldReturnToolOutput(toolCall))) {
          const actionContent = cleanAssistantContent(assistantMessage.content || '');
          assistantOutcome = {
            status: isIncompleteFinishReason(assistantMessage.finishReason) ? 'incomplete' : 'sent',
            content: actionContent.content || 'Ação executada.',
            thinking: actionContent.thinking,
            finishReason: assistantMessage.finishReason || null,
            continuationAvailable: isIncompleteFinishReason(assistantMessage.finishReason),
            error: null,
          };
          break;
        }
        continue;
      }

      const approvalToolCalls = toolCalls.filter((toolCall) => toolRequiresApproval(toolCall, selectedConfig));
      if (approvalToolCalls.length) {
        const safeToolCalls = toolCalls.filter((toolCall) => !toolRequiresApproval(toolCall, selectedConfig));
        for (const toolCall of safeToolCalls) {
          throwIfStopped(operationSignal);
          const toolUse = await executeToolCallSafely(chatId, toolCall, { ...selectedConfig, signal: operationSignal });
          throwIfStopped(operationSignal);
          toolUses.push(toolUse);
          executionTrace.push(createToolTraceEntry(toolUse));
          appendToolResultForModel(workingMessages, toolCall, toolUse);
          if (toolUseHasExecutionFailure(toolUse)) {
            const failedContent = cleanAssistantContent(assistantMessage.content || '');
            assistantOutcome = {
              status: 'incomplete',
              content: renderToolFailureMessage(toolUse),
              thinking: failedContent.thinking,
              finishReason: assistantMessage.finishReason || null,
              continuationAvailable: true,
              error: toolUse.result?.error || describeToolFailure(toolUse),
            };
            break;
          }
        }
        if (assistantOutcome) break;

        throwIfStopped(operationSignal);
        if (isGenericChatTitle(chatBefore.title) && !toolCalls.some((toolCall) => toolCall.function?.name === 'rename_chat')) {
          await updateChatMetadata(chatId, { title: titleSeed });
        }
        const pendingAssistantMessage = createToolApprovalMessage(assistantMessage, toolCalls, workingMessages, effectiveConfig, {
          preapprovedToolUses: safeToolCalls.map((toolCall) => toolUses.find((toolUse) => toolUse.id === toolCall.id)).filter(Boolean),
          approvalToolCalls,
          executionTrace,
          providerUsed,
          modelUsed,
          sourceUserMessage: userMessage,
          continuationGroupId,
          attemptIndex,
          continuationReason,
          retryOfMessageId,
          continuedFromMessageId,
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
            sourceUserMessageId: userMessage.id,
            groupId: continuationGroupId,
            attemptIndex,
            continuationReason,
            retryOfMessageId,
            continuedFromMessageId,
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
        throwIfStopped(operationSignal);
        const toolUse = await executeToolCallSafely(chatId, toolCall, { ...selectedConfig, signal: operationSignal });
        throwIfStopped(operationSignal);
        toolUses.push(toolUse);
        executionTrace.push(createToolTraceEntry(toolUse));
        appendToolResultForModel(workingMessages, toolCall, toolUse);
        if (toolUseHasExecutionFailure(toolUse)) {
          const failedContent = cleanAssistantContent(assistantMessage.content || '');
          assistantOutcome = {
            status: 'incomplete',
            content: renderToolFailureMessage(toolUse),
            thinking: failedContent.thinking,
            finishReason: assistantMessage.finishReason || null,
            continuationAvailable: true,
            error: toolUse.result?.error || describeToolFailure(toolUse),
          };
          break;
        }
      }
      if (assistantOutcome) break;
      if (toolCalls.every((toolCall) => !shouldReturnToolOutput(toolCall))) {
        const actionContent = cleanAssistantContent(assistantMessage.content || '');
        assistantOutcome = {
          status: isIncompleteFinishReason(assistantMessage.finishReason) ? 'incomplete' : 'sent',
          content: actionContent.content || 'Ação executada.',
          thinking: actionContent.thinking,
          finishReason: assistantMessage.finishReason || null,
          continuationAvailable: isIncompleteFinishReason(assistantMessage.finishReason),
          error: null,
        };
        break;
      }
    }

    if (!assistantOutcome) {
      try {
        throwIfStopped(operationSignal);
        const assistantMessage = await callProviderChat({
          config: effectiveConfig,
          provider: effectiveConfig.provider,
          model: effectiveConfig.model,
          messages: workingMessages,
          tools: [],
          modelSettings: effectiveConfig.modelSettings,
          chatId,
          signal: operationSignal,
        });
        throwIfStopped(operationSignal);
        providerUsed = assistantMessage.providerUsed || providerUsed;
        modelUsed = assistantMessage.modelUsed || modelUsed;
        executionTrace.push(createAssistantTraceEntry(assistantMessage, [], executionTrace.length + 1, 'final'));
        const finalContent = cleanAssistantContent(assistantMessage.content || '');
        assistantOutcome = {
          status: isIncompleteFinishReason(assistantMessage.finishReason) ? 'incomplete' : 'sent',
          content: finalContent.content || 'Terminei a execução das tools, mas não recebi texto final.',
          thinking: finalContent.thinking,
          finishReason: assistantMessage.finishReason || null,
          continuationAvailable: isIncompleteFinishReason(assistantMessage.finishReason),
          error: null,
        };
      } catch (error) {
        if (isUserStopError(error)) {
          assistantOutcome = buildStoppedOutcome();
        } else {
          const searchToolUse = [...toolUses].reverse().find((toolUse) => toolUse.name === 'web_search');
          if (searchToolUse) {
          assistantOutcome = {
            status: 'incomplete',
            content: renderWebSearchFallbackAnswer(searchToolUse, error.message),
            finishReason: null,
            continuationAvailable: true,
            error: error.message,
          };
        } else {
          assistantOutcome = {
            status: 'failed',
            content: 'A execução falhou antes de concluir. Use Tentar novamente para recomeçar ou Continuar para retomar do último estado útil.',
            finishReason: null,
            continuationAvailable: true,
            error: error.message || 'Erro ao gerar resposta.',
          };
        }
        }
      }
    }
  } catch (error) {
    assistantOutcome = assistantOutcome || (isUserStopError(error)
      ? buildStoppedOutcome()
      : {
          status: 'failed',
          content: 'A execução falhou antes de concluir. Use Tentar novamente para recomeçar ou Continuar para retomar do último estado útil.',
          finishReason: null,
          continuationAvailable: true,
          error: error.message || 'Erro ao gerar resposta.',
        });
  }

  assistantOutcome = applyStoppedOutcomeIfRequested(assistantOutcome, operationSignal);

  if (isGenericChatTitle(chatBefore.title) && !toolUses.some((toolUse) => toolUse.name === 'rename_chat') && titleSeed) {
    await updateChatMetadata(chatId, { title: titleSeed });
  }

  const savedAssistantMessage = buildAssistantAttemptMessage({
    sourceUserMessage: userMessage,
    content: assistantOutcome.content,
    status: assistantOutcome.status,
    providerUsed,
    modelUsed,
    toolUses,
    executionTrace: executionTrace.length ? executionTrace : [],
    finishReason: assistantOutcome.finishReason,
    error: assistantOutcome.error,
    thinking: assistantOutcome.thinking,
    continuationAvailable: assistantOutcome.continuationAvailable,
    continuationReason,
    continuationGroupId,
    attemptIndex,
    retryOfMessageId,
    continuedFromMessageId,
  });
  await appendMessages(chatId, [savedAssistantMessage]);
  await appendEvent({
    type:
      assistantOutcome.status === 'sent'
        ? 'chat.message.completed'
        : assistantOutcome.status === 'incomplete'
          ? 'chat.message.incomplete'
          : 'chat.message.failed',
    chatId,
    details: {
      messageId: savedAssistantMessage.id,
      sourceUserMessageId: userMessage.id,
      groupId: continuationGroupId,
      attemptIndex,
      status: assistantOutcome.status,
      continuationReason,
      retryOfMessageId,
      continuedFromMessageId,
      toolCount: toolUses.length,
      finishReason: assistantOutcome.finishReason || null,
      continuationAvailable: assistantOutcome.continuationAvailable,
    },
  });

  const updatedChat = await readChat(chatId);
  const latestPersistentMemory = await readPersistentMemory();
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, latestPersistentMemory));
  const autoCompact =
    assistantOutcome.finishReason === 'stopped_by_user'
      ? null
      : await maybeAutoCompactChat(chatId, updatedChat, effectiveConfig, latestPersistentMemory, { signal: operationSignal });

  return {
    userMessage,
    assistantMessage: savedAssistantMessage,
    autoCompact,
    continuationAvailable: assistantOutcome.continuationAvailable,
    assistantStatus: assistantOutcome.status,
    chat: await readChat(chatId),
  };
}

function isGenericChatTitle(title = '') {
  return GENERIC_CHAT_TITLES.has(String(title || '').trim());
}

export async function continueToolApproval(chatId, messageId, decision = 'approve', options = {}) {
  return withToolApprovalLock(chatId, messageId, () =>
    withActiveChatRun(chatId, 'tool_approval', (signal) =>
      continueToolApprovalLocked(chatId, messageId, decision, { ...options, signal }),
    ),
  );
}

async function continueToolApprovalLocked(chatId, messageId, decision = 'approve', options = {}) {
  const operationSignal = options.signal;
  throwIfStopped(operationSignal);
  const chat = await readChat(chatId);
  const pendingMessage = chat.messages.find((message) => message.id === messageId && message.role === 'assistant');
  if (pendingMessage?.status === 'running_tools') {
    if (isStaleRunningToolApproval(pendingMessage)) {
      await resetStaleRunningToolApproval(chatId, pendingMessage);
      return { chat: await readChat(chatId) };
    }
    return { chat };
  }
  if (!pendingMessage?.pendingToolApproval) {
    if (pendingMessage && pendingMessage.status !== 'needs_tool_approval') {
      return { chat };
    }
    const error = new Error('Aprovação de tool não encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const pendingState = pendingMessage.pendingToolApproval || {};
  const approvalToolCalls = pendingState.approvalToolCalls || pendingState.toolCalls || [];
  if (hasDuplicateToolCallIds(approvalToolCalls) || hasDuplicateToolCallIds(pendingState.toolCalls || [])) {
    await updateMessage(chatId, messageId, {
      status: 'incomplete',
      content: cleanAssistantContent(pendingMessage.content || '').content || 'A aprovação de tool ficou ambígua e foi interrompida.',
      pendingToolApproval: null,
      continuationAvailable: true,
      error: 'Tool calls com IDs duplicados foram detectadas. Use Tentar novamente ou Continuar para refazer com IDs seguros.',
    });
    await appendEvent({
      type: 'tool.approval.invalid_duplicate_ids',
      chatId,
      details: { messageId, toolCount: approvalToolCalls.length },
    });
    return { chat: await readChat(chatId) };
  }
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
  const runtimeInfo = await getRuntimeInfo();
  const effectiveConfig = buildEffectiveConfig(config, currentChat, runtimeInfo, { modelSettings: currentChat.modelSettings || {} });
  const workingMessages = pendingState.providerMessages || [];
  const toolCalls = pendingState.toolCalls || approvalToolCalls;
  const toolUses = [...(pendingState.preapprovedToolUses || [])];
  const executionTrace = [...(pendingState.executionTrace || [])];
  let providerUsed = pendingMessage.providerUsed || effectiveConfig.provider;
  let modelUsed = pendingMessage.modelUsed || effectiveConfig.model;
  const selectedConfig = { ...withSelectedProviderConfig(effectiveConfig, providerUsed, modelUsed), signal: operationSignal };
  const sourceUserMessage =
    currentChat.messages.find((message) => message.id === pendingState.sourceUserMessageId && message.role === 'user') ||
    findPreviousUserMessage(currentChat.messages, pendingMessage);
  const continuationGroupId = pendingState.continuationGroupId || getMessageContinuationGroupId(sourceUserMessage);
  const attemptIndex = Number(pendingState.attemptIndex || pendingMessage.attemptIndex || 1);
  const continuationReason = pendingState.continuationReason || pendingMessage.continuationReason || 'initial';
  const retryOfMessageId = pendingState.retryOfMessageId || pendingMessage.retryOfMessageId || null;
  const continuedFromMessageId = pendingState.continuedFromMessageId || pendingMessage.continuedFromMessageId || null;

  await updateMessage(chatId, messageId, {
    status: 'running_tools',
    content: pendingMessage.content || 'Executando tools aprovadas e registrando negativas...',
    toolUses: interimToolUses,
  });
  await appendEvent({
    type: 'tool.approval.completed',
    chatId,
    details: {
      messageId,
      sourceUserMessageId: sourceUserMessage?.id || null,
      groupId: continuationGroupId,
      attemptIndex,
      toolCount: approvalToolCalls.length,
    },
  });

  try {
    for (const toolCall of toolCalls) {
      if (!approvalToolCalls.some((approvalToolCall) => approvalToolCall.id === toolCall.id)) continue;
      throwIfStopped(operationSignal);
      const toolUse =
        decisions[toolCall.id] === 'approve'
          ? await executeToolCallSafely(chatId, toolCall, selectedConfig)
          : createDeniedToolUse(toolCall);
      throwIfStopped(operationSignal);
      toolUses.push(toolUse);
      executionTrace.push(createToolTraceEntry(toolUse));
      appendToolResultForModel(workingMessages, toolCall, toolUse);
      if (toolUseHasExecutionFailure(toolUse)) {
        await finalizeApprovedToolMessage({
          chatId,
          messageId,
          effectiveConfig: selectedConfig,
          sourceUserMessage,
          continuationGroupId,
          attemptIndex,
          outcome: buildToolFailureOutcome(toolUse, pendingMessage.finishReason, pendingMessage.thinking),
          toolUses,
          executionTrace,
          providerUsed,
          modelUsed,
          approvedToolCount: toolUses.filter((item) => item.status !== 'denied').length,
          failedToolUse: toolUse,
        });
        return { chat: await readChat(chatId) };
      }
    }

    const toolOutputsRequested = toolCalls.some((toolCall) => shouldReturnToolOutput(toolCall));
    if (!toolOutputsRequested) {
      const hasToolErrors = toolUses.some((toolUse) => toolUseHasExecutionFailure(toolUse));
      const finalStatus = hasToolErrors ? 'incomplete' : 'sent';
      const cleanedPendingContent = cleanAssistantContent(pendingMessage.content || '');
      throwIfStopped(operationSignal);
      await finalizeApprovedToolMessage({
        chatId,
        messageId,
        effectiveConfig: selectedConfig,
        sourceUserMessage,
        continuationGroupId,
        attemptIndex,
        outcome: {
          status: finalStatus,
          content:
            finalStatus === 'incomplete'
              ? cleanedPendingContent.content || 'A execução foi interrompida antes do final.'
              : cleanedPendingContent.content || 'Ação de tool concluída.',
          thinking: mergeThinkingSections(pendingMessage.thinking, cleanedPendingContent.thinking),
          finishReason: pendingMessage.finishReason || null,
          continuationAvailable: finalStatus !== 'sent',
          error: hasToolErrors ? 'Uma das tools aprovadas falhou.' : null,
        },
        toolUses,
        executionTrace,
        providerUsed,
        modelUsed,
        approvedToolCount: toolUses.filter((toolUse) => toolUse.status !== 'denied').length,
        skippedFollowup: true,
      });
      return { chat: await readChat(chatId) };
    }

    const followup = await continueAssistantToolLoop({
      chatId,
      messageId,
      effectiveConfig: selectedConfig,
      workingMessages,
      toolUses,
      executionTrace,
      providerUsed,
      modelUsed,
      sourceUserMessage,
      continuationGroupId,
      attemptIndex,
      continuationReason,
      retryOfMessageId,
      continuedFromMessageId,
      baseThinking: pendingMessage.thinking,
      signal: operationSignal,
    });
    if (followup.awaitingApproval) return { chat: await readChat(chatId) };
    throwIfStopped(operationSignal);
    await finalizeApprovedToolMessage({
      chatId,
      messageId,
      effectiveConfig: selectedConfig,
      sourceUserMessage,
      continuationGroupId,
      attemptIndex,
      outcome: followup.outcome,
      toolUses: followup.toolUses,
      executionTrace: followup.executionTrace,
      providerUsed: followup.providerUsed,
      modelUsed: followup.modelUsed,
      approvedToolCount: followup.toolUses.filter((toolUse) => toolUse.status !== 'denied').length,
    });
  } catch (error) {
    const searchToolUse = [...toolUses].reverse().find((toolUse) => toolUse.name === 'web_search');
    const fallbackOutcome = isUserStopError(error)
      ? buildStoppedOutcome(pendingMessage.thinking)
      : searchToolUse
        ? {
            status: 'incomplete',
            content: renderWebSearchFallbackAnswer(searchToolUse, error.message),
            thinking: pendingMessage.thinking,
            finishReason: null,
            continuationAvailable: true,
            error: error.message,
          }
        : {
            status: 'failed',
            content: cleanAssistantContent(pendingMessage.content || '').content || 'A execução falhou antes de concluir.',
            thinking: pendingMessage.thinking,
            finishReason: null,
            continuationAvailable: true,
            error: error.message || 'Erro ao finalizar a resposta.',
          };
    await finalizeApprovedToolMessage({
      chatId,
      messageId,
      effectiveConfig: selectedConfig,
      sourceUserMessage,
      continuationGroupId,
      attemptIndex,
      outcome: fallbackOutcome,
      toolUses,
      executionTrace,
      providerUsed,
      modelUsed,
      approvedToolCount: toolUses.length,
    });
  }
  return { chat: await readChat(chatId) };
}

async function finalizeApprovedToolMessage({
  chatId,
  messageId,
  effectiveConfig,
  sourceUserMessage,
  continuationGroupId,
  attemptIndex,
  outcome,
  toolUses,
  executionTrace,
  providerUsed,
  modelUsed,
  approvedToolCount,
  failedToolUse = null,
  skippedFollowup = false,
}) {
  const status = outcome.status || 'sent';
  const finalTimestamp = new Date().toISOString();
  await updateMessage(chatId, messageId, {
    status,
    content: outcome.content,
    thinking: outcome.thinking || undefined,
    toolUses,
    executionTrace: executionTrace.length ? executionTrace : null,
    pendingToolApproval: null,
    modelUsed: modelUsed || effectiveConfig.model,
    providerUsed: providerUsed || effectiveConfig.provider,
    finishReason: outcome.finishReason || null,
    continuationAvailable: Boolean(outcome.continuationAvailable),
    error: outcome.error || null,
    completedAt: status === 'sent' ? finalTimestamp : undefined,
    failedAt: status === 'failed' ? finalTimestamp : undefined,
    interruptedAt: status === 'incomplete' ? finalTimestamp : undefined,
  });

  const updatedChat = await readChat(chatId);
  const latestPersistentMemory = await readPersistentMemory();
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, latestPersistentMemory));
  if (outcome.finishReason !== 'stopped_by_user') {
    await maybeAutoCompactChat(chatId, updatedChat, effectiveConfig, latestPersistentMemory, { signal: effectiveConfig.signal });
  }
  await appendEvent({
    type: status === 'sent' ? 'chat.message.completed' : status === 'incomplete' ? 'chat.message.incomplete' : 'chat.message.failed',
    chatId,
    details: {
      messageId,
      sourceUserMessageId: sourceUserMessage?.id || null,
      groupId: continuationGroupId,
      attemptIndex,
      status,
      approvedToolCount,
      skippedFollowup,
      failedToolName: failedToolUse?.name || null,
      failedToolId: failedToolUse?.id || null,
      finishReason: outcome.finishReason || null,
      error: outcome.error || null,
    },
  });
}

async function withToolApprovalLock(chatId, messageId, action) {
  const key = `${chatId}:${messageId}`;
  const previous = toolApprovalLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(action);
  const cleanup = run.catch(() => {}).then(() => {
    if (toolApprovalLocks.get(key) === cleanup) toolApprovalLocks.delete(key);
  });
  toolApprovalLocks.set(key, cleanup);
  return run;
}

async function withActiveChatRun(chatId, operation, action) {
  const key = String(chatId || '');
  if (activeChatRuns.has(key)) {
    const error = new Error('Já existe uma execução em andamento neste chat.');
    error.statusCode = 409;
    throw error;
  }
  const controller = new AbortController();
  const activeRun = {
    controller,
    operation,
    startedAt: new Date().toISOString(),
    promise: null,
  };
  activeChatRuns.set(key, activeRun);
  const run = Promise.resolve().then(() => action(controller.signal));
  activeRun.promise = run;
  try {
    return await run;
  } finally {
    const activeRun = activeChatRuns.get(key);
    if (activeRun?.controller === controller) activeChatRuns.delete(key);
  }
}

async function withChatTurnLock(chatId, action) {
  const key = String(chatId || '');
  if (chatTurnLocks.has(key)) {
    const error = new Error('Já existe uma execução em andamento neste chat. Aguarde concluir antes de enviar, tentar novamente ou continuar.');
    error.statusCode = 409;
    throw error;
  }

  const run = Promise.resolve().then(action);
  chatTurnLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (chatTurnLocks.get(key) === run) chatTurnLocks.delete(key);
  }
}

async function waitForRunSettle(promise, waitMs) {
  if (!promise || waitMs <= 0) return false;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), waitMs));
  const settled = Promise.resolve(promise)
    .then(() => true)
    .catch(() => true);
  return Promise.race([settled, timeout]);
}

function clampStopWaitMs(value) {
  const numeric = Number(value ?? 1200);
  if (!Number.isFinite(numeric)) return 1200;
  return Math.min(Math.max(Math.round(numeric), 0), 5000);
}

function createToolApprovalMessage(assistantMessage, toolCalls, providerMessages, config, options = {}) {
  const preapprovedToolUses = options.preapprovedToolUses || [];
  const approvalToolCalls = options.approvalToolCalls || toolCalls;
  const sourceUserMessage = options.sourceUserMessage || null;
  const cleanedContent = cleanAssistantContent(assistantMessage.content || '');
  const toolUses = [
    ...preapprovedToolUses,
    ...approvalToolCalls.map((toolCall) => createPendingApprovalToolUse(toolCall)),
  ];
  return createMessage(
    'assistant',
    cleanedContent.content || 'A IA solicitou uma tool e está aguardando aprovação.',
    {
      status: 'needs_tool_approval',
      sourceUserMessageId: sourceUserMessage?.id || null,
      continuationGroupId: options.continuationGroupId || getMessageContinuationGroupId(sourceUserMessage),
      attemptIndex: options.attemptIndex || 1,
      continuationReason: options.continuationReason || 'initial',
      continuationAvailable: true,
      retryOfMessageId: options.retryOfMessageId || null,
      continuedFromMessageId: options.continuedFromMessageId || null,
      modelUsed: options.modelUsed || assistantMessage.modelUsed || config.model,
      providerUsed: options.providerUsed || assistantMessage.providerUsed || config.provider,
      thinking: mergeThinkingSections(options.thinking, cleanedContent.thinking) || undefined,
      toolUses,
      pendingToolApproval: {
        toolCalls,
        approvalToolCalls,
        providerMessages,
        preapprovedToolUses,
        executionTrace: options.executionTrace || [],
        decisions: {},
        sourceUserMessageId: sourceUserMessage?.id || null,
        continuationGroupId: options.continuationGroupId || getMessageContinuationGroupId(sourceUserMessage),
        attemptIndex: options.attemptIndex || 1,
        continuationReason: options.continuationReason || 'initial',
        retryOfMessageId: options.retryOfMessageId || null,
        continuedFromMessageId: options.continuedFromMessageId || null,
      },
      executionTrace: options.executionTrace?.length ? options.executionTrace : undefined,
    },
  );
}

function createPendingApprovalToolUse(toolCall) {
  return {
    id: toolCall.id,
    name: toolCall.function?.name || 'unknown_tool',
    input: normalizeToolInput(toolCall.function?.name, parseToolArguments(toolCall.function?.arguments)),
    status: 'pending_approval',
    approvalRequired: true,
    result: { action: 'pending_approval' },
    createdAt: new Date().toISOString(),
  };
}

async function continueAssistantToolLoop({
  chatId,
  messageId,
  effectiveConfig,
  workingMessages,
  toolUses,
  executionTrace,
  providerUsed,
  modelUsed,
  sourceUserMessage,
  continuationGroupId,
  attemptIndex,
  continuationReason,
  retryOfMessageId,
  continuedFromMessageId,
  baseThinking = '',
  signal = null,
}) {
  const enabledTools = buildEnabledToolDefinitions(effectiveConfig.tools);
  let currentProviderUsed = providerUsed || effectiveConfig.provider;
  let currentModelUsed = modelUsed || effectiveConfig.model;
  let currentThinking = baseThinking || '';
  const startingRound = executionTrace.filter((entry) => entry.type === 'assistant_output').length;
  const maxRounds = getMaxToolRounds(effectiveConfig);

  for (let round = startingRound; round < maxRounds; round += 1) {
    throwIfStopped(signal);
    const assistantMessage = await callProviderChat({
      config: effectiveConfig,
      provider: effectiveConfig.provider,
      model: effectiveConfig.model,
      messages: workingMessages,
      tools: enabledTools,
      modelSettings: effectiveConfig.modelSettings,
      chatId,
      signal,
    });
    throwIfStopped(signal);
    currentProviderUsed = assistantMessage.providerUsed || currentProviderUsed;
    currentModelUsed = assistantMessage.modelUsed || currentModelUsed;
    const selectedConfig = { ...withSelectedProviderConfig(effectiveConfig, currentProviderUsed, currentModelUsed), signal };

    const toolCalls = normalizeAssistantToolCalls(assistantMessage.tool_calls || [], assistantMessage.content, effectiveConfig.tools);
    if (toolCalls.length || assistantMessage.content) {
      executionTrace.push(createAssistantTraceEntry(assistantMessage, toolCalls, round + 1, 'tool_round'));
    }

    const cleanedContent = cleanAssistantContent(assistantMessage.content || '');
    currentThinking = mergeThinkingSections(currentThinking, cleanedContent.thinking);
    if (!toolCalls.length) {
      throwIfStopped(signal);
      const finalStatus = isIncompleteFinishReason(assistantMessage.finishReason) ? 'incomplete' : 'sent';
      return {
        outcome: {
          status: finalStatus,
          content:
            cleanedContent.content ||
            (finalStatus === 'incomplete'
              ? 'Tools executadas, mas o provider interrompeu a resposta antes do final.'
              : 'Tools executadas, mas o provider não retornou texto final.'),
          thinking: currentThinking,
          finishReason: assistantMessage.finishReason || null,
          continuationAvailable: finalStatus !== 'sent',
          error: null,
        },
        providerUsed: currentProviderUsed,
        modelUsed: currentModelUsed,
        toolUses,
        executionTrace,
      };
    }

    workingMessages.push({
      role: 'assistant',
      content: cleanedContent.content,
      tool_calls: toolCalls,
    });

    const approvalToolCalls = toolCalls.filter((toolCall) => toolRequiresApproval(toolCall, selectedConfig));
    if (approvalToolCalls.length) {
      const safeToolCalls = toolCalls.filter((toolCall) => !toolRequiresApproval(toolCall, selectedConfig));
      for (const toolCall of safeToolCalls) {
        throwIfStopped(signal);
        const toolUse = await executeToolCallSafely(chatId, toolCall, selectedConfig);
        throwIfStopped(signal);
        toolUses.push(toolUse);
        executionTrace.push(createToolTraceEntry(toolUse));
        appendToolResultForModel(workingMessages, toolCall, toolUse);
        if (toolUseHasExecutionFailure(toolUse)) {
          return {
            outcome: buildToolFailureOutcome(toolUse, assistantMessage.finishReason, currentThinking),
            providerUsed: currentProviderUsed,
            modelUsed: currentModelUsed,
            toolUses,
            executionTrace,
          };
        }
      }
      throwIfStopped(signal);
      const pendingToolUses = [...toolUses, ...approvalToolCalls.map((toolCall) => createPendingApprovalToolUse(toolCall))];
      await updateMessage(chatId, messageId, {
        status: 'needs_tool_approval',
        content: cleanedContent.content || 'A IA solicitou outra tool e está aguardando aprovação.',
        thinking: currentThinking || undefined,
        toolUses: pendingToolUses,
        executionTrace: executionTrace.length ? executionTrace : null,
        pendingToolApproval: {
          toolCalls,
          approvalToolCalls,
          providerMessages: workingMessages,
          preapprovedToolUses: toolUses,
          executionTrace,
          decisions: {},
          sourceUserMessageId: sourceUserMessage?.id || null,
          continuationGroupId,
          attemptIndex,
          continuationReason,
          retryOfMessageId,
          continuedFromMessageId,
        },
        providerUsed: currentProviderUsed,
        modelUsed: currentModelUsed,
        continuationAvailable: true,
        error: null,
      });
      await appendEvent({
        type: 'tool.approval.requested',
        chatId,
        details: {
          messageId,
          sourceUserMessageId: sourceUserMessage?.id || null,
          groupId: continuationGroupId,
          attemptIndex,
          continuationReason,
          retryOfMessageId,
          continuedFromMessageId,
          toolCount: approvalToolCalls.length,
          tools: approvalToolCalls.map((toolCall) => toolCall.function?.name).filter(Boolean),
        },
      });
      return { awaitingApproval: true };
    }

    for (const toolCall of toolCalls) {
      throwIfStopped(signal);
      const toolUse = await executeToolCallSafely(chatId, toolCall, selectedConfig);
      throwIfStopped(signal);
      toolUses.push(toolUse);
      executionTrace.push(createToolTraceEntry(toolUse));
      appendToolResultForModel(workingMessages, toolCall, toolUse);
      if (toolUseHasExecutionFailure(toolUse)) {
        return {
          outcome: buildToolFailureOutcome(toolUse, assistantMessage.finishReason, currentThinking),
          providerUsed: currentProviderUsed,
          modelUsed: currentModelUsed,
          toolUses,
          executionTrace,
        };
      }
    }

    if (toolCalls.every((toolCall) => !shouldReturnToolOutput(toolCall))) {
      throwIfStopped(signal);
      return {
        outcome: {
          status: 'sent',
          content: cleanedContent.content || 'Ação executada.',
          thinking: currentThinking,
          finishReason: assistantMessage.finishReason || null,
          continuationAvailable: false,
          error: null,
        },
        providerUsed: currentProviderUsed,
        modelUsed: currentModelUsed,
        toolUses,
        executionTrace,
      };
    }
  }

  throwIfStopped(signal);
  return {
    outcome: {
      status: 'incomplete',
      content: 'A investigação atingiu o limite de rodadas de tools antes de uma resposta final. Use Continuar para retomar do último estado útil.',
      thinking: currentThinking,
      finishReason: null,
      continuationAvailable: true,
      error: 'Limite de rodadas de tools atingido.',
    },
    providerUsed: currentProviderUsed,
    modelUsed: currentModelUsed,
    toolUses,
    executionTrace,
  };
}

function buildToolFailureOutcome(toolUse, finishReason = null, thinking = '') {
  return {
    status: 'incomplete',
    content: renderToolFailureMessage(toolUse),
    thinking,
    finishReason: finishReason || null,
    continuationAvailable: true,
    error: toolUse.result?.error || describeToolFailure(toolUse),
  };
}

async function resetStaleRunningToolApproval(chatId, message) {
  if (!message.pendingToolApproval) {
    await updateMessage(chatId, message.id, {
      status: 'incomplete',
      content: 'A execução de tools foi interrompida e não há estado suficiente para retomar a aprovação.',
      pendingToolApproval: null,
      continuationAvailable: true,
      error: 'Execução de tools interrompida em estado running_tools.',
      interruptedAt: new Date().toISOString(),
    });
    await appendEvent({
      type: 'tool.approval.running_stale_marked_incomplete',
      chatId,
      details: { messageId: message.id },
    });
    return;
  }

  const pendingState = message.pendingToolApproval || {};
  const decisions = { ...(pendingState.decisions || {}) };
  const approvalIds = new Set((pendingState.approvalToolCalls || pendingState.toolCalls || []).map((toolCall) => toolCall.id));
  const hasUnknownExecutedSideEffect = (message.toolUses || []).some(
    (toolUse) => approvalIds.has(toolUse.id) && toolUse.status === 'approved_pending_execution',
  );
  if (hasUnknownExecutedSideEffect) {
    await updateMessage(chatId, message.id, {
      status: 'incomplete',
      content:
        'A execução aprovada foi interrompida depois da aprovação. Para evitar repetir comandos ou edições, revise o estado atual e use Continuar em vez de aprovar novamente.',
      pendingToolApproval: null,
      continuationAvailable: true,
      error: 'Execução aprovada interrompida; rerun automático bloqueado por segurança.',
      interruptedAt: new Date().toISOString(),
    });
    await appendEvent({
      type: 'tool.approval.running_stale_marked_incomplete',
      chatId,
      details: { messageId: message.id, staleMs: getRunningToolStaleMs(), reason: 'approved_execution_unknown' },
    });
    return;
  }
  const toolUses = (message.toolUses || []).map((toolUse) => {
    if (toolUse.status === 'denied') {
      decisions[toolUse.id] = 'deny';
      return toolUse;
    }
    if (!approvalIds.has(toolUse.id)) return toolUse;
    delete decisions[toolUse.id];
    return {
      ...toolUse,
      status: 'pending_approval',
      result: { action: 'pending_approval_after_interrupted_execution' },
    };
  });

  await updateMessage(chatId, message.id, {
    status: 'needs_tool_approval',
    content: message.content || 'A execução anterior foi interrompida. Revise e aprove ou negue a tool novamente.',
    toolUses,
    pendingToolApproval: {
      ...pendingState,
      decisions,
    },
    error: 'Execução de tools interrompida antes de concluir.',
    continuationAvailable: true,
  });
  await appendEvent({
    type: 'tool.approval.running_stale_reset',
    chatId,
    details: { messageId: message.id, staleMs: getRunningToolStaleMs() },
  });
}

function isStaleRunningToolApproval(message = {}) {
  const timestamp = Date.parse(message.updatedAt || message.createdAt || '');
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp > getRunningToolStaleMs();
}

function getRunningToolStaleMs() {
  const value = Number(process.env.MC_RUNNING_TOOL_STALE_MS || DEFAULT_RUNNING_TOOL_STALE_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_RUNNING_TOOL_STALE_MS;
  return Math.min(Math.max(Math.round(value), 1000), 24 * 60 * 60 * 1000);
}

function throwIfStopped(signal) {
  if (!signal?.aborted) return;
  throw signal.reason?.stoppedByUser ? signal.reason : createUserStopError();
}

function isUserStopError(error) {
  return Boolean(error?.stoppedByUser || (error?.name === 'AbortError' && error?.statusCode === 499));
}

function createUserStopError(reason = '') {
  const error = new Error(reason || 'Execução interrompida pelo usuário.');
  error.name = 'AbortError';
  error.statusCode = 499;
  error.stoppedByUser = true;
  return error;
}

function buildStoppedOutcome(thinking = '') {
  return {
    status: 'incomplete',
    content: 'Execução interrompida pelo usuário. Use Continuar para retomar do último estado útil.',
    thinking,
    finishReason: 'stopped_by_user',
    continuationAvailable: true,
    error: 'Interrompido pelo usuário.',
  };
}

function applyStoppedOutcomeIfRequested(outcome, signal) {
  if (!signal?.aborted) return outcome;
  if (outcome?.finishReason === 'stopped_by_user') return outcome;
  return buildStoppedOutcome(outcome?.thinking);
}

function createAssistantTraceEntry(assistantMessage, toolCalls = [], round = 1, phase = 'tool_round') {
  const cleanedContent = cleanAssistantContent(assistantMessage.content || '');
  return {
    type: 'assistant_output',
    phase,
    round,
    provider: assistantMessage.providerUsed || null,
    model: assistantMessage.modelUsed || null,
    content: truncate(cleanedContent.content, 12000),
    thinking: cleanedContent.thinking ? truncate(cleanedContent.thinking, 12000) : undefined,
    toolCalls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function?.name || 'unknown_tool',
      input: normalizeToolInput(toolCall.function?.name, parseToolArguments(toolCall.function?.arguments)),
    })),
    createdAt: new Date().toISOString(),
  };
}

function createToolTraceEntry(toolUse) {
  return {
    type: 'tool_result',
    toolUse,
    createdAt: new Date().toISOString(),
  };
}

function getMaxToolRounds(config = {}) {
  return config.tools?.deepInvestigation ? MAX_DEEP_INVESTIGATION_TOOL_ROUNDS : MAX_TOOL_ROUNDS;
}

function getMessageContinuationGroupId(message = {}) {
  return message.continuationGroupId || message.sourceUserMessageId || message.id || null;
}

function findPreviousUserMessage(messages = [], referenceMessage = null) {
  if (!referenceMessage) return null;
  const index = messages.findIndex((message) => message.id === referenceMessage.id);
  if (index === -1) return null;
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    const candidate = messages[currentIndex];
    if (candidate?.role === 'user') return candidate;
  }
  return null;
}

function resolveRetrySourceMessage(chat, retryMessageId) {
  if (!retryMessageId) return null;
  const directMessage = chat.messages.find((message) => message.id === retryMessageId);
  if (!directMessage) return null;
  if (directMessage.role === 'user') {
    return {
      sourceUserMessage: directMessage,
      sourceAssistantMessage: null,
      continuationReason: 'retry',
      continuationMode: 'retry',
    };
  }

  if (directMessage.role === 'assistant') {
    const sourceUserMessage =
      chat.messages.find((message) => message.id === directMessage.sourceUserMessageId && message.role === 'user') ||
      findPreviousUserMessage(chat.messages, directMessage);
    if (!sourceUserMessage) return null;
    return {
      sourceUserMessage,
      sourceAssistantMessage: directMessage,
      continuationReason: 'retry',
      continuationMode: 'retry',
    };
  }

  return null;
}

function resolveContinuationTargetMessage(chat, continueMessageId) {
  if (!continueMessageId) return null;
  const targetMessage = chat.messages.find((message) => message.id === continueMessageId && message.role === 'assistant');
  if (!targetMessage) return null;
  const sourceUserMessage =
    chat.messages.find((message) => message.id === targetMessage.sourceUserMessageId && message.role === 'user') ||
    findPreviousUserMessage(chat.messages, targetMessage);
  if (!sourceUserMessage) return null;
  return {
    sourceUserMessage,
    sourceAssistantMessage: targetMessage,
    continuationReason: 'continue',
    continuationMode: 'continue',
  };
}

function resolveRequestSourceMessage(chat, options = {}) {
  if (options.continueMessageId) return resolveContinuationTargetMessage(chat, options.continueMessageId);
  if (options.retryMessageId) return resolveRetrySourceMessage(chat, options.retryMessageId);
  return null;
}

function ensureRequestSourceIsActionable(chat, requestSource = null) {
  const sourceAssistantMessage = requestSource?.sourceAssistantMessage;
  if (!sourceAssistantMessage) return;

  if (!['failed', 'incomplete'].includes(sourceAssistantMessage.status)) {
    const error = new Error('Esta tentativa não está disponível para retry/continue.');
    error.statusCode = 409;
    throw error;
  }

  const attempts = getAssistantAttempts(chat.messages, getMessageContinuationGroupId(sourceAssistantMessage));
  const latestAttempt = attempts[attempts.length - 1];
  if (latestAttempt && latestAttempt.id !== sourceAssistantMessage.id) {
    const error = new Error('Esta tentativa já possui uma tentativa mais recente. Use a tentativa mais recente para continuar ou tentar novamente.');
    error.statusCode = 409;
    throw error;
  }
}

function ensureNoActiveToolApproval(chat = {}) {
  const pendingMessage = (chat.messages || []).find(
    (message) =>
      message.role === 'assistant' &&
      (message.pendingToolApproval || message.status === 'needs_tool_approval' || message.status === 'running_tools'),
  );
  if (!pendingMessage) return;

  const error = new Error('Há uma aprovação de tool pendente neste chat. Aprove ou negue a tool antes de enviar outra mensagem.');
  error.statusCode = 409;
  error.details = { messageId: pendingMessage.id, status: pendingMessage.status };
  throw error;
}

function withSelectedProviderConfig(config = {}, providerUsed, modelUsed) {
  const provider = providerUsed || config.provider;
  const model = modelUsed || config.model;
  if (provider === config.provider && model === config.model) return config;
  return { ...config, provider, model };
}

function getAssistantAttempts(messages = [], groupId) {
  if (!groupId) return [];
  return messages
    .filter((message) => message.role === 'assistant' && getMessageContinuationGroupId(message) === groupId)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function getNextAssistantAttemptIndex(messages = [], groupId) {
  return getAssistantAttempts(messages, groupId).length + 1;
}

function isIncompleteFinishReason(finishReason) {
  return INCOMPLETE_FINISH_REASONS.has(String(finishReason || '').trim().toLowerCase());
}

function toolUseHasExecutionFailure(toolUse = {}) {
  if (!toolUse || toolUse.status === 'denied') return false;
  if (toolUse.result?.error) return true;
  if (toolUse.name !== 'run_terminal_command') return false;
  if (toolUse.result?.aborted) return true;
  if (toolUse.result?.timedOut) return true;
  if (toolUse.result?.signal) return true;
  const exitCode = toolUse.result?.exitCode;
  if (typeof exitCode !== 'number' || exitCode === 0) return false;
  return toolUse.input?.returnOutput !== true;
}

function getLatestAssistantOutputContent(message = {}) {
  const trace = Array.isArray(message.executionTrace) ? [...message.executionTrace].reverse() : [];
  for (const entry of trace) {
    if (entry.type === 'assistant_output' && String(entry.content || '').trim()) {
      return sanitizeAssistantToolLikeText(entry.content || '');
    }
  }
  return sanitizeAssistantToolLikeText(message.content || '');
}

function summarizeAssistantAttempt(message = {}, options = {}) {
  const lines = [];
  const content = getLatestAssistantOutputContent(message);
  const maxChars = Number(options.maxChars || 6000);
  if (content) {
    lines.push('## Saída parcial');
    lines.push(truncate(content, 3000));
  }
  if (message.finishReason) {
    lines.push('');
    lines.push(`Motivo do término: ${message.finishReason}`);
  }
  if (message.error) {
    lines.push(`Erro: ${message.error}`);
  }

  const trace = Array.isArray(message.executionTrace) ? message.executionTrace : [];
  const toolUses = Array.isArray(message.toolUses) ? message.toolUses : [];
  if (trace.length || toolUses.length) {
    lines.push('');
    lines.push('## Histórico da execução');
    for (const entry of trace) {
      if (entry.type === 'assistant_output') {
        const meta = [entry.phase, entry.round ? `rodada ${entry.round}` : null].filter(Boolean).join(' · ');
        lines.push(`- IA${meta ? ` (${meta})` : ''}: ${truncate(entry.content || 'sem texto', 1200)}`);
        for (const toolCall of Array.isArray(entry.toolCalls) ? entry.toolCalls : []) {
          lines.push(`  - Tool solicitada: ${toolCall.name} ${truncate(JSON.stringify(toolCall.input || {}, null, 2), 800)}`);
        }
        continue;
      }
      if (entry.type === 'tool_result') {
        const toolUse = entry.toolUse || {};
        const toolName = toolUse.name || 'unknown_tool';
        const resultPreview = truncate(JSON.stringify(toolUse.result || {}, null, 2), 1200);
        lines.push(`- Tool ${toolName}: ${resultPreview}`);
      }
    }
    if (!trace.length) {
      for (const toolUse of toolUses) {
        const toolName = toolUse.name || 'unknown_tool';
        const resultPreview = truncate(JSON.stringify(toolUse.result || {}, null, 2), 1200);
        lines.push(`- Tool ${toolName}: ${resultPreview}`);
      }
    }
  }

  return truncate(lines.join('\n'), maxChars);
}

function buildContinuationPrompt(sourceUserMessage, sourceAssistantMessage) {
  return [
    'Você já estava executando essa tarefa e a resposta anterior não chegou ao final.',
    'Continue a partir do ponto em que parou, sem repetir etapas já concluídas.',
    'O pedido original já está no histórico do chat; foque só em avançar o trabalho.',
    '',
    '## Última saída parcial',
    getLatestAssistantOutputContent(sourceAssistantMessage) || 'Nenhuma saída parcial foi registrada.',
    '',
    '## Histórico imediato da execução',
    summarizeAssistantAttempt(sourceAssistantMessage, { maxChars: 12000 }) || 'Sem histórico adicional.',
    '',
    'Se precisar, use tools novas. Preserve o estado já obtido e produza a próxima etapa útil.',
  ].join('\n');
}

function buildAssistantAttemptMessage({
  sourceUserMessage,
  content,
  status,
  providerUsed,
  modelUsed,
  toolUses = [],
  executionTrace = [],
  finishReason = null,
  error = null,
  thinking = '',
  continuationAvailable = false,
  continuationReason = 'initial',
  continuationGroupId = null,
  attemptIndex = 1,
  retryOfMessageId = null,
  continuedFromMessageId = null,
  pendingToolApproval = null,
}) {
  const cleanedContent = cleanAssistantContent(content || '');
  const safeContent = cleanedContent.content;
  const safeThinking = mergeThinkingSections(thinking, cleanedContent.thinking);
  const timestamp = new Date().toISOString();
  const groupId = continuationGroupId || getMessageContinuationGroupId(sourceUserMessage);
  const completed = status !== 'needs_tool_approval';
  return createMessage('assistant', safeContent, {
    status,
    sourceUserMessageId: sourceUserMessage?.id || null,
    continuationGroupId: groupId,
    attemptIndex,
    continuationReason,
    continuationAvailable: Boolean(continuationAvailable),
    retryOfMessageId: retryOfMessageId || null,
    continuedFromMessageId: continuedFromMessageId || null,
    providerUsed: providerUsed || null,
    modelUsed: modelUsed || null,
    thinking: safeThinking || undefined,
    toolUses,
    executionTrace: executionTrace.length ? executionTrace : undefined,
    pendingToolApproval,
    finishReason: finishReason || null,
    error: error ? String(error) : null,
    completedAt: completed ? timestamp : undefined,
    failedAt: status === 'failed' ? timestamp : undefined,
    interruptedAt: status === 'incomplete' ? timestamp : undefined,
  });
}

async function saveUserMessageForRequest(chatId, chat, content, retryMessageId, attachments = []) {
  if (retryMessageId) {
    const source = resolveRetrySourceMessage(chat, retryMessageId);
    const existing = source?.sourceUserMessage;
    if (!existing) {
      const error = new Error('Mensagem para retry não encontrada.');
      error.statusCode = 404;
      throw error;
    }

    if (existing.status === 'failed' || existing.status === 'pending' || existing.status === 'incomplete') {
      return updateMessage(chatId, existing.id, {
        content: existing.content || content,
        attachments: existing.attachments || [],
        status: 'sent',
        error: null,
        retryCount: Number(existing.retryCount || 0) + 1,
        retriedAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
      });
    }

    return existing;
  }

  const userMessage = createMessage('user', content, {
    attachments,
    status: 'pending',
  });
  await appendMessages(chatId, [userMessage]);
  return userMessage;
}

export async function compactChat(chatId, options = {}) {
  throwIfStopped(options.signal);
  const config = await loadConfig();
  const chat = await readChat(chatId);
  const persistentMemory = await readPersistentMemory();
  const runtimeInfo = await getRuntimeInfo();
  const effectiveConfig = buildEffectiveConfig(config, chat, runtimeInfo);
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
    signal: options.signal,
  });
  throwIfStopped(options.signal);

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
  const runtimeInfo = await getRuntimeInfo();
  const effectiveConfig = buildEffectiveConfig(config, updatedChat, runtimeInfo);
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, persistentMemory));
  return { chat: await readChat(chatId), path: updatedChat.paths.context };
}

export async function saveContextWindow(chatId) {
  const config = await loadConfig();
  const chat = await readChat(chatId);
  const persistentMemory = await readPersistentMemory();
  const runtimeInfo = await getRuntimeInfo();
  const effectiveConfig = buildEffectiveConfig(config, chat, runtimeInfo);
  const content = buildContextWindowMarkdown(chat, effectiveConfig, persistentMemory);
  const path = await saveContextSnapshot(chatId, content);
  await saveCurrentContextWindow(chatId, content);
  return { path, chat: await readChat(chatId) };
}

async function maybeAutoCompactChat(chatId, chat, config, persistentMemory, options = {}) {
  throwIfStopped(options.signal);
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
  throwIfStopped(options.signal);
  return compactChat(chatId, {
    automatic: true,
    reason: `context window reached ${contextWindow.length} chars`,
    signal: options.signal,
  });
}

export function buildContextWindowMarkdown(chat, config, persistentMemory = '') {
  return [
    `# Context window - ${chat.title}`,
    '',
    `- Chat: ${chat.id}`,
    `- Runtime: ${config.runtimeHome || getRuntimeHome()}`,
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
  const systemPrompt = buildSystemPrompt(chat, config, persistentMemory, options.userMemoryContext || null, {
    skipMemory: options.skipMemory === true,
    scheduledTaskContext: options.scheduledTaskContext || null,
  });
  return [{ role: 'system', content: systemPrompt }, ...(await selectRecentMessages(chat, config, options))];
}

// Masks the tool-related config flags that drive the system prompt's
// narrative instructions (e.g. "call run_terminal_command...") so a scheduled
// task's prompt never tells the model to use a tool that was filtered out of
// the actual function-calling schema by buildEnabledToolDefinitions.
function applyScheduledTaskToolMask(tools = {}, scheduledTaskContext, emailSettings = null) {
  if (!scheduledTaskContext) return tools;
  const allowed = new Set(scheduledTaskContext.allowedTools || []);
  const searchMode = allowed.has('web_search') ? getSearchMode(tools) : 'off';
  return {
    ...tools,
    terminal: tools.terminal !== false && allowed.has('run_terminal_command'),
    chatMemory: tools.chatMemory !== false && allowed.has('memory_chat'),
    persistentMemory: tools.persistentMemory !== false && allowed.has('persistent_memory'),
    userMemory: tools.userMemory !== false && allowed.has('persistent_memory_user'),
    userMemoryEdit: tools.userMemoryEdit === true && allowed.has('edit_persistent_memory_user'),
    chatDocuments: tools.chatDocuments !== false && allowed.has('chat_document'),
    autoCompact: tools.autoCompact !== false && allowed.has('compact_context'),
    chatTitle: tools.chatTitle !== false && allowed.has('rename_chat'),
    sendEmail: allowed.has('send_email') && isEmailConfigured(emailSettings),
    searchMode,
    webSearch: searchMode !== 'off',
    searchTerminal: searchMode === 'terminal' || searchMode === 'both',
  };
}

function buildEffectiveConfig(config, chat = {}, runtimeInfo = {}, extra = {}) {
  const offlineMode = config.privacy?.offlineMode === true;
  const provider = offlineMode ? 'ollama' : chat.provider || config.provider;
  const model = offlineMode
    ? chat.provider === 'ollama'
      ? chat.model || config.model || getDefaultModelForProvider('ollama')
      : config.model || getDefaultModelForProvider('ollama')
    : chat.model || config.model;
  const searchMode = getSearchMode(config.tools);
  const offlineSearchMode = offlineMode && searchMode === 'both' ? 'off' : searchMode;
  return {
    ...config,
    ...extra,
    provider,
    model,
    tools: {
      ...(config.tools || {}),
      searchMode: offlineSearchMode,
      webSearch: offlineSearchMode !== 'off',
      searchTerminal: offlineSearchMode === 'terminal' || offlineSearchMode === 'both',
    },
    routing: offlineMode
      ? {
          modelRotationEnabled: false,
          modelFallbacks: [],
          providerRotationEnabled: false,
          maxProviderPasses: 1,
          fallbacks: [],
        }
      : config.routing,
    runtimeHome: runtimeInfo.runtimeHome,
    activeProfile: runtimeInfo.activeProfile,
  };
}

function buildSystemPrompt(
  chat,
  config,
  persistentMemory,
  userMemoryContext = null,
  { skipMemory = false, scheduledTaskContext = null } = {},
) {
  if (scheduledTaskContext) {
    config = { ...config, tools: applyScheduledTaskToolMask(config.tools, scheduledTaskContext, config.email) };
  }
  const languageInstruction =
    config.language === 'auto'
      ? 'Respond in the same language the user is using.'
      : `Respond in this language unless the user explicitly asks otherwise: ${config.language}.`;

  return [
    'You are My Computer, a self-hosted AI assistant integrated with this local app, not a generic chatbot.',
    'Use the app state, durable memories, user-added memory files, tools, provider settings, and current chat metadata as first-class context.',
    config.userNickname ? `Call the user by this preferred name when natural: ${config.userNickname}.` : '',
    languageInstruction,
    buildTechnicalLevelInstruction(config),
    `Available tools: ${describeEnabledTools(config.tools).join(', ') || 'none'}.`,
    config.activeProfile?.name ? `Active isolated section/profile: ${config.activeProfile.name} (${config.activeProfile.id}).` : '',
    config.privacy?.offlineMode
      ? 'Offline privacy mode is enabled for this section. Do not use cloud AI providers, native provider web search, provider-side tools, provider rotation, or any workflow that sends user prompts, memories, files, paths, code, terminal output, or personal/project details to an external AI service. The only chat provider allowed is local Ollama.'
      : '',
    'Final answer formatting: write clean Markdown. Start with the direct answer, then use short sections, bullets, numbered steps, tables, or fenced code blocks only when they make the answer easier to scan. Avoid dumping raw logs unless the user asked for them.',
    'If you cannot finish cleanly, do not pretend the answer is complete. Stop with the best partial state you have; the UI will keep that attempt and expose a Continue action.',
    config.tools?.terminal
      ? 'When local state, files, commands, or host actions matter, call run_terminal_command before your final answer. Do not use terminal commands as a substitute for public web search: grep, find, rg, ls, cat, browser caches, local files, and /home searches inspect the user machine, not the internet. Do not run broad recursive searches across /home, the user profile, or filesystem root unless the user explicitly asked for a local-file search and gave a narrow scope; ask for a path or use a targeted command instead. Avoid interactive commands unless you make them non-interactive; for package managers prefer flags like -y/--assumeyes when safe. For long-running commands and downloads, set timeoutSeconds explicitly. Use returnOutput false for fire-and-forget side effects and true only when the stdout/stderr is needed for the next reasoning step. Do not retry a failing or rate-limited command repeatedly.'
      : 'Terminal execution is disabled by user settings.',
    config.provider === 'ollama'
      ? 'Current provider is Ollama/local. Do not ask for an API key for this provider. If the model is missing or Ollama seems unavailable, explain the local daemon/model step clearly and use available Ollama status/model-management UI assumptions before suggesting terminal commands.'
      : '',
    config.tools?.deepInvestigation
      ? [
          'Deep investigation mode is enabled. For requests about the user machine, code, installed software, configuration, logs, scripts, provider behavior, or anything that can be inspected locally, investigate before answering.',
          'Prefer several read-only tool calls across multiple rounds when the first result is incomplete: locate entry points, inspect referenced files/scripts/configs, and follow the chain until you understand the mechanism.',
          'Do not ask the user to run commands that you can run with available tools. Keep risky or system-changing commands separate from inspection and explain them before choosing them.',
          'If a tool produces useful stdout/stderr or search results, use that output in the next reasoning step before giving the final answer.',
        ].join('\n')
      : '',
    config.tools?.terminalMode === 'isolated'
      ? 'Terminal mode is soft-isolated: commands run from a My Computer sandbox HOME. This is not a full VM/container isolation; absolute paths can still touch the host.'
      : 'Terminal mode is standard: commands run on the user machine with the normal user environment.',
    config.tools?.alwaysAllow
      ? 'The user enabled automatic tool execution. Tools may run without an extra confirmation step.'
      : 'The user disabled automatic tool execution. The app may ask the user to approve a tool before it actually runs.',
    'For every tool call, set returnOutput to true only when you need the tool result to continue reasoning. Use returnOutput false for pure side effects such as rename_chat, successful memory writes, or compacting when you do not need the summary.',
    getSearchMode(config.tools) !== 'off'
      ? `Use web_search when current, time-sensitive, source-backed, legal/medical/financial, schedule, price, documentation, or news information matters. Search mode is "${getSearchMode(config.tools)}": terminal means the web_search tool runs a terminal-backed public DuckDuckGo query, and both means provider-side native search first with that web_search terminal fallback when native search fails or returns no results. Terminal search mode does not mean you should call run_terminal_command. Do not use web_search for purely local app state, files, or memories; use the local tools for those. If web_search returns sources, include a final "Fontes" section with the URLs and briefly say which search method was used. If web_search fails, is rate-limited, or returns no public results, do not switch to run_terminal_command, grep, find, rg, or local filesystem searches unless the user explicitly asked to search local files. Instead, say the web search failed or found no reliable public sources and ask for another query/provider if needed.`
      : 'Web search is disabled by user settings.',
    config.privacy?.offlineMode && getSearchMode(config.tools) !== 'off'
      ? 'Offline search privacy rule: if web_search is enabled, use only terminal-backed search and write neutral, generic queries. Never include user text verbatim, names, secrets, local paths, code snippets, private project names, memory contents, chat details, or terminal output in a web search query. If a useful query would reveal private context, ask the user to approve or provide a sanitized query.'
      : '',
    config.tools?.chatMemory
      ? 'When stable user preferences, decisions, file paths, facts, or TODOs appear inside this chat, use memory_chat to read or update the current chat memory.'
      : 'Chat memory editing through tools is disabled by user settings.',
    config.tools?.persistentMemory
      ? 'When stable information should survive across all chats, use persistent_memory to read or update the global memory.'
      : 'Persistent memory editing through tools is disabled by user settings.',
    config.tools?.userMemory !== false
      ? 'User-added persistent memory files are managed by the app. When their index suggests useful context and full content was not injected, use persistent_memory_user to list or read files. Prefer this tool over terminal for those files. If a read result has truncated=true, continue reading with offset=nextOffset before relying on the missing part.'
      : 'Reading user-added persistent memory files through tools is disabled by user settings.',
    config.tools?.userMemoryEdit
      ? 'The edit_persistent_memory_user tool is enabled. Use it to keep user-added Markdown/text memory files current when the conversation creates durable facts, decisions, preferences, project state, or TODOs that belong in those files.'
      : 'Editing user-added persistent memory files through tools is disabled by user settings.',
    config.tools?.userMemoryEdit && config.userMemory?.remindModelToUpdateFiles
      ? 'Before a final answer, briefly consider whether any user-added memory file should be updated. If yes, call edit_persistent_memory_user with exact oldText and newText; the user can approve or deny the change in the UI.'
      : '',
    config.tools?.chatDocuments !== false
      ? 'Chat attachments are copied into the app runtime. For user requests to inspect or edit Markdown/text/HTML/JSON/YAML/code attachments, use chat_document instead of terminal. The tool edits only the saved chat copy and supports list/read/replace/write; if a read result is truncated, continue with offset=nextOffset.'
      : 'Reading and editing chat document attachments through tools is disabled by user settings.',
    config.tools?.autoCompact
      ? 'When the current conversation is getting long or important context should be preserved, use compact_context to update the durable compacted context.'
      : 'Automatic context compaction through tools is disabled by user settings.',
    config.tools?.chatTitle
      ? 'If the chat title is generic, call rename_chat after the first user message with a short descriptive title. For rename_chat, normally set returnOutput false.'
      : 'Chat title editing through tools is disabled by user settings.',
    config.tools?.sendEmail
      ? 'The send_email tool is available for this scheduled task. It always sends to the single destination address configured by the user in Email settings -- there is no recipient parameter and you cannot choose or override the destination. Use it only when the task prompt asks for an emailed result.'
      : '',
    config.tools?.chatMemory
      ? 'For memory_chat write operations, send the full edited Markdown memory file, using the current memory below as the base.'
      : '',
    config.tools?.persistentMemory
      ? 'For persistent_memory write operations, send the full edited Markdown memory file, using the current persistent memory below as the base.'
      : '',
    'Be careful with host actions, explain risky commands before choosing them, and prefer read-only commands when inspection is enough.',
    'Sudo and host actions: this app runs commands as the current OS user. If sudo needs a password, the browser cannot type it for the user; explain the exact command to run manually or suggest a narrow NOPASSWD sudoers rule only when appropriate. Never imply sudo is configured unless a command confirms it.',
    `Runtime folder: ${config.runtimeHome || getRuntimeHome()}`,
    `Current chat title: ${chat.title}`,
    `Chat memory file: ${chat.paths.memory}`,
    `Saved context file: ${chat.paths.context}`,
    `Current context window file: ${chat.paths.contextWindow}`,
    '',
    'Always use the persistent memory, chat memory, and compacted context below as durable context.',
    '',
    '<persistent_memory_md>',
    skipMemory ? 'Memória persistente não incluída nesta execução agendada (otimização de tokens).' : persistentMemory || 'Sem memória persistente.',
    '</persistent_memory_md>',
    '',
    skipMemory ? '' : renderUserMemoryPromptSection(userMemoryContext, config),
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

function renderUserMemoryPromptSection(userMemoryContext, config = {}) {
  const files = userMemoryContext?.files || [];
  if (!files.length) {
    return ['<persistent_memory_user_files mode="empty">', 'Nenhum arquivo adicional de memória do usuário foi adicionado.', '</persistent_memory_user_files>'].join('\n');
  }
  const mode = userMemoryContext?.mode === 'full' ? 'full' : 'index';
  const lines = [`<persistent_memory_user_files mode="${mode}" count="${files.length}">`];
  lines.push('These files were explicitly added by the user as durable memory. Treat them as user-provided context, but prefer newer chat facts when there is a clear conflict.');
  lines.push('');
  lines.push('## Index');
  for (const file of files) {
    lines.push(`- id: ${file.id}`);
    lines.push(`  name: ${file.name}`);
    if (file.displayName && file.displayName !== file.name) lines.push(`  displayName: ${file.displayName}`);
    if (file.title) lines.push(`  title: ${file.title}`);
    if (file.preview) lines.push(`  preview: ${file.preview}`);
    lines.push(`  size: ${file.size} bytes`);
    lines.push(`  editable: ${file.editable ? 'yes' : 'no'}`);
    lines.push(`  storageName: ${file.storageName || ''}`);
  }
  if (mode !== 'full') {
    lines.push('');
    if (config.tools?.userMemory !== false) {
      lines.push('Only the index was injected because "send user-added files to every prompt" is off. Use name/title/preview to choose likely files, then call persistent_memory_user with action "read" using fileId or the original file name before answering when a file may matter.');
    } else {
      lines.push('Only the index was injected because "send user-added files to every prompt" is off, and persistent_memory_user is disabled. Do not claim to know file contents that were not injected; ask the user to enable file reading or provide the relevant file when needed.');
    }
  } else {
    lines.push('');
    lines.push('## File contents');
    for (const file of userMemoryContext.promptFiles || []) {
      lines.push('');
      lines.push(`<user_memory_file id="${escapeXmlAttribute(file.id)}" name="${escapeXmlAttribute(file.name)}" editable="${file.editable ? 'yes' : 'no'}">`);
      lines.push(file.content || (file.readError ? '[Read error]' : '[Empty file]'));
      if (file.truncated) lines.push('\n[File content truncated for prompt budget.]');
      lines.push('</user_memory_file>');
    }
  }
  if (config.tools?.userMemoryEdit && config.userMemory?.remindModelToUpdateFiles) {
    lines.push('');
    lines.push('Memory upkeep reminder: update these files with edit_persistent_memory_user when durable information changes and the target file is editable.');
  }
  lines.push('</persistent_memory_user_files>');
  return lines.join('\n');
}

function getHistoryBudgetChars(config) {
  if (config.context?.historyBudgetEnabled === false) return 0;
  const configured = Number(config.context?.historyBudgetChars);
  return Number.isFinite(configured) && configured > 0 ? configured : MAX_CONTEXT_CHARS;
}

async function selectRecentMessages(chat, config, options = {}) {
  const selected = [];
  let total = 0;
  const budget = getHistoryBudgetChars(config);

  for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
    const message = chat.messages[index];
    if (!['user', 'assistant'].includes(message.role)) continue;
    if (message.status === 'failed' || message.status === 'incomplete') continue;
    const rendered = await renderProviderMessage(chat, message, config, options);
    const size = estimateMessageSize(rendered.content) + 20;
    if (selected.length && total + size > budget) break;
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

  if (name === 'persistent_memory_user') {
    return executePersistentMemoryUserToolCall(chatId, toolCall.id, input);
  }

  if (name === 'edit_persistent_memory_user') {
    return executeEditPersistentMemoryUserToolCall(chatId, toolCall.id, input);
  }

  if (name === 'chat_document') {
    return executeChatDocumentToolCall(chatId, toolCall.id, input);
  }

  if (name === 'compact_context') {
    return executeCompactContextToolCall(chatId, toolCall.id, input, config);
  }

  if (name === 'rename_chat') {
    return executeRenameChatToolCall(chatId, toolCall.id, input);
  }

  if (name === 'web_search') {
    return executeWebSearchToolCall(chatId, toolCall.id, normalizeWebSearchInput(input), config);
  }

  if (name === 'send_email') {
    return executeSendEmailToolCall(chatId, toolCall.id, input, config);
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

  const terminalInput = normalizeToolInput(name, input);
  await appendEvent({
    type: 'tool.run_terminal_command.requested',
    chatId,
    details: {
      command: terminalInput.command,
      timeoutSeconds: terminalInput.timeoutSeconds,
      terminalMode: config.tools?.terminalMode || 'standard',
    },
  });
  const result = await runTerminalCommand(terminalInput.command, {
    timeoutSeconds: terminalInput.timeoutSeconds,
    terminalMode: config.tools?.terminalMode,
    runtimeHome: config.runtimeHome,
    signal: config.signal,
  });
  throwIfStopped(config.signal);
  await appendEvent({
    type: 'tool.run_terminal_command.completed',
    chatId,
    details: {
      command: terminalInput.command,
      timeoutSeconds: terminalInput.timeoutSeconds,
      terminalMode: result.terminalMode,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdoutPreview: truncate(result.stdout || '', 2000),
      stderrPreview: truncate(result.stderr || '', 2000),
    },
  });

  return {
    id: toolCall.id,
    name,
    input: terminalInput,
    result,
    createdAt: new Date().toISOString(),
  };
}

async function executeToolCallSafely(chatId, toolCall, config = {}) {
  try {
    throwIfStopped(config.signal);
    return await executeToolCall(chatId, toolCall, config);
  } catch (error) {
    if (isUserStopError(error)) throw error;
    try {
      await appendEvent({
        type: 'tool.execution.failed',
        chatId,
        details: {
          toolCallId: toolCall?.id || null,
          toolName: toolCall?.function?.name || 'unknown_tool',
          error: error.message || String(error),
        },
      });
    } catch {
      // The assistant turn still needs a persisted tool failure if diagnostics fail.
    }
    return createFailedToolUse(toolCall, error);
  }
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

async function executeSendEmailToolCall(chatId, toolCallId, input, config = {}) {
  const email = config.email || {};
  if (!isEmailConfigured(email)) {
    return {
      id: toolCallId,
      name: 'send_email',
      input,
      result: { error: 'Envio de email não está configurado (chave do Resend ou email de destino faltando).' },
      createdAt: new Date().toISOString(),
    };
  }

  const subject = String(input.subject || '').trim();
  const body = String(input.body || '').trim();
  try {
    const sent = await sendEmail({
      apiKey: email.resendApiKey,
      to: email.destinationEmail,
      subject,
      text: body,
    });
    await appendEvent({
      type: 'tool.send_email.sent',
      chatId,
      details: { subject: truncate(subject, 200), bodyPreview: truncate(body, 500) },
    });
    return {
      id: toolCallId,
      name: 'send_email',
      input,
      result: { action: 'sent', id: sent.id },
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    await appendEvent({
      type: 'tool.send_email.failed',
      chatId,
      details: { subject: truncate(subject, 200), error: error.message },
    });
    return {
      id: toolCallId,
      name: 'send_email',
      input,
      result: { error: `Falha ao enviar email: ${error.message}` },
      createdAt: new Date().toISOString(),
    };
  }
}

async function executeCompactContextToolCall(chatId, toolCallId, input, config = {}) {
  const compacted = await compactChat(chatId, { signal: config.signal });
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

function buildEnabledToolDefinitions(tools = {}, scheduledTaskContext = null, emailSettings = null) {
  const definitions = [
    tools.terminal !== false ? terminalToolDefinition : null,
    getSearchMode(tools) !== 'off' ? webSearchToolDefinition : null,
    tools.chatMemory !== false ? memoryChatToolDefinition : null,
    tools.persistentMemory !== false ? persistentMemoryToolDefinition : null,
    tools.userMemory !== false ? persistentMemoryUserToolDefinition : null,
    tools.userMemoryEdit === true ? editPersistentMemoryUserToolDefinition : null,
    tools.chatDocuments !== false ? chatDocumentToolDefinition : null,
    tools.autoCompact !== false ? compactContextToolDefinition : null,
    tools.chatTitle !== false ? renameChatToolDefinition : null,
  ].filter(Boolean);
  if (!scheduledTaskContext) return definitions;
  const allowed = new Set(scheduledTaskContext.allowedTools || []);
  const filtered = definitions.filter((definition) => allowed.has(definition.function?.name));
  // send_email only ever exists inside scheduled tasks, never in the base/interactive list above,
  // and only when Resend is actually configured -- otherwise the model would see a tool that
  // can't possibly work.
  if (allowed.has('send_email') && isEmailConfigured(emailSettings)) {
    filtered.push(sendEmailToolDefinition);
  }
  return filtered;
}

function isEmailConfigured(emailSettings) {
  return Boolean(emailSettings?.enabled && emailSettings?.resendApiKey && emailSettings?.destinationEmail);
}

export function normalizeAssistantToolCalls(toolCalls = [], content = '', tools = {}) {
  const normalized = (Array.isArray(toolCalls) ? toolCalls : [])
    .map((toolCall, index) => normalizeToolCall(toolCall, index))
    .filter(Boolean);
  if (normalized.length) return ensureUniqueToolCallIds(normalized);

  const syntheticToolCalls = extractSyntheticToolCalls(content, tools);
  if (syntheticToolCalls.length) return ensureUniqueToolCallIds(syntheticToolCalls);

  if (getSearchMode(tools) === 'off') return [];

  const fakeWebSearchInput = extractFakeWebSearchInput(content);
  if (!fakeWebSearchInput) return [];
  return ensureUniqueToolCallIds([
    {
      id: `synthetic_web_search_${Date.now()}`,
      type: 'function',
      function: {
        name: 'web_search',
        arguments: JSON.stringify(normalizeWebSearchInput(fakeWebSearchInput)),
      },
      synthetic: true,
    },
  ]);
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

function ensureUniqueToolCallIds(toolCalls = []) {
  const used = new Set();
  return toolCalls.map((toolCall, index) => {
    const fallbackId = `tool_call_${Date.now()}_${index}`;
    const baseId = String(toolCall.id || fallbackId).trim() || fallbackId;
    let nextId = baseId;
    let suffix = 2;
    while (used.has(nextId)) {
      nextId = `${baseId}_${suffix}`;
      suffix += 1;
    }
    used.add(nextId);
    return nextId === toolCall.id ? toolCall : { ...toolCall, id: nextId };
  });
}

function hasDuplicateToolCallIds(toolCalls = []) {
  const seen = new Set();
  for (const toolCall of toolCalls || []) {
    const id = String(toolCall?.id || '').trim();
    if (!id) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function extractSyntheticToolCalls(content = '', tools = {}) {
  const text = String(content || '');
  const candidates = [];
  const tagPatterns = [
    /<function\s*=\s*["']?([\w.-]+)["']?\s*>\s*([\s\S]*?)\s*<\/function>/gi,
    /<function\b[^>]*\bname\s*=\s*["']?([\w.-]+)["']?[^>]*>\s*([\s\S]*?)\s*<\/function>/gi,
  ];

  for (const pattern of tagPatterns) {
    for (const match of text.matchAll(pattern)) {
      candidates.push({ name: match[1], body: match[2] });
    }
  }

  const inlinePattern =
    /^(run_terminal_command|web_search|memory_chat|persistent_memory|persistent_memory_user|edit_persistent_memory_user|chat_document|compact_context|rename_chat)\s*\(\s*(\{[\s\S]*\})\s*\)$/i;
  const inline = text.trim().match(inlinePattern);
  if (inline) {
    candidates.push({ name: inline[1], body: inline[2] });
  }

  return candidates
    .map((candidate, index) => {
      const name = normalizeSyntheticToolName(candidate.name);
      if (!name || !isToolEnabled(name, tools)) return null;
      const parsed = extractJsonObject(candidate.body) || {};
      if (!Object.keys(parsed).length && !['compact_context', 'rename_chat'].includes(name)) return null;
      return normalizeToolCall(
        {
          id: `synthetic_${name}_${Date.now()}_${index}`,
          type: 'function',
          function: {
            name,
            arguments: JSON.stringify(parsed),
          },
          synthetic: true,
        },
        index,
      );
    })
    .filter(Boolean);
}

function normalizeSyntheticToolName(name = '') {
  const value = String(name || '').trim().split('.').pop();
  return [
    'run_terminal_command',
    'web_search',
    'memory_chat',
    'persistent_memory',
    'persistent_memory_user',
    'edit_persistent_memory_user',
    'chat_document',
    'compact_context',
    'rename_chat',
    'send_email',
  ].includes(value)
    ? value
    : '';
}

function recoverMalformedToolCall(name, args) {
  const trimmedName = String(name || '').trim();
  const trimmedArgs = String(args || '').trim();
  const directTool = trimmedName.match(/^(web_search|run_terminal_command|memory_chat|persistent_memory|persistent_memory_user|edit_persistent_memory_user|chat_document|compact_context|rename_chat|send_email)(?:\s*=?\s*|\s+)(\{[\s\S]*\})$/);
  if (directTool) return { name: directTool[1], arguments: directTool[2] };
  if (trimmedName === 'web_search' || trimmedName.endsWith('.web_search')) return { name: 'web_search', arguments: trimmedArgs };
  return { name: trimmedName, arguments: trimmedArgs };
}

function normalizeToolInput(name, input = {}) {
  const normalizedInput = input && typeof input === 'object' ? { ...input } : {};
  const returnOutput = normalizeBooleanLike(normalizedInput.returnOutput);
  if (returnOutput !== undefined) normalizedInput.returnOutput = returnOutput;
  if (name === 'web_search') return normalizeWebSearchInput(normalizedInput);
  if (name === 'send_email') {
    normalizedInput.subject = String(normalizedInput.subject || '').trim().slice(0, 200);
    normalizedInput.body = String(normalizedInput.body || '').trim().slice(0, 20000);
  }
  if (name === 'persistent_memory_user') {
    normalizedInput.action = ['list', 'read', 'search'].includes(String(normalizedInput.action || '').trim())
      ? String(normalizedInput.action).trim()
      : 'list';
    if (Object.hasOwn(normalizedInput, 'offset')) normalizedInput.offset = clampInteger(normalizedInput.offset, 0, 2_000_000, 0);
    if (Object.hasOwn(normalizedInput, 'limit')) normalizedInput.limit = clampInteger(normalizedInput.limit, 1000, 50000, 20000);
  }
  if (name === 'chat_document') {
    normalizedInput.action = ['list', 'read', 'replace', 'write'].includes(String(normalizedInput.action || '').trim())
      ? String(normalizedInput.action).trim()
      : 'list';
    if (Object.hasOwn(normalizedInput, 'offset')) normalizedInput.offset = clampInteger(normalizedInput.offset, 0, 5_000_000, 0);
    if (Object.hasOwn(normalizedInput, 'limit')) normalizedInput.limit = clampInteger(normalizedInput.limit, 1000, 50000, 20000);
  }
  return normalizedInput;
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
  const inline = text.trim().match(/^web_search\s*=?\s*(\{[\s\S]*\})$/i);
  if (inline) return extractJsonObject(inline[1]);
  return null;
}

export function sanitizeAssistantToolLikeText(content = '') {
  const { visible } = extractAssistantThinking(content);
  return String(visible || '')
    .replace(/<function\s*=\s*["']?[\w.-]+["']?\s*>\s*[\s\S]*?\s*<\/function>/gi, '[Tool solicitada como texto; o app processou isso como tool quando possível.]')
    .replace(/<function\b[^>]*\bname\s*=\s*["']?[\w.-]+["']?[^>]*>\s*[\s\S]*?\s*<\/function>/gi, '[Tool solicitada como texto; o app processou isso como tool quando possível.]')
    .replace(/<web_search>\s*[\s\S]*?\s*<\/web_search>/gi, '[Busca web solicitada como texto; o app processou isso como tool quando possível.]')
    .replace(/\bweb_search\b\s*=?\s*\{[\s\S]*?\}(?=\s*$|\s*<\/|\s*\n)/gi, '[Busca web solicitada como texto; o app processou isso como tool quando possível.]')
    .replace(/^Tool used:\s*\w+[\s\S]*?(?:\n\s*\n|$)/gi, '')
    // Some small/weaker models emit a different malformed pseudo-tool-call syntax
    // (<parameter=name>value</parameter>), sometimes missing the opening wrapper tag
    // entirely. This can't be recovered into a real tool call, so just strip the leftover
    // markup instead of leaking it as literal text in the final answer.
    .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/gi, '')
    .replace(/<\/?parameter[^>]*>/gi, '')
    .trim();
}

function cleanAssistantContent(content = '') {
  const thinking = extractAssistantThinking(content).thinking.join('\n\n').trim();
  return {
    content: sanitizeAssistantToolLikeText(content),
    thinking,
  };
}

function extractAssistantThinking(content = '') {
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

function mergeThinkingSections(...sections) {
  return sections
    .flatMap((section) => (Array.isArray(section) ? section : [section]))
    .map((section) => String(section || '').trim())
    .filter(Boolean)
    .join('\n\n');
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

function normalizeBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'nao', 'não'].includes(normalized)) return false;
  return undefined;
}

function describeEnabledTools(tools = {}) {
  return [
    tools.terminal !== false ? 'run_terminal_command' : null,
    getSearchMode(tools) !== 'off' ? 'web_search' : null,
    tools.chatMemory !== false ? 'memory_chat' : null,
    tools.persistentMemory !== false ? 'persistent_memory' : null,
    tools.userMemory !== false ? 'persistent_memory_user' : null,
    tools.userMemoryEdit === true ? 'edit_persistent_memory_user' : null,
    tools.chatDocuments !== false ? 'chat_document' : null,
    tools.autoCompact !== false ? 'compact_context' : null,
    tools.chatTitle !== false ? 'rename_chat' : null,
  ].filter(Boolean);
}

function isToolEnabled(name, tools = {}) {
  if (name === 'run_terminal_command') return tools.terminal !== false;
  if (name === 'web_search') return getSearchMode(tools) !== 'off';
  if (name === 'memory_chat') return tools.chatMemory !== false;
  if (name === 'persistent_memory') return tools.persistentMemory !== false;
  if (name === 'persistent_memory_user') return tools.userMemory !== false;
  if (name === 'edit_persistent_memory_user') return tools.userMemoryEdit === true;
  if (name === 'chat_document') return tools.chatDocuments !== false;
  if (name === 'compact_context') return tools.autoCompact !== false;
  if (name === 'rename_chat') return tools.chatTitle !== false;
  // send_email has no global on/off flag -- tools.sendEmail only ever becomes true via
  // applyScheduledTaskToolMask (allowlist + isEmailConfigured), so outside that masked
  // context this is always false, structurally blocking it from regular chats.
  if (name === 'send_email') return tools.sendEmail === true;
  return true;
}

function toolRequiresApproval(toolCall, config = {}) {
  const name = toolCall?.function?.name;
  if (name === 'web_search' && config.privacy?.offlineMode === true) return true;
  if (config.tools?.alwaysAllow === true) return false;
  if (name === 'run_terminal_command') return true;
  if (name === 'memory_chat' || name === 'persistent_memory') {
    const input = normalizeToolInput(name, parseToolArguments(toolCall?.function?.arguments));
    return input.action !== 'read';
  }
  if (name === 'persistent_memory_user') {
    const input = normalizeToolInput(name, parseToolArguments(toolCall?.function?.arguments));
    return input.action === 'read';
  }
  if (name === 'edit_persistent_memory_user' || name === 'compact_context' || name === 'rename_chat') {
    return true;
  }
  if (name === 'chat_document') {
    return true;
  }
  if (name === 'web_search') {
    const searchMode = getSearchMode(config.tools);
    if (searchMode === 'terminal' || searchMode === 'both') return true;
  }
  return false;
}

function isToolAllowedForScheduledTask(toolCall, scheduledTaskContext) {
  return (scheduledTaskContext.allowedTools || []).includes(toolCall.function?.name);
}

function createScheduledTaskDeniedToolUse(toolCall) {
  return {
    id: toolCall.id,
    name: toolCall.function?.name || 'unknown_tool',
    input: normalizeToolInput(toolCall.function?.name, parseToolArguments(toolCall.function?.arguments)),
    status: 'denied',
    approvalRequired: false,
    result: { action: 'denied_scheduled_task', reason: 'Tool não permitida para esta tarefa agendada.' },
    createdAt: new Date().toISOString(),
  };
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

function createFailedToolUse(toolCall, error) {
  const name = toolCall?.function?.name || 'unknown_tool';
  return {
    id: toolCall?.id || `failed_tool_${Date.now()}`,
    name,
    input: normalizeToolInput(name, parseToolArguments(toolCall?.function?.arguments)),
    status: 'failed',
    result: { error: error.message || String(error) || 'Falha ao executar tool.' },
    createdAt: new Date().toISOString(),
  };
}

function describeToolFailure(toolUse = {}) {
  if (!toolUse) return 'Falha na tool.';
  if (toolUse.name === 'run_terminal_command') {
    if (toolUse.result?.timedOut) return 'O comando do terminal excedeu o timeout configurado.';
    if (toolUse.result?.signal) return `O comando do terminal foi encerrado por signal ${toolUse.result.signal}.`;
    if (typeof toolUse.result?.exitCode === 'number') {
      return `O comando do terminal terminou com exit code ${toolUse.result.exitCode}.`;
    }
  }
  return toolUse.result?.error || `Falha na tool ${toolUse.name || 'desconhecida'}.`;
}

function shouldReturnToolOutput(toolCall) {
  const name = toolCall?.function?.name;
  const input = normalizeToolInput(name, parseToolArguments(toolCall?.function?.arguments));
  if (typeof input.returnOutput === 'boolean') return input.returnOutput;
  return name !== 'rename_chat';
}

function appendToolResultForModel(messages, toolCall, toolUse) {
  const returnOutput = shouldReturnToolOutput(toolCall);
  const outputLimit = ['persistent_memory_user', 'chat_document'].includes(toolUse.name) ? 70000 : 12000;
  const result = returnOutput
    ? toolUse.result
    : {
        action: toolUse.result?.action || 'completed',
        outputOmitted: true,
        reason: 'returnOutput was false; detailed output was intentionally omitted by the app.',
      };
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: toolUse.name,
    content: truncate(JSON.stringify(result), outputLimit),
  });
  return returnOutput;
}

function renderToolFailureMessage(toolUse) {
  if (toolUse.name === 'run_terminal_command') {
    const exitCode = typeof toolUse.result?.exitCode === 'number' ? toolUse.result.exitCode : 'desconhecido';
    const timeoutNote = toolUse.result?.timedOut ? ' O comando excedeu o timeout solicitado.' : '';
    const signalNote = toolUse.result?.signal ? ` Encerrado por signal ${toolUse.result.signal}.` : '';
    const stderrNote = toolUse.result?.stderr ? `\n\nstderr:\n${truncate(toolUse.result.stderr, 2000)}` : '';
    return [
      'O comando do terminal falhou antes de concluir.',
      '',
      `Exit code: ${exitCode}.${timeoutNote}${signalNote}`,
      '',
      'Você pode tentar novamente, aumentar timeoutSeconds ou continuar a partir do estado atual.',
      stderrNote,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (toolUse.name !== 'web_search') {
    return `A tool ${toolUse.name} falhou: ${toolUse.result?.error || 'erro desconhecido'}`;
  }
  return [
    'A busca web falhou antes de retornar fontes confiáveis.',
    '',
    `Erro: ${toolUse.result?.error || 'erro desconhecido'}`,
    '',
    'Você pode tentar novamente em alguns segundos, trocar o modo de pesquisa ou reformular a consulta.',
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
  throwIfStopped(config.signal);
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
  let nativeResult = null;
  if (searchMode === 'both') {
    try {
      nativeResult = await callProviderNativeWebSearch({
        config,
        provider: config.provider,
        model: config.model,
        query,
        maxResults,
        chatId,
        signal: config.signal,
      });
      throwIfStopped(config.signal);
      await appendEvent({
        type: 'tool.web_search.completed',
        chatId,
        details: {
          query,
          resultCount: nativeResult.results?.length || 0,
          method: nativeResult.method,
        },
      });
      if (nativeResult.results?.length || searchMode !== 'both') {
        return {
          id: toolCallId,
          name: 'web_search',
          input,
          result: nativeResult,
          createdAt: new Date().toISOString(),
        };
      }
      await appendEvent({
        type: 'tool.web_search.native_empty',
        chatId,
        details: {
          query,
          provider: config.provider,
          method: nativeResult.method,
          resultCount: nativeResult.results?.length || 0,
        },
      });
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
    signal: config.signal,
  });
  throwIfStopped(config.signal);
  if (nativeError) {
    result.nativeError = nativeError.message;
    result.fallbackFrom = 'native';
  } else if (nativeResult) {
    result.fallbackFrom = 'native-empty';
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
  if (['off', 'terminal', 'both'].includes(mode)) return mode;
  if (tools.webSearch === false) return 'off';
  if (tools.searchTerminal === true) return 'terminal';
  return 'both';
}

function nativeSearchSupported(providerId) {
  return ['openai', 'groq', 'gemini', 'anthropic', 'xai', 'openrouter'].includes(providerId);
}

async function executePersistentMemoryToolCall(chatId, toolCallId, input) {
  const action = normalizeMemoryToolAction(input.action);
  if (!action) {
    return createInvalidMemoryActionToolUse(toolCallId, 'persistent_memory', input);
  }

  if (action === 'read') {
    const previous = await readPersistentMemory();
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

  const update = await updatePersistentMemory((previous) => applyMemoryToolUpdate(previous, content, action));
  const previous = update.previousContent;
  const next = update.content;

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

async function executePersistentMemoryUserToolCall(chatId, toolCallId, input) {
  const action = String(input.action || 'list').trim();
  if (action === 'list') {
    const files = (await listUserMemoryFilesWithHints()).map(serializeUserMemoryFileForTool);
    await appendEvent({ type: 'tool.persistent_memory_user.list', chatId, details: { reason: input.reason, fileCount: files.length } });
    return {
      id: toolCallId,
      name: 'persistent_memory_user',
      input,
      result: {
        action,
        files,
      },
      createdAt: new Date().toISOString(),
    };
  }

  if (action === 'search') {
    const keyword = String(input.keyword || '').trim();
    if (!keyword) {
      return {
        id: toolCallId,
        name: 'persistent_memory_user',
        input,
        status: 'failed',
        result: { action, error: 'keyword is required for action search' },
        createdAt: new Date().toISOString(),
      };
    }
    const matches = await searchUserMemoryFiles(keyword);
    await appendEvent({
      type: 'tool.persistent_memory_user.search',
      chatId,
      details: { reason: input.reason, keyword, matchCount: matches.length },
    });
    return {
      id: toolCallId,
      name: 'persistent_memory_user',
      input,
      result: { action, keyword, matches },
      createdAt: new Date().toISOString(),
    };
  }

  if (action !== 'read') {
    return {
      id: toolCallId,
      name: 'persistent_memory_user',
      input,
      status: 'failed',
      result: {
        action,
        error: 'action must be list, read, or search',
      },
      createdAt: new Date().toISOString(),
    };
  }

  const identifier = input.fileId || input.fileName;
  if (!identifier) {
    return {
      id: toolCallId,
      name: 'persistent_memory_user',
      input,
      status: 'failed',
      result: {
        action,
        error: 'fileId or fileName is required for read',
      },
      createdAt: new Date().toISOString(),
    };
  }

  const normalizedInput = normalizeToolInput('persistent_memory_user', input);
  const offset = normalizedInput.offset || 0;
  const limit = normalizedInput.limit || 20000;
  const file = await readUserMemoryFile(identifier);
  const totalChars = file.content.length;
  const content = file.content.slice(offset, offset + limit);
  const nextOffset = offset + content.length;
  const truncated = nextOffset < totalChars;
  await appendEvent({
    type: 'tool.persistent_memory_user.read',
    chatId,
    details: { reason: input.reason, fileId: file.id, name: file.name, offset, limit, truncated, nextOffset: truncated ? nextOffset : null },
  });
  return {
    id: toolCallId,
    name: 'persistent_memory_user',
    input: normalizedInput,
    result: {
      action,
      file: serializeUserMemoryFileForTool(file),
      offset,
      limit,
      totalChars,
      nextOffset: truncated ? nextOffset : null,
      truncated,
      content,
    },
    createdAt: new Date().toISOString(),
  };
}

function serializeUserMemoryFileForTool(file = {}) {
  return {
    id: file.id,
    name: file.name,
    displayName: file.displayName || file.name,
    storageName: file.storageName || String(file.path || '').split(/[\\/]/).pop() || '',
    size: file.size,
    editable: file.editable,
    title: file.title || '',
    preview: file.preview || '',
  };
}

async function executeEditPersistentMemoryUserToolCall(chatId, toolCallId, input) {
  const identifier = input.fileId || input.fileName;
  if (!identifier) {
    return {
      id: toolCallId,
      name: 'edit_persistent_memory_user',
      input,
      status: 'failed',
      result: { error: 'fileId or fileName is required' },
      createdAt: new Date().toISOString(),
    };
  }
  const oldText = String(input.oldText ?? '');
  if (!oldText) {
    return {
      id: toolCallId,
      name: 'edit_persistent_memory_user',
      input,
      status: 'failed',
      result: { error: 'oldText is required' },
      createdAt: new Date().toISOString(),
    };
  }

  const update = await replaceTextInUserMemoryFile(identifier, oldText, String(input.newText ?? ''));
  await appendEvent({
    type: 'tool.edit_persistent_memory_user',
    chatId,
    details: {
      reason: input.reason,
      fileId: update.file.id,
      name: update.file.name,
      path: update.path,
    },
  });
  return {
    id: toolCallId,
    name: 'edit_persistent_memory_user',
    input,
    result: {
      action: 'replace',
      file: serializeUserMemoryFileForTool(update.file),
      previousContent: truncate(update.previousContent, 4000),
      content: truncate(update.content, 12000),
    },
    createdAt: new Date().toISOString(),
  };
}

async function executeChatDocumentToolCall(chatId, toolCallId, input) {
  const normalizedInput = normalizeToolInput('chat_document', input);
  const action = normalizedInput.action || 'list';
  if (action === 'list') {
    const chat = await readChat(chatId);
    const documents = (chat.attachments || []).filter(isChatTextAttachment).map(serializeChatDocumentAttachmentForTool);
    await appendEvent({ type: 'tool.chat_document.list', chatId, details: { reason: input.reason, documentCount: documents.length } });
    return {
      id: toolCallId,
      name: 'chat_document',
      input: normalizedInput,
      result: {
        action,
        documents,
      },
      createdAt: new Date().toISOString(),
    };
  }

  const identifier = normalizedInput.attachmentId || normalizedInput.fileName;
  if (!identifier) {
    return {
      id: toolCallId,
      name: 'chat_document',
      input: normalizedInput,
      status: 'failed',
      result: { action, error: 'attachmentId or fileName is required' },
      createdAt: new Date().toISOString(),
    };
  }

  if (action === 'read') {
    const offset = normalizedInput.offset || 0;
    const limit = normalizedInput.limit || 20000;
    const file = await readAttachmentTextContent(chatId, identifier);
    const totalChars = file.content.length;
    const content = file.content.slice(offset, offset + limit);
    const nextOffset = offset + content.length;
    const truncated = nextOffset < totalChars;
    await appendEvent({
      type: 'tool.chat_document.read',
      chatId,
      details: {
        reason: input.reason,
        attachmentId: file.attachment.id,
        name: file.attachment.name,
        offset,
        limit,
        truncated,
        nextOffset: truncated ? nextOffset : null,
      },
    });
    return {
      id: toolCallId,
      name: 'chat_document',
      input: normalizedInput,
      result: {
        action,
        document: serializeChatDocumentAttachmentForTool(file.attachment),
        offset,
        limit,
        totalChars,
        nextOffset: truncated ? nextOffset : null,
        truncated,
        content,
      },
      createdAt: new Date().toISOString(),
    };
  }

  if (action === 'replace') {
    const oldText = String(normalizedInput.oldText ?? '');
    if (!oldText) {
      return {
        id: toolCallId,
        name: 'chat_document',
        input: normalizedInput,
        status: 'failed',
        result: { action, error: 'oldText is required for replace' },
        createdAt: new Date().toISOString(),
      };
    }
    const update = await replaceTextInAttachment(chatId, identifier, oldText, String(normalizedInput.newText ?? ''));
    await appendEvent({
      type: 'tool.chat_document.replace',
      chatId,
      details: { reason: input.reason, attachmentId: update.attachment.id, name: update.attachment.name, path: update.path },
    });
    return {
      id: toolCallId,
      name: 'chat_document',
      input: normalizedInput,
      result: {
        action,
        document: serializeChatDocumentAttachmentForTool(update.attachment),
        previousContent: truncate(update.previousContent, 4000),
        content: truncate(update.content, 12000),
      },
      createdAt: new Date().toISOString(),
    };
  }

  if (action === 'write') {
    const update = await writeAttachmentTextContent(chatId, identifier, String(normalizedInput.content ?? ''));
    await appendEvent({
      type: 'tool.chat_document.write',
      chatId,
      details: { reason: input.reason, attachmentId: update.attachment.id, name: update.attachment.name, path: update.path },
    });
    return {
      id: toolCallId,
      name: 'chat_document',
      input: normalizedInput,
      result: {
        action,
        document: serializeChatDocumentAttachmentForTool(update.attachment),
        previousContent: truncate(update.previousContent, 4000),
        content: truncate(update.content, 12000),
      },
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: toolCallId,
    name: 'chat_document',
    input: normalizedInput,
    status: 'failed',
    result: { action, error: 'action must be list, read, replace, or write' },
    createdAt: new Date().toISOString(),
  };
}

function serializeChatDocumentAttachmentForTool(attachment = {}) {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
    sendMode: attachment.sendMode,
    extractionStatus: attachment.extractionStatus || '',
    title: inferDocumentTitle(attachment.extractedText || attachment.previewText || ''),
    preview: truncate(String(attachment.previewText || attachment.extractedText || ''), 500),
    updatedAt: attachment.updatedAt || attachment.createdAt || '',
  };
}

function isChatTextAttachment(attachment = {}) {
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const name = String(attachment.name || '').toLowerCase();
  return (
    attachment.kind === 'text' ||
    mimeType.startsWith('text/') ||
    /\.(md|markdown|txt|json|jsonl|csv|tsv|html?|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|css|py|rb|go|rs|java|c|cpp|h|hpp|sh|sql|log|ini|toml)$/i.test(name) ||
    ['application/json', 'application/xml', 'application/x-yaml'].includes(mimeType)
  );
}

function inferDocumentTitle(text = '') {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => /^#{1,6}\s+/.test(line));
  if (heading) return heading.replace(/^#{1,6}\s+/, '').trim().slice(0, 160);
  return (lines[0] || '').slice(0, 160);
}

async function executeMemoryToolCall(chatId, toolCallId, input) {
  const action = normalizeMemoryToolAction(input.action);
  if (!action) {
    return createInvalidMemoryActionToolUse(toolCallId, 'memory_chat', input);
  }

  if (action === 'read') {
    const previous = await readMemory(chatId);
    const chat = await readChat(chatId);
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
    const chat = await readChat(chatId);
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

  const update = await updateMemory(chatId, (previous) => applyMemoryToolUpdate(previous, content, action));
  const previous = update.previousContent;
  const next = update.content;

  await appendEvent({
    type: `tool.memory_chat.${action}`,
    chatId,
    details: { reason: input.reason, path: update.path },
  });

  return {
    id: toolCallId,
    name: 'memory_chat',
    input,
    result: {
      action,
      path: update.path,
      previousContent: truncate(previous, 4000),
      content: truncate(next, 12000),
    },
    createdAt: new Date().toISOString(),
  };
}

function applyMemoryToolUpdate(previous, content, action) {
  return action === 'append'
    ? `${previous.trim()}\n\n${content}\n`
    : content.endsWith('\n')
      ? content
      : `${content}\n`;
}

function normalizeMemoryToolAction(value) {
  const action = String(value || 'read').trim();
  return MEMORY_TOOL_ACTIONS.has(action) ? action : null;
}

function createInvalidMemoryActionToolUse(toolCallId, name, input = {}) {
  return {
    id: toolCallId,
    name,
    input,
    status: 'failed',
    result: {
      action: String(input.action || ''),
      error: 'action must be one of: read, write, append',
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
  const requestSource = resolveRequestSourceMessage(chat, options);
  if (requestSource?.sourceUserMessage) {
    return requestSource.sourceUserMessage.attachments || [];
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
    if (attachment.deletedAt || attachment.sendMode === 'deleted') {
      parts.push(
        [
          `## ${attachment.name || 'Anexo removido'}`,
          `- id: ${attachment.id}`,
          '- status: removed_by_user',
          '- content: unavailable',
        ].join('\n'),
      );
      continue;
    }
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
