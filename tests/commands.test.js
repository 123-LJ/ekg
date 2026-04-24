const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

function ensureFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
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
      OUTPUT_DIR: "C:/Users/Administrator/Desktop/skill/tools/ekg/ekg-out",
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
      },
      projects: {
        next_project_number: 1,
        active_project_id: "",
        registry: []
      }
    }
  };
}

module.exports = async function runCommandsTest() {
  const runtime = createRuntime();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ekg-commands-projects-"));
  const mallRoot = path.join(tmpRoot, "mall-app");
  const adminRoot = path.join(tmpRoot, "admin-app");

  ensureFile(path.join(mallRoot, "src", "views", "loginRedirect.vue"), "<template />\n");
  fs.mkdirSync(adminRoot, { recursive: true });

  const helpOutput = captureLogs(() => {
    commands.printUsage();
  });
  assert.equal(helpOutput.includes("pipeline-status"), true);
  assert.equal(helpOutput.includes("backup-export"), true);
  assert.equal(helpOutput.includes("backup-inspect"), true);
  assert.equal(helpOutput.includes("project-register"), true);
  assert.equal(helpOutput.includes("project-resolve"), true);
  assert.equal(helpOutput.includes("node scripts/ekg.js ingest"), true);
  assert.equal(helpOutput.includes("node scripts/ekg.js stale-check"), true);
  assert.equal(helpOutput.includes("node scripts/ekg.js panel"), true);

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

  const ingestOutput = captureLogs(() => {
    commands.commandIngest(runtime, {
      positional: ["ingest"],
      options: {
        source: "task",
        task: "修复登录重定向问题",
        summary: "排除回调页和当前触发路径",
        file: "src/views/loginRedirect.vue"
      }
    }, { skipSave: true });
  });
  assert.equal(ingestOutput.includes("\"action\": \"ingest\""), true);
  assert.equal(ingestOutput.includes("\"candidate_count\": 1"), true);

  const reviewConfirmOutput = captureLogs(() => {
    commands.commandReview(runtime, {
      positional: ["review", "E002"],
      options: {
        confirm: true
      }
    }, { skipSave: true, skipExperienceFile: true });
  });
  assert.equal(reviewConfirmOutput.includes("\"confidence\": \"CONFIRMED\""), true);

  const projectRegisterOutput = captureLogs(() => {
    commands.commandProjectRegister(runtime, {
      positional: ["project-register"],
      options: {
        name: "Mall App",
        root: mallRoot,
        type: "vue",
        tags: "mall,h5"
      }
    }, { skipSave: true });
  });
  assert.equal(projectRegisterOutput.includes("\"id\": \"P001\""), true);
  assert.equal(runtime.state.projects.active_project_id, "P001");

  const secondProjectOutput = captureLogs(() => {
    commands.commandProjectRegister(runtime, {
      positional: ["project-register"],
      options: {
        name: "Admin App",
        root: adminRoot,
        type: "vue",
        tags: "admin",
        activate: false
      }
    }, { skipSave: true });
  });
  assert.equal(secondProjectOutput.includes("\"id\": \"P002\""), true);
  assert.equal(runtime.state.projects.registry.length, 2);

  const projectListOutput = captureLogs(() => {
    commands.commandProjectList(runtime);
  });
  assert.equal(projectListOutput.includes("* P001: Mall App"), true);
  assert.equal(projectListOutput.includes("- P002: Admin App"), true);

  const projectUseOutput = captureLogs(() => {
    commands.commandProjectUse(runtime, {
      positional: ["project-use", "P002"],
      options: {}
    }, { skipSave: true });
  });
  assert.equal(projectUseOutput.includes("\"id\": \"P002\""), true);
  assert.equal(runtime.state.projects.active_project_id, "P002");

  const projectStatusOutput = captureLogs(() => {
    commands.commandProjectStatus(runtime, {
      positional: ["project-status"],
      options: {}
    });
  });
  assert.equal(projectStatusOutput.includes("\"id\": \"P002\""), true);
  assert.equal(projectStatusOutput.includes("\"active\": true"), true);

  captureLogs(() => {
    commands.commandProjectUse(runtime, {
      positional: ["project-use", "P001"],
      options: {}
    }, { skipSave: true });
  });

  const projectResolveOutput = captureLogs(() => {
    commands.commandProjectResolve(runtime, {
      positional: ["project-resolve", "src/views/loginRedirect.vue"],
      options: {}
    });
  });
  assert.equal(projectResolveOutput.includes("\"matched_by\": \"active-project-existing-file\""), true);
  assert.equal(projectResolveOutput.includes("Mall App"), true);
  assert.equal(projectResolveOutput.includes("loginRedirect.vue"), true);

  const staleBaselineOutput = captureLogs(() => {
    commands.commandStaleCheck(runtime, {
      positional: ["stale-check"],
      options: {
        baseline: true
      }
    }, { skipSave: true, skipExperienceFile: true });
  });
  assert.equal(staleBaselineOutput.includes("\"mode\": \"baseline\""), true);

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

  const panelOutput = captureLogs(() => {
    return commands.commandPanel(runtime, {
      positional: ["panel"],
      options: {}
    });
  });
  assert.equal(panelOutput.includes("\"action\": \"panel\""), true);
  assert.equal(panelOutput.includes("ekg-out/panel/index.html"), true);

  await assert.rejects(
    () => commands.main(["unsupported-command"]),
    /unsupported command/i
  );

  fs.rmSync(tmpRoot, { recursive: true, force: true });
};
