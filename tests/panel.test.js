const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const {
  buildPanelViewModel,
  buildCytoscapeGraph,
  generatePanelHtml,
  writePanel,
  startPanelServer
} = require("../lib/panel");

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      method: options.method || "GET",
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      headers: options.headers || {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const contentType = String(response.headers["content-type"] || "");
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: raw,
          json: contentType.includes("application/json") && raw ? JSON.parse(raw) : null
        });
      });
    });
    request.on("error", reject);
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

module.exports = async function runPanelTest() {
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
        paper_count: 1,
        active_count: 1,
        needs_review_count: 1,
        stale_count: 0,
        superseded_count: 0,
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
          symptom: "Users bounce away after login.",
          problem: "Guard loop happens after login.",
          cause: "The callback route stays inside the auth guard.",
          solution: "Exclude login callback route.",
          fix: "Return early for the callback route before auth fallback.",
          scope: "Touches login redirect and route guard handling.",
          status: "ACTIVE",
          confidence: "CONFIRMED",
          level: "L2",
          tags: ["auth", "routing"],
          techs: ["vue-router"],
          anchors: {
            files: ["src/views/loginRedirect.vue"]
          },
          relations: ["causes:E002"],
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
          relations: ["blocked-by:E001", "supersedes:E001"],
          created_at: "2026-04-22T00:00:00.000Z",
          updated_at: "2026-04-22T01:00:00.000Z"
        },
        {
          kind: "Paper",
          id: "P001",
          title: "Callback-aware authentication routing",
          abstract: "Studies redirect-safe callback handling in SPA auth flows.",
          summary: "Explains callback-first routing for auth flows.",
          findings: "Reduces redirect loops.",
          limitations: "SPA-only evaluation.",
          authors: ["Alice Zhang"],
          topics: ["authentication", "routing"],
          keywords: ["callback", "redirect"],
          venue: "ICSE",
          year: "2025",
          status: "ACTIVE",
          relations: ["fixes:E001"],
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
            entry_kind: "Experience",
            problem: "Need to confirm path handling",
            solution: "Verify project root restriction",
            status: "NEEDS_REVIEW",
            confidence: "UNCERTAIN",
            tags: ["routing"],
            anchors: {
              files: ["lib/project/index.js"]
            },
            origin: {
              event: "Stop"
            }
          },
          {
            id: "C002",
            title: "Review multimodal hallucination paper",
            entry_kind: "Paper",
            problem: "Need to confirm web paper analysis before adding it into the formal paper graph.",
            solution: "Record the reviewed paper summary and keep it queryable beside implementation experience.",
            status: "NEEDS_REVIEW",
            confidence: "UNCERTAIN",
            anchors: {
              files: ["papers/research-note.md"]
            },
            origin: {
              event: "Stop"
            }
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
  assert.equal(view.stats.paper_count, 1);
  assert.equal(view.active_project.id, "P001");
  assert.equal(view.pending_candidates.length, 2);
  assert.equal(view.pending_candidates.some((candidate) => candidate.review_gate.riskLevel === "high"), true);
  assert.equal(view.pending_candidates.some((candidate) => candidate.review_gate.riskLevel === "low"), true);
  assert.equal(view.top_tags[0].name, "routing");
  assert.equal(view.graph_view.nodes.some((node) => node.data.id === "E001"), true);
  assert.equal(view.graph_view.nodes.some((node) => node.data.id === "P001"), true);
  assert.equal(view.graph_view.edges.length > 0, true);
  assert.equal(view.experience_relations.E001.some((item) => item.relation_type === "causes"), true);
  assert.equal(view.all_experiences.find((item) => item.id === "E001").superseded_by_ids.includes("E002"), true);
  assert.equal(view.all_experiences.find((item) => item.id === "E002").supersedes_ids.includes("E001"), true);

  const graph = buildCytoscapeGraph(runtime.index);
  assert.equal(graph.nodes.some((node) => node.data.nodeType === "experience"), true);
  assert.equal(graph.nodes.some((node) => node.data.nodeType === "paper"), true);
  assert.equal(graph.nodes.some((node) => node.data.nodeType === "tag"), true);
  assert.equal(graph.edges.some((edge) => edge.data.edgeType === "relation:causes"), true);

  const html = generatePanelHtml(runtime);
  const scriptMatch = html.match(/<script>\s*([\s\S]*)\s*<\/script>\s*<\/body>/);
  assert.equal(Boolean(scriptMatch), true);
  assert.doesNotThrow(() => {
    new vm.Script(scriptMatch[1]);
  });
  assert.equal(html.includes("EKG Panel"), true);
  assert.equal(html.includes("Fix login redirect loop"), true);
  assert.equal(html.includes("lib/project/index.js"), true);
  assert.equal(html.includes("Capture Review Queue"), true);
  assert.equal(html.includes("Review Workspace"), true);
  assert.equal(html.includes("Review Checklist"), true);
  assert.equal(html.includes("Unified Candidate Queue"), true);
  assert.equal(html.includes("Candidate type filter"), true);
  assert.equal(html.includes("data-entry-filter=\"all\""), true);
  assert.equal(html.includes("data-entry-filter=\"experience\""), true);
  assert.equal(html.includes("data-entry-filter=\"paper\""), true);
  assert.equal(html.includes("Only show high-risk candidates"), true);
  assert.equal(html.includes("Filter review queue by file path"), true);
  assert.equal(html.includes("Accept Into Graph"), true);
  assert.equal(html.includes("Dismiss Candidate"), true);
  assert.equal(html.includes("capture-dismiss C001"), true);
  assert.equal(html.includes("candidate-feedback"), true);
  assert.equal(html.includes("Accept Command Copied"), true);
  assert.equal(html.includes("Dismiss Command Copied"), true);
  assert.equal(html.includes("data-feedback-for=\"C001\""), true);
  assert.equal(html.includes("data-command-box-for=\"C001\""), true);
  assert.equal(html.includes("panelRuntimeConfig"), true);
  assert.equal(html.includes("reviewHighRiskOnly"), true);
  assert.equal(html.includes("reviewFileFilter"), true);
  assert.equal(html.includes("setReviewEntryFilter"), true);
  assert.equal(html.includes("data-risk-level=\"high\""), true);
  assert.equal(html.includes("data-entry-kind=\"paper\""), true);
  assert.equal(html.includes(">Paper<"), true);
  assert.equal(html.includes("data-file-haystack=\"lib/project/index.js\""), true);
  assert.equal(html.includes("Browser Query Helper"), true);
  assert.equal(html.includes("Experience details"), true);
  assert.equal(html.includes("Related Experiences"), true);
  assert.equal(html.includes("Research Papers"), true);
  assert.equal(html.includes("Top Topics"), true);
  assert.equal(html.includes("Callback-aware authentication routing"), true);
  assert.equal(html.includes("Explicit Relations"), true);
  assert.equal(html.includes("Recommended Current Version"), true);
  assert.equal(html.includes("Supersedes"), true);
  assert.equal(html.includes("causes:E002"), true);
  assert.equal(html.includes("Symptom"), true);
  assert.equal(html.includes("Cause"), true);
  assert.equal(html.includes("Fix"), true);
  assert.equal(html.includes("Scope"), true);
  assert.equal(html.includes("Open details"), true);
  assert.equal(html.includes("cytoscape.min.js"), true);
  assert.equal(html.includes("reviewPanel"), true);
  assert.equal(html.includes("Review</button>"), true);
  assert.equal(html.includes("Graph View"), true);
  assert.equal(html.includes("Knowledge Graph View"), true);
  assert.equal(html.includes("cy-container"), true);

  const result = writePanel(runtime);
  assert.equal(fs.existsSync(result.output_file), true);
  assert.equal(result.relative_output_file.endsWith("ekg-out/panel/index.html"), true);

  const serverRuntime = structuredClone(runtime);
  const serverHandle = await startPanelServer({
    runtime: serverRuntime,
    handleAction: ({ candidateId, action }) => {
      serverRuntime.state.capture.pending_candidates = (serverRuntime.state.capture.pending_candidates || [])
        .filter((candidate) => candidate.id !== candidateId);
      return {
        candidate_id: candidateId,
        action
      };
    }
  });

  try {
    const rootResponse = await requestJson(serverHandle.url, {
      headers: {
        Accept: "text/html"
      }
    });
    assert.equal(rootResponse.statusCode, 200);
    assert.equal(rootResponse.body.includes("/api"), true);
    assert.equal(rootResponse.body.includes("panelRuntimeConfig"), true);

    const actionResponse = await requestJson(`${serverHandle.url}api/capture-action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        candidate_id: "C001",
        action: "dismiss"
      })
    });
    assert.equal(actionResponse.statusCode, 200);
    assert.equal(actionResponse.json.ok, true);
    assert.equal(actionResponse.json.pending_candidate_count, 1);
  } finally {
    await serverHandle.close();
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
};
