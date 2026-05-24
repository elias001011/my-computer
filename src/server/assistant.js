import { runtimeHome } from './paths.js';
import { callGroqChat } from './groq.js';
import {
  appendEvent,
  appendMessages,
  createMessage,
  readChat,
  readContextSummary,
  readMemory,
  loadConfig,
  saveContextSnapshot,
  saveCurrentContextWindow,
  updateChatMetadata,
  writeMemory,
  writeContextSummary,
} from './store.js';
import { memoryChatToolDefinition, runTerminalCommand, terminalToolDefinition } from './tools.js';

const MAX_CONTEXT_CHARS = 28000;
const MAX_CONTEXT_SAVE_CHARS = 120000;
const MAX_TOOL_ROUNDS = 4;

export async function sendUserMessage(chatId, content) {
  const config = await loadConfig();
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    const error = new Error('Mensagem vazia.');
    error.statusCode = 400;
    throw error;
  }

  const chatBefore = await readChat(chatId);
  const userMessage = createMessage('user', trimmed);
  await appendMessages(chatId, [userMessage]);

  if (chatBefore.title === 'Novo chat') {
    await updateChatMetadata(chatId, { title: trimmed });
  }

  const chat = await readChat(chatId);
  const effectiveConfig = { ...config, model: chat.model || config.model };
  const workingMessages = buildProviderMessages(chat, effectiveConfig);
  const toolUses = [];
  let finalContent = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const assistantMessage = await callGroqChat({
      apiKey: config.apiKey,
      model: effectiveConfig.model,
      messages: workingMessages,
      tools: [terminalToolDefinition, memoryChatToolDefinition],
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
    const assistantMessage = await callGroqChat({
      apiKey: config.apiKey,
      model: effectiveConfig.model,
      messages: workingMessages,
      tools: [],
    });
    finalContent = assistantMessage.content || 'Terminei a execucao das tools, mas nao recebi texto final.';
  }

  const savedAssistantMessage = createMessage('assistant', finalContent, { toolUses });
  await appendMessages(chatId, [savedAssistantMessage]);

  const updatedChat = await readChat(chatId);
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig));
  await appendEvent({ type: 'chat.message.completed', chatId, details: { toolCount: toolUses.length } });

  return {
    userMessage,
    assistantMessage: savedAssistantMessage,
    chat: await readChat(chatId),
  };
}

export async function compactChat(chatId) {
  const config = await loadConfig();
  const chat = await readChat(chatId);
  const effectiveConfig = { ...config, model: chat.model || config.model };
  const transcript = renderTranscript(chat.messages, MAX_CONTEXT_SAVE_CHARS);
  const contextSummary = await readContextSummary(chatId);

  const response = await callGroqChat({
    apiKey: config.apiKey,
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
          `Chat memory:\n${chat.memory}`,
          `Transcript:\n${transcript}`,
        ].join('\n\n---\n\n'),
      },
    ],
  });

  const summary = response.content || '# Context summary\n\nNenhum resumo retornado.';
  const updatedChat = await writeContextSummary(chatId, summary);
  await saveCurrentContextWindow(chatId, buildContextWindowMarkdown(updatedChat, effectiveConfig));
  return { summary, chat: await readChat(chatId) };
}

export async function saveContextWindow(chatId) {
  const config = await loadConfig();
  const chat = await readChat(chatId);
  const effectiveConfig = { ...config, model: chat.model || config.model };
  const content = buildContextWindowMarkdown(chat, effectiveConfig);
  const path = await saveContextSnapshot(chatId, content);
  await saveCurrentContextWindow(chatId, content);
  return { path, chat: await readChat(chatId) };
}

export function buildContextWindowMarkdown(chat, config) {
  return [
    `# Context window - ${chat.title}`,
    '',
    `- Chat: ${chat.id}`,
    `- Runtime: ${runtimeHome}`,
    `- Provider: ${config.provider}`,
    `- Model: ${chat.model || config.model}`,
    `- Language: ${config.language}`,
    '',
    '## User preferences',
    '',
    config.systemPromptExtra || 'Nenhuma preferencia extra configurada.',
    '',
    '## Chat memory',
    '',
    chat.memory || 'Sem memoria de chat.',
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

function buildProviderMessages(chat, config) {
  const systemPrompt = buildSystemPrompt(chat, config);
  return [{ role: 'system', content: systemPrompt }, ...selectRecentMessages(chat.messages)];
}

function buildSystemPrompt(chat, config) {
  const languageInstruction =
    config.language === 'auto'
      ? 'Respond in the same language the user is using.'
      : `Respond in this language unless the user explicitly asks otherwise: ${config.language}.`;

  return [
    'You are My Computer, a self-hosted AI assistant running on the user machine.',
    languageInstruction,
    'You have two tools: run_terminal_command and memory_chat.',
    'When local state, files, commands, or host actions matter, call run_terminal_command before your final answer.',
    'When stable user preferences, decisions, file paths, facts, or TODOs appear, use memory_chat to read or update the current chat memory.',
    'For memory_chat write operations, send the full edited Markdown memory file, using the current memory below as the base.',
    'For this MVP there is no extra confirmation step before terminal execution. Be careful, explain risky commands before choosing them, and prefer read-only commands when inspection is enough.',
    `Runtime folder: ${runtimeHome}`,
    `Chat memory file: ${chat.paths.memory}`,
    `Saved context file: ${chat.paths.context}`,
    `Current context window file: ${chat.paths.contextWindow}`,
    '',
    'Always use the chat memory and compacted context below as durable context for this chat.',
    '',
    '<chat_memory_md>',
    chat.memory || 'Sem memoria de chat.',
    '</chat_memory_md>',
    '',
    '<compacted_context_md>',
    chat.contextSummary || 'Sem contexto compactado.',
    '</compacted_context_md>',
    '',
    '<extra_user_preferences>',
    config.systemPromptExtra || 'Nenhuma preferencia extra configurada.',
    '</extra_user_preferences>',
  ].join('\n');
}

function selectRecentMessages(messages) {
  const selected = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!['user', 'assistant'].includes(message.role)) continue;
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

  if (name !== 'run_terminal_command') {
    return {
      id: toolCall.id,
      name: name || 'unknown_tool',
      input,
      result: { error: `Unknown tool: ${name}` },
      createdAt: new Date().toISOString(),
    };
  }

  const result = await runTerminalCommand(input.command);
  await appendEvent({
    type: 'tool.run_terminal_command',
    chatId,
    details: {
      command: input.command,
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
