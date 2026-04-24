const assert = require("node:assert/strict");
const { saveRuntimeUnlocked } = require("../lib/core/runtime");

module.exports = function runRuntimeTest() {
  const calls = [];
  const runtime = {
    config: {},
    storageBackend: {
      saveData(nextRuntime, options = {}) {
        calls.push({
          type: "saveData",
          skipReportWrite: options.skipReportWrite === true,
          pipelineStages: (((nextRuntime || {}).state || {}).pipeline || {}).stages || []
        });
        return {
          REPORT_FILE: "C:/tmp/EKG_REPORT.md"
        };
      },
      saveState(nextRuntime, nextState) {
        calls.push({
          type: "saveState",
          pipelineStages: ((nextState || {}).pipeline || {}).stages || []
        });
        nextRuntime.state = nextState;
        return {
          REPORT_FILE: "C:/tmp/EKG_REPORT.md"
        };
      },
      saveReport() {
        calls.push({
          type: "saveReport"
        });
        throw new Error("report write failed");
      }
    },
    index: {
      nodes: [
        {
          id: "E001",
          kind: "Experience",
          title: "Runtime save flow",
          type: "workflow",
          symptom: "",
          problem: "Need to keep core persistence stable.",
          cause: "",
          solution: "Save core state before derived artifacts.",
          fix: "",
          scope: "",
          root_cause: "",
          tags: ["runtime"],
          techs: ["node"],
          level: "L1",
          confidence: "CONFIRMED",
          status: "ACTIVE",
          anchors: {
            files: ["lib/core/runtime.js"],
            concepts: ["saveRuntime"]
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

  assert.doesNotThrow(() => {
    saveRuntimeUnlocked(runtime);
  });

  assert.equal(calls[0].type, "saveData");
  assert.equal(calls[0].skipReportWrite, true);
  assert.equal(calls.some((entry) => entry.type === "saveState"), true);
  assert.equal(calls.some((entry) => entry.type === "saveReport"), true);
  assert.equal(runtime.state.pipeline.stages.slice(-1)[0].status, "error");
};
