import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getRuntimeHome } from './paths.js';

export const terminalToolDefinition = {
  type: 'function',
  function: {
    name: 'run_terminal_command',
    description:
      'Run a shell command on the user machine. Use this before the final answer when local files, terminal state, or host actions are needed. Do not use this as a substitute for public web search; local commands such as grep/find/rg search the user machine, not the web.',
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
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description:
            'Whether the app should send this command output back to the model. Use true when you need stdout/stderr to continue; use false for fire-and-forget actions. Strings like "true" or "false" are accepted for compatibility.',
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
      'Search the public web when current information, source-backed answers, links, prices, schedules, or recent documentation matter. This is the supported public web search path; do not use run_terminal_command, curl, grep, find, or rg as a substitute. Return sources and cite them in the final answer.',
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
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true. Set false only if you do not need search results back in the next reasoning step. Strings like "true" or "false" are accepted for compatibility.',
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
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Whether the app should send the memory tool result back to the model. Usually true for reads, optional for writes/appends. Strings like "true" or "false" are accepted for compatibility.',
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
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Whether the app should send the memory tool result back to the model. Usually true for reads, optional for writes/appends. Strings like "true" or "false" are accepted for compatibility.',
        },
      },
      required: ['action', 'reason'],
      additionalProperties: false,
    },
  },
};

export const persistentMemoryUserToolDefinition = {
  type: 'function',
  function: {
    name: 'persistent_memory_user',
    description:
      'List, read, or keyword-search user-added persistent memory files. Use this instead of terminal when the user memory file index suggests a file may contain durable context for the current answer. Prefer search over read when you only need to locate a specific fact across files without reading whole files.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'search'],
          description:
            'list returns the file index. read returns one compatible text file by fileId or fileName. search returns short snippets across all files containing keyword, with the file each snippet came from.',
        },
        fileId: {
          type: 'string',
          description: 'ID of the file to read. Prefer fileId from the index.',
        },
        fileName: {
          type: 'string',
          description: 'Name of the file to read when fileId is not available.',
        },
        keyword: {
          type: 'string',
          description: 'Keyword or phrase to search for across user memory files. Required for action search.',
        },
        offset: {
          type: 'number',
          description: 'Character offset for read pagination. Use nextOffset from a truncated read to continue.',
        },
        limit: {
          type: 'number',
          description: 'Maximum characters to return for read. Defaults to 20000; max 50000.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for reading or searching user persistent memory files.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true, because list/read results are meant to inform the next reasoning step.',
        },
      },
      required: ['action', 'reason'],
      additionalProperties: false,
    },
  },
};

export const editPersistentMemoryUserToolDefinition = {
  type: 'function',
  function: {
    name: 'edit_persistent_memory_user',
    description:
      'Edit a user-added persistent memory text file by replacing an exact oldText snippet with newText. Use only when user memory files should be kept up to date and the edit tool is enabled.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file to edit. Prefer fileId from persistent_memory_user list.',
        },
        fileName: {
          type: 'string',
          description: 'Name of the file to edit when fileId is not available.',
        },
        oldText: {
          type: 'string',
          description: 'Exact text currently present in the file. The app replaces only the first exact match.',
        },
        newText: {
          type: 'string',
          description: 'Replacement text.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for this memory-file edit.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Whether the app should send the edit result back to the model. Usually true when you will continue reasoning.',
        },
      },
      required: ['oldText', 'newText', 'reason'],
      additionalProperties: false,
    },
  },
};

export const chatDocumentToolDefinition = {
  type: 'function',
  function: {
    name: 'chat_document',
    description:
      'List, read, or edit text-like files attached to the current chat. This operates only on the copy saved inside My Computer, never on the original file outside the app. Use it for Markdown, text, HTML, JSON, YAML, XML, CSV, code, and logs that the user wants edited as chat artifacts.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'replace', 'write'],
          description:
            'list returns editable text attachments in this chat. read returns a paginated raw file chunk. replace swaps one exact oldText snippet. write replaces the whole document with content.',
        },
        attachmentId: {
          type: 'string',
          description: 'ID of the chat attachment. Prefer attachmentId from the attachment index.',
        },
        fileName: {
          type: 'string',
          description: 'Original file name when attachmentId is not available.',
        },
        offset: {
          type: 'number',
          description: 'Character offset for read pagination. Use nextOffset from a truncated read to continue.',
        },
        limit: {
          type: 'number',
          description: 'Maximum characters to return for read. Defaults to 20000; max 50000.',
        },
        oldText: {
          type: 'string',
          description: 'Exact text currently present in the document. Required for replace.',
        },
        newText: {
          type: 'string',
          description: 'Replacement text for replace.',
        },
        content: {
          type: 'string',
          description: 'Full desired document content. Required for write.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for reading or editing the chat document.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true for reads and edits when you need to continue reasoning.',
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
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Whether the app should send the compaction summary back to the model. Use false when no follow-up reasoning is needed. Strings like "true" or "false" are accepted for compatibility.',
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
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description:
            'Whether the app should send the rename result back to the model. Usually false because renaming is a side effect and does not need follow-up. Strings like "true" or "false" are accepted for compatibility.',
        },
      },
      required: ['title', 'reason'],
      additionalProperties: false,
    },
  },
};

