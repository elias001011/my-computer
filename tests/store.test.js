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
    apiKey: 'test-key',
    model: 'llama-3.3-70b-versatile',
    language: 'auto',
    systemPromptExtra: 'Prefer short answers.',
  });

  const chat = await store.createChat('Teste');
  assert.equal(chat.title, 'Teste');
  assert.match(chat.paths.memory, /memory\.md$/);

  await store.writeMemory(chat.id, '# Memory\n\n- keep this');
  const updated = await store.readChat(chat.id);
  assert.match(updated.memory, /keep this/);

  const snapshotPath = await store.saveContextSnapshot(chat.id, '# Context');
  assert.equal(await fs.readFile(snapshotPath, 'utf8'), '# Context');

  const chats = await store.listChats();
  assert.equal(chats.length, 1);
});
