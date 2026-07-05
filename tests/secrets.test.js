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
    tools: { searchMode: 'off', webSearch: false, alwaysAllow: true, ...extraTools },
    providerSettings: {
      'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
    },
  });
}

test('secrets CRUD sanitizes names, never exposes the value through listSecrets, and rejects duplicates', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-secrets-crud-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const token = `${Date.now()}-secrets-crud`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  await store.ensureRuntime();

  const created = await store.createSecret({ name: 'github token!!', description: 'Token do GitHub', value: 'ghp_abc123' });
  assert.equal(created.name, 'GITHUB_TOKEN');
  assert.equal(created.value, undefined, 'createSecret must not echo the value back to the client shape');

  const listed = await store.listSecrets();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].value, undefined, 'listSecrets must never include the value');
  assert.equal(listed[0].name, 'GITHUB_TOKEN');

  await assert.rejects(() => store.createSecret({ name: 'GITHUB_TOKEN', description: 'outro', value: 'x' }), /Já existe uma variável/);
  await assert.rejects(() => store.createSecret({ name: 'NEW_ONE', description: 'sem valor' }), /Valor é obrigatório/);

  const envMap = await store.getSecretsEnvMap();
  assert.equal(envMap.GITHUB_TOKEN, 'ghp_abc123');

  const fullSecret = await store.readSecretValue('GITHUB_TOKEN');
  assert.equal(fullSecret.value, 'ghp_abc123');

  // Updating without a value keeps the old one; blank must never silently wipe a secret.
  const updated = await store.updateSecret(created.id, { description: 'Nova descrição' });
  assert.equal((await store.readSecretValue(created.id)).value, 'ghp_abc123');
  assert.equal(updated.description, 'Nova descrição');

  await store.deleteSecret(created.id);
  assert.equal((await store.listSecrets()).length, 0);
});

test('a terminal command can reference $NAME to use a secret without the value ever appearing in the prompt sent to the provider', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-secrets-terminal-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  let capturedSystemContent = null;
  let capturedRequestBodies = [];
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    const body = JSON.parse(options.body);
    capturedRequestBodies.push(body);
    capturedSystemContent = body.messages.find((m) => m.role === 'system')?.content || '';
    round += 1;
    if (round === 1) {
      return mockChatCompletion(
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 't1', type: 'function', function: { name: 'run_terminal_command', arguments: JSON.stringify({ command: 'printf "%s" "$MY_SECRET" | wc -c' }) } }],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'feito' });
  };

  try {
    const token = `${Date.now()}-secrets-terminal`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { terminal: true });
    await store.createSecret({ name: 'my_secret', description: 'Um segredo qualquer usado em scripts', value: 'super-secret-value-xyz' });
    const chat = await store.createChat('Secrets terminal', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Confirme o tamanho do segredo no ambiente.');
    assert.equal(result.assistantMessage.status, 'sent');

    // Prompt only ever carries name+description -- never the literal secret value.
    assert.match(capturedSystemContent, /MY_SECRET/);
    assert.match(capturedSystemContent, /Um segredo qualquer usado em scripts/);
    assert.doesNotMatch(capturedSystemContent, /super-secret-value-xyz/);
    for (const body of capturedRequestBodies) {
      assert.doesNotMatch(JSON.stringify(body), /super-secret-value-xyz/);
    }

    // The command actually ran with the real value in its environment: wc -c on the
    // 22-character secret returns 22 (byte count, no trailing newline from printf).
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'run_terminal_command');
    assert.equal(toolUse.result.stdout.trim(), '22');
  } finally {
    global.fetch = originalFetch;
  }
});

test('get_env_var reveals the literal value only when enabled, and requires approval when alwaysAllow is off', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-secrets-getenv-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    return mockChatCompletion(
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'g1', type: 'function', function: { name: 'get_env_var', arguments: JSON.stringify({ name: 'API_KEY', reason: 'preciso escrever no arquivo' }) } }],
      },
      'tool_calls',
    );
  };

  try {
    const token = `${Date.now()}-secrets-getenv`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    // alwaysAllow off (unlike baseConfig's default) is what makes get_env_var pause here --
    // like every other tool, alwaysAllow is a global override with no per-tool exception,
    // so turning it on would skip this approval too (by the app's own documented design).
    await baseConfig(store, { secretDisclosure: true, alwaysAllow: false });
    await store.createSecret({ name: 'API_KEY', description: 'Chave de API de exemplo', value: 'value-123' });
    const chat = await store.createChat('Secrets getenv', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Preciso do valor da API_KEY.');
    assert.equal(result.awaitingApproval, true);
    const pendingToolUse = result.assistantMessage.toolUses.find((use) => use.name === 'get_env_var');
    assert.equal(pendingToolUse.status, 'pending_approval');

    const approved = await assistant.continueToolApproval(chat.id, result.assistantMessage.id, 'approve');
    const approvedMessage = approved.chat.messages.find((message) => message.id === result.assistantMessage.id);
    const toolUse = approvedMessage.toolUses.find((use) => use.name === 'get_env_var');
    assert.equal(toolUse.result.value, 'value-123');
  } finally {
    global.fetch = originalFetch;
  }
});

test('get_env_var is not offered as a tool when secretDisclosure is off', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-secrets-disabled-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let capturedTools = null;
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    capturedTools = JSON.parse(options.body).tools || [];
    return mockChatCompletion({ role: 'assistant', content: 'ok' });
  };

  try {
    const token = `${Date.now()}-secrets-disabled`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store, { secretDisclosure: false });
    await store.createSecret({ name: 'X', description: 'y', value: 'z' });
    const chat = await store.createChat('Secrets disabled', { provider: 'openai-compatible', model: 'gpt-5.5' });
    await assistant.sendUserMessage(chat.id, 'oi');
    assert.ok(!capturedTools.some((tool) => tool.function?.name === 'get_env_var'));
  } finally {
    global.fetch = originalFetch;
  }
});
