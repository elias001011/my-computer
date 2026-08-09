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
            tool_calls: [{ id: `r${round}`, type: 'function', function: { name: 'read_skill', arguments: JSON.stringify({ action: 'list', reason: 'test' }) } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {},
    }),
  };
}

async function baseConfig(store, extraTools = {}) {
  await store.ensureRuntime();
  await store.saveConfig({
    setupComplete: true,
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    tools: { terminal: false, searchMode: 'off', webSearch: false, alwaysAllow: true, ...extraTools },
    providerSettings: {
      'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
    },
  });
}

test('a low maxToolRounds stops the run after exactly that many rounds', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-tool-rounds-low-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    return toolCallResponse(round); // never stops calling tools on its own
  };

  try {
    const token = `${Date.now()}-tool-rounds-low`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { maxToolRounds: 2 });
    const chat = await store.createChat('Tool rounds low', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Continue chamando tools.');
    assert.equal(result.assistantMessage.status, 'incomplete');
    assert.match(result.assistantMessage.content, /limite de rodadas de tools/);
    assert.equal(result.assistantMessage.toolUses.length, 2, 'exactly maxToolRounds tool rounds should have run');
    // +1: after exhausting the round budget, the app makes one final forced
    // no-tools call to get a wrap-up message instead of just cutting off.
    assert.equal(round, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a higher configured maxToolRounds lets a task that needed more rounds finish normally', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-tool-rounds-high-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  const TOTAL_TOOL_ROUNDS = 5; // would already exceed the old hardcoded default of 8? no -- exceeds a tight custom limit below
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    if (round <= TOTAL_TOOL_ROUNDS) return toolCallResponse(round);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'concluído' }, finish_reason: 'stop' }], usage: {} }),
    };
  };

  try {
    const token = `${Date.now()}-tool-rounds-high`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    // 3 would be too tight for 5 tool rounds + 1 final answer; 10 is generous enough.
    await baseConfig(store, { maxToolRounds: 10 });
    const chat = await store.createChat('Tool rounds high', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Tarefa longa com várias tools.');
    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.content, 'concluído');
    assert.equal(result.assistantMessage.toolUses.length, TOTAL_TOOL_ROUNDS);
  } finally {
    global.fetch = originalFetch;
  }
});

test('deepInvestigation doubles whatever maxToolRounds is configured', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-tool-rounds-deep-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    return toolCallResponse(round);
  };

  try {
    const token = `${Date.now()}-tool-rounds-deep`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { maxToolRounds: 3, deepInvestigation: true });
    const chat = await store.createChat('Tool rounds deep', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Investigue a fundo.');
    assert.equal(result.assistantMessage.toolUses.length, 6, 'deepInvestigation should double the configured 3 to 6 tool rounds');
    // +1 forced final no-tools call once the (doubled) budget runs out, same as above.
    assert.equal(round, 7);
  } finally {
    global.fetch = originalFetch;
  }
});

test('hitting the round limit but wrapping up cleanly is a complete answer, not an incomplete one', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-tool-rounds-wrapup-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url, options) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    // The forced no-tools call (the one made after the budget runs out) has no tools in the
    // request; that is the call where the model gets to write its final answer.
    const body = JSON.parse(options.body);
    if (!body.tools?.length) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Terminei a análise: o arquivo está correto.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        }),
      };
    }
    return toolCallResponse(round);
  };

  try {
    const token = `${Date.now()}-tool-rounds-wrapup`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { maxToolRounds: 2 });
    const chat = await store.createChat('Wrap up', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Analise o arquivo.');

    // The model said "stop" and produced a real answer -- that is a finished turn. Marking it
    // incomplete made Auto continue pay for a whole extra run of an already-answered task.
    assert.equal(result.assistantMessage.status, 'sent');
    assert.match(result.assistantMessage.content, /Terminei a análise/);
    assert.equal(result.assistantMessage.error, null);
    // The round limit still gets recorded, so the UI can say it happened.
    assert.equal(result.assistantMessage.toolRoundLimitReached, true);
    assert.equal(result.assistantMessage.usage.totalTokens, 120);
  } finally {
    global.fetch = originalFetch;
  }
});

test('the rename push only appears while the chat title is still a placeholder', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-rename-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  const prompts = [];
  global.fetch = async (url, options) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    prompts.push(JSON.parse(options.body).messages.find((message) => message.role === 'system').content);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: {} }),
    };
  };

  try {
    const token = `${Date.now()}-rename`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { chatTitle: true });

    const fresh = await store.createChat('Novo chat', { provider: 'openai-compatible', model: 'gpt-5.5' });
    await assistant.sendUserMessage(fresh.id, 'Primeira mensagem.');
    assert.match(prompts[0], /CHAT TITLE, FIRST ACTION/, 'a placeholder title gets the push');

    // Second turn: the app already titled the chat from the first message, so the model must be
    // told to leave it alone. Left as a soft "if the title is generic" clause inside an
    // imperative, models renamed the chat on every single message.
    await assistant.sendUserMessage(fresh.id, 'Segunda mensagem.');
    assert.doesNotMatch(prompts[1], /CHAT TITLE, FIRST ACTION/, 'a titled chat gets no rename push');
    assert.match(prompts[1], /Do not call rename_chat/);
  } finally {
    global.fetch = originalFetch;
  }
});
