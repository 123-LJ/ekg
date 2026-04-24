const assert = require("node:assert/strict");
const commands = require("../lib/commands");
const {
  createCaptureCandidate,
  listCaptureCandidates,
  findCaptureCandidate,
  evaluateCandidateRisk
} = require("../lib/capture");

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
      },
      capture: {
        autoAccept: {
          enabled: true,
          maxSummaryLength: 180,
          allowedSources: ["host/auto-stop", "host/auto"],
          allowedTypes: ["workflow"],
          allowedLevels: ["L1"],
          requireFileAnchor: true,
          requireProblemAndSolution: true,
          blockIfTagsPresent: true,
          blockIfTechsPresent: true,
          blockIfRelationsPresent: true,
          blockIfRootCausePresent: true,
          blockIfCommitsPresent: true,
          blockOnEvents: ["Stop", "task-complete"]
        }
      }
    },
    storagePaths: {
      REPORT_FILE: "C:/Users/Administrator/Desktop/skill/tools/ekg/ekg-out/reports/EKG_REPORT.md"
    },
    index: {
      nodes: [],
      edges: []
    },
    state: {}
  };
}

module.exports = function runCaptureTest() {
  const runtime = createRuntime();

  const firstResult = createCaptureCandidate(runtime.state, {
    title: "Footer navigation fix",
    task: "修复 H5 底部导航缺少分类入口",
    summary: "调整 Footer 结构，补首页、分类、我的三个导航入口并修正激活态。",
    files: ["src/components/Footer.vue"],
    tags: ["h5", "footer"],
    techs: ["vue"]
  }, {
    pendingLimit: 10
  });

  assert.equal(firstResult.created, true);
  assert.equal(firstResult.candidate.id, "C001");
  assert.equal(listCaptureCandidates(runtime.state).length, 1);
  assert.equal(findCaptureCandidate(runtime.state, "Footer navigation fix").id, "C001");
  const lowRisk = evaluateCandidateRisk(firstResult.candidate, runtime.config.capture.autoAccept, {
    eventName: "Stop"
  });
  assert.equal(lowRisk.autoAcceptEligible, false);
  assert.equal(lowRisk.reasons.some((item) => item.includes("tags")), true);

  const duplicateResult = createCaptureCandidate(runtime.state, {
    title: "Footer navigation fix",
    task: "修复 H5 底部导航缺少分类入口",
    summary: "同步补齐导航入口并保留当前页高亮。",
    files: ["src/components/Footer.vue"]
  }, {
    pendingLimit: 10,
    dedupeWindowMinutes: 180
  });

  assert.equal(duplicateResult.created, false);
  assert.equal(listCaptureCandidates(runtime.state).length, 1);

  const plainCandidate = createCaptureCandidate(runtime.state, {
    title: "Simple file anchor note",
    task: "记录一个简单的低风险工作流候选",
    summary: "Keep a short verified workflow note with a single file anchor.",
    files: ["docs/simple-note.md"],
    source: "host/auto-stop"
  }, {
    pendingLimit: 10
  });

  const highConfidenceLowRisk = evaluateCandidateRisk(plainCandidate.candidate, runtime.config.capture.autoAccept, {
    eventName: "Stop"
  });
  assert.equal(highConfidenceLowRisk.autoAcceptEligible, true);
  assert.equal(highConfidenceLowRisk.riskLevel, "low");

  const statusOutput = captureLogs(() => {
    commands.commandCaptureStatus(runtime, {
      positional: ["capture-status"],
      options: {}
    });
  });
  assert.equal(statusOutput.includes("C001"), true);
  assert.equal(statusOutput.includes("Footer navigation fix"), true);
  assert.equal(statusOutput.includes("risk:"), true);

  const acceptOutput = captureLogs(() => {
    commands.commandCaptureAccept(runtime, {
      positional: ["capture-accept", "C001"],
      options: {
        confirm: true
      }
    }, {
      skipSave: true,
      skipExperienceFile: true
    });
  });
  assert.equal(acceptOutput.includes("\"candidate_id\": \"C001\""), true);
  assert.equal(acceptOutput.includes("\"experience_id\": \"E001\""), true);
  assert.equal(runtime.index.nodes.length, 1);
  assert.equal(runtime.index.nodes[0].title, "Footer navigation fix");
  assert.equal(runtime.index.nodes[0].confidence, "CONFIRMED");
  assert.equal(findCaptureCandidate(runtime.state, "C001"), null);
  assert.equal(findCaptureCandidate(runtime.state, "Simple file anchor note").id, "C002");

  createCaptureCandidate(runtime.state, {
    title: "Dismiss me",
    task: "临时噪音候选",
    summary: "这条应该被忽略。",
    files: ["src/views/noise.vue"]
  }, {
    pendingLimit: 10
  });

  const dismissOutput = captureLogs(() => {
    commands.commandCaptureDismiss(runtime, {
      positional: ["capture-dismiss", "C003"],
      options: {}
    }, {
      skipSave: true
    });
  });
  assert.equal(dismissOutput.includes("\"dismissed\": true"), true);
  assert.equal(listCaptureCandidates(runtime.state).length, 1);
  assert.equal(findCaptureCandidate(runtime.state, "Simple file anchor note").id, "C002");
};
