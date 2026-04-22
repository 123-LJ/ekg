# EKG

Experience Knowledge Graph for AI coding agents.

## What it does

- records real debugging experience
- queries past fixes before editing code
- injects short reminders into the agent context
- creates reviewable capture candidates after a task ends
- keeps a SQLite primary store with JSON/report mirrors for compatibility

## Supported agents

- Claude: full automatic hook integration
- Codex: automatic `model_instructions_file` integration, plus experimental hook template support
- Other agents: can reuse the CLI and installer templates

## Quick start

```powershell
git clone <your-repo-url> ekg-agent-memory
cd ekg-agent-memory
node scripts\install-host.js --host claude
node scripts\install-host.js --host codex
node scripts/ekg.js help
```

## Common commands

```powershell
node scripts/ekg.js storage-status
node scripts/ekg.js query "redirect"
node scripts/ekg.js explain loginRedirect
node scripts/ekg.js add --title "..." --problem "..." --solution "..."
node scripts/ekg.js review
node scripts/ekg.js report
```

## Host flow

- `PreToolUse`: query related experience before editing
- `Stop`: create a review candidate and gate once when a new candidate appears
- `SubagentStop`: create a review candidate without blocking by default

## Storage

- primary: `ekg-out/ekg.sqlite`
- export: `ekg-out/ekg.json`
- state: `ekg-out/state.json`
- report: `ekg-out/reports/EKG_REPORT.md`

## Docs

- [Usage Guide](./usage-guide.md)
- [Host Integration](./host-integration.md)
- [GitHub Publishing](./github-publishing.md)
- [Skill Guide](./SKILL.md)

## Validation

```powershell
node tests\run.js
```

## Notes

- Do not commit local agent state, sqlite databases, or generated mirrors unless you explicitly want to publish sample data.
- `Claude` gets real hook automation.
- `Codex` gets an official `model_instructions_file` integration and a safe experimental hook template.
