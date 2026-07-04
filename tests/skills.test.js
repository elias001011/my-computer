import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function mockChatCompletion(message, finishReason = 'stop') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message, finish_reason: finishReason }],
      usage: {},
    }),
  };
}

test('skills CRUD round-trips through frontmatter and rejects duplicate names', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-skills-crud-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const token = `${Date.now()}-skills-crud`;
  const store = await import(`../src/server/store.js?test=${token}-store`);
  await store.ensureRuntime();

  const created = await store.saveSkill({ name: 'Revisar PR!!', description: 'Como revisar um PR neste projeto', body: '1. Rode os testes\n2. Confira o diff' });
  assert.equal(created.name, 'revisar-pr');
  assert.equal(created.description, 'Como revisar um PR neste projeto');

  const listed = await store.listSkills();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const full = await store.readSkill(created.id);
  assert.equal(full.body, '1. Rode os testes\n2. Confira o diff');
  assert.match(full.content, /^---\nname: revisar-pr\ndescription: Como revisar um PR neste projeto\n---\n/);

  await assert.rejects(() => store.saveSkill({ name: 'revisar-pr', description: 'outra' }), /Já existe uma skill/);

  const updated = await store.updateSkill(created.id, { description: 'Nova descrição', body: 'Passo único.' });
  assert.equal(updated.description, 'Nova descrição');
  assert.equal(updated.body, 'Passo único.');

  const deleted = await store.deleteSkill(created.id);
  assert.equal(deleted.id, created.id);
  assert.equal((await store.listSkills()).length, 0);
});

test('system prompt lists skill name+description only; read_skill list needs no approval, read does and returns the body', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-skills-prompt-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let capturedSystemContent = null;
  let round = 0;
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    const body = JSON.parse(options.body);
    const systemMessage = body.messages.find((message) => message.role === 'system');
    capturedSystemContent = systemMessage?.content || '';
    round += 1;
    if (round === 1) {
      return mockChatCompletion(
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'read-skill-1',
              type: 'function',
              function: { name: 'read_skill', arguments: JSON.stringify({ action: 'read', skillId: null, name: 'remover-fundo', reason: 'tarefa pede' }) },
            },
          ],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'Feito.' });
  };

  try {
    const token = `${Date.now()}-skills-prompt`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    const skill = await store.saveSkill({
      name: 'remover-fundo',
      description: 'Como remover o fundo de uma imagem enviada usando o terminal',
      body: 'Instale rembg com pip e rode `rembg i entrada.png saida.png`.',
    });
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: false, skills: true, alwaysAllow: false, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chat = await store.createChat('Skills prompt', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Remova o fundo da imagem, use a skill certa.');

    // The first request's system prompt must carry the index (name+description) but not the body.
    assert.match(capturedSystemContent, /remover-fundo/);
    assert.match(capturedSystemContent, /Como remover o fundo de uma imagem enviada usando o terminal/);
    assert.doesNotMatch(capturedSystemContent, /rembg i entrada\.png/);

    // read requires approval when alwaysAllow is off, so the run stops before the second round.
    assert.equal(result.awaitingApproval, true);
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'read_skill');
    assert.equal(toolUse.status, 'pending_approval');

    const approved = await assistant.continueToolApproval(chat.id, result.assistantMessage.id, 'approve');
    const approvedMessage = approved.chat.messages.find((message) => message.id === result.assistantMessage.id);
    const approvedToolUse = approvedMessage.toolUses.find((use) => use.name === 'read_skill');
    assert.equal(approvedToolUse.result.skill.name, 'remover-fundo');
    assert.match(approvedToolUse.result.skill.body, /rembg i entrada\.png/);
    assert.equal(approvedToolUse.result.skill.id, skill.id);
  } finally {
    global.fetch = originalFetch;
  }
});

test('read_skill list action returns the index and does not require approval even with alwaysAllow off', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-skills-list-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    if (round === 1) {
      return mockChatCompletion(
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'read-skill-list-1',
              type: 'function',
              function: { name: 'read_skill', arguments: JSON.stringify({ action: 'list', reason: 'checar skills' }) },
            },
          ],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'Ok.' });
  };

  try {
    const token = `${Date.now()}-skills-list`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    await store.saveSkill({ name: 'skill-a', description: 'Primeira skill' });
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: false, skills: true, alwaysAllow: false, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chat = await store.createChat('Skills list', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const result = await assistant.sendUserMessage(chat.id, 'Quais skills existem?');
    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.content, 'Ok.');
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'read_skill');
    assert.equal(toolUse.result.skills.length, 1);
    assert.equal(toolUse.result.skills[0].name, 'skill-a');
  } finally {
    global.fetch = originalFetch;
  }
});
