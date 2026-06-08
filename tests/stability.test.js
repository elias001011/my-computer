import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  const functionText = 'Agora vou olhar isso.\n<function=run_terminal_command> {"command":"pwd","returnOutput":true} </function>';
  const functionCalls = assistant.normalizeAssistantToolCalls([], functionText, { terminal: true, searchMode: 'off' });
  assert.equal(functionCalls.length, 1);
  assert.equal(functionCalls[0].function.name, 'run_terminal_command');
  assert.deepEqual(JSON.parse(functionCalls[0].function.arguments), { command: 'pwd', returnOutput: true });
  assert.doesNotMatch(assistant.sanitizeAssistantToolLikeText(functionText), /function=run_terminal_command/);
  const inlineExample =
    'Example: `run_terminal_command({"command":"touch /tmp/poc","returnOutput":false})` should not execute.';
  assert.equal(assistant.normalizeAssistantToolCalls([], inlineExample, { terminal: true, searchMode: 'off' }).length, 0);
  const exactInline = 'run_terminal_command({"command":"pwd","returnOutput":true})';
  const exactInlineCalls = assistant.normalizeAssistantToolCalls([], exactInline, { terminal: true, searchMode: 'off' });
  assert.equal(exactInlineCalls.length, 1);
  assert.equal(exactInlineCalls[0].function.name, 'run_terminal_command');
  const userMemoryText =
    '<function=persistent_memory_user> {"action":"read","fileId":"abc","reason":"usar memória do usuário","returnOutput":true} </function>';
  const userMemoryCalls = assistant.normalizeAssistantToolCalls([], userMemoryText, { userMemory: true });
  assert.equal(userMemoryCalls.length, 1);
  assert.equal(userMemoryCalls[0].function.name, 'persistent_memory_user');
  assert.deepEqual(JSON.parse(userMemoryCalls[0].function.arguments), {
    action: 'read',
    fileId: 'abc',
    reason: 'usar memória do usuário',
    returnOutput: true,
  });
  const chatDocumentText =
    '<function=chat_document> {"action":"read","attachmentId":"doc-1","reason":"ler documento anexado","returnOutput":true} </function>';
  const chatDocumentCalls = assistant.normalizeAssistantToolCalls([], chatDocumentText, { chatDocuments: true });
  assert.equal(chatDocumentCalls.length, 1);
  assert.equal(chatDocumentCalls[0].function.name, 'chat_document');
  assert.deepEqual(JSON.parse(chatDocumentCalls[0].function.arguments), {
    action: 'read',
    attachmentId: 'doc-1',
    reason: 'ler documento anexado',
    returnOutput: true,
  });
  assert.equal(assistant.sanitizeAssistantToolLikeText('<think>não mostrar</think>Resposta limpa.'), 'Resposta limpa.');

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

  const duplicateIdCalls = assistant.normalizeAssistantToolCalls(
    [
      {
        id: 'duplicate-id',
        type: 'function',
        function: {
          name: 'run_terminal_command',
          arguments: JSON.stringify({ command: 'echo one', returnOutput: true }),
        },
      },
      {
        id: 'duplicate-id',
        type: 'function',
        function: {
          name: 'run_terminal_command',
          arguments: JSON.stringify({ command: 'echo two', returnOutput: true }),
        },
      },
    ],
    '',
    { terminal: true, searchMode: 'off' },
  );
  assert.deepEqual(
    duplicateIdCalls.map((toolCall) => toolCall.id),
    ['duplicate-id', 'duplicate-id_2'],
  );

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

