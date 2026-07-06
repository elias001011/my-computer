import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
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

export const terminalSessionToolDefinition = {
  type: 'function',
  function: {
    name: 'terminal_session',
    description:
      'Persistent interactive terminal sessions (tmux-backed). Unlike run_terminal_command (stateless, one command per call), a session keeps shell state between calls: working directory, environment, REPLs, and long-running interactive programs. Flow: open a session, write text into it (Enter is pressed by default), wait waitSeconds, and the visible screen comes back; call read to wait/poll again without typing; close when done. Prefer run_terminal_command for simple one-shot commands. The user can watch this same session live and type into it through the Terminal window in the panel -- if a program asks for a password or manual step, ask the user to open the Terminal window and do it there, then continue.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['open', 'write', 'read', 'list', 'close'],
          description:
            'open creates a session and returns its sessionId. write types text and/or a special key into the session, waits waitSeconds, and returns the screen. read only waits waitSeconds and returns the screen. list returns the sessions of this chat. close ends a session.',
        },
        sessionId: {
          type: 'string',
          description: 'Session id returned by open or list. Required for write, read, and close.',
        },
        text: {
          type: 'string',
          description: 'Literal text to type for write. Sent followed by Enter unless pressEnter is false.',
        },
        keys: {
          type: 'string',
          description:
            'Optional special key for write, sent after text when both are given. Accepted: Enter, Escape, Tab, Space, BSpace, Up, Down, Left, Right, Home, End, PageUp, PageDown, DC, F1-F12, C-<letter> (Ctrl, e.g. C-c), M-<letter> (Alt).',
        },
        pressEnter: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Whether to press Enter after text. Default true. Set false to type without submitting.',
        },
        waitSeconds: {
          type: 'number',
          description:
            'Seconds to wait before capturing the screen, from 0 to 180. Use small values for prompts and larger ones for slow commands; if the screen still shows work in progress, call read again with a larger waitSeconds instead of retyping.',
        },
        lines: {
          type: 'number',
          description: 'How many terminal lines to return, from 10 to 2000. Omit to use the user-configured default.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true, because the captured screen is meant to inform the next step. Strings like "true" or "false" are accepted for compatibility.',
        },
      },
      required: ['action'],
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
      'Create a new user-added persistent memory text file, or edit an existing one by replacing an exact oldText snippet with newText. Use only when user memory files should be kept up to date and this tool is enabled.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['replace', 'create'],
          description:
            'replace edits an existing file: provide fileId or fileName plus oldText and newText. create adds a brand-new file: provide fileName and content. Defaults to replace when omitted.',
        },
        fileId: {
          type: 'string',
          description: 'ID of the file to edit with action replace. Prefer fileId from persistent_memory_user list.',
        },
        fileName: {
          type: 'string',
          description:
            'Name of the file to edit when fileId is not available (action replace), or the file name to create (action create, e.g. "project-x-notes.md"). Use a Markdown or plain-text extension.',
        },
        oldText: {
          type: 'string',
          description: 'Exact text currently present in the file. Required for action replace. The app replaces only the first exact match.',
        },
        newText: {
          type: 'string',
          description: 'Replacement text. Required for action replace.',
        },
        content: {
          type: 'string',
          description: 'Full Markdown/text content for the new file. Required for action create.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for this memory-file change.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Whether the app should send the edit result back to the model. Usually true when you will continue reasoning.',
        },
      },
      required: ['reason'],
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

