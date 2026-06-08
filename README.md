# My Computer

Updated on 2026-06-08.

My Computer is a local web panel for chatting with an AI assistant and letting it use tools on your machine with explicit control. It is built for long-running work: persistent memory, isolated sections/users, file attachments, provider routing, web search, terminal tools, backups, and local models through Ollama.

The app runs on your own machine with Node.js. The browser is only the UI; chats, attachments, memory files, settings, and event logs live in a local runtime folder separate from the source code.

## Quick Start

Install and open the panel:

```bash
./install.sh
```

After the first install:

```bash
npm run start:open
```

Use `./install.sh --fresh` to move the current runtime aside and show the initial setup again. Use `./uninstall.sh` to remove the install while preserving data, or `./uninstall.sh --remove-data` to delete chats, attachments, memories, and settings too.

## What It Does

- Chat with online or local models in one UI.
- Let the AI use terminal, web search, memory, attachments, and context compaction through tools.
- Ask for approval before sensitive tool calls.
- Keep persistent memory per chat and per isolated section.
- Add Markdown/text files as user memory.
- Run privacy-focused offline sections backed by Ollama.
- Export and restore runtime data.
- Switch the panel UI between English and Brazilian Portuguese.

## What Stays Local

By default, data lives in `~/.my-computer`. New isolated sections live in `~/.my-computer/profiles/<id>`.

This includes:

- chat history
- copied attachments
- persistent memory
- additional user memory files
- provider, model, tool, and UI settings
- execution events for audit/debug

Files added to user memory are copied into the My Computer runtime. If the AI edits a memory file, it edits that runtime copy, not the original file you uploaded from outside the app.

## Practical Safety

Local tools can require approval before they run. Web search in `Terminal` or `Both` mode also follows tool approval when `Always allow any tool` is off, because it may make a public DuckDuckGo query from your machine.

Offline mode is configured per section. It forces Ollama, blocks online providers in the backend, disables native provider search, and removes external provider/model fallback routes. If web search is enabled in an offline section, the prompt instructs the AI to use neutral, generic searches without private names, paths, code, memory, terminal output, or user messages.

## Sections And Isolation

The panel supports isolated sections/users. The `Default` section keeps the old runtime at `~/.my-computer`; new sections use `~/.my-computer/profiles/<id>`.

Each section has its own:

- chats and attachments
- provider/model/tool configuration
- global persistent memory
- additional persistent memory files
- local event log

Switch sections from the sidebar, or manage them in `General settings > Sections`. Each browser tab sends the active section with API calls, and the backend freezes that scope during the request to avoid mixing data between tabs.

## Offline Mode

In `General settings > Identity`, enable `Offline mode for this section` to run a privacy-focused local section.

Offline mode:

- forces the default provider and chats to `Ollama`
- blocks online provider calls in the backend
- disables native provider search
- removes fallback routing to external providers
- keeps the UI focused on Ollama and local options

## Requirements

- Node.js 20 or newer.
- Git, for repository-based updates.
- npm, for dependencies.
- Python 3, only when using terminal-backed web search.
- One or more API keys, depending on the providers you use.
- Optional: Ollama for local models.

Optional tools:

- `ollama` for local models, `pull`, and local vision tests.
- `python3` for terminal-backed web search when `tools.searchMode` is `terminal` or `both`.
- `sudo` only if you want the app to install/remove Ollama automatically.

## Install

Use the root entrypoint:

```bash
./install.sh
```

`install.sh` is a small wrapper around `scripts/bootstrap.sh`. End users should use `./install.sh`; `scripts/bootstrap.sh` is the internal maintenance script.

Common commands:

- first install or dependency check: `./install.sh`
- start after installation: `npm run start:open` or `npm run start`
- prepare dependencies/runtime without starting the server: `./install.sh --no-start`
- reset the runtime and show setup again: `./install.sh --fresh`

Flags:

```bash
./install.sh --fresh
./install.sh --no-open
./install.sh --no-start
./install.sh --port 8788
./install.sh --host 127.0.0.1
```

- `--fresh` moves the current runtime to a backup and shows initial setup again.
- `--no-open` starts without opening the browser.
- `--no-start` installs dependencies and prepares the runtime without starting the server.
- `--port` chooses the panel port.
- `--host` chooses the bind host.

