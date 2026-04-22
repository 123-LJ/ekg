const assert = require("node:assert/strict");
const { runBuildPipeline } = require("../lib/pipeline");

module.exports = function runPipelineTest() {
  const runtime = {
    config: {},
    index: {
      nodes: [
        {
          id: "E001",
          kind: "Experience",
          title: "Login redirect loop",
          type: "bug-fix",
          problem: "Redirect loop after login.",
          solution: "Exclude callback path.",
          root_cause: "",
          tags: ["auth", "redirect"],
          techs: ["vue-router"],
          level: "L2",
          confidence: "CONFIRMED",
          status: "ACTIVE",
          anchors: {
            files: ["src/views/loginRedirect.vue"],
            concepts: ["loginRedirect"]
          }
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

  const result = runBuildPipeline(runtime);

  assert.equal(Array.isArray(result.stages), true);
  assert.equal(result.stages.length, 5);
  assert.equal(runtime.index.stats.experience_count, 1);
  assert.equal(runtime.state.pipeline.stages[0].name, "ingest");
  assert.equal(runtime.state.analysis.hotspots[0].name, "auth");
  assert.equal(typeof result.report.content, "string");
  assert.equal(result.report.content.includes("# EKG Report"), true);
};