test('offline partial chat metadata update preserves chat model', async () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import fs from 'node:fs/promises';
    import os from 'node:os';
    import path from 'node:path';

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-offline-chat-metadata-'));
    process.env.MY_COMPUTER_HOME = tempDir;
    const store = await import('./src/server/store.js');
    const serverModule = await import('./src/server/server.js');
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'ollama',
      model: 'section-model',
      privacy: { offlineMode: true },
    });
    const chat = await store.createChat('Offline chat', {
      provider: 'ollama',
      model: 'chat-specific-model',
    });
    const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });
    try {
      const response = await fetch(url + '/api/chats/' + chat.id, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-My-Computer-Request': 'panel',
        },
        body: JSON.stringify({ folder: 'Folder only' }),
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.chat.folder, 'Folder only');
      assert.equal(data.chat.provider, 'ollama');
      assert.equal(data.chat.model, 'chat-specific-model');
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('groq native search starts with compound-mini and parses nested search results', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body, headers: options.headers || {} });
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
                  search_results: {
                    results: [{ title: 'Exemplo', url: 'https://example.com', content: 'fonte' }],
                  },
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
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].url, 'https://example.com');
    assert.equal(result.results[0].snippet, 'fonte');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, 'groq/compound-mini');
    assert.equal(calls[0].headers['Groq-Model-Version'], 'latest');
  } finally {
    global.fetch = originalFetch;
  }
});

test('xai native search keeps response citations as sources', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body, headers: options.headers || {} });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Resumo com citacoes.' }],
          },
        ],
        citations: ['https://x.ai/news', 'https://docs.x.ai/developers/tools/web-search'],
        usage: {},
      }),
    };
  };

  try {
    const providerClient = await import(`../src/server/provider-client.js?test=${Date.now()}-xai-citations`);
    const result = await providerClient.callProviderNativeWebSearch({
      config: {
        provider: 'xai',
        model: 'grok-4.3',
        providerSettings: {
          xai: {
            baseUrl: 'https://api.x.ai/v1',
            apiKeys: ['test-key'],
          },
        },
      },
      provider: 'xai',
      model: 'grok-4.3',
      query: 'What is xAI?',
      maxResults: 5,
    });

    assert.equal(result.method, 'xai-responses-web_search');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].url, 'https://x.ai/news');
    assert.equal(calls[0].body.tools[0].type, 'web_search');
  } finally {
    global.fetch = originalFetch;
  }
});

test('web search both mode asks approval before possible terminal fallback', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-web-search-both-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url: String(url), body });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Vou buscar uma fonte pública.',
              tool_calls: [
                {
                  id: 'search-call-1',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: JSON.stringify({
                      query: 'banda Trueblood',
                      reason: 'Pesquisar informação pública.',
                      maxResults: 5,
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
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-both-search-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-both-search-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
      tools: {
        webSearch: true,
        searchMode: 'both',
        searchTerminal: true,
        alwaysAllow: false,
      },
      providerSettings: {
        gemini: {
          apiKeys: [{ value: 'test-key' }],
        },
      },
      setupComplete: true,
    });
    const chat = await store.createChat('Both search approval', {
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
    });

    const result = await assistant.sendUserMessage(chat.id, 'pesquise a banda Trueblood');
    assert.equal(result.awaitingApproval, true);
    assert.equal(result.assistantMessage.status, 'needs_tool_approval');
    assert.equal(result.assistantMessage.toolUses[0].name, 'web_search');
    assert.equal(result.assistantMessage.toolUses[0].status, 'pending_approval');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /chat\/completions/);
    assert.doesNotMatch(calls.map((call) => call.url).join('\n'), /generateContent|duckduckgo/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('offline mode blocks online providers and native search', async () => {
  const providerClient = await import(`../src/server/provider-client.js?test=${Date.now()}-offline`);
  const config = {
    provider: 'ollama',
    model: 'llama3.2',
    privacy: { offlineMode: true },
    providerSettings: {
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeys: [{ value: 'test-key' }],
      },
      ollama: {
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKeys: [],
      },
    },
  };

  await assert.rejects(
    () =>
      providerClient.callProviderChat({
        config,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'oi' }],
        tools: [],
      }),
    /Modo offline ativo/,
  );
  await assert.rejects(
    () =>
      providerClient.callProviderNativeWebSearch({
        config,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        query: 'noticias',
      }),
    /Modo offline ativo/,
  );
  await assert.rejects(
    () =>
      providerClient.callProviderChat({
        config: {
          ...config,
          providerSettings: {
            ...config.providerSettings,
            ollama: { baseUrl: 'https://ollama.example.test/v1', apiKeys: [] },
          },
        },
        provider: 'ollama',
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'oi' }],
        tools: [],
      }),
    /endpoint do Ollama precisa ser local/,
  );
});

