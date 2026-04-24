# Host Integration

## Goal

This is the `B` path:

- before editing, the host automatically queries EKG
- when a task ends, the host automatically creates a reviewable capture candidate
- only reviewed candidates are promoted into formal experiences

There is now also an installer entry:

```powershell
node scripts/install-host.js --host claude
node scripts/install-host.js --host codex
node scripts/install-host.js --host codex --codex-mode strong
```

This avoids two failure modes:

- nobody checks past experience before editing
- unfinished or wrong solutions get written directly into the knowledge base

## Integration model

### 1. Pre-edit reminder

Hook script:

- `hooks/pre-edit.js`

Trigger:

- `PreToolUse`
- matcher: `Edit|Write`

Purpose:

- look up relevant past experience by target file
- inject a short or detailed reminder into the host context
- when available, attach directly related papers so implementation and research memory stay connected

### 2. Task-end capture

Hook script:

- `hooks/task-complete.js`

Trigger:

- `Stop`
- `SubagentStop`

Optional:

- `PostToolUse` for patch/apply/edit events if your host emits strong final summaries there

Purpose:

- convert the completed task into a pending capture candidate
- store the candidate in `state.capture.pending_candidates`
- avoid direct auto-write into the formal experience graph
- when a brand-new candidate is created on `Stop`, block once and force an explicit review step

## Why task-end creates a candidate instead of a formal experience

Because the final correct solution is often not the first attempted fix.

So this integration deliberately uses:

- `auto-suggest`
- `human/agent confirm`
- `then formal write`

That is the safest workflow for the kind of iterative debugging you described.

## Current gate behavior

The current default is:

- `Stop`: create candidate and block once when a new candidate is created
- `SubagentStop`: create candidate, but do not block by default

This gives you enforcement on the main workflow without making subagents too noisy.

## Suggested hook config example

See:

- `host-hooks.example.json`

This file is a template, not a guaranteed drop-in config for every host.

## Host support matrix

- `Claude`: full hook automation is supported and already implemented.
- `Codex`: `light` mode keeps the stable `model_instructions_file` path. `hooks` mode adds official hook wiring (`SessionStart`, `UserPromptSubmit`, `PreToolUse`/`PermissionRequest` for Bash, `Stop`). `strong` mode also writes a global `~/.codex/AGENTS.override.md` so the workflow is reinforced before any work starts.
- `Other agents`: reuse the CLI and adapt the hook templates.

## Codex strong mode

Recommended command:

```powershell
node scripts/install-host.js --host codex --codex-mode strong
```

This installs:

- `~/.codex/config.toml` → keeps `model_instructions_file`
- `~/.codex/hooks.json` → installs Codex hook automation
- `~/.codex/AGENTS.override.md` → global Codex guidance for EKG

Practical effect:

- session start reminds Codex that EKG is active
- each submitted prompt gets an EKG reminder, prompt-aligned experience hints, and lightweight related-paper hints
- Bash permission hooks block direct writes to `ekg-out/ekg.sqlite`, `ekg.json`, and `state.json`
- task end creates reviewable capture candidates

Current caveat:

- according to the official Codex hooks docs, hooks are still experimental and Windows support may be temporarily disabled, so keep the instructions/AGENTS layer as the baseline even when strong mode is installed

## Review flow after automatic capture

List pending candidates:

```powershell
node scripts/ekg.js capture-status
```

Inspect a specific candidate:

```powershell
node scripts/ekg.js capture-status C001
```

Promote a candidate into a formal experience:

```powershell
node scripts/ekg.js capture-accept C001 --confirm
```

Dismiss a bad or noisy candidate:

```powershell
node scripts/ekg.js capture-dismiss C001
```

## Candidate storage

Automatic task-end captures are stored in state, not directly in the graph:

- primary state: `ekg-out/state.json`
- legacy mirror: `state.json`

Important field:

- `state.capture.pending_candidates`

Formal accepted experience is then written through the normal runtime path:

- SQLite primary store
- JSON/report mirrors
- Markdown copies in `experiences/` and `papers/`

## Research-aware workflow

EKG host integration is no longer limited to bug-fix recall.

When the current prompt or file hint matches tracked research topics, the host layer can surface:

- related papers
- linked implementation experience
- a follow-up hint to use `survey`

Useful manual commands:

```powershell
node scripts/ekg.js paper-query "agent memory"
node scripts/ekg.js survey "agent memory"
```

## Minimal host data contract

`hooks/task-complete.js` works best when the host can provide:

- task or prompt text
- summary/result text
- changed file list

CLI fallback example:

```powershell
node hooks/task-complete.js `
  --task "修复 H5 底部导航缺少分类入口" `
  --summary "调整 Footer 结构，补首页/分类/我的导航并修正激活态" `
  --file src/components/Footer.vue `
  --tags h5,footer,navigation `
  --techs vue,router
```

## Recommended rollout order

1. Enable `pre-edit` first.
2. Enable `task-complete` on `Stop`.
3. Watch candidate quality for a few days.
4. Then optionally extend to `SubagentStop`.

This reduces noise during the first rollout.
