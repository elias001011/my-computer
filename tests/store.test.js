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
  assert.equal(config.tools.searchMode, 'native');
  assert.equal(config.context.autoCompactEnabled, false);
  assert.equal(config.context.autoCompactChars, 24000);
  assert.equal(config.routing.providerRotationEnabled, false);
  assert.equal(config.routing.maxProviderPasses, 2);
  assert.equal(config.server.networkEnabled, false);
  assert.equal(config.technicalLevel, 'balanced');
  assert.equal(config.technicalGuidanceEnabled, true);

  await store.saveConfig({
    technicalLevel: 'beginner',
    technicalGuidanceEnabled: false,
    tools: { ...config.tools, alwaysAllow: true, terminalMode: 'isolated', searchMode: 'both' },
    context: { autoCompactEnabled: true, autoCompactChars: 32000, autoCompactMinMessages: 5 },
    routing: {
      providerRotationEnabled: true,
      maxProviderPasses: 3,
      fallbacks: [{ provider: 'gemini', model: 'gemini-2.5-flash' }],
    },
    server: { networkEnabled: true, authPassword: 'local-pass' },
  });
  const securityConfig = await store.loadConfig();
  assert.equal(securityConfig.technicalLevel, 'beginner');
  assert.equal(securityConfig.technicalGuidanceEnabled, false);
  assert.equal(securityConfig.tools.alwaysAllow, true);
  assert.equal(securityConfig.tools.terminalMode, 'isolated');
  assert.equal(securityConfig.tools.searchMode, 'both');
  assert.equal(securityConfig.tools.searchTerminal, true);
  assert.equal(securityConfig.context.autoCompactEnabled, true);
  assert.equal(securityConfig.context.autoCompactChars, 32000);
  assert.equal(securityConfig.context.autoCompactMinMessages, 5);
  assert.equal(securityConfig.routing.providerRotationEnabled, true);
  assert.equal(securityConfig.routing.maxProviderPasses, 3);
  assert.deepEqual(securityConfig.routing.fallbacks, [{ provider: 'gemini', model: 'gemini-2.5-flash' }]);
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

  const pdf = await store.saveAttachment(chat.id, {
    name: 'manual.pdf',
    mimeType: 'application/pdf',
    dataBase64: Buffer.from('%PDF fake bytes').toString('base64'),
  });
  assert.equal(pdf.kind, 'pdf');
  assert.equal(pdf.sendMode, 'reference');
  assert.match(pdf.extractionNote, /PDF salvo/);

  await assert.rejects(
    () =>
      store.saveAttachment(chat.id, {
        name: 'documento.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dataBase64: Buffer.from('fake docx bytes').toString('base64'),
      }),
    /Formato ainda não compatível/,
  );

  const snapshotPath = await store.saveContextSnapshot(chat.id, '# Context');
  assert.equal(await fs.readFile(snapshotPath, 'utf8'), '# Context');

  const exported = await store.exportRuntimeData();
  assert.equal(exported.chats.length, 1);
  assert.equal(exported.config.provider, 'openai-compatible');
  assert.equal(exported.chats[0].metadata.modelSettings.maxTokens, 1000);
  assert.equal(exported.chats[0].attachments.length, 3);

  await store.writePersistentMemory('# Local\n\n- keep local memory');
  await store.importRuntimeData(exported, {
    config: true,
    persistentMemory: false,
    chats: true,
    attachments: false,
    events: false,
  });
  const importedChats = await store.listChats();
  assert.equal(importedChats.length, 1);
  const importedChat = await store.readChat(importedChats[0].id);
  assert.equal(importedChat.attachments.length, 0);
  assert.match(await store.readPersistentMemory(), /keep local memory/);

  const chats = await store.listChats();
  assert.equal(chats.length, 1);

  const chatEvents = await store.readEvents({ chatId: chat.id });
  assert.ok(chatEvents.every((event) => event.chatId === chat.id));

  await store.deleteChat(chat.id);
  assert.equal((await store.listChats()).length, 0);
});
