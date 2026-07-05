import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function mockChatCompletion(message, finishReason = 'stop') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message, finish_reason: finishReason }], usage: {} }),
  };
}

async function baseConfig(store, extraTools = {}) {
  await store.ensureRuntime();
  await store.saveConfig({
    setupComplete: true,
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    tools: { terminal: false, searchMode: 'off', webSearch: false, alwaysAllow: false, ...extraTools },
    providerSettings: {
      'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
    },
  });
}

test('customCommands CRUD round-trips and rejects duplicate triggers', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-commands-crud-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const token = `${Date.now()}-commands-crud`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  await store.ensureRuntime();

  const created = await store.createCustomCommand({
    name: 'Revisar PR',
    trigger: 'Revisar PR!!',
    prompt: 'Revise o PR aberto focando em segurança.',
    allowedTools: ['run_terminal_command', 'edit_file', 'not_a_real_tool'],
  });
  assert.equal(created.trigger, 'revisar-pr');
  assert.deepEqual(created.allowedTools, ['run_terminal_command', 'edit_file']);

  await assert.rejects(() => store.createCustomCommand({ name: 'outro', trigger: 'revisar-pr', prompt: 'x' }), /Já existe um comando/);

  const found = await store.getCustomCommand('revisar-pr');
  assert.equal(found.id, created.id);

  const updated = await store.updateCustomCommand(created.id, { prompt: 'Novo prompt.' });
  assert.equal(updated.prompt, 'Novo prompt.');

  await store.deleteCustomCommand(created.id);
  assert.equal((await store.listCustomCommands()).length, 0);
});

test('a /trigger message runs inline in the current chat with the command tools pre-approved (no approval pause)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-commands-run-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const targetPath = path.join(tempDir, 'out.txt');
  const originalFetch = global.fetch;
  let round = 0;
  let capturedSystemContent = null;
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    const body = JSON.parse(options.body);
    capturedSystemContent = body.messages.find((m) => m.role === 'system')?.content || '';
    round += 1;
    if (round === 1) {
      return mockChatCompletion(
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ action: 'create', path: targetPath, content: 'ok', reason: 'command' }) } },
          ],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'feito' });
  };

  try {
    const token = `${Date.now()}-commands-run`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    // fileEditing is on globally (the command allowlist only narrows what's already
    // enabled, same invariant as scheduled tasks) but alwaysAllow is off -- the command's
    // own allowlist is what makes this run skip the interactive approval pause.
    await baseConfig(store, { fileEditing: true });
    const command = await store.createCustomCommand({
      name: 'Criar arquivo',
      trigger: 'criar-arquivo',
      prompt: 'Crie o arquivo de saída.',
      systemPrompt: 'Responda sempre em uma frase.',
      allowedTools: ['edit_file'],
    });
    const chat = await store.createChat('Custom command run', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, command.prompt, {
      scheduledTaskContext: { allowedTools: command.allowedTools, skipMemory: command.skipMemoryInPrompt === true, systemPrompt: command.systemPrompt },
    });

    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.content, 'feito');
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'edit_file');
    assert.equal(toolUse.result.created, true);
    assert.equal(await fs.readFile(targetPath, 'utf8'), 'ok');
    assert.match(capturedSystemContent, /Responda sempre em uma frase/);

    // Ran inline: same chat as before, no separate chat was created for it.
    const chats = await store.listChats();
    assert.equal(chats.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a /trigger command still denies a tool call outside its own allowlist (unattended-style masking)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-commands-deny-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    return mockChatCompletion(
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'd1', type: 'function', function: { name: 'run_terminal_command', arguments: JSON.stringify({ command: 'echo hi' }) } }],
      },
      'tool_calls',
    );
  };

  try {
    const token = `${Date.now()}-commands-deny`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { terminal: true, alwaysAllow: true });
    const command = await store.createCustomCommand({
      name: 'Só skills',
      trigger: 'so-skills',
      prompt: 'Faça algo.',
      allowedTools: ['read_skill'],
    });
    const chat = await store.createChat('Custom command deny', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, command.prompt, {
      scheduledTaskContext: { allowedTools: command.allowedTools, skipMemory: false, systemPrompt: '' },
    });
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'run_terminal_command');
    assert.ok(toolUse, 'tool use should be recorded even though denied');
    assert.equal(toolUse.status, 'denied');
  } finally {
    global.fetch = originalFetch;
  }
});
