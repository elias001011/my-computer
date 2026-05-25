import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('normalizes web_search tool calls and fake tool text', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-stability-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const assistant = await import(`../src/server/assistant.js?test=${Date.now()}`);

  const fakeText = '<web_search>{"query":"notícias atuais","reason":"buscar notícias","maxResults":"5"}</web_search>';
  const syntheticCalls = assistant.normalizeAssistantToolCalls([], fakeText, { searchMode: 'native', webSearch: true });
  assert.equal(syntheticCalls.length, 1);
  assert.equal(syntheticCalls[0].function.name, 'web_search');
  assert.deepEqual(JSON.parse(syntheticCalls[0].function.arguments), {
    query: 'notícias atuais',
    reason: 'buscar notícias',
    maxResults: 5,
  });
  assert.match(assistant.sanitizeAssistantToolLikeText(fakeText), /processou isso como tool/);
  assert.equal(
    assistant.sanitizeAssistantToolLikeText('Tool used: web_search Input: {"query":"x"}\nExit code: unknown\n\nResposta limpa.'),
    'Resposta limpa.',
  );

  const malformedCalls = assistant.normalizeAssistantToolCalls(
    [
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'web_search {"query":"Sarandi RS clima","reason":"clima","maxResults":"2"}',
          arguments: '{}',
        },
      },
    ],
    '',
    { searchMode: 'native', webSearch: true },
  );
  assert.equal(malformedCalls[0].function.name, 'web_search');
  assert.equal(JSON.parse(malformedCalls[0].function.arguments).maxResults, 2);

  const disabledCalls = assistant.normalizeAssistantToolCalls([], fakeText, { searchMode: 'off', webSearch: false });
  assert.equal(disabledCalls.length, 0);
});

test('network status endpoint exposes bind and LAN diagnostics without password', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-network-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });
  try {
    const response = await fetch(`${url}/api/network/status`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.networkStatus.bindHost, '127.0.0.1');
    assert.equal(data.networkStatus.authRequired, false);
    assert.ok(data.networkStatus.localUrl.startsWith('http://127.0.0.1:'));
    assert.equal(JSON.stringify(data).includes('authPassword'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('bootstrap does not create a ghost chat when no chat exists', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-bootstrap-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const store = await import(`../src/server/store.js?test=${Date.now()}`);
  await store.ensureRuntime();
  await store.saveConfig({ setupComplete: true });
  const serverModule = await import(`../src/server/server.js?test=${Date.now()}`);
  const { server, url } = await serverModule.startServer({ port: 0, host: '127.0.0.1' });
  try {
    const response = await fetch(`${url}/api/bootstrap`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.chats, []);
    assert.equal(data.activeChat, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
