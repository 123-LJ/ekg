const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sqliteBackend = require("../lib/storage/backends/sqlite");

module.exports = function runSqliteStorageTest() {
  const suffix = `sqlite-storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = {
    storage: {
      backend: "sqlite",
      outputDir: `ekg-out/${suffix}`,
      legacyMirror: false,
      indexFile: "ekg.json",
      stateFile: "state.json",
      reportFile: "reports/EKG_REPORT.md",
      sqliteFile: `ekg-out/${suffix}/ekg.sqlite`
    }
  };

  const runtime = {
    config,
    index: {
      version: "1.0.0",
      stage: "phase-1",
      stats: { experience_count: 1 },
      indexes: { by_tag: { auth: ["E901"] } },
      nodes: [
        {
          id: "E901",
          kind: "Experience",
          type: "bug-fix",
          title: "SQLite storage test",
          problem: "Persist through sqlite",
          solution: "Store rows and export json",
          root_cause: "",
          tags: ["auth"],
          techs: ["node"],
          level: "L2",
          confidence: "CONFIRMED",
          status: "ACTIVE",
          source: "test",
          project_scope: "current-project",
          anchors: { files: ["src/test.js"], concepts: ["storage"], commits: [] },
          relations: [],
          writer: { agent_id: "test-agent" },
          created_at: "2026-04-21T00:00:00.000Z",
          updated_at: "2026-04-21T00:00:00.000Z",
          experience_file: "experiences/E901-sqlite-storage-test.md"
        }
      ],
      edges: [
        {
          from: "E901",
          to: "tag:auth",
          type: "involves",
          reason: "test edge"
        }
      ]
    },
    state: {
      hook: { recent_injections: [] },
      pipeline: { name: "test-pipeline", stages: [] }
    }
  };

  const reportContent = "# sqlite report\n";
  const storagePaths = sqliteBackend.saveData(runtime, { reportContent });
  const loaded = sqliteBackend.loadData(config);

  assert.equal(fs.existsSync(storagePaths.SQLITE_FILE), true);
  assert.equal(fs.existsSync(storagePaths.INDEX_FILE), true);
  assert.equal(fs.existsSync(storagePaths.STATE_FILE), true);
  assert.equal(loaded.index.nodes[0].id, "E901");
  assert.equal(loaded.index.edges[0].type, "involves");
  assert.equal(loaded.state.pipeline.name, "test-pipeline");
  assert.equal(fs.readFileSync(storagePaths.REPORT_FILE, "utf8"), reportContent);

  const nextState = {
    ...loaded.state,
    hook: {
      recent_injections: [
        {
          target_file: "src/test.js",
          experience_ids: ["E901"],
          injected_at: "2026-04-21T01:00:00.000Z"
        }
      ]
    }
  };

  sqliteBackend.saveState({
    config,
    storagePaths,
    state: loaded.state
  }, nextState);

  const reloaded = sqliteBackend.loadData(config);
  assert.equal(reloaded.state.hook.recent_injections.length, 1);

  fs.rmSync(path.join(storagePaths.OUTPUT_DIR), { recursive: true, force: true });
};
