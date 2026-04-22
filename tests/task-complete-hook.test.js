const assert = require("node:assert/strict");
const {
  buildHookOutput,
  shouldBlockOnCandidate,
  formatBlockReason
} = require("../hooks/task-complete.js");

module.exports = function runTaskCompleteHookTest() {
  const result = {
    created: true,
    candidate: {
      id: "C001",
      title: "Footer navigation fix",
      anchors: {
        files: ["src/components/Footer.vue"]
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
};
