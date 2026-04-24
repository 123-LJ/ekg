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
          symptom: "Need to confirm sqlite-backed structured storage.",
          problem: "Persist through sqlite",
          cause: "Structured fields could be lost during row mapping.",
          solution: "Store rows and export json",
          fix: "Persist additional structured columns in sqlite and mirrors.",
          scope: "Touches sqlite backend serialization and migration.",
          root_cause: "",
          tags: ["auth"],
          techs: ["node"],
          aliases: ["sqlite 存储"],
          canonical_terms: ["sqlite-storage"],
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
        },
        {
          id: "P901",
          kind: "Paper",
          title: "Memory graphs for coding agents",
          abstract: "Explores graph-based memory for long-horizon coding tasks.",
          summary: "Contrasts structured memory graphs with transcript-only recall.",
          findings: "Hybrid memory improves recovery of prior decisions.",
          limitations: "Does not evaluate human review loops.",
          authors: ["Lin Chen"],
          topics: ["agents", "memory"],
          keywords: ["graph", "retrieval"],
          aliases: ["智能体记忆"],
          canonical_terms: ["agent-memory"],
          venue: "arXiv",
          year: "2026",
          url: "https://example.com/p901",
          doi: "",
          arxiv_id: "2604.00001",
          source: "test",
          status: "ACTIVE",
          relations: ["depends-on:E901"],
          created_at: "2026-04-21T00:00:00.000Z",
          updated_at: "2026-04-21T00:00:00.000Z",
          paper_file: "papers/P901-memory-graphs-for-coding-agents.md"
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
  assert.equal(loaded.index.nodes[0].symptom, "Need to confirm sqlite-backed structured storage.");
  assert.equal(loaded.index.nodes[0].fix, "Persist additional structured columns in sqlite and mirrors.");
  assert.equal(loaded.index.nodes[0].canonical_terms[0], "sqlite-storage");
  assert.equal(loaded.index.nodes.some((node) => node.id === "P901"), true);
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

  const nextRuntime = {
    config,
    storagePaths,
    index: {
      version: "1.0.0",
      stage: "phase-1",
      stats: { experience_count: 1 },
      indexes: { by_tag: { token: ["E902"] } },
      nodes: [
        {
          id: "E902",
          kind: "Experience",
          type: "bug-fix",
          title: "SQLite incremental sync test",
          symptom: "Need to replace the previous sqlite experience row.",
          problem: "Persist delta through sqlite",
          cause: "Full rewrites hold the write lock too long.",
          solution: "Upsert changed rows and delete removed rows only.",
          fix: "Use incremental sqlite sync instead of truncate-and-reload.",
          scope: "Touches sqlite experience and edge persistence.",
          root_cause: "",
          tags: ["token"],
          techs: ["node"],
          aliases: ["增量同步"],
          canonical_terms: ["sqlite-sync"],
          level: "L2",
          confidence: "CONFIRMED",
          status: "ACTIVE",
          source: "test",
          project_scope: "current-project",
          anchors: { files: ["src/next-test.js"], concepts: ["sqlite-sync"], commits: [] },
          relations: [],
          writer: { agent_id: "test-agent" },
          created_at: "2026-04-21T02:00:00.000Z",
          updated_at: "2026-04-21T02:00:00.000Z",
          experience_file: "experiences/E902-sqlite-incremental-sync-test.md"
        },
        {
          id: "P902",
          kind: "Paper",
          title: "Research memory sync",
          abstract: "Validates incremental persistence for paper nodes.",
          summary: "Shows papers should survive sqlite delta sync too.",
          authors: ["Test Author"],
          topics: ["storage"],
          keywords: ["sqlite"],
          aliases: ["研究记忆同步"],
          canonical_terms: ["sqlite-sync"],
          venue: "ICSE",
          year: "2026",
          source: "test",
          status: "ACTIVE",
          relations: ["fixes:E902"],
          created_at: "2026-04-21T02:00:00.000Z",
          updated_at: "2026-04-21T02:00:00.000Z",
          paper_file: "papers/P902-research-memory-sync.md"
        }
      ],
      edges: [
        {
          from: "E902",
          to: "tag:token",
          type: "involves",
          reason: "incremental edge"
        }
      ]
    },
    state: nextState
  };

  sqliteBackend.saveData(nextRuntime, { reportContent: "# sqlite report v2\n" });
  const reloadedAfterDelta = sqliteBackend.loadData(config);
  assert.equal(reloadedAfterDelta.index.nodes.length, 2);
  assert.equal(reloadedAfterDelta.index.nodes.some((node) => node.id === "E902"), true);
  assert.equal(reloadedAfterDelta.index.nodes.some((node) => node.id === "P902"), true);
  assert.equal(reloadedAfterDelta.index.edges.length, 1);
  assert.equal(reloadedAfterDelta.index.edges[0].from, "E902");

  fs.rmSync(path.join(storagePaths.OUTPUT_DIR), { recursive: true, force: true });
};
