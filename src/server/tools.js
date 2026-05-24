import { spawn } from 'node:child_process';
import os from 'node:os';

export const terminalToolDefinition = {
  type: 'function',
  function: {
    name: 'run_terminal_command',
    description:
      'Run a shell command on the user machine. Use this before the final answer when local files, terminal state, or host actions are needed.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The exact shell command to execute.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

export const memoryChatToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_chat',
    description:
      'Read or update the durable Markdown memory for the current chat. Use it when the conversation contains stable preferences, decisions, paths, facts, or TODOs that should survive context compaction.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'append'],
          description:
            'read returns the current memory. write replaces the file with the full edited Markdown. append adds new Markdown notes.',
        },
        content: {
          type: 'string',
          description:
            'Markdown content. Required for write and append. For write, send the full desired memory file.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for this memory operation.',
        },
      },
      required: ['action', 'reason'],
      additionalProperties: false,
    },
  },
};

export async function runTerminalCommand(command, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.MC_SHELL_TIMEOUT_MS || 120000);
  const outputLimit = Number(options.outputLimit || process.env.MC_SHELL_OUTPUT_LIMIT || 40000);
  const startedAt = Date.now();
  const cwd = options.cwd || process.env.HOME || os.homedir();
  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;

  return new Promise((resolve) => {
    const child = spawn(String(command || ''), {
      cwd,
      env: process.env,
      shell: process.env.SHELL || true,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const collected = collect(stdout, chunk.toString(), outputLimit);
      stdout = collected.value;
      stdoutTruncated ||= collected.truncated;
    });

    child.stderr.on('data', (chunk) => {
      const collected = collect(stderr, chunk.toString(), outputLimit);
      stderr = collected.value;
      stderrTruncated ||= collected.truncated;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        durationMs: Date.now() - startedAt,
        timedOut,
        truncated: stdoutTruncated || stderrTruncated,
      });
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        truncated: stdoutTruncated || stderrTruncated,
      });
    });
  });
}

function collect(current, next, limit) {
  if (current.length >= limit) return { value: current, truncated: true };
  const remaining = limit - current.length;
  if (next.length > remaining) {
    return { value: current + next.slice(0, remaining), truncated: true };
  }
  return { value: current + next, truncated: false };
}
