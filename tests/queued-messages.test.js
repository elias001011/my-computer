import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function toolCallResponse(round) {
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
              { id: `r${round}`, type: 'function', function: { name: 'read_skill', arguments: JSON.stringify({ action: 'list', reason: 'test' }) } },
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
    providerSettings: {
      'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
    },
  });
}

test('a message queued mid-run reaches the model on the next call without interrupting it', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-queue-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const token = `${Date.now()}-queue-next-tool`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  const sentPayloads = [];
  let round = 0;
  let queueResult = null;
  global.fetch = async (url, options) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    sentPayloads.push(JSON.parse(options.body));
    round += 1;
    if (round === 1) {
      // The user types while the first round is still in flight.
      queueResult = await assistant.queueChatComplement(chatId, { id: 'q-1', content: 'na verdade, foca no arquivo B' });
      return toolCallResponse(round);
    }
    return finalResponse();
  };

  let chatId = null;
  try {
    await baseConfig(store);
    const chat = await store.createChat('Fila', { provider: 'openai-compatible', model: 'gpt-5.5' });
    chatId = chat.id;

    const result = await assistant.sendUserMessage(chat.id, 'Analise o arquivo A.');

    assert.deepEqual(queueResult, { queued: true, id: 'q-1', pending: 1 });
    assert.equal(result.assistantMessage.status, 'sent', 'the queued message must not interrupt the run');
    assert.deepEqual(result.queuedComplementIds, ['q-1'], 'the run reports which queued ids it consumed');

    const secondCallMessages = sentPayloads[1].messages;
    const complement = secondCallMessages.filter(
      (message) => message.role === 'user' && String(message.content || '').includes('Complementos do usuário'),
    );
    assert.equal(complement.length, 1, 'the complement is handed over exactly once');
    assert.match(complement[0].content, /foca no arquivo B/);

    const traceEntry = (result.assistantMessage.executionTrace || []).find((entry) => entry.type === 'user_complement');
    assert.ok(traceEntry, 'the complement is recorded in the attempt trace (View details)');
    assert.deepEqual(traceEntry.contents, ['na verdade, foca no arquivo B']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('queueing with no run in flight reports queued:false instead of throwing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-queue-idle-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const token = `${Date.now()}-queue-idle`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  await baseConfig(store);
  const chat = await store.createChat('Sem run', { provider: 'openai-compatible', model: 'gpt-5.5' });

  const result = await assistant.queueChatComplement(chat.id, { content: 'oi' });
  assert.equal(result.queued, false);

  await assert.rejects(() => assistant.queueChatComplement(chat.id, { content: '   ' }), /Complemento vazio/);
});

test('a finished attempt records how long the model actually worked', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-duration-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const token = `${Date.now()}-duration`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);

  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    return finalResponse();
  };

  try {
    await baseConfig(store);
    const chat = await store.createChat('Cronometro', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const result = await assistant.sendUserMessage(chat.id, 'Oi.');
    assert.equal(typeof result.assistantMessage.durationMs, 'number');
    assert.ok(result.assistantMessage.durationMs >= 30, 'duration covers the provider call');
  } finally {
    global.fetch = originalFetch;
  }
});

test('the openai-compatible provider no longer offers a placeholder model that is not real', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-custom-models-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const token = `${Date.now()}-custom-models`;
  const models = await import(`../src/server/models.js?test=${token}-models`);

  const provider = models.getProvider('openai-compatible');
  assert.equal(provider.models.length, 0, 'no static catalog: the old "modelo-personalizado" entry looked like a configured model');
  assert.equal(provider.defaultModel, '');

  // Models the user registers by hand are what actually populates the selector.
  const withCustom = models.getProviderModels('openai-compatible', { customModels: ['glm-4.6'] });
  assert.deepEqual(withCustom.map((item) => item.id), ['glm-4.6']);
});
