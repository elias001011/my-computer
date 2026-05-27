import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('normalizes web_search tool calls and fake tool text', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-stability-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const assistant = await import(`../src/server/assistant.js?test=${Date.now()}`);

  const fakeText = '<web_search>{"query":"notícias atuais","reason":"buscar notícias","maxResults":"5"}</web_search>';
  const syntheticCalls = assistant.normalizeAssistantToolCalls([], fakeText, { searchMode: 'native', webSearch: true });
  assert.equal(syntheticCalls.length, 1);
  assert.equal(syntheticCalls[0].function.name, 'web_search');
  assert.deepEqual(JSON.parse(syntheticCalls[0].function.arguments), {
    query: 'notícias atuais',
    reason: 'buscar notícias',
    maxResults: 5,
  });
  assert.match(assistant.sanitizeAssistantToolLikeText(fakeText), /processou isso como tool/);
  assert.equal(
    assistant.sanitizeAssistantToolLikeText('Tool used: web_search Input: {"query":"x"}\nExit code: unknown\n\nResposta limpa.'),
    'Resposta limpa.',
  );

  const malformedCalls = assistant.normalizeAssistantToolCalls(
    [
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'web_search {"query":"Sarandi RS clima","reason":"clima","maxResults":"2"}',
          arguments: '{}',
        },
      },
    ],
    '',
    { searchMode: 'native', webSearch: true },
  );
  assert.equal(malformedCalls[0].function.name, 'web_search');
  assert.equal(JSON.parse(malformedCalls[0].function.arguments).maxResults, 2);

  const disabledCalls = assistant.normalizeAssistantToolCalls([], fakeText, { searchMode: 'off', webSearch: false });
  assert.equal(disabledCalls.length, 0);
});

test('network status endpoint exposes bind and LAN diagnostics without password', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-network-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });
  try {
    const response = await fetch(`${url}/api/network/status`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.networkStatus.bindHost, '127.0.0.1');
    assert.equal(data.networkStatus.authRequired, false);
    assert.ok(data.networkStatus.localUrl.startsWith('http://127.0.0.1:'));
    assert.equal(JSON.stringify(data).includes('authPassword'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('bootstrap does not create a ghost chat when no chat exists', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-bootstrap-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const store = await import(`../src/server/store.js?test=${Date.now()}`);
  await store.ensureRuntime();
  await store.saveConfig({ setupComplete: true });
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });
  try {
    const response = await fetch(`${url}/api/bootstrap`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.chats, []);
    assert.equal(data.activeChat, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('groq native search retries compound-mini on request-too-large', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body, headers: options.headers || {} });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 413,
        json: async () => ({ error: 'Request Entity Too Large' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Resumo com fontes',
              executed_tools: [
                {
                  search_results: [{ title: 'Exemplo', url: 'https://example.com', snippet: 'fonte' }],
                },
              ],
            },
          },
        ],
        usage: {},
      }),
    };
  };

  try {
    const providerClient = await import(`../src/server/provider-client.js?test=${Date.now()}`);
    const result = await providerClient.callProviderNativeWebSearch({
      config: {
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        providerSettings: {
          groq: {
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKeys: ['test-key'],
          },
        },
      },
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      query: 'Últimas notícias do Rio Grande do Sul',
      maxResults: 5,
    });

    assert.equal(result.method, 'groq/compound-mini-web_search');
    assert.equal(calls[0].body.model, 'groq/compound');
    assert.equal(calls[1].body.model, 'groq/compound-mini');
    assert.equal(calls[0].headers['Groq-Model-Version'], 'latest');
  } finally {
    global.fetch = originalFetch;
  }
});

test('chat rotation tries alternate model before alternate api key', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body, headers: options.headers || {} });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'rate limit on this model' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'ok on fallback model' } }],
      }),
    };
  };

  try {
    const providerClient = await import(`../src/server/provider-client.js?test=${Date.now()}-rotation`);
    const result = await providerClient.callProviderChat({
      config: {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        providerSettings: {
          groq: {
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKeys: [{ value: 'key-one' }, { value: 'key-two' }],
          },
        },
        routing: {
          modelRotationEnabled: true,
          modelFallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
          providerRotationEnabled: false,
        },
      },
      messages: [{ role: 'user', content: 'oi' }],
      tools: [],
    });

    assert.equal(result.modelUsed, 'openai/gpt-oss-120b');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.model, 'llama-3.3-70b-versatile');
    assert.equal(calls[1].body.model, 'openai/gpt-oss-120b');
    assert.equal(calls[0].headers.Authorization, 'Bearer key-one');
    assert.equal(calls[1].headers.Authorization, 'Bearer key-one');
  } finally {
    global.fetch = originalFetch;
  }
});

