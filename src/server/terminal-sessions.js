import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getRuntimeHome } from './paths.js';

// Persistent terminal sessions backed by tmux (a system binary, not an npm
// package, keeping the zero-dependency rule). Each My Computer instance talks
// to its own tmux server through a private socket label derived from the root
// runtime home, so two instances running as the same OS user never see each
// other's sessions. Session names encode the chat id, which is what scopes a
// session to a chat -- both the AI tool and the panel endpoints validate that
// prefix before touching a session.

const SESSION_PREFIX = 'mc';
const TMUX_COMMAND_TIMEOUT_MS = 10000;
const MAX_CAPTURE_CHARS = 16000;
const SPECIAL_KEY_PATTERN = /^(Enter|Escape|Tab|Space|BSpace|BTab|Up|Down|Left|Right|Home|End|PageUp|PageDown|DC|IC|F([1-9]|1[0-2])|C-[a-zA-Z]|M-[a-zA-Z])$/;

let cleanupRegistered = false;

export function getSocketLabel() {
  const hash = crypto.createHash('sha1').update(getRuntimeHome()).digest('hex').slice(0, 10);
  return `mc-terminal-${hash}`;
}

export function isTmuxAvailable() {
  try {
    const result = spawnSync('tmux', ['-V'], { timeout: 3000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

function chatKey(chatId) {
  const clean = String(chatId || '').replace(/[^a-zA-Z0-9_-]+/g, '');
  if (!clean) throw createError(400, 'chatId inválido para sessão de terminal.');
  return clean;
}

function sessionPrefixForChat(chatId) {
  return `${SESSION_PREFIX}-${chatKey(chatId)}-`;
}

export function sessionBelongsToChat(sessionId, chatId) {
  const name = String(sessionId || '');
  return /^[a-zA-Z0-9_-]+$/.test(name) && name.startsWith(sessionPrefixForChat(chatId));
}

function runTmux(args) {
  return new Promise((resolve) => {
    const child = spawn('tmux', ['-L', getSocketLabel(), ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr: error ? `${stderr}${stderr ? '\n' : ''}${error}` : stderr });
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(1, 'tmux não respondeu a tempo.');
    }, TMUX_COMMAND_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish(1, error.code === 'ENOENT' ? 'tmux não está instalado nesta máquina.' : error.message));
    child.on('close', (code) => finish(code ?? 1));
  });
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function ensureTmuxOrThrow() {
  if (!isTmuxAvailable()) {
    throw createError(
      503,
      'tmux não está instalado. Sessões de terminal persistentes usam tmux (binário do sistema). Instale com o gerenciador de pacotes (ex.: sudo apt install tmux) e tente de novo.',
    );
  }
}

// Best-effort idle reaper. tmux keeps session_activity current on any output or
// input in the session, so a session stuck idle past the timeout is genuinely
// forgotten, not just quiet mid-command. There is no background timer for this:
// it runs opportunistically whenever list/open touches the module (AI calls,
// panel polling, panel open), which is frequent enough to be a real cleanup path
// while staying zero-dependency.
async function reapIdleSessions(idleTimeoutMinutes) {
  const minutes = Number(idleTimeoutMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const all = await runTmux(['list-sessions', '-F', '#{session_name}\t#{session_activity}']);
  if (all.code !== 0) return;
  const cutoffMs = Date.now() - minutes * 60 * 1000;
  const stale = all.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, activity] = line.split('\t');
      return { name, activityMs: Number(activity) * 1000 };
    })
    .filter((session) => session.name.startsWith(`${SESSION_PREFIX}-`) && Number.isFinite(session.activityMs) && session.activityMs < cutoffMs);
  for (const session of stale) {
    await runTmux(['kill-session', '-t', session.name]);
  }
}

async function countAllSessions() {
  const all = await runTmux(['list-sessions', '-F', '#{session_name}']);
  if (all.code !== 0) return 0;
  return all.stdout.split('\n').filter((name) => name.startsWith(`${SESSION_PREFIX}-`)).length;
}

export async function listSessions(chatId, options = {}) {
  await reapIdleSessions(options.idleTimeoutMinutes);
  const prefix = sessionPrefixForChat(chatId);
  const list = await runTmux(['list-sessions', '-F', '#{session_name}\t#{session_created}\t#{session_attached}']);
  // "no server running" / "no sessions" are normal empty states, not failures.
  if (list.code !== 0) return [];
  const commands = await runTmux(['list-panes', '-a', '-F', '#{session_name}\t#{pane_current_command}\t#{pane_pid}']);
  const commandBySession = new Map();
  if (commands.code === 0) {
    for (const line of commands.stdout.split('\n')) {
      const [name, command, pid] = line.split('\t');
      if (name && !commandBySession.has(name)) commandBySession.set(name, { command, pid: Number(pid) || null });
    }
  }
  return list.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, created, attached] = line.split('\t');
      return {
        sessionId: name,
        createdAt: created ? new Date(Number(created) * 1000).toISOString() : null,
        attached: attached === '1',
        currentCommand: commandBySession.get(name)?.command || null,
      };
    })
    .filter((session) => session.sessionId.startsWith(prefix))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId, 'en', { numeric: true }));
}

