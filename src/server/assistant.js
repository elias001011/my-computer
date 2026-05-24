import { runtimeHome } from './paths.js';
import { callProviderChat } from './provider-client.js';
import {
  appendEvent,
  appendMessages,
  createMessage,
  readChat,
  readContextSummary,
  readMemory,
  readPersistentMemory,
  loadConfig,
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
  terminalToolDefinition,
} from './tools.js';

const MAX_CONTEXT_CHARS = 28000;
const MAX_CONTEXT_SAVE_CHARS = 120000;
const MAX_TOOL_ROUNDS = 4;

export async function sendUserMessage(chatId, content, options = {}) {
  const config = await loadConfig();
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    const error = new Error('Mensagem vazia.');
    error.statusCode = 400;
    throw error;
  }

  const chatBefore = await readChat(chatId);
  const userMessage = await saveUserMessageForRequest(chatId, chatBefore, trimmed, options.retryMessageId);
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
  };
  const workingMessages = buildProviderMessages(chat, effectiveConfig, persistentMemory);
  const toolUses = [];
  const enabledTools = buildEnabledToolDefinitions(effectiveConfig.tools);
  let finalContent = '';

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const assistantMessage = await callProviderChat({
        config: effectiveConfig,
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        messages: workingMessages,
        tools: enabledTools,
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

      for (const toolCall of toolCalls) {
        const toolUse = await executeToolCall(chatId, toolCall);
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
  await appendEvent({ type: 'chat.message.completed', chatId, details: { toolCount: toolUses.length } });

  return {
    userMessage,
    assistantMessage: savedAssistantMessage,
    chat: await readChat(chatId),
  };
}

async function saveUserMessageForRequest(chatId, chat, content, retryMessageId) {
  if (retryMessageId) {
    const existing = chat.messages.find((message) => message.id === retryMessageId && message.role === 'user');
    if (!existing) {
      const error = new Error('Mensagem para retry não encontrada.');
      error.statusCode = 404;
      throw error;
    }

    return updateMessage(chatId, retryMessageId, {
      content: existing.content || content,
      status: 'pending',
      error: null,
      retryCount: Number(existing.retryCount || 0) + 1,
      retriedAt: new Date().toISOString(),
    });
  }

  const userMessage = createMessage('user', content, {
    status: 'pending',
  });
  await appendMessages(chatId, [userMessage]);
  return userMessage;
}

export async function compactChat(chatId) {
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
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig, persistentMemory));
  return { summary, chat: await readChat(chatId) };
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

function buildProviderMessages(chat, config, persistentMemory) {
  const systemPrompt = buildSystemPrompt(chat, config, persistentMemory);
  return [{ role: 'system', content: systemPrompt }, ...selectRecentMessages(chat.messages)];
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
    `Available tools: ${describeEnabledTools(config.tools).join(', ') || 'none'}.`,
    'Respond with a clear structure: short answer first, then concise sections or bullets when useful. Be explicit about commands run, files changed, and next steps.',
    config.tools?.terminal
      ? 'When local state, files, commands, or host actions matter, call run_terminal_command before your final answer. Avoid interactive commands unless you make them non-interactive; for package managers prefer flags like -y/--assumeyes when safe. Do not retry a failing or rate-limited command repeatedly.'
      : 'Terminal execution is disabled by user settings.',
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
    'For this MVP there is no extra confirmation step before terminal execution. Be careful, explain risky commands before choosing them, and prefer read-only commands when inspection is enough.',
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

function selectRecentMessages(messages) {
  const selected = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!['user', 'assistant'].includes(message.role)) continue;
    if (message.status === 'failed') continue;
    const content = renderMessageForModel(message);
    const size = content.length + 20;
    if (selected.length && total + size > MAX_CONTEXT_CHARS) break;
    selected.unshift({ role: message.role, content });
    total += size;
  }

  return selected;
}

async function executeToolCall(chatId, toolCall) {
  const name = toolCall?.function?.name;
  let input = {};
  try {
    input = JSON.parse(toolCall?.function?.arguments || '{}');
  } catch (error) {
    input = { parseError: error.message, raw: toolCall?.function?.arguments || '' };
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

  if (name !== 'run_terminal_command') {
    return {
      id: toolCall.id,
      name: name || 'unknown_tool',
      input,
      result: { error: `Unknown tool: ${name}` },
      createdAt: new Date().toISOString(),
    };
  }

  const result = await runTerminalCommand(input.command, { timeoutSeconds: input.timeoutSeconds });
  await appendEvent({
    type: 'tool.run_terminal_command',
    chatId,
    details: {
      command: input.command,
      timeoutSeconds: input.timeoutSeconds,
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
    tools.chatMemory !== false ? memoryChatToolDefinition : null,
    tools.persistentMemory !== false ? persistentMemoryToolDefinition : null,
    tools.autoCompact !== false ? compactContextToolDefinition : null,
    tools.chatTitle !== false ? renameChatToolDefinition : null,
  ].filter(Boolean);
}

function describeEnabledTools(tools = {}) {
  return [
    tools.terminal !== false ? 'run_terminal_command' : null,
    tools.chatMemory !== false ? 'memory_chat' : null,
    tools.persistentMemory !== false ? 'persistent_memory' : null,
    tools.autoCompact !== false ? 'compact_context' : null,
    tools.chatTitle !== false ? 'rename_chat' : null,
  ].filter(Boolean);
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

  return [toolText, message.content].filter(Boolean).join('\n\n');
}

function renderTranscript(messages, maxChars) {
  const parts = messages.map((message) => {
    const label = message.role === 'assistant' ? 'Assistant' : 'User';
    return `### ${label} - ${message.createdAt}\n\n${renderMessageForModel(message)}`;
  });
  return truncate(parts.join('\n\n'), maxChars);
}

function truncate(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated]`;
}
