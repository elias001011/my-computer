import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function mockChatCompletion(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: {} }),
  };
}

async function baseConfig(store) {
  await store.ensureRuntime();
  await store.saveConfig({
    setupComplete: true,
    provider: 'openai-compatible',
    model: 'gpt-5.5',
    tools: { terminal: false, searchMode: 'off', webSearch: false },
    providerSettings: {
      'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
    },
  });
}

test('editUserMessage forks the conversation: truncates downstream and archives it on editHistory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-edit-msg-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    return mockChatCompletion(`answer ${round}`);
  };

  try {
    const token = `${Date.now()}-edit-msg`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store);
    const chat = await store.createChat('Edit message', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const first = await assistant.sendUserMessage(chat.id, 'primeira pergunta');
    const firstUserId = first.assistantMessage.sourceUserMessageId;
    await assistant.sendUserMessage(chat.id, 'segunda pergunta');

    let full = await store.readChat(chat.id);
    assert.equal(full.messages.length, 4); // U1, A1, U2, A2

    const edited = await store.editUserMessage(chat.id, firstUserId, { content: 'primeira pergunta corrigida' });
    assert.equal(edited.content, 'primeira pergunta corrigida');
    assert.equal(edited.status, 'pending');
    assert.equal(edited.editHistory.length, 1);
    assert.equal(edited.editHistory[0].previousContent, 'primeira pergunta');
    // The three messages that came after (A1, U2, A2) are archived, not deleted.
    assert.equal(edited.editHistory[0].archivedMessages.length, 3);
    assert.equal(edited.editHistory[0].archivedMessages[0].content, 'answer 1');

    full = await store.readChat(chat.id);
    // Live transcript is truncated to end at the edited message.
    assert.equal(full.messages.length, 1);
    assert.equal(full.messages[0].id, firstUserId);
    assert.equal(full.messages[0].content, 'primeira pergunta corrigida');

    // Re-running via the retry path regenerates a fresh answer to the edited message.
    const rerun = await assistant.sendUserMessage(chat.id, '', { retryMessageId: firstUserId });
    assert.equal(rerun.assistantMessage.status, 'sent');
    const afterRerun = await store.readChat(chat.id);
    assert.equal(afterRerun.messages.length, 2); // edited U1 + new A
    assert.equal(afterRerun.messages[1].role, 'assistant');
    assert.equal(afterRerun.messages[0].editHistory.length, 1); // history preserved through re-run
  } finally {
    global.fetch = originalFetch;
  }
});

test('editUserMessage rejects empty content and non-user messages', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-edit-msg-guard-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    return mockChatCompletion('an answer');
  };

  try {
    const token = `${Date.now()}-edit-msg-guard`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await baseConfig(store);
    const chat = await store.createChat('Edit guard', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const sent = await assistant.sendUserMessage(chat.id, 'oi');
    const userId = sent.assistantMessage.sourceUserMessageId;
    const assistantId = sent.assistantMessage.id;

    await assert.rejects(() => store.editUserMessage(chat.id, userId, { content: '   ' }), /não pode ficar vazia/);
    await assert.rejects(() => store.editUserMessage(chat.id, assistantId, { content: 'x' }), /Só mensagens do usuário/);
    await assert.rejects(() => store.editUserMessage(chat.id, 'nonexistent', { content: 'x' }), /não encontrada/);
  } finally {
    global.fetch = originalFetch;
  }
});