export async function openSession(chatId, options = {}) {
  await ensureTmuxOrThrow();
  const existing = await listSessions(chatId, { idleTimeoutMinutes: options.idleTimeoutMinutes });
  const maxSessions = clampInteger(options.maxSessions, 1, 8, 3);
  if (existing.length >= maxSessions) {
    throw createError(
      409,
      `Limite de ${maxSessions} sessão(ões) por chat atingido. Feche uma sessão existente (close) ou aumente o limite nas configurações do Terminal.`,
    );
  }
  const maxGlobalSessions = clampInteger(options.maxGlobalSessions, 1, 64, 12);
  const globalCount = await countAllSessions();
  if (globalCount >= maxGlobalSessions) {
    throw createError(
      409,
      `Limite global de ${maxGlobalSessions} sessão(ões) de terminal (somando todos os chats) atingido. Feche alguma sessão ou aumente o limite nas configurações do Terminal.`,
    );
  }
  const prefix = sessionPrefixForChat(chatId);
  const taken = new Set(existing.map((session) => session.sessionId));
  let index = 1;
  while (taken.has(`${prefix}${index}`)) index += 1;
  const sessionId = `${prefix}${index}`;

  const terminalMode = options.terminalMode === 'isolated' ? 'isolated' : 'standard';
  const isolatedBaseHome = options.runtimeHome || getRuntimeHome();
  const isolatedHome = path.join(isolatedBaseHome, 'isolated-terminal');
  if (terminalMode === 'isolated') await fs.mkdir(isolatedHome, { recursive: true, mode: 0o700 });
  const cwd = options.cwd || (terminalMode === 'isolated' ? isolatedHome : process.env.HOME || os.homedir());

  const args = ['new-session', '-d', '-s', sessionId, '-x', '220', '-y', '50', '-c', cwd, '-e', `MC_TERMINAL_MODE=session-${terminalMode}`];
  if (terminalMode === 'isolated') args.push('-e', `HOME=${isolatedHome}`);
  const created = await runTmux(args);
  if (created.code !== 0) {
    throw createError(500, `Falha ao criar sessão tmux: ${created.stderr || created.stdout || `exit ${created.code}`}`);
  }
  // Sessions must never outlive the app process: a leftover shell with cwd inside
  // an encrypted mount would keep the volume busy after logout and block unmounting.
  registerProcessCleanup();
  await runTmux(['set-option', '-t', sessionId, 'history-limit', '5000']);
  return { sessionId, cwd, terminalMode, createdAt: new Date().toISOString() };
}

