import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('sending an image to a non-vision model is not blocked and reaches the model as a path/metadata note', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-image-unsupported-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const originalFetch = global.fetch;
  let capturedUserContent = null;
  global.fetch = async (url, options = {}) => {
    if (!String(url).includes('/chat/completions')) throw new Error(`Unexpected fetch in test: ${url}`);
    const body = JSON.parse(options.body);
    const userMessage = body.messages.find((message) => message.role === 'user');
    capturedUserContent = userMessage?.content;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Recebido.' }, finish_reason: 'stop' }],
        usage: {},
      }),
    };
  };

  try {
    const token = `${Date.now()}-image-unsupported`;
    const store = await import(`../src/server/store.js?test=${token}-store`);
    const assistant = await import(`../src/server/assistant.js?test=${token}-assistant`);
    await store.ensureRuntime();
    await store.saveConfig({
      setupComplete: true,
      // gpt-5.5 on openai-compatible carries no vision metadata in the catalog, same as
      // other tests in this suite that use it as a plain non-vision model.
      provider: 'openai-compatible',
      model: 'gpt-5.5',
      tools: { terminal: false, searchMode: 'off', webSearch: false },
      providerSettings: {
        'openai-compatible': { baseUrl: 'https://example.test/v1', apiKeys: [{ value: 'test-key' }] },
      },
    });
    const chat = await store.createChat('Image unsupported model', { provider: 'openai-compatible', model: 'gpt-5.5' });

    const pngBuffer = Buffer.from('fake-png-bytes');
    const attachment = await store.saveAttachment(chat.id, {
      name: 'foto.png',
      mimeType: 'image/png',
      size: pngBuffer.length,
      dataBase64: pngBuffer.toString('base64'),
    });

    const result = await assistant.sendUserMessage(chat.id, 'O que tem nessa imagem?', { attachmentIds: [attachment.id] });

    assert.equal(result.assistantMessage.status, 'sent');
    assert.equal(result.assistantMessage.content, 'Recebido.');
    assert.equal(typeof capturedUserContent, 'string', 'content should stay plain text, not an image_url array');
    assert.match(capturedUserContent, /saved_path/);
    assert.match(capturedUserContent, /foto\.png/);
    assert.match(capturedUserContent, /does not support vision/);
  } finally {
    global.fetch = originalFetch;
  }
});
