import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runtimeHome } from './paths.js';

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
            'Optional timeout in seconds, from 1 to 900. Use a short timeout for inspection and a longer one for explicit long-running tasks.',
        },
        returnOutput: {
          type: 'boolean',
          description:
            'Whether the app should send this command output back to the model. Use true when you need stdout/stderr to continue; use false for fire-and-forget actions.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

export const webSearchToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the public web when current information, source-backed answers, links, prices, schedules, or recent documentation matter. Return sources and cite them in the final answer.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in the user language when possible.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for searching.',
        },
        maxResults: {
          anyOf: [{ type: 'number' }, { type: 'string' }],
          description: 'Optional number of results, from 1 to 8. Strings like "5" are accepted.',
        },
        returnOutput: {
          type: 'boolean',
          description: 'Usually true. Set false only if you do not need search results back in the next reasoning step.',
        },
      },
      required: ['query', 'reason'],
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
        returnOutput: {
          type: 'boolean',
          description: 'Whether the app should send the memory tool result back to the model. Usually true for reads, optional for writes/appends.',
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
        returnOutput: {
          type: 'boolean',
          description: 'Whether the app should send the memory tool result back to the model. Usually true for reads, optional for writes/appends.',
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
        returnOutput: {
          type: 'boolean',
          description: 'Whether the app should send the compaction summary back to the model. Use false when no follow-up reasoning is needed.',
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
        returnOutput: {
          type: 'boolean',
          description:
            'Whether the app should send the rename result back to the model. Usually false because renaming is a side effect and does not need follow-up.',
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
    900000,
  );
  const outputLimit = Number(options.outputLimit || process.env.MC_SHELL_OUTPUT_LIMIT || 40000);
  const startedAt = Date.now();
  const terminalMode = options.terminalMode === 'isolated' ? 'isolated' : 'standard';
  const isolatedHome = path.join(runtimeHome, 'isolated-terminal');
  if (terminalMode === 'isolated') await fs.mkdir(isolatedHome, { recursive: true, mode: 0o700 });
  const cwd = options.cwd || (terminalMode === 'isolated' ? isolatedHome : process.env.HOME || os.homedir());
  const env =
    terminalMode === 'isolated'
      ? { ...process.env, CI: process.env.CI || '1', HOME: isolatedHome, MC_TERMINAL_MODE: 'isolated' }
      : { ...process.env, CI: process.env.CI || '1', MC_TERMINAL_MODE: 'standard' };
  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;

  return new Promise((resolve) => {
    const child = spawn(String(command || ''), {
      cwd,
      env,
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
        terminalMode,
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
        terminalMode,
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

export async function runWebSearch(query, options = {}) {
  const cleanQuery = String(query || '').trim();
  const maxResults = Math.min(Math.max(Number(options.maxResults || 5), 1), 8);
  if (!cleanQuery) {
    return {
      query: cleanQuery,
      method: 'terminal-duckduckgo-html',
      results: [],
      error: 'query is required',
    };
  }

  const queryBase64 = Buffer.from(cleanQuery, 'utf8').toString('base64');
  const command = `python3 - <<'PY'
import base64, html, json, re, urllib.parse, urllib.request
query = base64.b64decode('${queryBase64}').decode('utf-8')
url = 'https://duckduckgo.com/html/?q=' + urllib.parse.quote(query)
request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 MyComputer/0.1'})
with urllib.request.urlopen(request, timeout=20) as response:
    page = response.read().decode('utf-8', 'replace')
items = []
for match in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, re.S):
    href = html.unescape(match.group(1))
    title = re.sub('<[^>]+>', ' ', match.group(2))
    title = html.unescape(re.sub(r'\\s+', ' ', title)).strip()
    snippet = ''
    block = page[match.end():match.end()+1600]
    snippet_match = re.search(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', block, re.S)
    if snippet_match:
        snippet = html.unescape(re.sub('<[^>]+>', ' ', snippet_match.group(1)))
        snippet = re.sub(r'\\s+', ' ', snippet).strip()
    if href.startswith('//duckduckgo.com/l/?uddg='):
        parsed = urllib.parse.urlparse('https:' + href)
        href = urllib.parse.unquote(urllib.parse.parse_qs(parsed.query).get('uddg', [''])[0]) or href
    items.append({'title': title, 'url': href, 'snippet': snippet})
    if len(items) >= ${maxResults}:
        break
print(json.dumps({'query': query, 'method': 'terminal-duckduckgo-html', 'results': items}, ensure_ascii=False))
PY`;

  const terminalResult = await runTerminalCommand(command, {
    timeoutSeconds: 30,
    outputLimit: 20000,
    terminalMode: options.terminalMode,
  });

  try {
    const parsed = JSON.parse(terminalResult.stdout || '{}');
    return {
      ...parsed,
      terminal: {
        exitCode: terminalResult.exitCode,
        durationMs: terminalResult.durationMs,
        stderr: terminalResult.stderr,
      },
    };
  } catch {
    return {
      query: cleanQuery,
      method: 'terminal-duckduckgo-html',
      results: [],
      terminal: terminalResult,
      error: terminalResult.stderr || 'Search command did not return valid JSON.',
    };
  }
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
