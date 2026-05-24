import { spawn } from 'node:child_process';
import { projectRoot } from './paths.js';
import { runTerminalCommand } from './tools.js';

export async function getUpdateStatus(options = {}) {
  const inside = await runGit('git rev-parse --is-inside-work-tree', { allowFailure: true, timeoutSeconds: 5 });
  if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
    return {
      available: false,
      updateAvailable: false,
      canApply: false,
      reason: 'Esta instalação não parece ser um clone Git.',
      projectRoot,
    };
  }

  const branch = (await runGit('git branch --show-current', { allowFailure: true, timeoutSeconds: 5 })).stdout.trim();
  const remoteUrl = (await runGit('git remote get-url origin', { allowFailure: true, timeoutSeconds: 5 })).stdout.trim();
  const fetchResult = options.fetch === false ? null : await runGit('git fetch --prune', { allowFailure: true, timeoutSeconds: 90 });
  let upstream = (await runGit("git rev-parse --abbrev-ref --symbolic-full-name '@{u}'", {
    allowFailure: true,
    timeoutSeconds: 5,
  })).stdout.trim();

  if (!upstream && branch) {
    const candidate = `origin/${branch}`;
    const candidateResult = await runGit(`git rev-parse --verify ${shellQuote(candidate)}`, {
      allowFailure: true,
      timeoutSeconds: 5,
    });
    if (candidateResult.exitCode === 0) upstream = candidate;
  }

  const localCommit = (await runGit('git rev-parse HEAD', { allowFailure: true, timeoutSeconds: 5 })).stdout.trim();
  const statusPorcelain = (await runGit('git status --porcelain', { allowFailure: true, timeoutSeconds: 5 })).stdout;
  const dirty = Boolean(statusPorcelain.trim());

  if (!remoteUrl || !upstream) {
    return {
      available: true,
      updateAvailable: false,
      canApply: false,
      reason: 'Nenhum remote/upstream configurado para atualização automática.',
      branch,
      remoteUrl,
      upstream,
      localCommit,
      dirty,
      projectRoot,
      fetch: summarizeCommand(fetchResult),
    };
  }

  const upstreamCommit = (await runGit(`git rev-parse ${shellQuote(upstream)}`, {
    allowFailure: true,
    timeoutSeconds: 5,
  })).stdout.trim();
  const counts = (await runGit(`git rev-list --left-right --count HEAD...${shellQuote(upstream)}`, {
    allowFailure: true,
    timeoutSeconds: 10,
  })).stdout.trim();
  const [aheadRaw, behindRaw] = counts.split(/\s+/);
  const ahead = Number(aheadRaw || 0);
  const behind = Number(behindRaw || 0);
  const commits = (await runGit(`git log --oneline --max-count=8 HEAD..${shellQuote(upstream)}`, {
    allowFailure: true,
    timeoutSeconds: 10,
  })).stdout
    .trim()
    .split('\n')
    .filter(Boolean);

  return {
    available: true,
    updateAvailable: behind > 0,
    canApply: behind > 0 && !dirty,
    reason: dirty
      ? 'Há mudanças locais no código. Faça commit, stash ou descarte antes de atualizar pelo painel.'
      : behind > 0
        ? 'Atualização disponível.'
        : 'Instalação já está atualizada.',
    branch,
    remoteUrl,
    upstream,
    localCommit,
    upstreamCommit,
    ahead,
    behind,
    dirty,
    changedFiles: statusPorcelain
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, 20),
    commits,
    projectRoot,
    fetch: summarizeCommand(fetchResult),
    checkedAt: new Date().toISOString(),
  };
}

export async function applySourceUpdate() {
  const status = await getUpdateStatus({ fetch: true });
  if (!status.available) throwStatus(400, status.reason || 'Atualização indisponível.');
  if (status.dirty) throwStatus(409, status.reason);
  if (!status.upstream) throwStatus(400, status.reason || 'Remote/upstream não configurado.');
  if (!status.updateAvailable) {
    return {
      updated: false,
      status,
      result: null,
    };
  }

  const result = await runTerminalCommand('git pull --ff-only && npm install', {
    cwd: projectRoot,
    timeoutSeconds: 600,
    outputLimit: 60000,
  });
  if (result.exitCode !== 0) {
    const error = new Error(result.stderr || result.stdout || 'Falha ao atualizar My Computer.');
    error.statusCode = 500;
    error.details = result;
    throw error;
  }

  return {
    updated: true,
    status: await getUpdateStatus({ fetch: false }),
    result,
  };
}

export function restartProcess(options = {}) {
  const args = ['run', 'start', '--', '--port', String(options.port || process.env.PORT || 8787)];
  if (options.host) args.push('--host', String(options.host));
  const child = spawn('npm', args, {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

async function runGit(command, options = {}) {
  const result = await runTerminalCommand(command, {
    cwd: projectRoot,
    timeoutSeconds: options.timeoutSeconds || 30,
    outputLimit: options.outputLimit || 12000,
  });
  if (result.exitCode !== 0 && !options.allowFailure) {
    const error = new Error(result.stderr || result.stdout || `Comando falhou: ${command}`);
    error.statusCode = 500;
    error.details = result;
    throw error;
  }
  return result;
}

function summarizeCommand(result) {
  if (!result) return null;
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stderr: result.stderr,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function throwStatus(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