export async function writeToSession(chatId, sessionId, options = {}) {
  await assertSession(chatId, sessionId);
  const text = options.text === undefined || options.text === null ? '' : String(options.text);
  const keys = String(options.keys || '').trim();
  const pressEnter = options.pressEnter !== false;
  if (!text && !keys) throw createError(400, 'Envie text (texto literal) e/ou keys (tecla especial).');

  if (text) {
    const typed = await runTmux(['send-keys', '-t', sessionId, '-l', '--', text]);
    if (typed.code !== 0) throw createError(500, `Falha ao digitar na sessão: ${typed.stderr || typed.stdout}`);
    if (pressEnter) {
      const entered = await runTmux(['send-keys', '-t', sessionId, 'Enter']);
      if (entered.code !== 0) throw createError(500, `Falha ao enviar Enter: ${entered.stderr || entered.stdout}`);
    }
  }
  if (keys) {
    if (!SPECIAL_KEY_PATTERN.test(keys)) {
      throw createError(400, `Tecla especial inválida: "${keys}". Aceitas: Enter, Escape, Tab, Space, BSpace, Up/Down/Left/Right, Home/End, PageUp/PageDown, DC, F1-F12, C-<letra>, M-<letra>.`);
    }
    const sent = await runTmux(['send-keys', '-t', sessionId, keys]);
    if (sent.code !== 0) throw createError(500, `Falha ao enviar tecla: ${sent.stderr || sent.stdout}`);
  }

  return readSession(chatId, sessionId, options);
}

export async function readSession(chatId, sessionId, options = {}) {
  await assertSession(chatId, sessionId);
  const waitSeconds = clampInteger(options.waitSeconds, 0, 180, 0);
  if (waitSeconds > 0) await sleep(waitSeconds * 1000, options.signal);
  const lines = clampInteger(options.lines, 10, 2000, 200);
  const captured = await runTmux(['capture-pane', '-p', '-J', '-t', sessionId, '-S', `-${lines}`]);
  if (captured.code !== 0) throw createError(500, `Falha ao capturar a tela da sessão: ${captured.stderr || captured.stdout}`);
  let output = captured.stdout.replace(/\s+$/, '');
  let truncated = false;
  if (output.length > MAX_CAPTURE_CHARS) {
    output = output.slice(-MAX_CAPTURE_CHARS);
    truncated = true;
  }
  const running = await runTmux(['list-panes', '-t', sessionId, '-F', '#{pane_current_command}']);
  return {
    sessionId,
    output,
    truncated,
    waitedSeconds: waitSeconds,
    currentCommand: running.code === 0 ? running.stdout.trim() : null,
    capturedAt: new Date().toISOString(),
  };
}

export async function closeSession(chatId, sessionId) {
  await assertSession(chatId, sessionId);
  const killed = await runTmux(['kill-session', '-t', sessionId]);
  if (killed.code !== 0) throw createError(500, `Falha ao encerrar sessão: ${killed.stderr || killed.stdout}`);
  return { sessionId, closed: true };
}

async function assertSession(chatId, sessionId) {
  if (!sessionBelongsToChat(sessionId, chatId)) {
    throw createError(403, 'Sessão de terminal não pertence a este chat.');
  }
  const exists = await runTmux(['has-session', '-t', `=${sessionId}`]);
  if (exists.code !== 0) {
    throw createError(404, `Sessão "${sessionId}" não existe (pode ter sido encerrada). Use list/open.`);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createError(499, 'Execução interrompida pelo usuário.'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createError(499, 'Execução interrompida pelo usuário.'));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function killTmuxServerSync() {
  try {
    spawnSync('tmux', ['-L', getSocketLabel(), 'kill-server'], { timeout: 3000 });
  } catch {
    // Best effort: if tmux is already gone there is nothing to clean.
  }
}

function registerProcessCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.on('exit', killTmuxServerSync);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      killTmuxServerSync();
      process.exit(128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 1));
    });
  }
}
