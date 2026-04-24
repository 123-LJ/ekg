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
    symptom: "Users cannot reach the category tab from the footer.",
    task: "Fix the H5 footer so the category tab is reachable again.",
    cause: "The footer config dropped the category entry.",
    summary: "Restore the footer category entry and keep the active state in sync.",
    fix: "Restore the category tab and keep the active state in sync.",
    scope: "Affects the H5 footer navigation.",
    files: ["src/components/Footer.vue"],
    tags: ["h5", "footer"],
    techs: ["vue"]
  }, {
    pendingLimit: 10
  });

  assert.equal(firstResult.created, true);
  assert.equal(firstResult.candidate.id, "C001");
  assert.equal(firstResult.candidate.symptom, "Users cannot reach the category tab from the footer.");
  assert.equal(firstResult.candidate.fix, "Restore the category tab and keep the active state in sync.");
  assert.equal(listCaptureCandidates(runtime.state).length, 1);
  assert.equal(findCaptureCandidate(runtime.state, "Footer navigation fix").id, "C001");
  const lowRisk = evaluateCandidateRisk(firstResult.candidate, runtime.config.capture.autoAccept, {
    eventName: "Stop"
  });
  assert.equal(lowRisk.autoAcceptEligible, false);
  assert.equal(lowRisk.reasons.some((item) => item.includes("tags")), true);

  const duplicateResult = createCaptureCandidate(runtime.state, {
    title: "Footer navigation fix",
    task: "Fix the H5 footer so the category tab is reachable again.",
    summary: "Keep the category tab aligned with the current page highlight.",
    files: ["src/components/Footer.vue"]
  }, {
    pendingLimit: 10,
    dedupeWindowMinutes: 180
  });

  assert.equal(duplicateResult.created, false);
  assert.equal(listCaptureCandidates(runtime.state).length, 1);

  const plainCandidate = createCaptureCandidate(runtime.state, {
    title: "Simple file anchor note",
    task: "Record a low-risk workflow note.",
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

  const verboseCandidate = createCaptureCandidate(runtime.state, {
    title: "Long-form paper workflow note",
    task: "Store long research workflow notes without dropping the raw explanation.",
    summary: "This summary is intentionally long so the capture record keeps a full-fidelity version for later manual review even when the candidate-facing text has to be shorter in downstream workflows and reporting surfaces.",
    files: ["papers/research-memory.md"]
  }, {
    pendingLimit: 10
  });
  assert.equal(verboseCandidate.candidate.origin.summary_full.includes("full-fidelity version"), true);

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
  assert.equal(runtime.index.nodes[0].symptom, "Users cannot reach the category tab from the footer.");
  assert.equal(runtime.index.nodes[0].fix, "Restore the category tab and keep the active state in sync.");
  assert.equal(findCaptureCandidate(runtime.state, "C001"), null);
  assert.equal(findCaptureCandidate(runtime.state, "Simple file anchor note").id, "C002");

  createCaptureCandidate(runtime.state, {
    title: "Dismiss me",
    task: "Temporary noisy note.",
    summary: "This one should be ignored.",
    files: ["src/views/noise.vue"]
  }, {
    pendingLimit: 10
  });

  const dismissOutput = captureLogs(() => {
    commands.commandCaptureDismiss(runtime, {
      positional: ["capture-dismiss", "C004"],
      options: {}
    }, {
      skipSave: true
    });
  });
  assert.equal(dismissOutput.includes("\"dismissed\": true"), true);
  assert.equal(listCaptureCandidates(runtime.state).length, 2);
  assert.equal(findCaptureCandidate(runtime.state, "Simple file anchor note").id, "C002");
  assert.equal(findCaptureCandidate(runtime.state, "Long-form paper workflow note").id, "C003");
};
