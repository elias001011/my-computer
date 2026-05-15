# My Computer

My Computer is a self-hosted control center for a local AI assistant with a terminal-first workflow.

This repository currently contains the product plan, stack definition, UI spec, architecture notes, and security model.
It is intentionally the foundation for the first implementation pass.

## What exists now

- Product plan and MVP scope.
- Exact technology stack proposal.
- UI layout and interaction spec.
- Architecture and security notes.
- Installer stub and base project metadata.

## Current status

The first runnable app scaffold will come next.
The current repo state is aimed at documenting and locking the implementation plan before the UI and backend are built.

## Safety defaults

- Shell execution is off by default.
- The current server is meant for local use.
- Remote exposure should be added only after auth, transport security, and permission boundaries are in place.

## Project structure

- `package.json` - project metadata and future scripts.
- `install.sh` - bootstrap helper.
- `data/` - persisted runtime state placeholder.
- `ROADMAP.md` - product and delivery phases.
- `ARCHITECTURE.md` - system layout and data flow.
- `SECURITY.md` - security model and guardrails.
- `TECH_STACK.md` - exact technology choices and OSS integrations.
- `UI_SPEC.md` - dashboard layout and interaction model.

## Roadmap

See [ROADMAP.md](./ROADMAP.md).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Security

See [SECURITY.md](./SECURITY.md).