test('continue reuses the same prompt and creates a second assistant attempt', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-continue-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body });
    const isFirstCall = calls.length === 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: isFirstCall ? 'Saída parcial' : 'Saída final',
            },
            finish_reason: isFirstCall ? 'length' : 'stop',
          },
        ],
        usage: {},
      }),
    };
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-continue-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-continue-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });

    const chat = await store.createChat('Continue test', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const first = await assistant.sendUserMessage(chat.id, 'Faça um rascunho.');
    assert.equal(first.assistantStatus, 'incomplete');
    assert.equal(first.assistantMessage.status, 'incomplete');
    assert.equal(first.assistantMessage.continuationAvailable, true);

    const second = await assistant.sendUserMessage(chat.id, '', {
      continueMessageId: first.assistantMessage.id,
    });
    assert.equal(second.assistantStatus, 'sent');
    assert.equal(second.assistantMessage.status, 'sent');
    assert.equal(second.assistantMessage.continuedFromMessageId, first.assistantMessage.id);
    assert.equal(second.assistantMessage.attemptIndex, 2);

    const reloadedChat = await store.readChat(chat.id);
    const assistantAttempts = reloadedChat.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantAttempts.length, 2);
    assert.equal(assistantAttempts[0].status, 'incomplete');
    assert.equal(assistantAttempts[1].status, 'sent');
    assert.equal(assistantAttempts[0].continuationGroupId, assistantAttempts[1].continuationGroupId);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('config endpoint persists appearance theme changes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-theme-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}-theme-server`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });

  try {
    const response = await fetch(`${url}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        model: 'gpt-5.5',
        appearance: { theme: 'dark' },
        providerSettings: {
          'openai-compatible': {
            baseUrl: 'https://example.test/v1',
            apiKeys: [{ value: 'test-key' }],
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.config.appearance.theme, 'dark');

    const bootstrap = await fetch(`${url}/api/bootstrap`);
    assert.equal(bootstrap.status, 200);
    const bootstrapData = await bootstrap.json();
    assert.equal(bootstrapData.config.appearance.theme, 'dark');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('config endpoint preserves existing fields on partial appearance update', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-config-partial-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const store = await import(`../src/server/store.js?test=${Date.now()}-partial-config-store`);
  await store.ensureRuntime();
  await store.saveConfig({
    setupComplete: true,
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    language: 'pt-BR',
    userNickname: 'Elias',
    systemPromptExtra: 'Preserve this prompt.',
    appearance: { theme: 'dark' },
    tools: {
      terminal: false,
      chatMemory: true,
      persistentMemory: true,
      autoCompact: true,
      chatTitle: true,
      webSearch: false,
      searchMode: 'off',
      searchTerminal: false,
      alwaysAllow: true,
      terminalMode: 'isolated',
      deepInvestigation: true,
    },
    providerSettings: {
      'openai-compatible': {
        baseUrl: 'https://example.test/v1',
        apiKeys: [{ value: 'test-key' }],
      },
    },
  });
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}-partial-config-server`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });

  try {
    const response = await fetch(`${url}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appearance: { theme: 'system' },
        providerSettings: {
          'openai-compatible': {
            baseUrl: 'https://example.test/changed/v1',
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.config.appearance.theme, 'system');
    assert.equal(data.config.language, 'pt-BR');
    assert.equal(data.config.userNickname, 'Elias');
    assert.equal(data.config.systemPromptExtra, 'Preserve this prompt.');
    assert.equal(data.config.tools.terminal, false);
    assert.equal(data.config.tools.alwaysAllow, true);
    assert.equal(data.config.tools.terminalMode, 'isolated');
    assert.equal(data.config.tools.deepInvestigation, true);
    assert.equal(data.config.providerSettings['openai-compatible'].baseUrl, 'https://example.test/changed/v1');
    assert.equal(data.config.providerSettings['openai-compatible'].apiKeys[0].value, 'test-key');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('terminal command failures keep the assistant turn incomplete', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-terminal-failure-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes('/chat/completions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: 'run_terminal_command',
                      arguments: JSON.stringify({ command: 'sh -c "exit 1"', returnOutput: false }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-terminal-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-terminal-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: true,
        terminalMode: 'standard',
        deepInvestigation: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });

    const chat = await store.createChat('Terminal failure', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const result = await assistant.sendUserMessage(chat.id, 'Rode um comando que falhe.');
    assert.equal(result.assistantStatus, 'incomplete');
    assert.equal(result.assistantMessage.status, 'incomplete');
    assert.match(result.assistantMessage.content, /terminal/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('approved terminal command failures keep the pending assistant turn incomplete', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-approved-terminal-failure-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Vou rodar o comando.',
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: 'run_terminal_command',
                      arguments: JSON.stringify({ command: 'sh -c "exit 1"', returnOutput: true }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-approved-terminal-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-approved-terminal-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: false,
        terminalMode: 'standard',
        deepInvestigation: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });

    const chat = await store.createChat('Approved terminal failure', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Rode um comando que falhe.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');

    const completed = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'tool-call-1',
    });
    const updatedMessage = completed.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(updatedMessage.status, 'incomplete');
    assert.equal(updatedMessage.continuationAvailable, true);
    assert.match(updatedMessage.content, /terminal/i);
    assert.equal(updatedMessage.toolUses[0].result.exitCode, 1);
    assert.equal(providerCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('pending tool approval blocks new chat turns until resolved', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-pending-approval-block-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Vou atualizar a memória.',
                tool_calls: [
                  {
                    id: 'memory-tool-1',
                    type: 'function',
                    function: {
                      name: 'memory_chat',
                      arguments: JSON.stringify({ action: 'append', content: '- pendente', reason: 'teste' }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-pending-approval-block-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-pending-approval-block-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: false,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Pending approval block', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Crie uma memória.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');

    await assert.rejects(
      () => assistant.sendUserMessage(chat.id, 'Mensagem antes de aprovar.'),
      (error) => error.statusCode === 409 && /aprovação de tool pendente/i.test(error.message),
    );

    const reloadedChat = await store.readChat(chat.id);
    assert.equal(reloadedChat.messages.length, 2);
    assert.equal(providerCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('stale running tool approvals reset instead of trapping the chat', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-stale-running-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const originalStaleMs = process.env.MC_RUNNING_TOOL_STALE_MS;
  process.env.MC_RUNNING_TOOL_STALE_MS = '1000';
  let providerCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Vou atualizar a memória.',
                tool_calls: [
                  {
                    id: 'memory-tool-1',
                    type: 'function',
                    function: {
                      name: 'memory_chat',
                      arguments: JSON.stringify({
                        action: 'append',
                        content: '- recuperado após running stale',
                        reason: 'teste',
                        returnOutput: false,
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-stale-running-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-stale-running-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: false,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Stale running approval', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Crie uma memória.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');

    const messagesPath = path.join(store.getChatDir(chat.id), 'messages.json');
    const messages = JSON.parse(await fs.readFile(messagesPath, 'utf8'));
    const pendingMessage = messages.find((message) => message.id === pending.assistantMessage.id);
    pendingMessage.status = 'running_tools';
    pendingMessage.updatedAt = new Date(Date.now() - 2000).toISOString();
    pendingMessage.toolUses = pendingMessage.toolUses.map((toolUse) =>
      toolUse.id === 'memory-tool-1'
        ? { ...toolUse, status: 'approved_pending_execution', result: { action: 'approved_pending_execution' } }
        : toolUse,
    );
    await fs.writeFile(messagesPath, `${JSON.stringify(messages, null, 2)}\n`);

    const reset = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'memory-tool-1',
    });
    const resetMessage = reset.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(resetMessage.status, 'needs_tool_approval');
    assert.equal(resetMessage.toolUses[0].status, 'pending_approval');

    const completed = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'memory-tool-1',
    });
    const completedMessage = completed.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(completedMessage.status, 'sent');
    assert.equal(completedMessage.pendingToolApproval, null);
    assert.match(await store.readMemory(chat.id), /recuperado após running stale/);
    assert.equal(providerCalls, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalStaleMs === undefined) {
      delete process.env.MC_RUNNING_TOOL_STALE_MS;
    } else {
      process.env.MC_RUNNING_TOOL_STALE_MS = originalStaleMs;
    }
  }
});

test('parallel tool approvals execute a pending tool only once', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-idempotent-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const sideEffectPath = path.join(tempDir, 'side-effect.txt');
  const sideEffectScript = `require('node:fs').appendFileSync(${JSON.stringify(sideEffectPath)}, 'x')`;
  let providerCalls = 0;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Vou executar uma ação local.',
                tool_calls: [
                  {
                    id: 'tool-call-1',
                    type: 'function',
                    function: {
                      name: 'run_terminal_command',
                      arguments: JSON.stringify({
                        command: `${process.execPath} -e ${JSON.stringify(sideEffectScript)}`,
                        returnOutput: false,
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-idempotent-approval-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-idempotent-approval-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Idempotent approval', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Execute uma ação com side effect.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');

    await Promise.all([
      assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', { toolCallId: 'tool-call-1' }),
      assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', { toolCallId: 'tool-call-1' }),
    ]);

    assert.equal(await fs.readFile(sideEffectPath, 'utf8'), 'x');
    const updatedChat = await store.readChat(chat.id);
    const updatedMessage = updatedChat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(updatedMessage.status, 'sent');
    assert.equal(updatedMessage.toolUses.filter((toolUse) => toolUse.id === 'tool-call-1').length, 1);
    assert.equal(providerCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('invalid memory tool actions fail without overwriting memory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-invalid-memory-action-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      const toolName = providerCalls === 1 ? 'memory_chat' : 'persistent_memory';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'memory-bad-action',
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments: JSON.stringify({ action: 'delete', content: '- novo conteúdo', reason: 'ação inválida' }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-invalid-memory-action-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-invalid-memory-action-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: false,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: true,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Invalid memory action', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });
    await store.writeMemory(chat.id, '# Chat memory\n\n- original\n');
    await store.writePersistentMemory('# Persistent memory\n\n- original global\n');

    const result = await assistant.sendUserMessage(chat.id, 'Tente uma ação inválida de memória.');
    assert.equal(result.assistantMessage.status, 'incomplete');
    assert.match(result.assistantMessage.toolUses[0].result.error, /action must be one of/i);
    assert.match(await store.readMemory(chat.id), /original/);
    assert.doesNotMatch(await store.readMemory(chat.id), /novo conteúdo/);

    const persistentResult = await assistant.sendUserMessage(chat.id, 'Tente uma ação inválida de memória persistente.');
    assert.equal(persistentResult.assistantMessage.status, 'incomplete');
    assert.match(persistentResult.assistantMessage.toolUses[0].result.error, /action must be one of/i);
    assert.match(await store.readPersistentMemory(), /original global/);
    assert.doesNotMatch(await store.readPersistentMemory(), /novo conteúdo/);
    assert.equal(providerCalls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('provider chat requests time out instead of holding a chat lock forever', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-provider-timeout-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const originalTimeout = process.env.MC_PROVIDER_TIMEOUT_MS;
  process.env.MC_PROVIDER_TIMEOUT_MS = '50';
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) {
      throw new Error(`Unexpected fetch in test: ${url}`);
    }
    return new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  };

  try {
    const providerClient = await import(`../src/server/provider-client.js?test=${Date.now()}-provider-timeout`);
    await assert.rejects(
      () =>
        providerClient.callProviderChat({
          config: {
            provider: 'openai-compatible',
            model: 'gpt-5.5',
            providerSettings: {
              'openai-compatible': {
                baseUrl: 'https://example.test/v1',
                apiKeys: [{ value: 'test-key' }],
              },
            },
          },
          messages: [{ role: 'user', content: 'oi' }],
          tools: [],
        }),
      (error) => error.statusCode === 408 && /não respondeu/i.test(error.message),
    );
  } finally {
    global.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.MC_PROVIDER_TIMEOUT_MS;
    } else {
      process.env.MC_PROVIDER_TIMEOUT_MS = originalTimeout;
    }
  }
});

test('parallel continue requests only create one follow-up attempt', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-continue-lock-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const sideEffectPath = path.join(tempDir, 'continue-side-effect.txt');
  const sideEffectScript = `require('node:fs').appendFileSync(${JSON.stringify(sideEffectPath)}, 'x')`;
  let providerCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      const callNumber = providerCalls;
      await new Promise((resolve) => setTimeout(resolve, callNumber === 1 ? 5 : 50));
      if (callNumber === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'Saída parcial' }, finish_reason: 'length' }],
            usage: {},
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Vou executar uma continuação.',
                tool_calls: [
                  {
                    id: `continue-tool-${callNumber}`,
                    type: 'function',
                    function: {
                      name: 'run_terminal_command',
                      arguments: JSON.stringify({
                        command: `${process.execPath} -e ${JSON.stringify(sideEffectScript)}`,
                        returnOutput: false,
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-continue-lock-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-continue-lock-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: true,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Continue lock', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const first = await assistant.sendUserMessage(chat.id, 'Gere uma resposta parcial.');
    assert.equal(first.assistantMessage.status, 'incomplete');

    const results = await Promise.allSettled([
      assistant.sendUserMessage(chat.id, '', { continueMessageId: first.assistantMessage.id }),
      assistant.sendUserMessage(chat.id, '', { continueMessageId: first.assistantMessage.id }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.statusCode, 409);
    assert.equal(await fs.readFile(sideEffectPath, 'utf8'), 'x');

    const updatedChat = await store.readChat(chat.id);
    const assistantAttempts = updatedChat.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantAttempts.length, 2);
    assert.equal(assistantAttempts[0].attemptIndex, 1);
    assert.equal(assistantAttempts[1].attemptIndex, 2);
    assert.equal(assistantAttempts[1].continuedFromMessageId, first.assistantMessage.id);

    await assert.rejects(
      () => assistant.sendUserMessage(chat.id, '', { continueMessageId: first.assistantMessage.id }),
      (error) => error.statusCode === 409,
    );
    await assert.rejects(
      () => assistant.sendUserMessage(chat.id, '', { continueMessageId: 'missing-message' }),
      (error) => error.statusCode === 404,
    );
    assert.equal(providerCalls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('approved tool exceptions are persisted as incomplete turns', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-approved-tool-exception-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Vou compactar o contexto.',
                  tool_calls: [
                    {
                      id: 'compact-tool-1',
                      type: 'function',
                      function: {
                        name: 'compact_context',
                        arguments: JSON.stringify({ reason: 'Teste de falha', returnOutput: true }),
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: {},
          }),
        };
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'provider failed while compacting' } }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-tool-exception-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-tool-exception-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatMemory: true,
        persistentMemory: true,
        autoCompact: true,
        chatTitle: true,
        webSearch: false,
        searchMode: 'off',
        searchTerminal: false,
        alwaysAllow: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Approved tool exception', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Compacte o contexto.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');

    const completed = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'compact-tool-1',
    });
    const updatedMessage = completed.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(updatedMessage.status, 'incomplete');
    assert.equal(updatedMessage.pendingToolApproval, null);
    assert.equal(updatedMessage.continuationAvailable, true);
    assert.match(updatedMessage.toolUses[0].result.error, /provider failed/);
    assert.equal(providerCalls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('concurrent sends reject duplicate in-flight turns', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-concurrent-send-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      providerCalls += 1;
      const callNumber = providerCalls;
      await new Promise((resolve) => setTimeout(resolve, callNumber === 1 ? 50 : 10));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { role: 'assistant', content: `ok ${callNumber}` },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-concurrent-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-concurrent-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });

    const chat = await store.createChat('Concurrent send', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const results = await Promise.allSettled([
      assistant.sendUserMessage(chat.id, 'primeira'),
      assistant.sendUserMessage(chat.id, 'segunda'),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.statusCode, 409);

    const reloadedChat = await store.readChat(chat.id);
    assert.equal(reloadedChat.messages.length, 2);
    assert.equal(reloadedChat.messages.filter((message) => message.role === 'user').length, 1);
    assert.equal(reloadedChat.messages.filter((message) => message.role === 'assistant').length, 1);
    assert.equal(providerCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
