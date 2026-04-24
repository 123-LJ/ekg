# EKG Usage Guide

## 1. What this knowledge base is

EKG is an experience knowledge base for coding collaboration.

It is used to record:

- what problem happened
- what solution finally worked
- what root cause was found
- which files, concepts, tags, and technologies were involved

Its goal is not to replace code search. Its goal is to let people and agents reuse solved experience before repeating the same debugging loop.

## 2. Current source of truth

The current formal storage backend is `SQLite`.

- Primary storage: `ekg-out/ekg.sqlite`
- Compatibility export: `ekg-out/ekg.json`
- Compatibility state: `ekg-out/state.json`
- Compatibility report: `ekg-out/reports/EKG_REPORT.md`
- Legacy mirror: root `ekg.json`, root `state.json`, root `reports/EKG_REPORT.md`

This means:

- actual write operations go to SQLite
- JSON and report files are still exported for inspection, diffing, and compatibility

## 3. How to start using it

All commands are run in:

```powershell
cd <your-ekg-repo>
```

Install into a host:

```powershell
node scripts/install-host.js --host claude
node scripts/install-host.js --host codex
node scripts/install-host.js --host codex --codex-mode strong
```

See command help:

```powershell
node scripts/ekg.js help
```

Check current storage mode:

```powershell
node scripts/ekg.js storage-status
```

Check current knowledge base stats:

```powershell
node scripts/ekg.js stats
```

Check the latest pipeline state:

```powershell
node scripts/ekg.js pipeline-status
```

## 3.1 Project context layer

Before daily query/add/review usage, register the current repository once and switch the active project when you change workspaces.

Register a project and activate it:

```powershell
node scripts/ekg.js project-register --name "Mall App" --root C:\work\mall-app --type vue --tags mall,h5 --activate
```

List known projects:

```powershell
node scripts/ekg.js project-list
```

Switch the active project:

```powershell
node scripts/ekg.js project-use P001
```

Check the current active project:

```powershell
node scripts/ekg.js project-status
```

Resolve a file hint into the current project root before searching:

```powershell
node scripts/ekg.js project-resolve src/views/loginRedirect.vue
```

Why this matters:

- Codex hooks can inject the active project root into the session context
- file lookup can stay inside the current workspace first
- broad recursive scans across the whole machine become less necessary

## 4. Daily workflow

### 4.1 Add a new experience

When you have confirmed a problem and a working solution, add it:

```powershell
node scripts/ekg.js add `
  --title "登录重定向死循环" `
  --problem "已登录后仍被 beforeEach 重定向，页面来回跳转" `
  --solution "在守卫里排除 loginRedirect 和已登录目标路由" `
  --root-cause "重定向逻辑和登录态校验互相触发" `
  --tags auth,redirect,guard `
  --techs vue-router,axios `
  --file src/views/loginRedirect.vue `
  --file src/router/index.ts `
  --concept loginRedirect `
  --concept beforeEach `
  --level L2 `
  --type bug-fix `
  --source manual/project
```

Recommended rule:

- only record a solution after it is actually verified
- keep `problem`, `solution`, and `root-cause` short and concrete
- bind the experience to files and concepts whenever possible

### 4.2 Query existing experience

Search by keyword:

```powershell
node scripts/ekg.js query "redirect"
node scripts/ekg.js query "Footer.vue"
node scripts/ekg.js query "auth guard"
```

Use this before modifying code in a hotspot area.

### 4.3 Explain a node

Explain a concept, file-related node, or experience:

```powershell
node scripts/ekg.js explain E001
node scripts/ekg.js explain loginRedirect
node scripts/ekg.js explain vue-router
```

This is used when you want to see which experiences are attached to a concept or node.

### 4.4 Find a path between two nodes

```powershell
node scripts/ekg.js path auth vue-router
node scripts/ekg.js path E001 tabbar
```

This is useful when you want to understand why two concepts are connected in the graph.

### 4.5 Review experience quality

List items that need review:

```powershell
node scripts/ekg.js review
```

Review a specific record:

```powershell
node scripts/ekg.js review E003 --confirm
node scripts/ekg.js review E003 --needs-review
node scripts/ekg.js review E003 --uncertain
node scripts/ekg.js review E003 --archive
```

Use `review` when:

- the experience was inferred rather than explicitly confirmed
- the solution might be outdated
- the result needs manual approval

### 4.6 Ingest automatic candidate skeleton

EKG now has a Phase 2 prototype command that creates **reviewable candidates** instead of writing formal experiences directly.

Ingest from a task summary:

```powershell
node scripts/ekg.js ingest `
  --source task `
  --task "修复登录重定向问题" `
  --summary "排除回调页和当前触发路径" `
  --file src/views/loginRedirect.vue `
  --tags auth,redirect
```

