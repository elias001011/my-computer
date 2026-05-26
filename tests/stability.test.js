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
