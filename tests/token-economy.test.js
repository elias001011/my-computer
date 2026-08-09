import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function bigToolCallResponse(round) {
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
                id: `r${round}`,
                type: 'function',
                function: { name: 'run_terminal_command', arguments: JSON.stringify({ command: `printf 'x%.0s' $(seq 1 9000)`, reason: 'dump', returnOutput: true }) },
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

function finalResponse(content = 'Pronto.') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: {},
    }),
  };
}

async function baseConfig(store) {
  await store.ensureRuntime();
  await store.saveConfig({
    setupComplete: true,
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    tools: { terminal: false, searchMode: 'off', webSearch: false, alwaysAllow: true },
    providerSettings: { 'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'k' }] } },
  });
}

test('tool output inside one turn is capped, oldest results collapsing first', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-tool-budget-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const token = `${Date.now()}-tool-budget`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  const sentPayloads = [];
  let round = 0;
  global.fetch = async (url, options) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch: ${url}`);
    sentPayloads.push(JSON.parse(options.body));
    round += 1;
    return round <= 6 ? bigToolCallResponse(round) : finalResponse();
  };

  try {
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: true, searchMode: 'off', webSearch: false, alwaysAllow: true, maxToolRounds: 10 },
      context: { toolOutputBudgetChars: 20000 },
      providerSettings: { 'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'k' }] } },
    });
    const chat = await store.createChat('Budget', { provider: 'openai-compatible', model: 'gpt-5.5' });
    await assistant.sendUserMessage(chat.id, 'Rode os comandos.');

    const lastPayload = sentPayloads[sentPayloads.length - 1];
    const toolMessages = lastPayload.messages.filter((message) => message.role === 'tool');
    assert.ok(toolMessages.length >= 5, 'the run really did stack several tool results');

    const total = toolMessages.reduce((sum, message) => sum + message.content.length, 0);
    assert.ok(total <= 20000 * 1.2, `total tool output should stay near the budget, got ${total}`);

    const elided = toolMessages.filter((message) => message.content.includes('output antigo elidido'));
    assert.ok(elided.length > 0, 'older results were collapsed');
    const last = toolMessages[toolMessages.length - 1];
    assert.ok(!last.content.includes('output antigo elidido'), 'the most recent result is kept intact');
  } finally {
    global.fetch = originalFetch;
  }
});

test('the clock in the system prompt is stable across calls so the prefix stays cacheable', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-clock-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const token = `${Date.now()}-clock`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  const systemPrompts = [];
  global.fetch = async (url, options) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch: ${url}`);
    systemPrompts.push(JSON.parse(options.body).messages.find((message) => message.role === 'system').content);
    return finalResponse();
  };

  try {
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: false, searchMode: 'off', webSearch: false, alwaysAllow: true },
      providerSettings: { 'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'k' }] } },
    });
    const chat = await store.createChat('Clock', { provider: 'openai-compatible', model: 'gpt-5.5' });
    await assistant.sendUserMessage(chat.id, 'Oi.');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await assistant.sendUserMessage(chat.id, 'Oi de novo.');

    assert.equal(systemPrompts.length, 2);
    assert.match(systemPrompts[0], /Current date and time/);
    // A second apart, the two system prompts must be byte-identical. They were not before:
    // the clock carried millisecond precision and broke the cached prefix on every request.
    assert.equal(systemPrompts[0], systemPrompts[1]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reading the event log only touches the tail and the log gets trimmed', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-events-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const token = `${Date.now()}-events`;
  const store = await import(`../src/server/store.js?test=${token}-store`);

  await store.ensureRuntime();
  // Enough noise to cross the 8 MB trim threshold on one of the periodic size checks
  // (the check runs every 200 appends, so this has to comfortably overshoot).
  const filler = 'x'.repeat(20000);
  for (let index = 0; index < 620; index += 1) {
    await store.appendEvent({ type: 'test.noise', chatId: 'chat-a', details: { index, filler } });
  }
  await store.appendEvent({ type: 'test.marker', chatId: 'chat-a', details: { marker: true } });

  const eventsPath = path.join(tempDir, 'events.jsonl');
  const { size } = await fs.stat(eventsPath);
  assert.ok(size <= 9 * 1024 * 1024, `log should have been trimmed, got ${size} bytes`);

  const events = await store.readEvents({ chatId: 'chat-a', limit: 5 });
  assert.equal(events[0].type, 'test.marker', 'newest event first');
  assert.ok(events.length <= 5);
});

test('token usage is visible on the running run, not only after it finishes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-live-usage-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const token = `${Date.now()}-live-usage`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  let usageSeenMidRun = null;
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch: ${url}`);
    round += 1;
    if (round === 2) {
      // Second call: the first one's usage must already be published on the active run, which
      // is what lets the panel's poll show the counter moving while the model still works.
      usageSeenMidRun = assistant.getActiveRunInfo(chatId).usage;
    }
    if (round === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_skill', arguments: JSON.stringify({ action: 'list', reason: 'x' }) } }] }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050, prompt_tokens_details: { cached_tokens: 900 } },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Pronto.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1200, completion_tokens: 30, total_tokens: 1230, prompt_tokens_details: { cached_tokens: 1100 } },
      }),
    };
  };

  let chatId = null;
  try {
    await baseConfig(store);
    const chat = await store.createChat('Usage', { provider: 'openai-compatible', model: 'gpt-5.5' });
    chatId = chat.id;
    const result = await assistant.sendUserMessage(chat.id, 'Oi.');

    assert.equal(usageSeenMidRun?.totalTokens, 1050, 'the first call cost was published while the run was still going');
    // The saved attempt carries the whole turn, with cached input broken out separately.
    assert.equal(result.assistantMessage.usage.totalTokens, 2280);
    assert.equal(result.assistantMessage.usage.cachedInputTokens, 2000);
    assert.equal(result.assistantMessage.usage.calls, 2);
    // And it is gone from the run registry once the run ends.
    assert.equal(assistant.getActiveRunInfo(chat.id).active, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('usage totals are right for each provider shape, without double counting cache', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-usage-shapes-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const token = `${Date.now()}-usage-shapes`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  const cases = [
    {
      name: 'OpenAI (cached_tokens is part of prompt_tokens)',
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, prompt_tokens_details: { cached_tokens: 800 } },
      expected: { totalTokens: 1100, cachedInputTokens: 800 },
    },
    {
      name: 'Anthropic (input_tokens excludes cache)',
      usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 700, cache_creation_input_tokens: 50 },
      expected: { totalTokens: 1050, cachedInputTokens: 700 },
    },
    {
      name: 'Gemini native metadata',
      usage: { promptTokenCount: 900, candidatesTokenCount: 60, totalTokenCount: 960 },
      expected: { totalTokens: 960, cachedInputTokens: 0 },
    },
  ];

  try {
    await baseConfig(store);
    for (const testCase of cases) {
      global.fetch = async (url) => {
        if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch: ${url}`);
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: testCase.usage }),
        };
      };
      const chat = await store.createChat(testCase.name, { provider: 'openai-compatible', model: 'gpt-5.5' });
      const result = await assistant.sendUserMessage(chat.id, 'Oi.');
      assert.equal(result.assistantMessage.usage.totalTokens, testCase.expected.totalTokens, testCase.name);
      assert.equal(result.assistantMessage.usage.cachedInputTokens, testCase.expected.cachedInputTokens, testCase.name);
    }
  } finally {
    global.fetch = originalFetch;
  }
});