export const sendEmailToolDefinition = {
  type: 'function',
  function: {
    name: 'send_email',
    description:
      'Send an email. The destination address is fixed by the user in the Email settings and cannot be chosen or overridden here -- this tool never accepts a recipient. Only available inside scheduled tasks that explicitly allow it.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Short email subject line.',
        },
        body: {
          type: 'string',
          description: 'Plain-text email body.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description:
            'Whether the app should send the send result back to the model. Strings like "true" or "false" are accepted for compatibility.',
        },
      },
      required: ['subject', 'body'],
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
  const isolatedBaseHome = options.runtimeHome || getRuntimeHome();
  const isolatedHome = path.join(isolatedBaseHome, 'isolated-terminal');
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
  let aborted = false;

  return new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve({
        command,
        cwd,
        terminalMode,
        exitCode: null,
        signal: 'ABORT',
        stdout,
        stderr: 'Execução interrompida pelo usuário.',
        durationMs: Date.now() - startedAt,
        timedOut,
        aborted: true,
        truncated: false,
      });
      return;
    }
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
    const abortListener = () => {
      aborted = true;
      killProcessTree(child);
    };
    options.signal?.addEventListener?.('abort', abortListener, { once: true });

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
      options.signal?.removeEventListener?.('abort', abortListener);
      resolve({
        command,
        cwd,
        terminalMode,
        exitCode: 1,
        signal: aborted ? 'ABORT' : undefined,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${aborted ? 'Execução interrompida pelo usuário.' : error.message}`,
        durationMs: Date.now() - startedAt,
        timedOut,
        aborted,
        truncated: stdoutTruncated || stderrTruncated,
      });
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener?.('abort', abortListener);
      resolve({
        command,
        cwd,
        terminalMode,
        exitCode,
        signal: aborted ? 'ABORT' : signal,
        stdout,
        stderr: aborted && !stderr ? 'Execução interrompida pelo usuário.' : stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        aborted,
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
      method: 'terminal-duckduckgo-lite',
      results: [],
      error: 'query is required',
    };
  }

  const queryBase64 = Buffer.from(cleanQuery, 'utf8').toString('base64');
  const command = `python3 - <<'PY'
import base64, html, json, re, sys, urllib.parse, urllib.request
query = base64.b64decode('${queryBase64}').decode('utf-8')
max_results = ${maxResults}
headers = {
    'User-Agent': 'Mozilla/5.0 MyComputer/0.1',
    'Accept': 'text/html,application/xhtml+xml',
}
query_variants = [query]
dequoted_query = re.sub(r'["“”]+', '', query).strip()
if dequoted_query and dequoted_query != query:
    query_variants.append(dequoted_query)

def search_endpoints(active_query):
    encoded_query = urllib.parse.quote(active_query)
    return [
        ('https://lite.duckduckgo.com/lite/?q=' + encoded_query, 'terminal-duckduckgo-lite', 'lite'),
        ('https://duckduckgo.com/lite/?q=' + encoded_query, 'terminal-duckduckgo-lite', 'lite'),
        ('https://html.duckduckgo.com/html/?q=' + encoded_query, 'terminal-duckduckgo-html', 'html'),
    ]

def clean_text(value):
    value = re.sub(r'<[^>]+>', ' ', value or '')
    value = html.unescape(value)
    return re.sub(r'\\s+', ' ', value).strip()

def anchor_attributes(anchor):
    start = re.match(r'<a\\b([^>]*)>', anchor, re.I | re.S)
    attrs = {}
    if not start:
        return attrs
    for name, quote, value in re.findall(r'([\\w:-]+)\\s*=\\s*([\\'"])(.*?)\\2', start.group(1), re.S):
        attrs[name.lower()] = html.unescape(value)
    return attrs

def decode_duckduckgo_href(href):
    href = html.unescape(href or '').strip()
    if href.startswith('//'):
        href = 'https:' + href
    elif href.startswith('/l/?'):
        href = 'https://duckduckgo.com' + href
    parsed = urllib.parse.urlparse(href)
    if parsed.netloc.endswith('duckduckgo.com') and parsed.path.startswith('/l/'):
        uddg = urllib.parse.parse_qs(parsed.query).get('uddg', [''])[0]
        if uddg:
            return urllib.parse.unquote(uddg)
    return href

def append_unique(items, seen, title, href, snippet):
    url = decode_duckduckgo_href(href)
    if not title or not url.startswith(('http://', 'https://')) or url in seen:
        return
    seen.add(url)
    items.append({'title': title, 'url': url, 'snippet': snippet})

def parse_lite(page):
    items = []
    seen = set()
    for match in re.finditer(r'<a\\b[^>]*>.*?</a>', page, re.I | re.S):
        anchor = match.group(0)
        attrs = anchor_attributes(anchor)
        href = attrs.get('href', '')
        css_class = attrs.get('class', '')
        if 'result-link' not in css_class and '/l/?' not in href and 'uddg=' not in href:
            continue
        title = clean_text(anchor)
        block = page[match.end():match.end() + 2200]
        snippet = ''
        snippet_match = re.search(r'<td[^>]+class=[\\'"][^\\'"]*result-snippet[^\\'"]*[\\'"][^>]*>(.*?)</td>', block, re.I | re.S)
        if snippet_match:
            snippet = clean_text(snippet_match.group(1))
        append_unique(items, seen, title, href, snippet)
        if len(items) >= max_results:
            break
    return items

def parse_html(page):
    items = []
    seen = set()
    for match in re.finditer(r'<a\\b[^>]*>.*?</a>', page, re.I | re.S):
        anchor = match.group(0)
        attrs = anchor_attributes(anchor)
        if 'result__a' not in attrs.get('class', ''):
            continue
        href = attrs.get('href', '')
        title = clean_text(anchor)
        block = page[match.end():match.end() + 1800]
        snippet = ''
        snippet_match = re.search(r'<a[^>]+class=[\\'"][^\\'"]*result__snippet[^\\'"]*[\\'"][^>]*>(.*?)</a>', block, re.I | re.S)
        if snippet_match:
            snippet = clean_text(snippet_match.group(1))
        append_unique(items, seen, title, href, snippet)
        if len(items) >= max_results:
            break
    return items

def page_looks_blocked(status, page):
    page_lower = (page or '').lower()
    return (
        status == 202
        or 'anomaly.js' in page_lower
        or 'unfortunately, bots use duckduckgo too' in page_lower
        or 'duckduckgo search temporarily unavailable' in page_lower
    )

attempts = []
for active_query in query_variants:
    for url, method, parser in search_endpoints(active_query):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=20) as response:
                status = getattr(response, 'status', response.getcode())
                page = response.read().decode('utf-8', 'replace')
            items = parse_lite(page) if parser == 'lite' else parse_html(page)
            blocked = page_looks_blocked(status, page)
            attempts.append({
                'query': active_query,
                'method': method,
                'status': status,
                'resultCount': len(items),
                'blocked': blocked,
            })
            if items:
                print(json.dumps({
                    'query': query,
                    'queryUsed': active_query,
                    'method': method,
                    'results': items,
                    'attempts': attempts,
                }, ensure_ascii=False))
                sys.exit(0)
        except Exception as exc:
            attempts.append({'query': active_query, 'method': method, 'error': str(exc)})

blocked = any(attempt.get('blocked') for attempt in attempts)
print(json.dumps({
    'query': query,
    'method': attempts[0]['method'] if attempts else 'terminal-duckduckgo-lite',
    'results': [],
    'attempts': attempts,
    'blocked': blocked,
    'rateLimited': blocked,
    'error': 'DuckDuckGo bloqueou ou limitou temporariamente a busca web terminal.' if blocked else 'DuckDuckGo nao retornou resultados publicos pela busca web terminal.',
}, ensure_ascii=False))
PY`;

  const terminalResult = await runTerminalCommand(command, {
    timeoutSeconds: 30,
    outputLimit: 20000,
    terminalMode: options.terminalMode,
    signal: options.signal,
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
