const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jsonBackend = require("../lib/storage/backends/json");

module.exports = function runJsonStorageTest() {
  const suffix = `json-storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = {
    storage: {
      backend: "json",
      outputDir: `ekg-out/${suffix}`,
      legacyMirror: false,
      indexFile: "ekg.json",
      stateFile: "state.json",
      reportFile: "reports/EKG_REPORT.md"
    }
  };

  const runtime = {
    config,
    index: {
      nodes: [
        {
          id: "E900",
          kind: "Experience",
          title: "Temporary storage test",
          status: "ACTIVE",
          tags: [],
          techs: [],
          anchors: { files: [], concepts: [] }
        }
      ],
      edges: [],
      indexes: {}
    },
    state: {
      hook: {
        recent_injections: []
      }
    }
  };

  const reportContent = "# temporary report\n";
  const storagePaths = jsonBackend.saveData(runtime, { reportContent });
  const loaded = jsonBackend.loadData(config);

  assert.equal(fs.existsSync(storagePaths.INDEX_FILE), true);
  assert.equal(fs.existsSync(storagePaths.STATE_FILE), true);
  assert.equal(fs.existsSync(storagePaths.REPORT_FILE), true);
  assert.equal(loaded.index.nodes[0].id, "E900");
  assert.equal(loaded.state.hook.recent_injections.length, 0);
  assert.equal(fs.readFileSync(storagePaths.REPORT_FILE, "utf8"), reportContent);

  fs.rmSync(path.join(storagePaths.OUTPUT_DIR), { recursive: true, force: true });
};
