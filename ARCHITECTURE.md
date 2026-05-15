# Architecture

## Overview

My Computer is designed as a local control plane that keeps the browser, the orchestration layer, and the host machine separated by clear boundaries.

```text
Browser
  -> Web dashboard
  -> Local HTTP API
  -> State store + event log
  -> Optional shell executor
  -> Future AI provider adapters
```

## Current shape

- `public/` will contain the React/Vite frontend build output.
- `server.js` serves static assets and JSON API endpoints.
- `lib/state.js` owns the application state model and mutation helpers.
- `lib/assistant.js` provides a lightweight local assistant response generator and shell runner.
- `data/state.json` stores runtime state on disk.

## Frontend stack

- React for the application shell and workspace components.
- TypeScript for shared contracts and safer refactors.
- Vite for local development and production builds.
- xterm.js for terminal rendering inside the browser.
- Radix UI primitives for dialogs, menus, tabs, and overlays.

## Backend stack

- Node.js for the first server and future agent process.
- Fastify for API routing and request handling.
- WebSocket streaming for terminal and event updates.
- SQLite + Drizzle for durable local state.
- node-pty for PTY-backed command execution.

## Data flow

1. The browser loads the dashboard from the local server.
2. The UI fetches the current state from `/api/state`.
3. User actions create sessions, send chat messages, update config, and add env variables.
4. The server mutates the local state store and appends a log entry for each action.
5. Terminal commands are only executed when shell execution is explicitly enabled.

## Extension points

- **AI providers:** add adapters for Ollama, OpenAI-compatible endpoints, or fully local models.
- **Skills:** define manifests that declare permissions, inputs, outputs, and required capabilities.
- **Remote access:** add a dedicated secure transport layer after authentication and authorization exist.
- **Agent process:** split the host execution layer into a separate local agent when the architecture needs stronger isolation.