export const sendFileToolDefinition = {
  type: 'function',
  function: {
    name: 'send_file',
    description:
      'Deliver a file to the user as a chat attachment they can view/download. create writes new text content you author (Markdown, code, JSON, CSV, plain text) into a brand-new file -- use it for reports, docs, data exports. attach sends an existing file already on disk (for example an image produced by a script you ran through run_terminal_command/terminal_session, such as a background-removed PNG) -- attach is only available when a terminal tool is enabled, since that is what can produce or locate the file in the first place.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'attach'],
          description: 'create authors new text content into a new file. attach reads an existing file from disk and sends it as-is.',
        },
        fileName: {
          type: 'string',
          description: 'Name for the file shown to the user, with extension (e.g. relatorio.md, sem-fundo.png). For attach, defaults to the source file name when omitted.',
        },
        content: {
          type: 'string',
          description: 'Full text content of the new file. Required for create. Must be a text-like format (Markdown/text/JSON/CSV/code/etc), not an image or other binary -- use attach for those.',
        },
        path: {
          type: 'string',
          description: 'Absolute path (or path relative to the terminal home) of an existing file to send. Required for attach.',
        },
        mimeType: {
          type: 'string',
          description: 'Optional MIME type override. Guessed from the file extension when omitted.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true so you can confirm the file was delivered. Strings like "true" or "false" are accepted for compatibility.',
        },
      },
      required: ['action', 'fileName'],
      additionalProperties: false,
    },
  },
};

export const fileEditToolDefinition = {
  type: 'function',
  function: {
    name: 'edit_file',
    description:
      'Read, list, and edit real files on the user machine (project source, scripts, config, web code -- anything the user can access), not just chat attachments. Use it to inspect a directory, read a file, make a precise replace of an exact snippet, or write/create a whole file. This is the tool for editing a project the user pointed you at (via an @ path citation or by asking). For running/building/moving files or anything sudo, use the terminal instead. Prefer replace over write when changing part of an existing file, and read the file first so oldText matches exactly.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'replace', 'write', 'create'],
          description:
            'list returns directory entries at path. read returns file text (paginated). replace swaps one exact oldText snippet for newText in an existing file. write overwrites an existing file with content. create makes a new file with content (fails if it already exists).',
        },
        path: {
          type: 'string',
          description:
            'Absolute path, or path relative to the configured project root (or the user home when no project root is set). For list, a directory; otherwise a file.',
        },
        oldText: {
          type: 'string',
          description: 'Exact text currently in the file, for replace. Must match exactly once -- include enough surrounding context to be unique.',
        },
        newText: {
          type: 'string',
          description: 'Replacement text for replace.',
        },
        content: {
          type: 'string',
          description: 'Full file content for write and create.',
        },
        offset: {
          type: 'number',
          description: 'Character offset for read pagination. Use nextOffset from a truncated read to continue.',
        },
        limit: {
          type: 'number',
          description: 'Maximum characters to return for read. Defaults to 20000; max 100000.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for this file operation.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true, because list/read results and edit confirmations inform the next step.',
        },
      },
      required: ['action', 'path', 'reason'],
      additionalProperties: false,
    },
  },
};

export const browserToolDefinition = {
  type: 'function',
  function: {
    name: 'browser',
    description:
      'Open a web page in a real headless browser (Chromium) to see or read it. screenshot renders the page to a PNG image delivered as a chat attachment -- if the current model supports vision, the image is also sent to you so you can analyze the layout; otherwise you still get the saved path. read returns the fully rendered DOM/text after JavaScript runs, which is more accurate than a raw fetch for modern sites. Use this to inspect a site, check how a page looks, or validate web changes you just made (e.g. a local dev server URL).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['screenshot', 'read'],
          description: 'screenshot captures the rendered page as a PNG image. read returns the rendered DOM/text of the page.',
        },
        url: {
          type: 'string',
          description: 'The URL to open (http/https, or a file:// path). A local dev server like http://localhost:3000 is fine.',
        },
        fullPage: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'For screenshot: capture the full scrollable page instead of just the viewport. Default false.',
        },
        width: {
          type: 'number',
          description: 'Viewport width in pixels for screenshot, from 320 to 3840. Default 1280.',
        },
        height: {
          type: 'number',
          description: 'Viewport height in pixels for screenshot, from 240 to 2160. Default 800.',
        },
        waitSeconds: {
          type: 'number',
          description: 'Seconds to let the page settle before capturing, from 0 to 30. Default 3.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true, so the screenshot reference or page text informs the next step.',
        },
      },
      required: ['action', 'url'],
      additionalProperties: false,
    },
  },
};

