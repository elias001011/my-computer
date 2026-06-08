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
  assert.equal(config.tools.deepInvestigation, false);
  assert.equal(config.tools.userMemory, true);
  assert.equal(config.tools.userMemoryEdit, false);
  assert.equal(config.tools.searchTerminal, false);
  assert.equal(config.tools.searchMode, 'native');
  assert.equal(config.userMemory.sendFilesToPrompt, false);
  assert.equal(config.userMemory.remindModelToUpdateFiles, false);
  assert.equal(config.privacy.offlineMode, false);
  assert.equal(config.context.autoCompactEnabled, false);
  assert.equal(config.context.autoCompactChars, 24000);
  assert.equal(config.routing.modelRotationEnabled, false);
  assert.deepEqual(config.routing.modelFallbacks, []);
  assert.equal(config.routing.providerRotationEnabled, false);
  assert.equal(config.routing.maxProviderPasses, 2);
  assert.equal(config.server.networkEnabled, false);
  assert.equal(config.technicalLevel, 'balanced');
  assert.equal(config.technicalGuidanceEnabled, true);
  assert.equal(config.appearance.uiLanguage, 'en-US');

  await store.saveConfig({
    technicalLevel: 'beginner',
    technicalGuidanceEnabled: false,
    appearance: { theme: 'dark', uiLanguage: 'pt-BR' },
    tools: {
      ...config.tools,
      alwaysAllow: true,
      terminalMode: 'isolated',
      searchMode: 'both',
      deepInvestigation: true,
      userMemoryEdit: true,
    },
    userMemory: { sendFilesToPrompt: true, remindModelToUpdateFiles: true },
    context: { autoCompactEnabled: true, autoCompactChars: 32000, autoCompactMinMessages: 5 },
    routing: {
      modelRotationEnabled: true,
      modelFallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
      providerRotationEnabled: true,
      maxProviderPasses: 3,
      fallbacks: [{ provider: 'gemini', model: 'gemini-2.5-flash' }],
    },
    server: { networkEnabled: true, authPassword: 'local-pass' },
  });
  const securityConfig = await store.loadConfig();
  assert.equal(securityConfig.technicalLevel, 'beginner');
  assert.equal(securityConfig.technicalGuidanceEnabled, false);
  assert.equal(securityConfig.appearance.theme, 'dark');
  assert.equal(securityConfig.appearance.uiLanguage, 'pt-BR');
  assert.equal(securityConfig.tools.alwaysAllow, true);
  assert.equal(securityConfig.tools.terminalMode, 'isolated');
  assert.equal(securityConfig.tools.deepInvestigation, true);
  assert.equal(securityConfig.tools.userMemory, true);
  assert.equal(securityConfig.tools.userMemoryEdit, true);
  assert.equal(securityConfig.tools.searchMode, 'both');
  assert.equal(securityConfig.tools.searchTerminal, true);
  assert.equal(securityConfig.userMemory.sendFilesToPrompt, true);
  assert.equal(securityConfig.userMemory.remindModelToUpdateFiles, true);
  assert.equal(securityConfig.context.autoCompactEnabled, true);
  assert.equal(securityConfig.context.autoCompactChars, 32000);
  assert.equal(securityConfig.context.autoCompactMinMessages, 5);
  assert.equal(securityConfig.routing.modelRotationEnabled, true);
  assert.deepEqual(securityConfig.routing.modelFallbacks, [{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
  assert.equal(securityConfig.routing.providerRotationEnabled, true);
  assert.equal(securityConfig.routing.maxProviderPasses, 3);
  assert.deepEqual(securityConfig.routing.fallbacks, [{ provider: 'gemini', model: 'gemini-2.5-flash' }]);
  assert.equal(securityConfig.server.networkEnabled, true);

  await store.saveConfig({
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    privacy: { offlineMode: true },
    tools: { searchMode: 'native', webSearch: true, searchTerminal: false },
    routing: {
      modelRotationEnabled: true,
      modelFallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
      providerRotationEnabled: true,
      maxProviderPasses: 3,
      fallbacks: [{ provider: 'openai', model: 'gpt-4.1' }],
    },
  });
  const offlineConfig = await store.loadConfig();
  assert.equal(offlineConfig.privacy.offlineMode, true);
  assert.equal(offlineConfig.provider, 'ollama');
  assert.equal(offlineConfig.tools.searchMode, 'off');
  assert.equal(offlineConfig.tools.webSearch, false);
  assert.equal(offlineConfig.routing.providerRotationEnabled, false);
  assert.deepEqual(offlineConfig.routing.fallbacks, []);
  await store.saveConfig({
    privacy: { offlineMode: false },
    provider: 'openai-compatible',
    model: 'llama-3.3-70b-versatile',
    tools: securityConfig.tools,
    userMemory: securityConfig.userMemory,
    routing: securityConfig.routing,
  });

  const defaultRuntime = await store.getRuntimeInfo();
  assert.equal(defaultRuntime.activeProfile.id, 'default');
  const profile = await store.createProfile('Projeto Memória');
  assert.equal(profile.id, 'projeto-memoria');
  assert.equal((await store.getRuntimeInfo()).activeProfile.id, profile.id);
  assert.equal((await store.listChats()).length, 0);
  await store.saveConfig({ provider: 'ollama', model: 'llama3.2' });
  assert.equal((await store.loadConfig()).provider, 'ollama');
  await Promise.all([
    store.withProfileScope('default', async () => {
      await store.saveConfig({ userNickname: 'Default scoped' });
      await store.writePersistentMemory('# Default scoped\n');
      await store.createChat('Default scoped chat');
    }),
    store.withProfileScope(profile.id, async () => {
      await store.saveConfig({ userNickname: 'Profile scoped' });
      await store.writePersistentMemory('# Profile scoped\n');
      await store.createChat('Profile scoped chat');
    }),
  ]);
  await store.withProfileScope('default', async () => {
    assert.equal((await store.loadConfig()).userNickname, 'Default scoped');
    assert.match(await store.readPersistentMemory(), /Default scoped/);
    assert.equal((await store.listChats()).length, 1);
  });
  await store.withProfileScope(profile.id, async () => {
    assert.equal((await store.loadConfig()).userNickname, 'Profile scoped');
    assert.match(await store.readPersistentMemory(), /Profile scoped/);
    assert.equal((await store.listChats()).length, 1);
  });
  await store.activateProfile('default');
  assert.equal((await store.loadConfig()).provider, 'openai-compatible');
  await store.deleteProfile(profile.id);
  assert.equal((await store.getRuntimeInfo()).activeProfile.id, 'default');
  await store.deleteAllChats();

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

  const userMemoryFile = await store.saveUserMemoryFile({
    name: 'project.md',
    content: '# Projeto\n\n- status antigo\n',
  });
  assert.equal((await store.listUserMemoryFiles()).length, 1);
  assert.match((await store.readUserMemoryFile(userMemoryFile.id)).content, /status antigo/);
  const userMemoryEdit = await store.replaceTextInUserMemoryFile(userMemoryFile.id, 'status antigo', 'status novo');
  assert.match(userMemoryEdit.content, /status novo/);
  const userMemoryManualEdit = await store.writeUserMemoryFileContent(userMemoryFile.id, '# Projeto\n\n- status manual\n');
  assert.match(userMemoryManualEdit.content, /status manual/);
  const userMemoryWithHints = await store.readUserMemoryFileWithHints(userMemoryFile.id);
  assert.equal(userMemoryWithHints.title, 'Projeto');
  assert.match(userMemoryWithHints.preview, /status manual/);
  const userMemoryIndexOnly = await store.buildUserMemoryPromptContext({ userMemory: { sendFilesToPrompt: false } });
  assert.equal(userMemoryIndexOnly.mode, 'index');
  assert.equal(userMemoryIndexOnly.promptFiles.length, 0);
  const userMemoryFull = await store.buildUserMemoryPromptContext({ userMemory: { sendFilesToPrompt: true } });
  assert.equal(userMemoryFull.mode, 'full');
  assert.match(userMemoryFull.promptFiles[0].content, /status manual/);

  const attachment = await store.saveAttachment(chat.id, {
    name: 'doc.html',
    mimeType: 'text/html',
    dataBase64: Buffer.from('<html><body><h1>Titulo</h1><p>Texto extraido.</p></body></html>').toString('base64'),
  });
  assert.equal(attachment.kind, 'text');
  assert.match(attachment.extractedText, /Texto extraido/);
  assert.equal((await store.listAttachments(chat.id)).length, 1);
  const attachmentEdit = await store.replaceTextInAttachment(chat.id, attachment.id, 'Texto extraido.', 'Texto editado.');
  assert.match(attachmentEdit.content, /Texto editado/);
  assert.match((await store.readAttachmentTextContent(chat.id, attachment.id)).content, /Texto editado/);
  const attachmentManualEdit = await store.writeAttachmentTextContent(chat.id, attachment.id, '# Documento\n\nTexto manual.');
  assert.match(attachmentManualEdit.content, /Texto manual/);
  assert.match((await store.readChat(chat.id)).attachments[0].previewText, /Texto manual/);

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

  const removedAttachment = await store.saveAttachment(chat.id, {
    name: 'remove-me.md',
    mimeType: 'text/markdown',
    dataBase64: Buffer.from('# Remove me\n\nPRIVATE_TOKEN_123\n').toString('base64'),
  });
  await store.appendMessages(chat.id, [
    store.createMessage('user', 'Mensagem com anexo removível.', {
      attachments: [removedAttachment],
      status: 'sent',
    }),
    store.createMessage('assistant', 'Li PRIVATE_TOKEN_123 pelo anexo.', {
      status: 'needs_tool_approval',
      toolUses: [
        {
          id: 'doc-read-1',
          name: 'chat_document',
          input: { action: 'read', attachmentId: removedAttachment.id },
          status: 'completed',
          result: {
            action: 'read',
            content: '# Remove me\n\nPRIVATE_TOKEN_123\n',
            document: removedAttachment,
          },
        },
      ],
      executionTrace: [{ type: 'tool_result', content: 'PRIVATE_TOKEN_123', result: { content: 'PRIVATE_TOKEN_123' } }],
      pendingToolApproval: {
        providerMessages: [{ role: 'user', content: 'PRIVATE_TOKEN_123' }],
        toolCalls: [],
        approvalToolCalls: [],
      },
    }),
  ]);
  await store.writeContextSummary(chat.id, '# Contexto\n\nPRIVATE_TOKEN_123\n');
  await store.saveCurrentContextWindow(chat.id, '# Janela\n\nPRIVATE_TOKEN_123\n');
  await store.appendEvent({
    type: 'tool.run_terminal_command.completed',
    chatId: chat.id,
    details: {
      command: `cat ${removedAttachment.path}`,
      stdoutPreview: `PRIVATE_TOKEN_123\n${removedAttachment.path}`,
      stderrPreview: '',
    },
  });
  assert.equal((await store.listAttachments(chat.id)).length, 4);
  await store.deleteAttachment(chat.id, removedAttachment.id);
  const chatAfterDelete = await store.readChat(chat.id);
  assert.equal((await store.listAttachments(chat.id)).some((item) => item.id === removedAttachment.id), false);
  assert.doesNotMatch(JSON.stringify(chatAfterDelete.messages), /PRIVATE_TOKEN_123/);
  assert.doesNotMatch(chatAfterDelete.contextSummary, /PRIVATE_TOKEN_123/);
  const redactedAttachment = chatAfterDelete.messages.flatMap((message) => message.attachments || []).find((item) => item.id === removedAttachment.id);
  assert.equal(redactedAttachment.sendMode, 'deleted');
  assert.equal(redactedAttachment.path, undefined);
  assert.equal(redactedAttachment.extractedText, undefined);
  assert.equal(redactedAttachment.previewText, undefined);

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
  assert.equal(exported.version, 2);
  assert.equal(exported.chats.length, 1);
  assert.equal(exported.config.provider, 'openai-compatible');
  assert.equal(exported.config.appearance.theme, 'dark');
  assert.equal(exported.config.tools.deepInvestigation, true);
  assert.equal(exported.config.context.autoCompactEnabled, true);
  assert.equal(exported.config.routing.modelRotationEnabled, true);
  assert.deepEqual(exported.config.routing.modelFallbacks, [{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
  assert.equal(exported.chats[0].metadata.modelSettings.maxTokens, 1000);
  assert.equal(exported.chats[0].attachments.length, 3);
  assert.equal(exported.chats[0].attachments.some((item) => item.name === 'remove-me.md'), false);
  assert.doesNotMatch(JSON.stringify(exported.chats[0].messages), /PRIVATE_TOKEN_123/);
  assert.doesNotMatch(exported.chats[0].contextSummary, /PRIVATE_TOKEN_123/);
  assert.doesNotMatch(exported.chats[0].contextWindow, /PRIVATE_TOKEN_123/);
  assert.doesNotMatch(JSON.stringify(exported.events), /PRIVATE_TOKEN_123/);
  assert.doesNotMatch(JSON.stringify(exported.events), new RegExp(removedAttachment.id));
  assert.equal(exported.persistentMemoryUserFiles.length, 1);

  await store.saveConfig({
    appearance: { theme: 'light' },
    tools: { deepInvestigation: false, alwaysAllow: false, searchMode: 'native' },
    context: { autoCompactEnabled: false, autoCompactChars: 24000, autoCompactMinMessages: 12 },
    routing: {
      modelRotationEnabled: false,
      modelFallbacks: [],
      providerRotationEnabled: false,
      maxProviderPasses: 1,
      fallbacks: [],
    },
  });
  await store.writePersistentMemory('# Local\n\n- keep local memory');
  await store.deleteUserMemoryFile(userMemoryFile.id);
  await store.saveUserMemoryFile({ name: 'local.md', content: '# Local user file\n' });
  await store.importRuntimeData(exported, {
    config: true,
    persistentMemory: false,
    persistentMemoryUser: false,
    chats: true,
    attachments: false,
    events: false,
  });
  const importedChats = await store.listChats();
  assert.equal(importedChats.length, 2);
  const importedChat = await store.readChat(importedChats[0].id);
  assert.equal(importedChat.attachments.length, 0);
  assert.ok((importedChat.messages || []).every((message) => !message.attachments?.length));
  assert.match(await store.readPersistentMemory(), /keep local memory/);
  assert.match((await store.readUserMemoryFile('local.md')).content, /Local user file/);
  const importedConfig = await store.loadConfig();
  assert.equal(importedConfig.appearance.theme, 'dark');
  assert.equal(importedConfig.tools.deepInvestigation, true);
  assert.equal(importedConfig.context.autoCompactEnabled, true);
  assert.equal(importedConfig.routing.modelRotationEnabled, true);
  assert.deepEqual(importedConfig.routing.modelFallbacks, [{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
  assert.equal(importedConfig.routing.providerRotationEnabled, true);

  await store.importRuntimeData(exported, {
    config: false,
    persistentMemory: false,
    persistentMemoryUser: true,
    chats: false,
    attachments: false,
    events: false,
  });
  const restoredUserMemory = await store.readUserMemoryFile('project.md');
  assert.match(restoredUserMemory.content, /status manual/);
  const restoredUserMemoryHints = await store.listUserMemoryFilesWithHints();
  assert.equal(restoredUserMemoryHints[0].name, 'project.md');
  assert.equal(restoredUserMemoryHints[0].title, 'Projeto');

  await store.saveConfig({ userNickname: 'Before invalid import' });
  await assert.rejects(
    () =>
      store.importRuntimeData(
        {
          config: { setupComplete: true, userNickname: 'Should not apply' },
          persistentMemoryUserFiles: [
            {
              id: 'too-large',
              name: 'too-large.md',
              mimeType: 'text/markdown',
              dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
            },
          ],
        },
        { config: true, persistentMemoryUser: true, chats: false, attachments: false, events: false },
      ),
    /muito grande/,
  );
  assert.equal((await store.loadConfig()).userNickname, 'Before invalid import');

  await store.saveConfig({
    customModels: {
      'openai-compatible': ['old/custom-model'],
    },
    modelCapabilities: {
      'openai-compatible': {
        'old/custom-model': { images: true, maxInputImages: 2 },
      },
    },
    tools: { searchMode: 'off', webSearch: false, searchTerminal: false },
  });
  await store.importRuntimeData(
    {
      version: 1,
      config: {
        setupComplete: true,
        provider: 'openai-compatible',
        model: 'restored-model',
        providerSettings: {
          'openai-compatible': {
            baseUrl: 'https://backup.test/v1',
            apiKeys: [{ value: 'backup-key' }],
          },
        },
        customModels: {},
        modelCapabilities: {},
        tools: { webSearch: true, searchTerminal: false },
      },
    },
    { config: true, persistentMemory: false, chats: false, attachments: false, events: false },
  );
  const restoredConfig = await store.loadConfig();
  assert.equal(restoredConfig.customModels['openai-compatible'].length, 0);
  assert.deepEqual(restoredConfig.modelCapabilities['openai-compatible'], {});
  assert.equal(restoredConfig.tools.searchMode, 'native');
  assert.equal(restoredConfig.tools.webSearch, true);
  assert.equal(restoredConfig.providerSettings['openai-compatible'].apiKeys[0].value, 'backup-key');

  await store.saveConfig({ tools: { searchMode: 'off', webSearch: false, searchTerminal: false } });
  await store.saveConfig({ tools: { webSearch: true, searchTerminal: false } });
  const legacyPatchConfig = await store.loadConfig();
  assert.equal(legacyPatchConfig.tools.searchMode, 'native');
  assert.equal(legacyPatchConfig.tools.webSearch, true);

  await store.writePersistentMemory('# Shared\n');
  await Promise.all([
    store.updatePersistentMemory((previous) => `${previous.trim()}\n\n- alpha\n`),
    store.updatePersistentMemory((previous) => `${previous.trim()}\n\n- beta\n`),
  ]);
  const persistentMemory = await store.readPersistentMemory();
  assert.match(persistentMemory, /alpha/);
  assert.match(persistentMemory, /beta/);

  await store.writeMemory(chat.id, '# Chat memory\n');
  await Promise.all([
    store.updateMemory(chat.id, (previous) => `${previous.trim()}\n\n- local alpha\n`),
    store.updateMemory(chat.id, (previous) => `${previous.trim()}\n\n- local beta\n`),
  ]);
  const chatMemory = (await store.readChat(chat.id)).memory;
  assert.match(chatMemory, /local alpha/);
  assert.match(chatMemory, /local beta/);

  const chats = await store.listChats();
  assert.equal(chats.length, 2);

  const chatEvents = await store.readEvents({ chatId: chat.id });
  assert.ok(chatEvents.every((event) => event.chatId === chat.id));

  await store.deleteChat(chat.id);
  assert.equal((await store.listChats()).length, 1);
  await store.deleteAllChats();
  assert.equal((await store.listChats()).length, 0);

  await store.createChat('Limpar 1');
  await store.createChat('Limpar 2');
  const deletedChats = await store.deleteAllChats();
  assert.equal(deletedChats.count, 2);
  assert.equal((await store.listChats()).length, 0);
});
