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
