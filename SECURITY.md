# Security

## Principles

- Default to local-only.
- Default to least privilege.
- Never expose the shell directly to the internet.
- Make destructive actions explicit and visible.
- Log every important system action.
- Keep telemetry off unless the user opts in.

## Current protections

- Shell execution is disabled by default.
- The dashboard runs on a local port by default.
- State is stored locally in a file under `data/`.
- Terminal actions are logged.

## Threats to account for next

- Remote access without authentication.
- Command injection through chat-to-shell workflows.
- Unsafe skill execution.
- Secret leakage through logs or UI rendering.
- Over-permissive execution of local commands.

## Hardening checklist for the next stage

- Add authentication before remote exposure.
- Add permission scopes for shell, files, and tools.
- Add explicit command confirmation for destructive actions.
- Separate the agent process from the web server.
- Encrypt or protect sensitive configuration values.
- Add audit logs with clear provenance.

