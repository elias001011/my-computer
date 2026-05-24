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
  assert.equal(config.tools.alwaysAllow, false);
  assert.equal(config.tools.terminalMode, 'standard');
  assert.equal(config.tools.searchTerminal, false);
  assert.equal(config.context.autoCompactEnabled, false);
  assert.equal(config.context.autoCompactChars, 24000);
  assert.equal(config.server.networkEnabled, false);
  assert.equal(config.technicalLevel, 'balanced');
  assert.equal(config.technicalGuidanceEnabled, true);

  await store.saveConfig({
    technicalLevel: 'beginner',
    technicalGuidanceEnabled: false,
    tools: { ...config.tools, alwaysAllow: true, terminalMode: 'isolated', searchTerminal: true },
    context: { autoCompactEnabled: true, autoCompactChars: 32000, autoCompactMinMessages: 5 },
    server: { networkEnabled: true, authPassword: 'local-pass' },
  });
  const securityConfig = await store.loadConfig();
  assert.equal(securityConfig.technicalLevel, 'beginner');
  assert.equal(securityConfig.technicalGuidanceEnabled, false);
  assert.equal(securityConfig.tools.alwaysAllow, true);
  assert.equal(securityConfig.tools.terminalMode, 'isolated');
  assert.equal(securityConfig.tools.searchTerminal, true);
  assert.equal(securityConfig.context.autoCompactEnabled, true);
  assert.equal(securityConfig.context.autoCompactChars, 32000);
  assert.equal(securityConfig.context.autoCompactMinMessages, 5);
  assert.equal(securityConfig.server.networkEnabled, true);

  const chat = await store.createChat('Teste', {
    provider: securityConfig.provider,
    model: securityConfig.model,
    modelSettings: { temperature: 0.4, maxTokens: 1000 },
  });
  assert.equal(chat.title, 'Teste');
  assert.equal(chat.provider, 'openai-compatible');
  assert.equal(chat.modelSettings.temperature, 0.4);
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

  const attachment = await store.saveAttachment(chat.id, {
    name: 'doc.html',
    mimeType: 'text/html',
    dataBase64: Buffer.from('<html><body><h1>Titulo</h1><p>Texto extraido.</p></body></html>').toString('base64'),
  });
  assert.equal(attachment.kind, 'text');
  assert.match(attachment.extractedText, /Texto extraido/);
  assert.equal((await store.listAttachments(chat.id)).length, 1);

  const video = await store.saveAttachment(chat.id, {
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    dataBase64: Buffer.from('fake video bytes').toString('base64'),
  });
  assert.equal(video.kind, 'video');
  assert.equal(video.sendMode, 'reference');

  const snapshotPath = await store.saveContextSnapshot(chat.id, '# Context');
  assert.equal(await fs.readFile(snapshotPath, 'utf8'), '# Context');

  const exported = await store.exportRuntimeData();
  assert.equal(exported.chats.length, 1);
  assert.equal(exported.config.provider, 'openai-compatible');
  assert.equal(exported.chats[0].metadata.modelSettings.maxTokens, 1000);
  assert.equal(exported.chats[0].attachments.length, 2);

  const chats = await store.listChats();
  assert.equal(chats.length, 1);

  const chatEvents = await store.readEvents({ chatId: chat.id });
  assert.ok(chatEvents.every((event) => event.chatId === chat.id));

  await store.deleteChat(chat.id);
  assert.equal((await store.listChats()).length, 0);
});
