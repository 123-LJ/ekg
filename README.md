# EKG (Experience Knowledge Graph)

EKG is a lightweight “agent memory” toolkit for coding workflows.

It helps agents and humans reuse **real, verified engineering experience** (bugs, fixes, decisions) instead of re-discovering the same problems in every session.

## What you get

- **Pre-edit recall**: before editing a file, the host can query EKG and inject relevant past experience.
- **Post-task capture**: when a task ends, EKG creates a *reviewable candidate* (not auto-writing unverified lessons).
- **Safe by default**: local runtime artifacts (sqlite / generated mirrors / private experiences) are excluded from Git.
- **SQLite primary storage** + JSON/Markdown mirrors for portability.

## Host support

- **Claude**: full hook automation (`PreToolUse`, `Stop`, `SubagentStop`)
- **Codex**: official `model_instructions_file` integration (stable), hooks kept optional/experimental

## Quick start

```powershell
git clone https://github.com/123-LJ/ekg.git
cd ekg

# Install into hosts
node scripts/install-host.js --host claude
node scripts/install-host.js --host codex

# Use the CLI
node scripts/ekg.js help
node scripts/ekg.js query "redirect"
```

## The recommended workflow

1) **Before editing**: query by keyword/file and read the top matches.

2) **After finishing**: let the host create a capture candidate, then accept it only when verified:

```powershell
node scripts/ekg.js capture-status
node scripts/ekg.js capture-accept C001 --confirm
```

## Documentation

- [Usage Guide](./usage-guide.md)
- [Host Integration](./host-integration.md)
- [GitHub Publishing](./github-publishing.md)
- [Skill Guide](./SKILL.md)
- 中文版本（文档导航）: [README.zh-CN.md](./README.zh-CN.md)

## Validate

```powershell
node tests/run.js
```

