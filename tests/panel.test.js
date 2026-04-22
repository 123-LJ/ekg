const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildPanelViewModel,
  buildCytoscapeGraph,
  generatePanelHtml,
  writePanel
} = require("../lib/panel");

module.exports = function runPanelTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ekg-panel-"));
  const runtime = {
    config: {
      storage: {
        backend: "sqlite"
      }
    },
    storagePaths: {
      OUTPUT_DIR: path.join(tmpRoot, "ekg-out")
    },
    index: {
      stage: "phase-1",
      generated_at: "2026-04-22T00:00:00.000Z",
      stats: {
        experience_count: 2,
        active_count: 1,
        needs_review_count: 1,
        stale_count: 0,
        archived_count: 0,
        tag_count: 2,
        tech_count: 2
      },
      indexes: {
        by_tag: {
          auth: ["E001"],
          routing: ["E001", "E002"]
        },
        by_tech: {
          "vue-router": ["E001"],
          sqlite: ["E002"]
        },
        by_file: {
          "src/views/loginRedirect.vue": ["E001"],
          "lib/project/index.js": ["E002"]
        }
      },
      nodes: [
        {
          kind: "Experience",
          id: "E001",
          title: "Fix login redirect loop",
          problem: "Guard loop happens after login.",
          solution: "Exclude login callback route.",
          status: "ACTIVE",
          confidence: "CONFIRMED",
          level: "L2",
          tags: ["auth", "routing"],
          techs: ["vue-router"],
          anchors: {
            files: ["src/views/loginRedirect.vue"]
          },
          created_at: "2026-04-21T00:00:00.000Z",
          updated_at: "2026-04-22T00:00:00.000Z"
        },
        {
          kind: "Experience",
          id: "E002",
          title: "Use project root guard",
          problem: "Relative path escaped project root.",
          solution: "Resolve and prefix-check inside the project.",
          status: "NEEDS_REVIEW",
          confidence: "UNCERTAIN",
          level: "L1",
          tags: ["routing"],
          techs: ["sqlite"],
          anchors: {
            files: ["lib/project/index.js"]
          },
          created_at: "2026-04-22T00:00:00.000Z",
          updated_at: "2026-04-22T01:00:00.000Z"
        }
      ]
    },
    state: {
      projects: {
        next_project_number: 2,
        active_project_id: "P001",
        registry: [
          {
            id: "P001",
            name: "EKG",
            root: "C:/work/ekg",
            type: "node",
            tags: ["ekg"]
          }
        ]
      },
      capture: {
        pending_candidates: [
          {
            id: "C001",
            title: "Review routing fix",
            problem: "Need to confirm path handling",
            solution: "Verify project root restriction",
            status: "NEEDS_REVIEW",
            confidence: "UNCERTAIN"
          }
        ]
      },
      pipeline: {
        name: "ekg-build",
        finished_at: "2026-04-22T02:00:00.000Z",
        stages: [
          { name: "ingest", status: "ok", message: "loaded state" },
          { name: "report", status: "ok", message: "generated markdown report" }
        ]
      }
    }
  };

  const view = buildPanelViewModel(runtime);
  assert.equal(view.stats.experience_count, 2);
  assert.equal(view.active_project.id, "P001");
  assert.equal(view.pending_candidates.length, 1);
  assert.equal(view.top_tags[0].name, "routing");
  assert.equal(view.graph_view.nodes.some((node) => node.data.id === "E001"), true);
  assert.equal(view.graph_view.edges.length > 0, true);

  const graph = buildCytoscapeGraph(runtime.index);
  assert.equal(graph.nodes.some((node) => node.data.nodeType === "experience"), true);
  assert.equal(graph.nodes.some((node) => node.data.nodeType === "tag"), true);

  const html = generatePanelHtml(runtime);
  assert.equal(html.includes("EKG Panel"), true);
  assert.equal(html.includes("Fix login redirect loop"), true);
  assert.equal(html.includes("lib/project/index.js"), true);
  assert.equal(html.includes("Capture Review Queue"), true);
  assert.equal(html.includes("Browser Query Helper"), true);
  assert.equal(html.includes("Experience details"), true);
  assert.equal(html.includes("Related Experiences"), true);
  assert.equal(html.includes("Open details"), true);
  assert.equal(html.includes("cytoscape.min.js"), true);
  assert.equal(html.includes("Graph View"), true);
  assert.equal(html.includes("Knowledge Graph View"), true);
  assert.equal(html.includes("cy-container"), true);

  const result = writePanel(runtime);
  assert.equal(fs.existsSync(result.output_file), true);
  assert.equal(result.relative_output_file.endsWith("ekg-out/panel/index.html"), true);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
};