test('offline bootstrap skips online model discovery', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-offline-bootstrap-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('127.0.0.1:11434')) {
      return {
        ok: true,
        json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
      };
    }
    throw new Error(`unexpected online discovery: ${url}`);
  };
  try {
    const token = `${Date.now()}-offline-bootstrap`;
    const store = await import(`../src/server/store.js?test=${token}`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'ollama',
      model: 'llama3.2',
      privacy: { offlineMode: true },
      providerSettings: {
        openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKeys: [{ value: 'openrouter-key' }] },
        'openai-compatible': { baseUrl: 'https://models.example.test/v1', apiKeys: [{ value: 'compatible-key' }] },
      },
    });
    const serverModule = await import(`../src/server/server.js?test=${token}`);
    const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });
    try {
      const response = await originalFetch(`${url}/api/bootstrap`);
      assert.equal(response.status, 200);
      assert.ok(calls.every((call) => call.includes('127.0.0.1')));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('offline terminal search still requires approval when tools are always allowed', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-offline-search-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('/api/tags')) {
      return {
        ok: true,
        json: async () => ({ models: [{ name: 'llama3.2' }] }),
      };
    }
    if (String(url).includes('/chat/completions')) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'search-1',
                    type: 'function',
                    function: {
                      name: 'web_search',
                      arguments: JSON.stringify({ query: 'weather', reason: 'public info', maxResults: 2 }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected request: ${url}`);
  };

  try {
    const token = `${Date.now()}-offline-search-approval`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'ollama',
      model: 'llama3.2',
      privacy: { offlineMode: true },
      tools: { searchMode: 'terminal', webSearch: true, searchTerminal: true, alwaysAllow: true },
      providerSettings: { ollama: { baseUrl: 'http://127.0.0.1:11434/v1', apiKeys: [] } },
    });
    const chat = await store.createChat('Offline search approval', { provider: 'ollama', model: 'llama3.2' });
    const result = await assistant.sendUserMessage(chat.id, 'search this');
    assert.equal(result.awaitingApproval, true);
    assert.equal(result.assistantMessage.toolUses[0].name, 'web_search');
    assert.equal(result.assistantMessage.toolUses[0].status, 'pending_approval');
    assert.equal(calls.some((call) => /duckduckgo/i.test(call)), false);
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
      headers: { 'Content-Type': 'application/json', 'X-My-Computer-Request': 'panel' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        model: 'gpt-5.5',
        appearance: { theme: 'dark', uiLanguage: 'pt-BR' },
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
    assert.equal(data.config.appearance.uiLanguage, 'pt-BR');

    const bootstrap = await fetch(`${url}/api/bootstrap`);
    assert.equal(bootstrap.status, 200);
    const bootstrapData = await bootstrap.json();
    assert.equal(bootstrapData.config.appearance.theme, 'dark');
    assert.equal(bootstrapData.config.appearance.uiLanguage, 'pt-BR');
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
    appearance: { theme: 'dark', uiLanguage: 'pt-BR' },
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
      headers: { 'Content-Type': 'application/json', 'X-My-Computer-Request': 'panel' },
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
    assert.equal(data.config.appearance.uiLanguage, 'pt-BR');
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

test('mutating api requests require panel csrf header', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-csrf-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}-csrf-server`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });

  try {
    const response = await fetch(`${url}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appearance: { theme: 'dark' } }),
    });
    assert.equal(response.status, 403);
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

test('approved tool output returns to the model with tools still enabled', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-approved-tool-loop-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  const commandOne = `${process.execPath} -e ${JSON.stringify("console.log('one')")}`;
  const commandTwo = `${process.execPath} -e ${JSON.stringify("console.log('two')")}`;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Vou checar a primeira coisa.',
                  tool_calls: [
                    {
                      id: 'tool-call-1',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command: commandOne, returnOutput: true }),
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
      if (calls.length === 2) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Agora a segunda coisa.',
                  tool_calls: [
                    {
                      id: 'tool-call-2',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command: commandTwo, returnOutput: true }),
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
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Final com one e two.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-approved-tool-loop-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-approved-tool-loop-assistant`);
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
    const chat = await store.createChat('Approved tool loop', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Investigue em duas etapas.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');

    const afterFirstApproval = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'tool-call-1',
    });
    const awaitingSecond = afterFirstApproval.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(awaitingSecond.status, 'needs_tool_approval');
    assert.equal(awaitingSecond.toolUses.find((toolUse) => toolUse.id === 'tool-call-1').result.exitCode, 0);
    assert.equal(awaitingSecond.toolUses.find((toolUse) => toolUse.id === 'tool-call-2').status, 'pending_approval');
    assert.ok(calls[1].tools?.length > 0);

    const afterSecondApproval = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'tool-call-2',
    });
    const completed = afterSecondApproval.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(completed.status, 'sent');
    assert.match(completed.content, /one e two/);
    assert.equal(calls.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test('duplicate provider tool call ids are disambiguated before approval', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-duplicate-tool-ids-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  const onePath = path.join(tempDir, 'one.txt');
  const twoPath = path.join(tempDir, 'two.txt');
  const commandOne = `${process.execPath} -e ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(onePath)}, 'one')`)}`;
  const commandTwo = `${process.execPath} -e ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(twoPath)}, 'two')`)}`;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Vou rodar dois comandos.',
                  tool_calls: [
                    {
                      id: 'duplicate-id',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command: commandOne, returnOutput: true }),
                      },
                    },
                    {
                      id: 'duplicate-id',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command: commandTwo, returnOutput: true }),
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
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Comandos concluídos.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-duplicate-tool-ids-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-duplicate-tool-ids-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        searchMode: 'off',
        alwaysAllow: false,
        terminalMode: 'standard',
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Duplicate tool ids', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Rode dois comandos.');
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');
    assert.deepEqual(
      pending.assistantMessage.toolUses.map((toolUse) => toolUse.id),
      ['duplicate-id', 'duplicate-id_2'],
    );

    const afterFirstApproval = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'duplicate-id',
    });
    const awaitingSecond = afterFirstApproval.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(awaitingSecond.status, 'needs_tool_approval');
    assert.equal(awaitingSecond.toolUses.find((toolUse) => toolUse.id === 'duplicate-id').status, 'approved_pending_execution');
    assert.equal(awaitingSecond.toolUses.find((toolUse) => toolUse.id === 'duplicate-id_2').status, 'pending_approval');
    await assert.rejects(() => fs.access(onePath));
    await assert.rejects(() => fs.access(twoPath));
    assert.equal(calls.length, 1);

    const afterSecondApproval = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'duplicate-id_2',
    });
    const completed = afterSecondApproval.chat.messages.find((message) => message.id === pending.assistantMessage.id);
    assert.equal(completed.status, 'sent');
    assert.match(completed.content, /concluídos/i);
    assert.equal(await fs.readFile(onePath, 'utf8'), 'one');
    assert.equal(await fs.readFile(twoPath, 'utf8'), 'two');
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('chat document read requires approval before returning attachment content to provider', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-chat-document-read-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-chat-doc-read-approval-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-chat-doc-read-approval-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: false,
        chatDocuments: true,
        searchMode: 'off',
        alwaysAllow: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Attachment approval', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });
    const attachment = await store.saveAttachment(chat.id, {
      name: 'secrets.txt',
      mimeType: 'text/plain',
      dataBase64: Buffer.from('secret-token\n').toString('base64'),
    });

    global.fetch = async (url, options = {}) => {
      if (!String(url).includes('/chat/completions')) return originalFetch(url, options);
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Vou ler o anexo.',
                tool_calls: [
                  {
                    id: 'tool-chat-document-read',
                    type: 'function',
                    function: {
                      name: 'chat_document',
                      arguments: JSON.stringify({
                        action: 'read',
                        attachmentId: attachment.id,
                        reason: 'ler anexo',
                        returnOutput: true,
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
    };

    const pending = await assistant.sendUserMessage(chat.id, 'Leia o anexo.', { attachmentIds: [attachment.id] });
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');
    assert.equal(pending.assistantMessage.toolUses[0].name, 'chat_document');
    assert.equal(pending.assistantMessage.toolUses[0].input.action, 'read');
    assert.equal(calls.length, 1);
    assert.doesNotMatch(JSON.stringify(pending.assistantMessage.toolUses[0].result || {}), /secret-token/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('deleted attachment snapshots are redacted from later provider prompts', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-deleted-attachment-provider-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Ok.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-deleted-attachment-provider-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-deleted-attachment-provider-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: false,
        chatDocuments: true,
        searchMode: 'off',
        alwaysAllow: false,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Deleted attachment prompt', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });
    const attachment = await store.saveAttachment(chat.id, {
      name: 'secret.md',
      mimeType: 'text/markdown',
      dataBase64: Buffer.from('# Secret\n\nPRIVATE_TOKEN_123\n').toString('base64'),
    });

    await assistant.sendUserMessage(chat.id, 'Leia o anexo uma vez.', { attachmentIds: [attachment.id] });
    assert.match(JSON.stringify(calls[0]), /PRIVATE_TOKEN_123/);

    await store.writeContextSummary(chat.id, '# Summary\n\nPRIVATE_TOKEN_123\n');
    await store.saveCurrentContextWindow(chat.id, '# Window\n\nPRIVATE_TOKEN_123\n');
    await store.deleteAttachment(chat.id, attachment.id);
    await assistant.sendUserMessage(chat.id, 'Agora responda sem o anexo.');
    assert.equal(calls.length, 2);
    assert.doesNotMatch(JSON.stringify(calls[1]), /PRIVATE_TOKEN_123/);
    assert.match(JSON.stringify(calls[1]), /removed_by_user/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('deleted attachment content is redacted from pending approval provider messages', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-deleted-attachment-pending-provider-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  const command = `${process.execPath} -e ${JSON.stringify("console.log('approved output')")}`;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Vou rodar uma verificação local.',
                  tool_calls: [
                    {
                      id: 'terminal-after-delete',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command, returnOutput: true }),
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
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Sem segredo reenviado.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-deleted-attachment-pending-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-deleted-attachment-pending-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatDocuments: true,
        searchMode: 'off',
        alwaysAllow: false,
        terminalMode: 'standard',
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Deleted pending provider', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });
    const attachment = await store.saveAttachment(chat.id, {
      name: 'pending-secret.md',
      mimeType: 'text/markdown',
      dataBase64: Buffer.from('# Pending Secret\n\nPRIVATE_TOKEN_PENDING\n').toString('base64'),
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Use uma tool depois de ler o anexo.', { attachmentIds: [attachment.id] });
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');
    assert.match(JSON.stringify(calls[0]), /PRIVATE_TOKEN_PENDING/);

    await store.deleteAttachment(chat.id, attachment.id);
    assert.doesNotMatch(JSON.stringify((await store.readChat(chat.id)).messages), /PRIVATE_TOKEN_PENDING/);

    const completed = await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'terminal-after-delete',
    });
    assert.equal(completed.chat.messages.find((message) => message.id === pending.assistantMessage.id).status, 'sent');
    assert.equal(calls.length, 2);
    assert.doesNotMatch(JSON.stringify(calls[1]), /PRIVATE_TOKEN_PENDING/);
    assert.match(JSON.stringify(calls[1]), /conteúdo removido do anexo|removed_by_user/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('deleted image attachment data urls are redacted from pending approval provider messages', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-deleted-image-pending-provider-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  const imageBytes = Buffer.from('fake image bytes with private pixels');
  const imageBase64 = imageBytes.toString('base64');
  const command = `${process.execPath} -e ${JSON.stringify("console.log('image tool ok')")}`;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Vou usar uma tool depois da imagem.',
                  tool_calls: [
                    {
                      id: 'image-terminal-after-delete',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command, returnOutput: true }),
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
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Imagem removida não voltou.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-deleted-image-pending-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-deleted-image-pending-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        searchMode: 'off',
        alwaysAllow: false,
        terminalMode: 'standard',
      },
      providerSettings: {
        openai: {
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Deleted image pending provider', {
      provider: 'openai',
      model: 'gpt-5.5',
    });
    const attachment = await store.saveAttachment(chat.id, {
      name: 'secret-image.png',
      mimeType: 'image/png',
      dataBase64: imageBase64,
    });

    const pending = await assistant.sendUserMessage(chat.id, 'Analise a imagem e use a tool.', { attachmentIds: [attachment.id] });
    assert.equal(pending.assistantMessage.status, 'needs_tool_approval');
    assert.equal(JSON.stringify(calls[0]).includes(imageBase64), true);

    await store.deleteAttachment(chat.id, attachment.id);
    const exportedBeforeApproval = await store.exportRuntimeData();
    assert.equal(JSON.stringify(exportedBeforeApproval).includes(imageBase64), false);

    await assistant.continueToolApproval(chat.id, pending.assistantMessage.id, 'approve', {
      toolCallId: 'image-terminal-after-delete',
    });
    assert.equal(calls.length, 2);
    assert.equal(JSON.stringify(calls[1]).includes(imageBase64), false);
    assert.match(JSON.stringify(calls[1]), /conteúdo removido do anexo|removed_by_user/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('mixed returnOutput tool calls still send protocol results for every tool call', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-mixed-tool-results-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const calls = [];
  const command = `${process.execPath} -e ${JSON.stringify("console.log('needed output')")}`;
  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-mixed-tool-results-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-mixed-tool-results-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: true,
        chatTitle: true,
        searchMode: 'off',
        alwaysAllow: true,
      },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
    });
    const chat = await store.createChat('Mixed tools', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    global.fetch = async (url, options = {}) => {
      if (!String(url).includes('/chat/completions')) return originalFetch(url, options);
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push(body);
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Vou nomear e checar.',
                  tool_calls: [
                    {
                      id: 'rename-tool',
                      type: 'function',
                      function: {
                        name: 'rename_chat',
                        arguments: JSON.stringify({ title: 'Mixed tools check', reason: 'teste', returnOutput: false }),
                      },
                    },
                    {
                      id: 'terminal-tool',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command, returnOutput: true }),
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
      const toolMessages = (body.messages || []).filter((message) => message.role === 'tool');
      assert.deepEqual(
        toolMessages.map((message) => message.tool_call_id).sort(),
        ['rename-tool', 'terminal-tool'],
      );
      assert.match(toolMessages.find((message) => message.tool_call_id === 'rename-tool').content, /outputOmitted/);
      assert.match(toolMessages.find((message) => message.tool_call_id === 'terminal-tool').content, /needed output/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Tudo certo.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    };

    const sent = await assistant.sendUserMessage(chat.id, 'Teste tools mistas.');
    assert.equal(sent.assistantMessage.status, 'sent');
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('terminal nonzero exit with returnOutput true is passed back to the model', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-terminal-nonzero-output-'));
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
                  content: '',
                  tool_calls: [
                    {
                      id: 'tool-call-nonzero',
                      type: 'function',
                      function: {
                        name: 'run_terminal_command',
                        arguments: JSON.stringify({ command: 'sh -c "echo partial; exit 1"', returnOutput: true }),
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
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Vi a saída parcial e vou corrigir o comando.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-terminal-nonzero-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-terminal-nonzero-assistant`);
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
    const chat = await store.createChat('Terminal nonzero output', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const result = await assistant.sendUserMessage(chat.id, 'Rode um comando com saída parcial.');
    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.toolUses[0].result.exitCode, 1);
    assert.match(result.assistantMessage.toolUses[0].result.stdout, /partial/);
    assert.match(result.assistantMessage.content, /saída parcial/);
    assert.equal(providerCalls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('synthetic function tags are executed as tool calls instead of shown as final text', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-synthetic-function-'));
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
                  content:
                    'Agora vou verificar.\n<function=run_terminal_command> {"command":"printf synthetic","returnOutput":true} </function>',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {},
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Resultado synthetic confirmado.' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-synthetic-function-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-synthetic-function-assistant`);
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
    const chat = await store.createChat('Synthetic function', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const result = await assistant.sendUserMessage(chat.id, 'Use pseudo tool.');
    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.toolUses[0].name, 'run_terminal_command');
    assert.equal(result.assistantMessage.toolUses[0].result.stdout, 'synthetic');
    assert.doesNotMatch(result.assistantMessage.content, /function=run_terminal_command/);
    assert.match(result.assistantMessage.content, /synthetic confirmado/);
    assert.equal(providerCalls, 2);
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

test('stale approved tool execution is marked incomplete instead of rerunning side effects', async () => {
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
    assert.equal(resetMessage.status, 'incomplete');
    assert.equal(resetMessage.pendingToolApproval, null);
    assert.equal(resetMessage.continuationAvailable, true);
    assert.doesNotMatch(await store.readMemory(chat.id), /recuperado após running stale/);
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

test('chat run can be stopped and leaves the chat usable', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-stop-run-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let providerCalls = 0;
  let firstRequestStarted;
  const firstRequestStartedPromise = new Promise((resolve) => {
    firstRequestStarted = resolve;
  });
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) {
      throw new Error(`Unexpected fetch in test: ${url}`);
    }
    providerCalls += 1;
    if (providerCalls === 1) {
      firstRequestStarted();
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Depois do stop.' }, finish_reason: 'stop' }],
      }),
    };
  };

  try {
    const store = await import(`../src/server/store.js?test=${Date.now()}-stop-store`);
    const assistant = await import(`../src/server/assistant.js?test=${Date.now()}-stop-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': {
          baseUrl: 'https://example.test/v1',
          apiKeys: [{ value: 'test-key' }],
        },
      },
      setupComplete: true,
    });
    const chat = await store.createChat('Stop run', {
      provider: 'openai-compatible',
      model: 'gpt-5.5',
    });

    const running = assistant.sendUserMessage(chat.id, 'pare esta execução');
    await firstRequestStartedPromise;
    const stop = await assistant.stopChatRun(chat.id);
    assert.equal(stop.stopped, true);
    const stopped = await running;
    assert.equal(stopped.assistantMessage.status, 'incomplete');
    assert.equal(stopped.assistantMessage.finishReason, 'stopped_by_user');
    assert.match(stopped.assistantMessage.content, /interrompida/i);

    const next = await assistant.sendUserMessage(chat.id, 'continua normal');
    assert.equal(next.assistantMessage.status, 'sent');
    assert.equal(next.assistantMessage.content, 'Depois do stop.');
    assert.equal(providerCalls, 2);
  } finally {
    global.fetch = originalFetch;
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
