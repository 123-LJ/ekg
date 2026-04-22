# Graphify-Aligned EKG Structure

## Goal

This refactor moves `EKG` closer to the structure discipline used by Graphify:

- thin CLI entrypoint
- reusable library modules
- separated storage, query, graph, report, pipeline, and command layers
- storage backend abstraction with SQLite active and JSON still supported
- hooks depending on library APIs instead of a monolithic script

## Current Layout

```text
tools/ekg/
  config.json
  ekg.json
  state.json
  ekg-out/
    ekg.json
    state.json
    reports/
      EKG_REPORT.md
  experiences/
  reports/
  hooks/
    pre-edit.js
  scripts/
    ekg.js
  lib/
    index.js
    core/
      paths.js
      utils.js
      json-store.js
      concurrency.js
      runtime.js
    model/
      index.js
    graph/
      index.js
    query/
      index.js
    report/
      index.js
    storage/
      index.js
      backends/
        json.js
        sqlite.js
    pipeline/
      ingest.js
      extract.js
      build.js
      analyze.js
      report.js
      index.js
    commands/
      index.js
```

## Layer Mapping

### `scripts/ekg.js`

This is now a thin entrypoint only.

Responsibility:

- start CLI
- catch top-level errors
- re-export the library surface

### `lib/core/*`

This layer holds foundational infrastructure.

- `paths.js`: root paths and file constants
- `utils.js`: parsing, normalization, tokenization, writer identity
- `json-store.js`: JSON read/write helpers with retry
- `concurrency.js`: file lock and stale lock recovery
- `runtime.js`: load/save/mutate runtime and pipeline-backed persistence
  It now writes primary generated artifacts under `ekg-out/` and maintains legacy mirrors in the root for compatibility.

### `lib/model/*`

This is the storage-domain layer.

- index refresh
- state refresh
- stats
- experience id generation
- markdown rendering
- experience file write
- experience lookup and resolution

### `lib/graph/*`

This is the knowledge graph construction layer.

- graph build
- node resolution
- shortest path
- graph node description

### `lib/query/*`

This is the retrieval layer.

- experience scoring
- text query
- hook query reuse

### `lib/report/*`

This is the report rendering layer.

- markdown report generation

### `lib/storage/*`

This is the persistence backend layer.

- `storage/index.js`: backend selection
- `storage/backends/json.js`: active file-based backend
- `storage/backends/sqlite.js`: SQLite persistence backend

At this stage, SQLite is the configured live backend and JSON remains supported as a compatibility/export backend. SQLite still depends on Node's experimental `node:sqlite` module.

### `lib/pipeline/*`

This is the orchestration layer added to mirror Graphify more closely.

- `ingest.js`: collect existing input sources for Phase 1
- `extract.js`: placeholder for future LLM extraction
- `build.js`: refresh indexes and rebuild the in-memory graph
- `analyze.js`: compute hotspots and review summaries
- `report.js`: prepare final report content
- `index.js`: run the full build pipeline

### `lib/commands/*`

This is the CLI application layer.

- stats
- query
- explain
- path
- review
- add
- pipeline-status
- storage-status
- storage-migrate
- storage-rollback
- report
- lock-status

### `hooks/pre-edit.js`

The hook now depends on `lib/` instead of depending on a giant CLI script.

That makes host integration cleaner and reduces coupling.

## What Changed In This Round

- persistence now goes through `runBuildPipeline()` before files are written
- pipeline state is stored in `state.json`
- `pipeline-status` can show the last recorded pipeline stages
- primary generated artifacts live under `ekg-out/`
- root `ekg.json`, `state.json`, and `reports/EKG_REPORT.md` are kept as compatibility mirrors
- storage is now selected through `storage.backend`, with `sqlite` currently active and `json` still available
- a lightweight `tests/` harness is available through `node tests/run.js`
- the structure is closer to Graphify's "thin entrypoint + reusable library + orchestration layer" pattern

## Why This Is Better

Compared with the previous single-file `scripts/ekg.js` design:

- command flow is separated from persistence logic
- lock logic is isolated and reusable
- query logic is reusable by both CLI and hooks
- graph logic is reusable by `explain` and `path`
- pipeline orchestration is explicit instead of hidden inside save logic
- future MCP or service entrypoints can import `lib/` directly

## Still Not Fully Graphify-Like

This refactor improves structure, but it is still Phase 1.

What is still missing if we want to move even closer to Graphify:

- cache module
- validation module
- serve/MCP entrypoint
- real automatic `ingest/extract` for commits, conversations, and external imports

## Recommended Next Refactor

If we continue in the same direction, the next step should be:

1. move persistent outputs under `ekg-out/`
2. expand tests for `commands` and storage migration behavior
3. reduce dependence on exported JSON snapshots once SQLite usage is fully stable
4. add Phase 2 `ingest/extract` automation
