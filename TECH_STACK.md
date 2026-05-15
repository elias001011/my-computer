# Technology Stack

## UI decision

The web UI will be built with **React**, not plain HTML/JS.

Pure HTML/JS is fine for a throwaway prototype, but this project is a long-lived control plane with:

- session switching
- streaming terminal output
- settings forms
- confirmation dialogs
- logs and activity timelines
- future skill management
- future voice and vision workflows

That combination benefits from a component model and explicit state management.

## Core stack for the MVP

### Frontend

- **React** - component-based UI for the control surface.
- **TypeScript** - type safety across UI and backend contracts.
- **Vite** - fast local development and simple production builds.
- **TanStack Query** - server-state fetching, caching, and mutation flows.
- **Zustand** - lightweight local UI state for active session, drawer states, and ephemeral controls.
- **React Hook Form** - forms for settings, env vars, sessions, and confirmations.
- **Zod** - shared validation for client and server payloads.
- **Radix UI** - accessible primitives for dialogs, tabs, dropdowns, tooltips, and menus.
- **xterm.js** - browser terminal rendering.
- **cmdk** - command palette / quick actions.
- **Lucide** - icons.

### Backend

- **Node.js 24+** - runtime.
- **Fastify** - HTTP API and server-side orchestration.
- **ws** - real-time streaming for terminal and event updates.
- **Zod** - request validation and schema definitions.
- **Pino** - structured logging.
- **SQLite** - local persistent store for the MVP.
- **Drizzle ORM** - typed SQL access and migration path.
- **node-pty** - PTY-backed local terminal sessions.

### AI and model adapters

- **Ollama** - default local model runner.
- **LocalAI** - optional OpenAI-compatible self-hosted provider.
- **llama.cpp** - low-level local model path when we want direct control.
- **OpenAI-compatible endpoints** - a provider interface, not a dependency on one SaaS.

## Optional integrations later

- **whisper.cpp** - local speech-to-text.
- **Piper** - local text-to-speech.
- **frp** - self-hosted reverse tunnel option.
- **WireGuard** - secure remote networking option.
- **OpenCV** - if we need image preprocessing for camera workflows.

## Deliberately not default

- **ngrok** - third-party tunnel service.
- **Cloudflare Tunnel** - not self-hosted by default.
- **Electron** - not needed for the web-first product.
- **Next.js** - more framework than we need for the first release.

## Why this stack

- It keeps the UI flexible enough for future features.
- It keeps the backend simple and fully local.
- It favors pluggable providers over hard-coded model assumptions.
- It stays aligned with the self-hosted positioning.

