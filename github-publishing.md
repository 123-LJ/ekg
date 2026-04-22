# GitHub Publishing

## Goal

This repo can be published as a reusable EKG toolkit.

## What to commit

- `scripts/`
- `lib/`
- `hooks/`
- `README.md`
- `SKILL.md`
- docs in Chinese or English
- installer templates
- tests

## What to keep local

- `ekg-out/`
- `ekg.json`
- `state.json`
- `reports/EKG_REPORT.md`
- `.claude/`
- `.codex/`

These are runtime or host-local artifacts.

## Safe publish flow

1. Run `node tests/run.js`.
2. Run `node scripts/install-host.js --host claude --dry-run`.
3. Run `node scripts/install-host.js --host codex --dry-run`.
4. Verify the docs explain the install flow.
5. Commit only the toolkit, not local knowledge data.

## Important

The current repository may already contain example or personal experience data.
Before publishing, review whether those records should be:

- removed
- sanitized
- moved into a public sample dataset

## Recommended repository layout

- `lib/`: runtime and storage
- `scripts/`: CLI and installers
- `hooks/`: agent hooks
- `tests/`: behavior lock tests
- `docs/`: longer guidance

## Publish checklist

- `README.md` is GitHub-friendly
- `package.json` exposes install/test commands
- Claude installer works on the local machine
- Codex installer writes `model_instructions_file`
- `.gitignore` excludes runtime state
- no private sqlite/db snapshots are committed
- choose a license before making the repository public