Ingest from recent git commits:

```powershell
node scripts/ekg.js ingest --source commit --since HEAD~5
```

Current behavior:

- output goes to `capture candidate`
- default status is `NEEDS_REVIEW`
- default confidence is `UNCERTAIN`
- you still need `capture-accept --confirm` before it becomes a formal experience

### 4.7 Review host-generated capture candidates

If the host integration is enabled, task-end hooks will create pending candidates first.

List candidates:

```powershell
node scripts/ekg.js capture-status
```

Inspect one candidate:

```powershell
node scripts/ekg.js capture-status C001
```

Accept it into the formal knowledge base:

```powershell
node scripts/ekg.js capture-accept C001 --confirm
```

Dismiss noise:

```powershell
node scripts/ekg.js capture-dismiss C001
```

On the main `Stop` flow, the hook will now stop once for a brand-new candidate so you do not forget the review step.

### 4.8 Stale baseline and stale check

EKG now has a first-pass stale detection skeleton for file anchors.

Initialize or refresh anchor baselines:

```powershell
node scripts/ekg.js stale-check --baseline
```

Run a dry-run stale scan:

```powershell
node scripts/ekg.js stale-check --dry-run
```

Apply the result and move affected experiences into `NEEDS_REVIEW`:

```powershell
node scripts/ekg.js stale-check
```

Current first version checks:

- missing anchor files
- content changes for files that already have a stored baseline

### 4.9 Rebuild and export report

```powershell
node scripts/ekg.js report
```

This refreshes:

- report markdown
- JSON indexes
- pipeline state

### 4.10 Generate the local panel

Generate a browser-openable EKG dashboard:

```powershell
node scripts/ekg.js panel
```

Generate it and open it directly:

```powershell
node scripts/ekg.js panel --open
```

Default output:

- `ekg-out/panel/index.html`

The panel currently shows:

- overall stats
- recent experiences
- browser-side query helper
- experience detail drawer
- related experience suggestions
- graph summary
- top tags / techs / file anchors
- registered projects and active project
- pending capture candidates
- latest pipeline status

## 5. How the hook is used

There is a pre-edit hook at:

- `hooks/pre-edit.js`

There is also a task-end capture hook at:

- `hooks/task-complete.js`

The main `Stop` path now acts like a gate: it forces one explicit review step when a new candidate is created.

Its purpose is:

- before editing a file, query EKG for related past experience
- inject a short reminder when a related experience exists
- avoid repeating already-solved mistakes

Manual CLI check:

```powershell
node hooks/pre-edit.js --file src/views/loginRedirect.vue
```

Injection levels:

- `Level 0`: no output when no useful match exists
- `Level 1`: short reminder with experience ids and titles
- `Level 2`: detailed problem and solution when the match is strong enough

Current config is in `config.json`.

Host integration details are documented in `host-integration.md`.

## 6. Storage operations

Check current backend:

```powershell
node scripts/ekg.js storage-status
```

Migrate to SQLite:

```powershell
node scripts/ekg.js storage-migrate --to sqlite
```

Rollback to JSON:

