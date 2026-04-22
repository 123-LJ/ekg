const assert = require("node:assert/strict");
const commands = require("../lib/commands");

function captureLogs(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };

  try {
    fn();
  } finally {
    console.log = original;
  }

  return lines.join("\n");
}

function createRuntime() {
  return {
    config: {
      storage: {
        backend: "json"
      },
      query: {
        defaultLimit: 5
      }
    },
    storagePaths: {
      REPORT_FILE: "C:/Users/Administrator/Desktop/skill/tools/ekg/ekg-out/reports/EKG_REPORT.md"
    },
    index: {
      stats: {
        experience_count: 1,
        active_count: 1,
        needs_review_count: 0,
        stale_count: 0,
        archived_count: 0,
        tag_count: 1,
        tech_count: 1
      },
      nodes: [
        {
          id: "E001",
          kind: "Experience",
          type: "bug-fix",
          title: "Login redirect loop",
          problem: "Guard loops after login.",
          solution: "Exclude callback path.",
          root_cause: "Guard re-entry.",
          tags: ["auth"],
          techs: ["vue-router"],
          status: "ACTIVE",
          level: "L2",
          confidence: "CONFIRMED",
          source: "test",
          project_scope: "current-project",
          created_at: "2026-04-21T00:00:00.000Z",
          updated_at: "2026-04-21T00:00:00.000Z",
          experience_file: "",
          anchors: {
            files: ["src/views/loginRedirect.vue"],
            concepts: ["loginRedirect"]
          }
        }
      ],
      edges: []
    },
    state: {
      pipeline: {
        name: "ekg-build",
        started_at: "2026-04-21T00:00:00.000Z",
        finished_at: "2026-04-21T00:00:01.000Z",
        stages: [
          { name: "ingest", status: "ok", message: "loaded input" },
          { name: "report", status: "ok", message: "generated report" }
        ]
      }
    }
  };
}

module.exports = function runCommandsTest() {
  const runtime = createRuntime();

  const helpOutput = captureLogs(() => {
    commands.printUsage();
  });
  assert.equal(helpOutput.includes("pipeline-status"), true);
  assert.equal(helpOutput.includes("backup-export"), true);
  assert.equal(helpOutput.includes("backup-inspect"), true);

  const statsOutput = captureLogs(() => {
    commands.commandStats(runtime);
  });
  assert.equal(statsOutput.includes("\"experience_count\": 1"), true);

  const queryOutput = captureLogs(() => {
    commands.commandQuery(runtime, {
      positional: ["query", "loginRedirect"],
      options: {}
    });
  });
  assert.equal(queryOutput.includes("E001"), true);

  const pathOutput = captureLogs(() => {
    commands.commandPath(runtime, {
      positional: ["path", "E001", "auth"],
      options: {}
    });
  });
  assert.equal(pathOutput.includes("E001: Login redirect loop"), true);
  assert.equal(pathOutput.includes("tag: auth"), true);

  const reviewInspectOutput = captureLogs(() => {
    commands.commandReview(runtime, {
      positional: ["review", "E001"],
      options: {}
    }, { skipSave: true, skipExperienceFile: true });
  });
  assert.equal(reviewInspectOutput.includes("\"id\": \"E001\""), true);

  const addOutput = captureLogs(() => {
    commands.commandAdd(runtime, {
      positional: ["add"],
      options: {
        title: "Footer fix",
        problem: "Footer tabs wrong",
        solution: "Rebuild footer nav",
        tags: "h5,footer",
        techs: "vue",
        file: "src/components/Footer.vue"
      }
    }, { skipSave: true, skipExperienceFile: true });
  });
  assert.equal(addOutput.includes("\"id\": \"E002\""), true);
  assert.equal(runtime.index.nodes.length, 2);

  const reviewConfirmOutput = captureLogs(() => {
    commands.commandReview(runtime, {
      positional: ["review", "E002"],
      options: {
        confirm: true
      }
    }, { skipSave: true, skipExperienceFile: true });
  });
  assert.equal(reviewConfirmOutput.includes("\"confidence\": \"CONFIRMED\""), true);

  const pipelineOutput = captureLogs(() => {
    commands.commandPipelineStatus(runtime);
  });
  assert.equal(pipelineOutput.includes("[EKG] pipeline ekg-build"), true);
  assert.equal(pipelineOutput.includes("ingest: ok"), true);

  const storageStatusOutput = captureLogs(() => {
    commands.commandStorageStatus(runtime);
  });
  assert.equal(storageStatusOutput.includes("\"backend\": \"json\""), true);

  const reportOutput = captureLogs(() => {
    commands.commandReport(runtime, { skipSave: true });
  });
  assert.equal(reportOutput.includes("ekg-out/reports/EKG_REPORT.md"), true);

  assert.throws(
    () => commands.main(["unsupported-command"]),
    /unsupported command/i
  );
};
