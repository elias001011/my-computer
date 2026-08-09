# My Computer

Updated on 2026-07-05.

My Computer is a local web panel for chatting with an AI assistant and letting it use tools on your machine with explicit control. It is built for long-running work: persistent memory, isolated sections/users, file attachments, provider routing, web search, terminal tools (one-shot and persistent sessions), real file editing, a headless-browser tool, reusable skills, custom slash commands, environment-variable secrets, provider routing, backups, and local models through Ollama.

The app runs on your own machine with Node.js. The browser is only the UI; chats, attachments, memory files, skills, custom commands, secrets, settings, and event logs live in a local runtime folder separate from the source code.

## Quick Start

Install and open the panel:

```bash
./install.sh
```

After the first install:

```bash
npm run start:open
```

Use `./install.sh --fresh` to move the current runtime aside and show the initial setup again. Use `./uninstall.sh` to remove the install while preserving data (it will also offer to remove optional dependencies it detects, such as tmux, Ollama, or Chromium/Chrome -- see [Uninstall](#uninstall)), or `./uninstall.sh --remove-data` to delete chats, attachments, memories, and settings too.

## What It Does

- Chat with online or local models in one UI.
- Let the AI use terminal, web search, memory, attachments, and context compaction through tools.
- Run one-shot terminal commands, or open persistent, stateful terminal sessions (tmux-backed) the AI and the user can both watch and type into.
- Let the AI read, list, and edit real files on your machine (not just chat attachments) -- with a configurable project root, and approval before anything gets written.
- Let the AI open a headless Chromium to screenshot a page (sent back to the AI too, if the current model supports vision) or read its rendered DOM/text.
- Let the AI create or attach files as chat deliverables (reports, generated documents, or files produced by a script it ran).
- Save reusable "skills": short, user-authored (or AI-improved) Markdown instructions for a specific recurring task. Only the name and description sit in the prompt by default; the full body loads on demand.
- Define custom `/slash` commands: a fixed prompt with its own pre-approved tool allowlist, triggered live in the current chat.
- Store secrets (API tokens, keys) as named environment variables. Only the name and description ever reach the model -- terminal commands can reference `$NAME` and get the real value injected directly into the process environment, without the model ever seeing it. A separate, always-approved tool exists for the rare case where the literal value is genuinely needed.
- Optionally auto-continue a run that stopped mid-task on a recoverable error or limit, instead of waiting for you to click Continue.
- Keep typing while the model works: a message sent during a run is queued instead of interrupting it, and is either handed to the model on its next call ("Complementos do usuário") or sent as a normal message once the run finishes -- your choice.
- Watch a discreet chronometer while the AI works, with the elapsed time of every attempt kept in View details.
- Edit a past message: the conversation forks from that point (the previous branch, with its replies, stays viewable), and it re-runs from the edited message.
- Ask for approval before sensitive tool calls; an "always allow" override is available per section.
- Keep persistent memory per chat and per isolated section.
- Add Markdown/text files as user memory.
- Run privacy-focused offline sections backed by Ollama.
- Export and restore runtime data.
- Switch the panel UI between English and Brazilian Portuguese.
- Schedule recurring tasks (daily/weekly/monthly/interval) with their own provider, model, tool allowlist, and reduced-context option, run by an internal timer.
- Search user memory files by keyword instead of reading them whole.
- Send outbound email (Resend) to a single fixed address you configure -- available as a tool only inside scheduled tasks/custom commands, plus an automatic notification when a scheduled task fails.
- Drag and drop files onto the composer to attach them, or use the file picker (both support multiple files per message).
- A mobile layout where chat history/navigation lives in an off-canvas drawer (opened by a button next to the chat title) instead of a permanent strip at the top of a small screen.

## What Stays Local

By default, data lives in `~/.my-computer`. New isolated sections live in `~/.my-computer/profiles/<id>`.

This includes:

- chat history
- copied attachments
- persistent memory
- additional user memory files
- skills
- custom commands
- secrets (environment variable values)
- provider, model, tool, and UI settings
- execution events for audit/debug

Files added to user memory are copied into the My Computer runtime. If the AI edits a memory file, it edits that runtime copy, not the original file you uploaded from outside the app. `edit_file`, in contrast, is the tool that edits real files on your machine directly (outside the runtime) -- see [File Editing](#file-editing-edit_file).

## Practical Safety

Local tools can require approval before they run. Web search in `Terminal` or `Both` mode also follows tool approval when `Always allow any tool` is off, because it may make a public DuckDuckGo query from your machine.

`Always allow any tool` is a single global override, not a per-tool setting: turning it on skips the confirmation step for every tool, including the terminal, file editing, and the browser. A few tools still always ask regardless (for example, `get_env_var`, which is the one path that can send a secret's literal value into the conversation).

Offline mode is configured per section. It forces Ollama, blocks online providers in the backend, disables native provider search, and removes external provider/model fallback routes. The Ollama endpoint must be local (`localhost`, `127.0.0.1`, `::1`, or a local socket); remote Ollama-compatible URLs are rejected while offline mode is enabled. If terminal-backed web search is enabled in an offline section, the app still requires explicit approval even when `Always allow any tool` is on, and the prompt instructs the AI to use neutral, generic searches without private names, paths, code, memory, terminal output, or user messages.

## Sections And Isolation

The panel supports isolated sections/users. The `Default` section keeps the old runtime at `~/.my-computer`; new sections use `~/.my-computer/profiles/<id>`.

Each section has its own:

- chats and attachments
- provider/model/tool configuration
- global persistent memory
- additional persistent memory files
- skills, custom commands, and secrets
- local event log

Switch sections from the sidebar, or manage them in `General settings > Sections`. Each browser tab sends the active section with API calls, and the backend freezes that scope during the request to avoid mixing data between tabs. The chat sidebar currently stays flat and searchable to keep navigation simple; on narrow/mobile screens it becomes an off-canvas drawer instead of a permanent strip (see [Mobile Layout](#mobile-layout)).

## Terminal

`General settings > Terminal` has two layers:

- **Standard (`run_terminal_command`)**: one command per call. Each call spawns fresh, runs to completion or timeout (1-900s), and the process ends -- no state (cwd, environment, a REPL) is kept between calls.
- **Advanced (`terminal_session`, tmux-backed, off by default)**: persistent sessions that keep shell state between calls -- working directory, environment variables, REPLs, and long-running interactive programs. Open a session, write text into it (Enter is pressed by default), and the visible screen comes back after `waitSeconds`; read polls again without typing; close it when done. A Terminal window in the panel lets you watch the same session live and type into it directly (for passwords, sudo prompts, or anything the AI cannot type) without that input ever being logged or sent to the AI.

Advanced mode has its own per-chat and global session limits, an idle timeout, and requires `tmux` installed on the host (a clear error explains how to install it if missing). Configured secrets (see [Secrets](#secrets--environment-variables)) are injected into every spawned command's/session's environment automatically.

## File Editing (`edit_file`)

Off by default (`General settings > Tools`). Lets the AI list a directory, read a file, replace an exact snippet, write a whole file, or create a new one -- on real files on your machine, not just chat attachments. This is the tool for working on a project you point the AI at (see the `@` path citation below).

Reading and listing are free; writing, replacing, or creating a file requires approval, the same bar as the terminal -- this is not a new access boundary, since the terminal already reaches the whole filesystem. An optional project root can be configured so relative paths resolve predictably and the AI knows what project it is working in.

## Browser Tool

Off by default. Shells out to a headless Chromium/Chrome already installed on your machine (auto-detected on PATH, or point it at a specific binary in settings) -- the same "call an external system binary" philosophy as `tmux`/`python3`, no bundled browser, no Playwright/Puppeteer dependency.

Two actions:

- `screenshot`: renders the page to a PNG, delivered as a chat attachment. If the current model supports vision, the image is also sent back to the AI so it can analyze the layout; otherwise the AI still gets the saved path.
- `read`: returns the fully rendered DOM/text after JavaScript runs.

Each call is stateless (a fresh browser launch per call, nothing persists between calls). Live console output and interactive, stateful navigation (click/type/navigate across multiple calls) are not implemented yet -- they would need a hand-rolled CDP/WebSocket layer, which is a deliberately separate, heavier piece of work.

## Skills

Reusable, user-authored (or AI-improved) step-by-step guidance for a specific recurring task -- a CLI workflow, a house style, how you like something done. Manage them in `General settings > Skills`.

Only each skill's name and description are ever included in the system prompt; the full body is fetched on demand by the AI through the `read_skill` tool when a skill looks relevant to the task at hand -- the same progressive-disclosure pattern user memory files already use, so having many skills does not bloat every prompt. A "Melhorar com IA" (Improve with AI) button in the editor runs a one-off completion against your current default provider/model to suggest a clearer rewrite of the body; nothing is written to disk until you save it yourself.

## Custom Commands

Manage them in `General settings > Comandos`. A custom command has a name, a `/trigger`, a fixed prompt, an optional extra system prompt, and its own tool allowlist.

Typing `/trigger` at the very start of a chat message (anywhere, any chat) runs that command's fixed prompt inline in the current conversation, with its allowlisted tools pre-approved for that turn -- no interactive approval popup, the same "nobody needs to click approve" model a scheduled task uses, just triggered live instead of on a timer. Any text typed after the trigger is appended as extra context. A command's allowlist can only narrow tools that are already enabled globally in that section; it can never grant access to a tool that is off.

## Secrets / Environment Variables

Manage them in `General settings > Variáveis de ambiente`. Store a name, a description, and a value (kept in the local runtime, same plaintext-file model as provider API keys -- protected by file permissions and, if you run this behind full-disk/section encryption, whatever that provides, not by app-level cryptography).

Only the name and description are ever included in the system prompt -- the AI never sees the value as a matter of course. Instead, every configured secret is injected directly into the environment of every spawned terminal command and every opened terminal session, so a shell command the AI writes can reference `$NAME` (for example, `gh auth login --with-token <<< "$GITHUB_TOKEN"`) and have it resolve correctly without the literal value ever entering a prompt or a tool result.

`get_env_var` is the deliberate, off-by-default escape hatch for the rarer case where the literal value is genuinely needed for something a shell reference cannot do (writing it into a file, for instance). It always requires approval, and using it does send the value into the conversation -- and to the selected cloud provider, unless that provider is local Ollama.

## Auto Continue

Off by default (`General settings > Tools`). When a run stops mid-task on a recoverable error or a tool-round limit (the same situation that normally shows a "Continue" button), the app resumes it automatically instead of waiting for you to click it. It never fires while a tool is waiting on your approval, never after you explicitly stopped a run, and is capped at a bounded number of automatic continuations per turn so a repeatedly failing tool cannot loop forever.

## Messages Sent While The Model Is Working

The composer stays writable during a run. With text in it, the stop button becomes a send button, and what you send is queued rather than interrupting the work. Two modes (`General settings > Tools`):

- **Na próxima tool** (default): the queue is handed to the model on its next call to the provider, in a "Complementos do usuário" block. Nothing is interrupted and nothing already done is lost -- useful to add context or change direction in the middle of a long task. Delivered complements are recorded in View details.
- **Sequencial**: the queue waits for the model's final output and is then sent as a normal message.

In both modes, anything the run never picked up is sent as a normal message right after it settles. Attachments are not queued: they stay in the tray for your next normal message.

## Run Chronometer

While the AI is working, a small counter sits above the send button. It measures machine time only -- the clock stops while a tool call waits for your approval. Every attempt stores its duration, shown in View details even if you turn the on-screen counter off (`General settings > Identity`).

## Token Use And Prompt Caching

Two settings and one built-in behaviour keep a long agentic run from getting needlessly expensive:

- **Prompt caching is automatic on most providers** (OpenAI, DeepSeek, Zhipu/GLM, Moonshot, Groq and other OpenAI-compatible endpoints) as long as the beginning of the request does not change between calls. My Computer keeps that prefix stable: the clock injected into the system prompt is rounded to a 10-minute bucket instead of carrying an exact timestamp, so an entire agent loop reuses the same cached prefix. Anthropic does not cache automatically, so its requests carry explicit `cache_control` breakpoints on the system prompt and the tool schemas. Nothing to configure, and no provider is required to support it -- where it is unavailable, requests are simply billed as usual.
- **Limite de saída de tools por mensagem** (`General settings > Context`) caps how much raw tool output the model carries inside a single message. Without it, an investigation chaining 20+ terminal calls stacks every dump into one request, which is both the largest item on the token bill and the usual reason a run ends on `length`. Over the cap, the oldest results of that turn collapse to a short note and the recent ones stay intact.
- **Limite de histórico enviado** (same section) caps the message history carried between messages.

## Editing Messages

Editing a past user message forks the conversation at that point: the message updates, everything that came after it (the old text and any replies it got) is archived onto that message's edit history instead of being deleted, the live conversation truncates to end at the edited message, and it re-runs from there. The archived branch stays viewable through an "editada" chip on the message, which opens the previous version and what it led to. Only user messages are editable; assistant turns already have separate retry/continue actions.

## Requirements

- Node.js 20 or newer.
- Git, for repository-based updates.
- npm, for dependencies.
- Python 3, only when using terminal-backed web search.
- One or more API keys, depending on the providers you use.
- Optional: Ollama for local models.
- Optional: `tmux`, for persistent/advanced terminal sessions.
- Optional: Chromium or Google Chrome, for the browser tool.

Optional tools:

- `ollama` for local models, `pull`, and local vision tests.
- `python3` for terminal-backed web search when `tools.searchMode` is `terminal` or `both`.
- `tmux` for advanced/persistent terminal sessions. Without it installed, advanced mode returns a clear error explaining how to install it; the rest of the app is unaffected.
- `chromium`/`google-chrome` for the browser tool. Without it installed, the tool returns a clear error explaining how to install it; the rest of the app is unaffected.
- `sudo` only if you want the app to install/remove Ollama automatically.

None of these optional tools are installed by My Computer itself -- it only shells out to them if they are already present, and the uninstaller only ever offers to remove what it finds, never removes anything automatically (see [Uninstall](#uninstall)).

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

To delete chats, attachments, memory, skills, custom commands, secrets, and settings too:

```bash
./uninstall.sh --remove-data
```

### Interactive optional-dependency cleanup

Right after removing `node_modules`, and only when run from an interactive terminal (a script or CI invocation skips this step automatically), the uninstaller checks your system for **optional** tools My Computer can use but never installs by itself: `tmux`, `ollama`, and Chromium/Chrome. For each one it finds, it explains what My Computer used it for and asks, one at a time, whether to remove it too -- it never removes anything without asking, because the script has no way to know whether you installed that tool just for My Computer or already rely on it for something else.

What it does per tool, if you say yes:

- **tmux**: removed via your system's package manager (apt/dnf/yum/pacman/Homebrew, auto-detected). If the package manager isn't recognized, or tmux was installed some other way, it tells you the manual command instead of guessing.
- **ollama**: the service/binary and the downloaded local models are asked about **separately**, because models can be several gigabytes and you may want to keep them (to use with another app, for example) even if you remove the ollama service itself. If ollama runs as a systemd service, that service is stopped and disabled before the binary is removed.
- **Chromium/Chrome**: same package-manager-based removal as tmux, whichever browser binary was actually detected (`google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, or `chrome`).

`python3` is deliberately left out of this check: it is a base dependency of the operating system itself on nearly every Linux/macOS install, and removing it can break unrelated parts of your system. If you are certain you only installed it for My Computer, remove it manually through your system's package manager.

Skip the whole interactive step (for scripted/unattended uninstalls, or if you just don't want to be asked):

```bash
./uninstall.sh --no-deps
```

Other options:

- `--keep-data` preserves the runtime (default).
- `--yes` is a shortcut for `--remove-data`.
- `./uninstall.sh --help` prints full help, including the flags above.

## First Use

1. Install with `./install.sh`.
2. Open the panel and follow initial setup, or adjust later in `General settings`.
3. Choose a provider and add API keys.
4. Adjust panel theme, interface language, AI response language, and technical level.
5. Configure Ollama if you want local models.
6. Type your first message and send it. If no chat exists yet, the app creates one automatically.

## Interface Language

The panel UI defaults to English so the project is easier to share internationally. In `General settings > Identity`, change `Interface language` to `Portuguese` to use the panel in Brazilian Portuguese.

This is separate from `AI response language`: interface language translates the app UI; AI response language controls the preferred language for model replies.

The interface translation mechanism currently works by matching rendered Portuguese strings against a translation table after each render, not a proper key-based i18n system -- newly added UI text can go untranslated in English mode until a matching entry is added. If you rely on the English UI daily and spot untranslated Portuguese text, please open an issue.

## Mobile Layout

On narrow screens, the sidebar (new chat, sections, search, chat history) is hidden by default and opens as an off-canvas drawer instead of a permanent strip at the top of the screen -- tap the hamburger button next to the chat title to open it, tap the backdrop or the drawer's own close button to dismiss it. It closes automatically when you pick a chat, start a new one, or open settings. Chat settings stay in their usual place (the mobile settings entry at the bottom of the chat).

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
- OpenAI-compatible endpoints (this also covers providers like Alibaba Model Studio, Moonshot AI, and Zhipu/Z.ai -- see the in-app help text next to the OpenAI-compatible provider field for their base URLs)

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

Skills (see [Skills](#skills)) use the same progressive-disclosure shape but are a distinct concept: they are task instructions the AI decides to consult, not durable facts about you or the project.

## Attachments And Editable Documents

Files attached in a chat are copied into the My Computer runtime. The original file outside the app is not modified. Attach files with the file picker or by dragging and dropping them onto the composer; both support multiple files per message.

Text-like attachments such as Markdown, plain text, HTML, JSON, YAML, CSV, code, and logs can be opened from the chat viewer and edited manually, downloaded, or (for images) copied to the clipboard -- and the viewer shows the exact path where the file is stored inside the My Computer runtime. When the `chat_document` tool is enabled, the AI can also list, read, replace snippets, or rewrite those chat documents. The tool requires approval unless `Always allow any tool` is enabled, because reads can expose attachment contents to the selected provider.

When an attachment is removed, My Computer deletes the saved runtime copy and redacts message snapshots, pending tool state, saved context files, image data URLs, and related event previews so the removed content is not sent in later prompts or included in backups.

This is separate from persistent memory: editable chat documents stay attached to the conversation, while additional memory files are durable context that can be used across chats in the active section. It is also separate from `edit_file`, which edits real files on your machine directly, not the runtime copy of something you attached.

## `@` Mentions

Typing `@` in the composer opens a dropdown: pick a currently enabled tool to insert a plain-language nudge suggesting the AI use it (never a forced tool call), or pick the path-citation entry to point the AI at a specific file or directory on your machine (`@path:/some/path`) -- useful together with `edit_file` or the terminal when you want the AI working on a specific project without re-explaining where it lives every time.

## Backup And Restore

In `General settings > Backup`, export/import includes:

- configuration and providers
- persistent memory
- additional user memory files
- chats and messages
- attachments
- events

Skills, custom commands, and secrets are not yet included in export/import -- back those up manually if you rely on them.

The import dialog lets you choose which parts to restore. Restore runs with a rollback snapshot of the active runtime, so a failed import does not leave half-applied memory/config/chat changes. If chats are restored without attachments, old attachment contents are redacted from messages, tool traces, pending state, memory, and context before the chat is written.

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
