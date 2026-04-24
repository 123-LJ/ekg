const assert = require("node:assert/strict");
const {
  buildHookOutput,
  buildCandidateInput,
  evaluateCaptureCandidate,
  shouldCaptureCandidate,
  formatSkipReason,
  shouldBlockOnCandidate,
  formatBlockReason,
  tryAutoAcceptCandidate
} = require("../hooks/task-complete.js");

module.exports = function runTaskCompleteHookTest() {
  const result = {
    created: true,
    candidate: {
      id: "C001",
      title: "Footer navigation fix",
      type: "workflow",
      level: "L1",
      source: "host/auto-stop",
      problem: "Fix footer navigation",
      solution: "Restore the category entry in the footer navigation.",
      anchors: {
        files: ["src/components/Footer.vue"],
        concepts: ["Footer"]
      },
      tags: [],
      techs: [],
      relations: [],
      origin: {
        event: "Stop"
      }
    }
  };

  assert.equal(
    shouldBlockOnCandidate(result, {
      hook_event_name: "Stop",
      stop_hook_active: false
    }, {
      gate: {
        enabled: true,
        blockOnEvents: ["Stop"]
      }
    }),
    true
  );

  assert.equal(
    shouldBlockOnCandidate(result, {
      hook_event_name: "SubagentStop",
      stop_hook_active: false
    }, {
      gate: {
        enabled: true,
        blockOnEvents: ["Stop"]
      }
    }),
    false
  );

  assert.equal(
    shouldBlockOnCandidate({
      ...result,
      created: false
    }, {
      hook_event_name: "Stop",
      stop_hook_active: false
    }, {
      gate: {
        enabled: true,
        blockOnEvents: ["Stop"]
      }
    }),
    false
  );

  assert.equal(
    shouldBlockOnCandidate(result, {
      hook_event_name: "Stop",
      stop_hook_active: true
    }, {
      gate: {
        enabled: true,
        blockOnEvents: ["Stop"]
      }
    }),
    false
  );

  const reason = formatBlockReason(result.candidate);
  assert.equal(reason.includes("capture-status C001"), true);
  assert.equal(reason.includes("Human review is required"), false);

  const payload = buildHookOutput(result, {
    hook_event_name: "Stop",
    stop_hook_active: false
  }, {
    gate: {
      enabled: true,
      blockOnEvents: ["Stop"]
    }
  });

  assert.equal(payload.decision, "block");
  assert.equal(payload.reason.includes("capture-accept C001 --confirm"), true);
  assert.equal(payload.additionalContext.includes("captured candidate C001"), true);

  const autoRuntime = {
    index: {
      nodes: []
    },
    state: {
      capture: {
        next_candidate_number: 2,
        pending_candidates: [structuredClone(result.candidate)],
        recent_events: []
      }
    }
  };
  const autoAccepted = tryAutoAcceptCandidate(autoRuntime, autoRuntime.state.capture.pending_candidates[0], {
    autoAccept: {
      enabled: true,
      maxSummaryLength: 180,
      allowedSources: ["host/auto-stop"],
      allowedTypes: ["workflow"],
      allowedLevels: ["L1"],
      requireFileAnchor: true,
      requireProblemAndSolution: true,
      blockIfTagsPresent: true,
      blockIfTechsPresent: true,
      blockIfRelationsPresent: true,
      blockIfRootCausePresent: true,
      blockIfCommitsPresent: true,
      blockOnEvents: ["Stop"]
    }
  });

  assert.equal(autoAccepted.autoAccepted, true);
  assert.equal(autoAccepted.reviewGate.riskLevel, "low");
  assert.equal(autoRuntime.index.nodes.length, 1);
  assert.equal(autoRuntime.state.capture.pending_candidates.length, 0);

  const genericCandidate = buildCandidateInput({
    positional: [],
    options: {
      task: "Updated files",
      summary: "Done",
      file: [
        "src/a.js",
        "src/b.js",
        "src/c.js",
        "src/d.js",
        "src/e.js",
        "src/f.js",
        "src/g.js"
      ]
    }
  }, null);
  assert.equal(shouldCaptureCandidate(genericCandidate, {
    enabled: true,
    minimumSummaryLength: 4,
    requireFileAnchor: true,
    minimumStructuredFields: 1,
    maxHookFiles: 6
  }), false);
  const genericEvaluation = evaluateCaptureCandidate(genericCandidate, {
    enabled: true,
    minimumSummaryLength: 4,
    requireFileAnchor: true,
    minimumStructuredFields: 1,
    maxHookFiles: 6
  });
  assert.equal(genericEvaluation.shouldCapture, false);
  assert.equal(genericEvaluation.reasons.includes("too many files for low-structure capture (7 > 6)"), true);
  assert.equal(genericEvaluation.reasons.includes("problem and solution look too generic"), true);
  assert.equal(formatSkipReason(genericEvaluation.reasons).includes("skipped capture candidate"), true);

  const structuredCandidate = buildCandidateInput({
    positional: [],
    options: {
      task: "Fix login redirect callback",
      summary: "Exclude the callback route from the auth guard fallback.",
      symptom: "Users loop after login.",
      cause: "The callback route was treated as protected.",
      fix: "Return early for the callback route.",
      file: "src/views/loginRedirect.vue"
    }
  }, null);
  assert.equal(shouldCaptureCandidate(structuredCandidate, {
    enabled: true,
    minimumSummaryLength: 24,
    requireFileAnchor: true,
    minimumStructuredFields: 1,
    maxHookFiles: 6
  }), true);
  const structuredEvaluation = evaluateCaptureCandidate(structuredCandidate, {
    enabled: true,
    minimumSummaryLength: 24,
    requireFileAnchor: true,
    minimumStructuredFields: 1,
    maxHookFiles: 6
  });
  assert.equal(structuredEvaluation.shouldCapture, true);
  assert.deepEqual(structuredEvaluation.reasons, []);

  const verboseCandidate = buildCandidateInput({
    positional: [],
    options: {
      task: "Stabilize paper import and capture storage for long research summaries across the review pipeline.",
      summary: "Added a long-form research capture flow that keeps the original explanation intact for later review while compressing the candidate-facing solution into a smaller summary for retrieval, review queues, and auto-accept heuristics. This should avoid long paper notes overwhelming capture decisions while still preserving important context for manual inspection.",
      file: "lib/papers/index.js"
    }
  }, null);
  assert.equal(verboseCandidate.solution.length <= 180, true);
  assert.equal(verboseCandidate.summary.includes("original explanation intact"), true);
};
