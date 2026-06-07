# Security Policy

My Computer is a local-first control panel for AI workflows. It can store API keys, chat history, uploaded files, persistent memory, and terminal outputs in the local runtime, so security issues should be treated seriously.

## Supported Versions

The project is currently pre-1.0. Security fixes target the current `main` branch unless a release branch exists.

## Reporting a Vulnerability

Please report vulnerabilities privately when possible:

- Prefer GitHub Security Advisories for this repository.
- If advisories are unavailable, open an issue with a minimal description and avoid posting secrets, exploit payloads, or private files.

Helpful reports include:

- affected version or commit
- operating system and Node.js version
- whether LAN mode or offline mode was enabled
- exact steps to reproduce
- expected versus actual behavior
- why the issue can expose data, execute commands, bypass approval, or corrupt local state

## Security Model

- The app stores user data under `~/.my-computer` by default, or `MY_COMPUTER_HOME` when configured.
- Sections are runtime-level isolation inside the same local app, not separate operating-system users.
- API keys are stored locally in config JSON. Treat backups as sensitive.
- LAN mode uses Basic Auth and is intended for trusted local networks only.
- Offline mode blocks online providers and native provider search, but terminal commands can still access the network if the user enables terminal search or asks for network commands.
- Terminal tools run as the current OS user unless the user explicitly configures sudo outside the app.

## Security Review Checklist

Before merging changes that touch tools, providers, storage, uploads, backup/restore, network access, or terminal execution:

- run `npm test`
- run `node --check` on changed JavaScript files
- run `git diff --check`
- verify no secrets or runtime data were committed
- confirm destructive actions require explicit user confirmation
- confirm backup/restore handles the new data shape
- update README or docs when behavior changes

## Sensitive Data

Do not commit:

- API keys or provider tokens
- exported backups
- files from `~/.my-computer`
- chat logs containing private data
- terminal outputs with secrets

