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

function toolCallMessage(id, name, args) {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  };
}

async function baseConfig(store, extraTools = {}) {
  await store.ensureRuntime();
  await store.saveConfig({
    setupComplete: true,
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    tools: { terminal: false, searchMode: 'off', webSearch: false, ...extraTools },
    providerSettings: {
      'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
    },
  });
}

test('edit_file create then replace mutates a real file on disk; read returns it', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-edit-file-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const targetPath = path.join(tempDir, 'note.txt');
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    if (round === 1) return mockChatCompletion(toolCallMessage('e1', 'edit_file', { action: 'create', path: targetPath, content: 'hello world\n', reason: 'create' }), 'tool_calls');
    if (round === 2) return mockChatCompletion(toolCallMessage('e2', 'edit_file', { action: 'replace', path: targetPath, oldText: 'world', newText: 'there', reason: 'edit' }), 'tool_calls');
    return mockChatCompletion({ role: 'assistant', content: 'done' });
  };

  try {
    const token = `${Date.now()}-edit-file`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { fileEditing: true, alwaysAllow: true });
    const chat = await store.createChat('Edit file', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Crie e edite o arquivo.');
    assert.equal(result.assistantMessage.status, 'sent');
    const toolUses = result.assistantMessage.toolUses.filter((use) => use.name === 'edit_file');
    assert.equal(toolUses.length, 2);
    assert.equal(toolUses[0].result.created, true);
    assert.equal(toolUses[1].result.error, undefined);
    assert.equal(await fs.readFile(targetPath, 'utf8'), 'hello there\n');
  } finally {
    global.fetch = originalFetch;
  }
});

test('edit_file read returns file content without approval; ambiguous replace and missing-file write fail cleanly', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-edit-file-guard-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const readable = path.join(tempDir, 'dup.txt');
  await fs.writeFile(readable, 'x\nx\n');
  const missing = path.join(tempDir, 'nope.txt');
  const originalFetch = global.fetch;
  // A tool that returns an error halts the run (by design), so each erroring call needs
  // its own turn. read succeeds and continues to the ambiguous replace, which stops it.
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    if (round === 1) return mockChatCompletion(toolCallMessage('r1', 'edit_file', { action: 'read', path: readable, reason: 'read' }), 'tool_calls');
    if (round === 2) return mockChatCompletion(toolCallMessage('r2', 'edit_file', { action: 'replace', path: readable, oldText: 'x', newText: 'y', reason: 'replace' }), 'tool_calls');
    return mockChatCompletion(toolCallMessage('r3', 'edit_file', { action: 'write', path: missing, content: 'nope', reason: 'write' }), 'tool_calls');
  };

  try {
    const token = `${Date.now()}-edit-file-guard`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    // alwaysAllow so the mutating calls run and we can observe their guard errors.
    await baseConfig(store, { fileEditing: true, alwaysAllow: true });
    const chat = await store.createChat('Edit file guard', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const first = await assistant.sendUserMessage(chat.id, 'Leia e tente editar.');
    const firstUses = first.assistantMessage.toolUses.filter((use) => use.name === 'edit_file');
    assert.equal(firstUses[0].result.content, 'x\nx\n');
    assert.match(firstUses[1].result.error, /more than once/);
    // The ambiguous replace must not have changed the file.
    assert.equal(await fs.readFile(readable, 'utf8'), 'x\nx\n');

    const second = await assistant.sendUserMessage(chat.id, 'Agora escreva no arquivo que não existe.');
    const writeUse = second.assistantMessage.toolUses.find((use) => use.name === 'edit_file');
    assert.match(writeUse.result.error, /does not exist/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('edit_file mutations require human approval when alwaysAllow is off', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-edit-file-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const targetPath = path.join(tempDir, 'new.txt');
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    return mockChatCompletion(toolCallMessage('c1', 'edit_file', { action: 'create', path: targetPath, content: 'x', reason: 'create' }), 'tool_calls');
  };

  try {
    const token = `${Date.now()}-edit-file-approval`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { fileEditing: true, alwaysAllow: false });
    const chat = await store.createChat('Edit file approval', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Crie o arquivo.');
    assert.equal(result.awaitingApproval, true);
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'edit_file');
    assert.equal(toolUse.status, 'pending_approval');
    await assert.rejects(() => fs.access(targetPath));
  } finally {
    global.fetch = originalFetch;
  }
});

test('browser tool surfaces a clean error when no Chromium binary is found', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-browser-nobin-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    return mockChatCompletion(toolCallMessage('b1', 'browser', { action: 'screenshot', url: 'https://example.com', reason: 'shot' }), 'tool_calls');
  };

  try {
    const token = `${Date.now()}-browser-nobin`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    // Point the binary path at something that cannot resolve, so detection fails
    // deterministically regardless of what is installed on the test machine.
    await baseConfig(store, { browser: true, browserBinaryPath: '/definitely/not/a/real/chromium-xyz', alwaysAllow: true });
    const chat = await store.createChat('Browser no bin', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Tire um print.');
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'browser');
    assert.ok(toolUse, 'browser tool use should be present');
    assert.match(toolUse.result.error, /No Chromium\/Chrome binary found/);
    // No screenshot attachment should have been created.
    assert.equal((await store.readChat(chat.id)).attachments.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
