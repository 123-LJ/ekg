# EKG (Experience Knowledge Graph)

EKG is a lightweight local memory toolkit for coding agents and engineering workflows.

It helps humans and agents reuse **verified engineering experience** — bugs, fixes, decisions, patterns — instead of rediscovering the same lessons in every session.

## What you get

- **Pre-edit recall**: query prior experience before touching known files or hotspots
- **Post-task capture**: create reviewable capture candidates after work is done
- **SQLite primary storage** with JSON / Markdown mirrors for portability
- **Project context layer**: active project root resolution for Codex / Claude workflows
- **Portable backup package**: export and restore EKG across machines
- **Local HTML panel**: generate a browser-openable dashboard from current EKG data

## Host support

- **Claude**: hook automation for `PreToolUse`, `Stop`, `SubagentStop`
- **Codex**: `model_instructions_file` integration plus optional strong hook mode

## Quick start

```powershell
git clone https://github.com/123-LJ/ekg.git
cd ekg

# Install into hosts
node scripts/install-host.js --host claude
node scripts/install-host.js --host codex
node scripts/install-host.js --host codex --codex-mode strong

# Use the CLI
node scripts/ekg.js help
node scripts/ekg.js query "redirect"
node scripts/ekg.js panel
```

## Recommended workflow

1. **Before editing**: run `query` or let the host hook inject relevant experience.
2. **During coding**: keep work inside the active project root when possible.
3. **After finishing**: review and accept the generated capture candidate only after verification.

```powershell
node scripts/ekg.js capture-status
node scripts/ekg.js capture-accept C001 --confirm
```

## Local panel

Generate a local dashboard:

```powershell
node scripts/ekg.js panel
```

Generate and open it directly:

```powershell
node scripts/ekg.js panel --open
```

Default output:

- `ekg-out/panel/index.html`

Current panel features:

- snapshot metrics
- browser-side query helper
- experience detail drawer
- related experience suggestions
- graph summary
- CLI command hints

## Documentation

- [Usage Guide](./usage-guide.md)
- [Panel Architecture](./docs/ARCHITECTURE.md)
- [Panel UI Spec](./docs/EKG-UI交互设计规范.md)
- [Host Integration](./host-integration.md)
- [GitHub Publishing](./github-publishing.md)
- [Skill Guide](./SKILL.md)
- [中文文档](./README.zh-CN.md)

## Validate

```powershell
node tests/run.js
```