export const readSkillToolDefinition = {
  type: 'function',
  function: {
    name: 'read_skill',
    description:
      'List or read user-authored skills -- durable step-by-step guidance for a specific recurring task (a CLI workflow, a house style, how to do some process this user cares about). The system prompt already lists every skill name and description; call this with action read before relying on a skill whose description matches the current task, since only the full body (fetched here) has the actual instructions.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read'],
          description: 'list returns the name+description index again. read returns the full body of one skill by skillId or name.',
        },
        skillId: {
          type: 'string',
          description: 'ID of the skill to read. Prefer this when known from the system prompt index.',
        },
        name: {
          type: 'string',
          description: 'Name of the skill to read when skillId is not available.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for reading this skill.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true, since the skill body is meant to inform the next reasoning step.',
        },
      },
      required: ['action', 'reason'],
      additionalProperties: false,
    },
  },
};

export const getEnvVarToolDefinition = {
  type: 'function',
  function: {
    name: 'get_env_var',
    description:
      'Reveal the literal value of a configured secret/environment variable. Do NOT use this to run terminal commands -- every configured variable is already injected into the terminal/session process environment automatically, so a command you write can reference it as $NAME directly without ever calling this tool (e.g. gh auth login --with-token <<< "$GITHUB_TOKEN" just works). Only call get_env_var when you genuinely need the literal value for something a shell reference cannot do, such as writing it into a file with edit_file/send_file. Calling this sends the actual secret value into this conversation, and therefore to the cloud provider unless the provider is local Ollama -- avoid it whenever a $NAME reference in a terminal command would do the job instead.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the variable to reveal, exactly as listed in the system prompt index.',
        },
        reason: {
          type: 'string',
          description: 'Short reason this needs the literal value instead of a $NAME shell reference.',
        },
        returnOutput: {
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
          description: 'Usually true, since the value is meant to inform the next step (e.g. writing it somewhere).',
        },
      },
      required: ['name', 'reason'],
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
      'Send an email. The destination address is fixed by the user in the Email settings and cannot be chosen or overridden here -- this tool never accepts a recipient.',
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
      ? { ...process.env, CI: process.env.CI || '1', HOME: isolatedHome, MC_TERMINAL_MODE: 'isolated', ...options.secretsEnv }
      : { ...process.env, CI: process.env.CI || '1', MC_TERMINAL_MODE: 'standard', ...options.secretsEnv };
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

const CHROMIUM_CANDIDATES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
  'chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

async function isExecutable(candidate) {
  try {
    await fs.access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Zero-dep "which": if the candidate is a path, test it directly; otherwise walk PATH.
// Same philosophy as tmux/python3 -- shell out to a system binary, never bundle one.
async function resolveExecutable(candidate) {
  if (!candidate) return null;
  if (candidate.includes(path.sep)) {
    return (await isExecutable(candidate)) ? candidate : null;
  }
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, candidate);
    if (await isExecutable(full)) return full;
  }
  return null;
}

export async function detectBrowserBinary(configuredPath = '') {
  const configured = String(configuredPath || '').trim();
  if (configured) {
    const resolved = await resolveExecutable(configured);
    if (resolved) return resolved;
    return null;
  }
  for (const candidate of CHROMIUM_CANDIDATES) {
    const resolved = await resolveExecutable(candidate);
    if (resolved) return resolved;
  }
  return null;
}