The script also respects:

- `MY_COMPUTER_HOME`
- `PORT`
- `HOST`

## Start

After installation:

```bash
npm run start:open
npm run start
node src/cli/mc.js start --open
```

- `npm run start:open` starts the server and opens the browser.
- `npm run start` starts the server without opening the browser.
- `node src/cli/mc.js start --open` uses the same internal CLI.

Diagnostics:

```bash
npm run doctor
node src/cli/mc.js doctor
```

## Uninstall

```bash
./uninstall.sh
```

By default this removes `node_modules` and preserves the runtime at `~/.my-computer`.

To delete chats, attachments, memory, and settings too:

```bash
./uninstall.sh --remove-data
```

Other options:

- `--keep-data` preserves the runtime.
- `--yes` is a shortcut for `--remove-data`.
- `./uninstall.sh --help` prints full help.

## First Use

1. Install with `./install.sh`.
2. Open the panel and follow initial setup, or adjust later in `General settings`.
3. Choose a provider and add API keys.
4. Adjust panel theme, interface language, AI response language, and technical level.
5. Configure Ollama if you want local models.
6. Open `Model index` to review selectable and informational models.
7. Type your first message and send it. If no chat exists yet, the app creates one automatically.

## Interface Language

The panel UI defaults to English so the project is easier to share internationally. In `General settings > Identity`, change `Interface language` to `Portuguese` to use the panel in Brazilian Portuguese.

This is separate from `AI response language`: interface language translates the app UI; AI response language controls the preferred language for model replies.

## Providers

Supported providers:

- OpenAI
- Anthropic
- Gemini
- Groq
- xAI
- OpenRouter
- Hugging Face
- Ollama
- OpenAI-compatible endpoints

API keys are stored in the local runtime config. Multiple keys per provider are supported; the backend rotates keys when one fails because of rate limits, authentication, or temporary provider errors.

## Web Search

Search modes:

- `Off`: no web search tool.
- `Native`: provider-side search when supported.
- `Terminal`: local terminal-backed DuckDuckGo search.
- `Both`: try native search first, then terminal fallback if native search fails or returns empty.

Terminal search is still a local tool. If tool approval is required, the UI asks before running it.

## Persistent Memory

The app has two memory layers:

- Global Markdown memory for the active section.
- Additional user memory files copied into the runtime.

Additional files can be sent with every prompt, or only exposed as an index. When only the index is sent, the AI can use `persistent_memory_user` to list/read files as needed. If editing is enabled, `edit_persistent_memory_user` proposes text replacements and asks for approval unless automatic tool approval is enabled.

## Attachments And Editable Documents

Files attached in a chat are copied into the My Computer runtime. The original file outside the app is not modified.

Text-like attachments such as Markdown, plain text, HTML, JSON, YAML, CSV, code, and logs can be opened from the chat viewer and edited manually. When the `chat_document` tool is enabled, the AI can also list, read, replace snippets, or rewrite those chat documents. The tool requires approval unless `Always allow any tool` is enabled, because reads can expose attachment contents to the selected provider.

When an attachment is removed, My Computer deletes the saved runtime copy and redacts message snapshots, pending tool state, saved context files, image data URLs, and related event previews so the removed content is not sent in later prompts or included in backups.

This is separate from persistent memory: editable chat documents stay attached to the conversation, while additional memory files are durable context that can be used across chats in the active section.

## Backup And Restore

In `General settings > Backup`, export/import includes:

- configuration and providers
- persistent memory
- additional user memory files
- chats and messages
- attachments
- events

The import dialog lets you choose which parts to restore.

## Development

```bash
npm install
npm test
node --check src/panel/app.js src/server/assistant.js src/server/tools.js src/server/server.js
git diff --check
```

Project docs:

- [CONTRIBUTING.md](CONTRIBUTING.md) explains development setup, validation, and PR checklist.
- [SECURITY.md](SECURITY.md) explains the local-first security model and how to report vulnerabilities.
- [RELEASE.md](RELEASE.md) documents the release checklist.

## License

Check the repository license before redistributing modified builds.