```powershell
node scripts/ekg.js storage-rollback
```

Or:

```powershell
node scripts/ekg.js storage-migrate --to json
```

Current recommendation:

- keep production use on SQLite
- keep JSON export enabled for debugging and portability

## 7. Portable backup and restore

Export a one-file portable backup package:

```powershell
node scripts/ekg.js backup-export
```

Or choose your own output path:

```powershell
node scripts/ekg.js backup-export --output backups/
node scripts/ekg.js backup-export --output backups/my-ekg.ekgpack.json.gz
```

Inspect a package before restoring:

```powershell
node scripts/ekg.js backup-inspect backups/my-ekg.ekgpack.json.gz
```

This package includes:

- `config.json`
- `ekg-out/ekg.sqlite` and SQLite sidecars when present
- exported `ekg-out/ekg.json`
- exported `ekg-out/state.json`
- generated report
- `experiences/*.md`

Restore from a portable package in a new cloned EKG repo:

```powershell
node scripts/ekg.js backup-import backups/ekg-backup-20260422-120000.ekgpack.json.gz
```

After restore, reinstall host integration for the new machine/path:

```powershell
node scripts/install-host.js --host codex --codex-mode strong
node scripts/install-host.js --host claude
```

Why reinstall is required:

- Codex and Claude host config files use local absolute paths
- backup packages restore EKG data and config, not host-global agent settings

## 8. Multi-agent usage

This project already includes a write lock mechanism.

Current behavior:

- writes are serialized by `.ekg.lock`
- commands such as `add`, `review`, `report`, and hook state updates are lock-protected
- multiple agents can read in parallel
- multiple agents should not write by bypassing the CLI or runtime layer

Recommended rule for multi-agent use:

- read through CLI or runtime
- write through `node scripts/ekg.js ...` or the runtime mutation layer
- do not hand-edit SQLite and JSON files in parallel

## 9. How to use it in practice

The most practical workflow is:

1. When you enter a repo, run `project-use` or `project-register` once so EKG knows the active workspace.
2. Before editing a file, run `query` or let the hook check related experience.
3. After solving a real problem, add one clean experience record.
4. If the experience is still uncertain, mark it for later review.
5. Periodically run `report` and `pipeline-status` to keep exports updated.

In short:

- project switch: `project-use`
- before coding: `query`
- after solving: `add`
- when uncertain: `review`
- for outputs: `report` / `panel`

## 10. Current limitation

Right now, solution evolution is still basic.

That means EKG currently does not fully manage:

- one old solution being superseded by a newer better solution
- automatic recommendation of the latest valid answer in a version chain

So for now, the practical rule is:

1. archive or mark the old record as needing review
2. add the new verified record
3. write the relationship clearly in `title`, `problem`, `solution`, or `relations`

This part should be upgraded next into a formal versioning model such as:

- `supersedes`
- `superseded_by`
- `SUPERSEDED`
- `PARTIAL`
- `REJECTED`

## 11. Files worth knowing

- `config.json`: global config and storage mode
- `scripts/ekg.js`: CLI entry
- `hooks/pre-edit.js`: pre-edit reminder hook
- `backups/*.ekgpack.json.gz`: portable backup packages
- `ekg-out/ekg.sqlite`: primary data store
- `ekg-out/ekg.json`: exported graph snapshot
- `ekg-out/reports/EKG_REPORT.md`: generated report
- `ekg-out/panel/index.html`: generated local dashboard
- `experiences/`: markdown copies of experience records

## 12. Minimal command set

If you only remember five commands, remember these:

```powershell
node scripts/ekg.js storage-status
node scripts/ekg.js query "keyword"
node scripts/ekg.js add --title "..." --problem "..." --solution "..."
node scripts/ekg.js ingest --source task --task "..." --summary "..."
node scripts/ekg.js review
node scripts/ekg.js stale-check --dry-run
node scripts/ekg.js report
node scripts/ekg.js panel
node scripts/ekg.js backup-export
```