// Drive a headless Chromium as a discrete, stateless operation (one launch per call),
// exactly like the python3-backed web search: no persistent driver, no npm dependency.
// screenshot returns PNG bytes; read returns the post-JS rendered DOM. Live console
// capture and interactive multi-step navigation are intentionally out of scope here --
// they would need a CDP/WebSocket layer, which is a separate, heavier piece.
export async function runBrowser(action, url, options = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return { action, error: 'url is required.' };
  if (!/^(https?:|file:)/i.test(cleanUrl)) {
    return { action, error: 'url must start with http://, https://, or file://.' };
  }
  const binary = await detectBrowserBinary(options.binaryPath);
  if (!binary) {
    return {
      action,
      error:
        'No Chromium/Chrome binary found. Install Google Chrome or Chromium (e.g. "apt install chromium" / "brew install --cask google-chrome"), or set the browser binary path in the Browser settings.',
    };
  }

  const waitSeconds = Math.min(Math.max(Number(options.waitSeconds ?? 3), 0), 30);
  const virtualTimeBudget = Math.max(1000, Math.round(waitSeconds * 1000) || 3000);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-browser-'));
  const userDataDir = path.join(tempDir, 'profile');
  const baseArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--disable-extensions',
    '--no-first-run',
    `--user-data-dir=${userDataDir}`,
    `--virtual-time-budget=${virtualTimeBudget}`,
  ];

  let args;
  let outputPath = null;
  if (action === 'screenshot') {
    const width = Math.min(Math.max(Number(options.width || 1280), 320), 3840);
    // Full-page capture over the CLI is not reliable; a taller window is a best-effort
    // stand-in that captures more of the page without a CDP driver.
    const height = options.fullPage
      ? Math.min(Math.max(Number(options.height || 800) * 5, 2400), 12000)
      : Math.min(Math.max(Number(options.height || 800), 240), 2160);
    outputPath = path.join(tempDir, 'screenshot.png');
    args = [...baseArgs, `--window-size=${width},${height}`, `--screenshot=${outputPath}`, cleanUrl];
  } else {
    args = [...baseArgs, '--dump-dom', cleanUrl];
  }

  const spawnTimeoutMs = (waitSeconds + 30) * 1000;
  const result = await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    const child = spawn(binary, args, { windowsHide: true });
    child.stdin?.end();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => {
      killProcessTree(child);
      done({ timedOut: true, stdout, stderr });
    }, spawnTimeoutMs);
    const abortListener = () => {
      killProcessTree(child);
      done({ aborted: true, stdout, stderr });
    };
    options.signal?.addEventListener?.('abort', abortListener, { once: true });
    child.stdout?.on('data', (chunk) => {
      const collected = collect(stdout, chunk.toString(), 200000);
      stdout = collected.value;
      stdoutTruncated ||= collected.truncated;
    });
    child.stderr?.on('data', (chunk) => {
      stderr = collect(stderr, chunk.toString(), 8000).value;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener?.('abort', abortListener);
      done({ error: error.message, stdout, stderr });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      options.signal?.removeEventListener?.('abort', abortListener);
      done({ exitCode, stdout, stdoutTruncated, stderr });
    });
  });

  try {
    if (result.aborted) return { action, error: 'Execução interrompida pelo usuário.', aborted: true };
    if (result.timedOut) return { action, error: `Browser timed out after ${waitSeconds + 30}s loading ${cleanUrl}.` };
    if (result.error) return { action, error: `Failed to launch browser: ${result.error}` };

    if (action === 'screenshot') {
      let imageBuffer;
      try {
        imageBuffer = await fs.readFile(outputPath);
      } catch {
        return { action, error: `Browser did not produce a screenshot.${result.stderr ? ` (${result.stderr.trim().slice(0, 400)})` : ''}` };
      }
      if (!imageBuffer.length) return { action, error: 'Screenshot came back empty.' };
      return { action, url: cleanUrl, imageBase64: imageBuffer.toString('base64'), mimeType: 'image/png', bytes: imageBuffer.length };
    }

    const dom = String(result.stdout || '').trim();
    if (!dom) return { action, error: `Browser returned no page content.${result.stderr ? ` (${result.stderr.trim().slice(0, 400)})` : ''}` };
    return { action, url: cleanUrl, dom, truncated: Boolean(result.stdoutTruncated) };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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
