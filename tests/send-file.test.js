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

test('send_file create writes a new text attachment without approval, even with terminal off', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-send-file-create-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let round = 0;
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    round += 1;
    if (round === 1) {
      return mockChatCompletion(
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'send-file-1',
              type: 'function',
              function: {
                name: 'send_file',
                arguments: JSON.stringify({
                  action: 'create',
                  fileName: 'relatorio.md',
                  content: '# Relatorio\n\nConteudo gerado pela IA.',
                }),
              },
            },
          ],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'Arquivo criado.' });
  };

  try {
    const token = `${Date.now()}-send-file-create`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: {
        terminal: false,
        fileDelivery: true,
        alwaysAllow: false,
        searchMode: 'off',
        webSearch: false,
      },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chat = await store.createChat('Send file create', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const result = await assistant.sendUserMessage(chat.id, 'Crie um relatorio em markdown.');
    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.content, 'Arquivo criado.');
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'send_file');
    assert.ok(toolUse, 'send_file tool use should be present');
    assert.equal(toolUse.result.error, undefined);
    assert.equal(toolUse.result.attachment.name, 'relatorio.md');

    const updatedChat = await store.readChat(chat.id);
    const attachment = updatedChat.attachments.find((item) => item.id === toolUse.result.attachment.id);
    assert.ok(attachment, 'attachment should be saved on the chat');
    assert.equal(attachment.mimeType, 'text/markdown');
    const { content } = await store.readAttachmentTextContent(chat.id, attachment.id);
    assert.equal(content, '# Relatorio\n\nConteudo gerado pela IA.');
  } finally {
    global.fetch = originalFetch;
  }
});

test('send_file create rejects binary-looking extensions, pointing to attach instead', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-send-file-binary-'));
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
              id: 'send-file-1',
              type: 'function',
              function: {
                name: 'send_file',
                arguments: JSON.stringify({ action: 'create', fileName: 'foto.png', content: 'not really a png' }),
              },
            },
          ],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'Ok.' });
  };

  try {
    const token = `${Date.now()}-send-file-binary`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: false, fileDelivery: true, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chat = await store.createChat('Send file binary', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const result = await assistant.sendUserMessage(chat.id, 'Crie uma foto.');
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'send_file');
    assert.ok(toolUse);
    assert.match(toolUse.result.error, /not a text-like format/);
    assert.equal((await store.readChat(chat.id)).attachments.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('send_file attach requires the terminal tool and, when available, sends an existing file', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-send-file-attach-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const sourcePath = path.join(tempDir, 'sem-fundo.png');
  await fs.writeFile(sourcePath, Buffer.from('fake-png-bytes'));

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
              id: 'send-file-1',
              type: 'function',
              function: {
                name: 'send_file',
                arguments: JSON.stringify({ action: 'attach', fileName: 'sem-fundo.png', path: sourcePath }),
              },
            },
          ],
        },
        'tool_calls',
      );
    }
    return mockChatCompletion({ role: 'assistant', content: 'Prontinho.' });
  };

  try {
    // First: fileDelivery on but terminal off -- attach must be refused with a clear reason.
    const offToken = `${Date.now()}-send-file-attach-off`;
    const store = await import(`../src/server/store.js?test=${offToken}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${offToken}-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: false, fileDelivery: true, alwaysAllow: true, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chatOff = await store.createChat('Send file attach off', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const offResult = await assistant.sendUserMessage(chatOff.id, 'Envie a imagem sem fundo.');
    const offToolUse = offResult.assistantMessage.toolUses.find((use) => use.name === 'send_file');
    assert.match(offToolUse.result.error, /requires the terminal/);

    round = 0;
    // Second: terminal on, alwaysAllow on -- attach goes through and the bytes match the source file.
    const onToken = `${Date.now()}-send-file-attach-on`;
    const store2 = await import(`../src/server/store.js?test=${onToken}-store`);
    const assistant2 = await import(`../src/server/assistant.js?test=${onToken}-assistant`);
    await store2.ensureRuntime();
    await store2.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: true, fileDelivery: true, alwaysAllow: true, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chatOn = await store2.createChat('Send file attach on', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const onResult = await assistant2.sendUserMessage(chatOn.id, 'Envie a imagem sem fundo.');
    const onToolUse = onResult.assistantMessage.toolUses.find((use) => use.name === 'send_file');
    assert.ok(onToolUse.result.attachment, 'attach should have produced an attachment');
    assert.equal(onToolUse.result.attachment.mimeType, 'image/png');
    const { data } = await store2.readAttachmentFile(chatOn.id, onToolUse.result.attachment.id);
    assert.equal(data.toString(), 'fake-png-bytes');
  } finally {
    global.fetch = originalFetch;
  }
});

test('send_file attach requires human approval while create does not', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-send-file-approval-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const sourcePath = path.join(tempDir, 'dados.csv');
  await fs.writeFile(sourcePath, 'a,b\n1,2\n');

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    return mockChatCompletion(
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'send-file-1',
            type: 'function',
            function: {
              name: 'send_file',
              arguments: JSON.stringify({ action: 'attach', fileName: 'dados.csv', path: sourcePath }),
            },
          },
        ],
      },
      'tool_calls',
    );
  };

  try {
    const token = `${Date.now()}-send-file-approval`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      // alwaysAllow off: attach must stop for approval; create (tested above) never does.
      tools: { terminal: true, fileDelivery: true, alwaysAllow: false, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chat = await store.createChat('Send file approval', { provider: 'openai-compatible', model: 'gpt-5.5' });
    const result = await assistant.sendUserMessage(chat.id, 'Anexe os dados.');
    assert.equal(result.awaitingApproval, true);
    const toolUse = result.assistantMessage.toolUses.find((use) => use.name === 'send_file');
    assert.equal(toolUse.status, 'pending_approval');
    assert.equal((await store.readChat(chat.id)).attachments.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
