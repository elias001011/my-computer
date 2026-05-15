# UI Spec

## Product shape

The first version of the web UI will be a **single-page control surface** with three major zones.

### 1. Left rail

- Session list
- New session action
- Workspace switcher
- Quick access to settings, skills, and logs

### 2. Center workspace

- Chat thread with the assistant
- Composer for prompts and commands
- Terminal panel with streaming output
- Optional tab switch between chat and terminal when space is tight

### 3. Right inspector

- Active session details
- Provider configuration
- Environment variables
- Event log
- Safety status

## Interaction model

- Keyboard-first navigation where possible.
- Clear confirmations before destructive commands.
- Prominent state for whether shell execution is locked, enabled, or blocked.
- Session switching should be instant and visible.
- Terminal output should stream live, not appear as a single completed block.
- Logs should always show the provenance of an action.

## Visual direction

- Dark, technical, and calm.
- Graphite backgrounds with teal and amber accents.
- Strong separation between command surfaces and informational surfaces.
- Terminal area should feel like a real terminal, not a text box imitation.

## Responsive behavior

- Desktop: three-column control plane.
- Tablet: left rail compresses into a drawer, inspector moves below the workspace.
- Mobile: stacked panels with persistent quick actions.

## Initial component map

- `AppShell`
- `SessionRail`
- `WorkspaceTabs`
- `ChatPanel`
- `TerminalPanel`
- `ConfigInspector`
- `EnvEditor`
- `EventLog`
- `SafetyBanner`
- `ConfirmDialog`
- `CommandPalette`

