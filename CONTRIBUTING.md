# Contributing

Thanks for helping improve My Computer. The project is intentionally local-first, practical, and readable: a contributor should be able to inspect the code and understand how data moves through the app.

## Getting Started

Use Node.js 20 or newer.

```bash
./install.sh --no-start
npm test
npm run start
```

For normal use, `./install.sh` is the user-facing entrypoint. `scripts/bootstrap.sh` is the internal bootstrap script used by the wrapper.

## Project Shape

- `src/server/` contains the local HTTP server, provider calls, tools, storage, and runtime import/export.
- `src/panel/` contains the browser UI in plain HTML/CSS/JS.
- `tests/` contains Node test runner coverage for stability and storage behavior.
- `docs/` contains architecture, UI, infrastructure, and security-oriented notes.

## Development Rules

- Keep changes scoped and easy to review.
- Prefer existing local patterns over new abstractions.
- Keep runtime data out of git.
- Update docs when user-facing behavior changes.
- Add or adjust tests when changing storage, backup/restore, tool execution, provider routing, uploads, or destructive actions.
- Do not weaken tool approval, offline mode, path isolation, or backup handling without documenting the security impact.

## Validation

Before opening a PR, run:

```bash
node --check src/server/store.js src/server/server.js src/server/assistant.js src/panel/app.js
npm test
git diff --check
```

Adjust the `node --check` file list to match the JavaScript files you changed.

## Pull Request Checklist

- What changed is clear from the title and description.
- Tests pass locally, or the PR explains why they could not run.
- New user-facing behavior is documented.
- Backup/restore behavior is considered for new persisted state.
- Destructive actions have explicit confirmation.
- Security-sensitive changes call out risk and mitigation.

