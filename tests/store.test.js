import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('store creates runtime, chat files, memory and context snapshots', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-test-'));
  process.env.MY_COMPUTER_HOME = tempDir;

  const store = await import(`../src/server/store.js?test=${Date.now()}`);
  await store.ensureRuntime();
  await store.saveConfig({
    provider: 'openai-compatible',
    model: 'llama-3.3-70b-versatile',
    language: 'auto',
    systemPromptExtra: 'Prefer short answers.',
    providerSettings: {
      'openai-compatible': {
        baseUrl: 'https://example.test/v1',
        apiKeys: [{ value: 'test-key' }],
      },
    },
  });
  const config = await store.loadConfig();
  assert.equal(config.provider, 'openai-compatible');
  assert.equal(config.providerSettings['openai-compatible'].apiKeys[0].value, 'test-key');

  const chat = await store.createChat('Teste', { provider: config.provider, model: config.model });
  assert.equal(chat.title, 'Teste');
  assert.equal(chat.provider, 'openai-compatible');
  assert.match(chat.paths.memory, /memory\.md$/);

  await store.writeMemory(chat.id, '# Memory\n\n- keep this');
  const updated = await store.readChat(chat.id);
  assert.match(updated.memory, /keep this/);

  const failedMessage = store.createMessage('user', 'retry me', { status: 'failed' });
  await store.appendMessages(chat.id, [failedMessage]);
  const retriedMessage = await store.updateMessage(chat.id, failedMessage.id, {
    status: 'pending',
    error: null,
  });
  assert.equal(retriedMessage.status, 'pending');

  await store.writePersistentMemory('# Global\n\n- cross-chat');
  assert.match(await store.readPersistentMemory(), /cross-chat/);

  const snapshotPath = await store.saveContextSnapshot(chat.id, '# Context');
  assert.equal(await fs.readFile(snapshotPath, 'utf8'), '# Context');

  const exported = await store.exportRuntimeData();
  assert.equal(exported.chats.length, 1);
  assert.equal(exported.config.provider, 'openai-compatible');

  const chats = await store.listChats();
  assert.equal(chats.length, 1);

  const chatEvents = await store.readEvents({ chatId: chat.id });
  assert.ok(chatEvents.every((event) => event.chatId === chat.id));

  await store.deleteChat(chat.id);
  assert.equal((await store.listChats()).length, 0);
});
