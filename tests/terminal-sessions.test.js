import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('config normalizes terminal session settings with clamps and master-flag gating', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-test-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const store = await import(`../src/server/store.js?test=${Date.now()}`);
  await store.ensureRuntime();

  await store.saveConfig({
    tools: {
      terminal: true,
      terminalSessions: true,
      terminalSessionOutputLines: 999999,
      terminalSessionMaxPerChat: 0,
      terminalSessionDefaultWaitSeconds: -5,
    },
  });
  let config = await store.loadConfig();
  assert.equal(config.tools.terminalSessions, true);
  assert.equal(config.tools.terminalSessionOutputLines, 2000);
  assert.equal(config.tools.terminalSessionMaxPerChat, 1);
  assert.equal(config.tools.terminalSessionDefaultWaitSeconds, 0);

  // Turning the master terminal flag off must force sessions off too, so no gate
  // anywhere else needs to re-check the master flag.
  await store.saveConfig({ tools: { terminal: false } });
  config = await store.loadConfig();
  assert.equal(config.tools.terminal, false);
  assert.equal(config.tools.terminalSessions, false);

  // Re-enabling the master flag does not resurrect the advanced mode: the forced-off
  // value was persisted, so sessions require an explicit re-opt-in (same semantics as
  // userMemory/userMemoryEdit).
  await store.saveConfig({ tools: { terminal: true } });
  config = await store.loadConfig();
  assert.equal(config.tools.terminalSessions, false);
  await store.saveConfig({ tools: { terminalSessions: true } });
  config = await store.loadConfig();
  assert.equal(config.tools.terminalSessions, true);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('terminal sessions: open, write, capture, scope validation and close', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-computer-test-'));
  process.env.MY_COMPUTER_HOME = tempDir;
  const sessions = await import(`../src/server/terminal-sessions.js?test=${Date.now()}`);

  if (!sessions.isTmuxAvailable()) {
    t.skip('tmux não está instalado neste ambiente');
    return;
  }

  const chatId = `test-${Date.now()}`;
  const otherChatId = 'other-chat';
  try {
    assert.deepEqual(await sessions.listSessions(chatId), []);

    const opened = await sessions.openSession(chatId, { maxSessions: 2 });
    assert.ok(opened.sessionId.includes(chatId.replace(/[^a-zA-Z0-9_-]+/g, '')));

    const listed = await sessions.listSessions(chatId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].sessionId, opened.sessionId);

    // Another chat must not see or touch this session.
    assert.deepEqual(await sessions.listSessions(otherChatId), []);
    assert.equal(sessions.sessionBelongsToChat(opened.sessionId, otherChatId), false);
    await assert.rejects(() => sessions.readSession(otherChatId, opened.sessionId), /não pertence/);

    const written = await sessions.writeToSession(chatId, opened.sessionId, {
      text: 'echo terminal-session-test-$((40+2))',
      waitSeconds: 1,
      lines: 100,
    });
    assert.match(written.output, /terminal-session-test-42/);

    // Special keys are validated against the whitelist.
    await assert.rejects(
      () => sessions.writeToSession(chatId, opened.sessionId, { keys: 'rm -rf /', waitSeconds: 0 }),
      /Tecla especial inválida/,
    );

    // Session cap is enforced at open time.
    await sessions.openSession(chatId, { maxSessions: 2 });
    await assert.rejects(() => sessions.openSession(chatId, { maxSessions: 2 }), /Limite de 2/);

    for (const session of await sessions.listSessions(chatId)) {
      await sessions.closeSession(chatId, session.sessionId);
    }
    assert.deepEqual(await sessions.listSessions(chatId), []);
    await assert.rejects(() => sessions.readSession(chatId, opened.sessionId), /não existe/);
  } finally {
    const { spawnSync } = await import('node:child_process');
    spawnSync('tmux', ['-L', sessions.getSocketLabel(), 'kill-server'], { timeout: 3000 });
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
