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
        timeoutSeconds: {
          type: 'number',
          description:
            'Optional timeout in seconds, from 1 to 300. Use a short timeout for inspection and a longer one for explicit long-running tasks.',
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

export const persistentMemoryToolDefinition = {
  type: 'function',
  function: {
    name: 'persistent_memory',
    description:
      'Read or update the global persistent Markdown memory shared across all chats. Use it for stable user preferences, identity details, long-running project facts, and reusable context that should be available beyond the current chat.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'append'],
          description:
            'read returns the current persistent memory. write replaces it with the full edited Markdown. append adds new Markdown notes.',
        },
        content: {
          type: 'string',
          description: 'Markdown content. Required for write and append.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for this persistent memory operation.',
        },
      },
      required: ['action', 'reason'],
      additionalProperties: false,
    },
  },
};

export const compactContextToolDefinition = {
  type: 'function',
  function: {
    name: 'compact_context',
    description:
      'Compact the current chat transcript into durable Markdown context. Use this when the current conversation is getting long, when important context should be preserved, or before the context window gets too full.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Short reason for compacting this chat context now.',
        },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  },
};

export const renameChatToolDefinition = {
  type: 'function',
  function: {
    name: 'rename_chat',
    description:
      'Rename the current chat with a short, descriptive title. Usually call this after the first user message if the current title is generic, and call it later if the chat topic changes substantially.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short chat title, ideally 3 to 8 words.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for renaming the chat.',
        },
      },
      required: ['title', 'reason'],
      additionalProperties: false,
    },
  },
};

export async function runTerminalCommand(command, options = {}) {
  const requestedTimeoutMs = Number(options.timeoutSeconds ? options.timeoutSeconds * 1000 : options.timeoutMs);
  const timeoutMs = Math.min(
    Math.max(requestedTimeoutMs || Number(process.env.MC_SHELL_TIMEOUT_MS || 120000), 1000),
    300000,
  );
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
      env: { ...process.env, CI: process.env.CI || '1' },
      shell: process.env.SHELL || true,
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    child.stdin?.end();

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
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

function killProcessTree(child) {
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
    setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }, 1500).unref();
  } catch {
    child.kill('SIGTERM');
  }
}

function collect(current, next, limit) {
  if (current.length >= limit) return { value: current, truncated: true };
  const remaining = limit - current.length;
  if (next.length > remaining) {
    return { value: current + next.slice(0, remaining), truncated: true };
  }
  return { value: current + next, truncated: false };
}
