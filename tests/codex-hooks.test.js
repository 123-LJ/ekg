const assert = require("node:assert/strict");
const {
  buildSessionStartContext,
  buildSessionStartOutput
} = require("../hooks/codex-session-start.js");
const {
  extractPromptTargetFile,
  isCodingPrompt,
  touchesManagedStore: touchesManagedPromptStore,
  buildBlockedPromptOutput,
  buildPromptContext,
  buildUserPromptOutput
} = require("../hooks/codex-user-prompt.js");
const {
  extractCommand,
  touchesManagedStore: touchesManagedCommandStore,
  isWriteLikeCommand,
  shouldBlockCommand,
  buildEventOutput
} = require("../hooks/codex-bash-guard.js");

module.exports = function runCodexHooksTest() {
  const runtime = {
    config: {
      hook: {
        minimumScore: 5,
        maxInjectedExperiences: 3
      },
      query: {
        detailScoreThreshold: 8
      }
    },
    index: {
      nodes: [
        {
          kind: "Experience",
          id: "E100",
          title: "Fix login redirect loop",
          problem: "Redirect loop in loginRedirect.vue",
          solution: "Exclude logged-in routes from the redirect guard.",
          root_cause: "Guard and redirect depended on each other.",
          confidence: "CONFIRMED",
          status: "ACTIVE",
          tags: ["auth", "redirect"],
          techs: ["vue-router"],
          anchors: {
            files: ["src/views/loginRedirect.vue"],
            concepts: ["loginRedirect", "beforeEach"]
          }
        }
      ]
    },
    state: {
      capture: {
        pending_candidates: [
          {
            id: "C001",
            title: "Footer navigation adjustment"
          }
        ]
      }
    }
  };

  const sessionContext = buildSessionStartContext(runtime);
  assert.equal(sessionContext.includes("Global workflow is active"), true);
  assert.equal(sessionContext.includes("Pending capture candidates: 1"), true);
  const sessionOutput = buildSessionStartOutput(runtime);
  assert.equal(sessionOutput.hookSpecificOutput.hookEventName, "SessionStart");

  assert.equal(extractPromptTargetFile("请修改 src/views/loginRedirect.vue"), "src/views/loginRedirect.vue");
  assert.equal(isCodingPrompt("修复登录重定向问题"), true);
  assert.equal(touchesManagedPromptStore("请直接修改 ekg.json"), true);

  const blockedPrompt = buildBlockedPromptOutput();
  assert.equal(blockedPrompt.continue, false);
  assert.equal(blockedPrompt.stopReason.includes("must not be edited directly"), true);

  const promptContext = buildPromptContext(runtime, "请修复 src/views/loginRedirect.vue 的登录重定向问题");
  assert.equal(promptContext.targetFile, "src/views/loginRedirect.vue");
  assert.equal(promptContext.matches.length, 1);
  assert.equal(promptContext.context.includes("E100"), true);

  const promptOutput = buildUserPromptOutput(runtime, "修复 src/views/loginRedirect.vue");
  assert.equal(promptOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");

  assert.equal(
    extractCommand({
      tool_input: {
        command: "Set-Content ekg.json {}"
      }
    }),
    "Set-Content ekg.json {}"
  );
  assert.equal(touchesManagedCommandStore("rm state.json"), true);
  assert.equal(isWriteLikeCommand("Set-Content ekg.json {}"), true);
  assert.equal(shouldBlockCommand("Set-Content ekg.json {}"), true);

  const preToolDeny = buildEventOutput("PreToolUse", "denied");
  assert.equal(preToolDeny.hookSpecificOutput.permissionDecision, "deny");
  const permissionDeny = buildEventOutput("PermissionRequest", "denied");
  assert.equal(permissionDeny.hookSpecificOutput.decision.behavior, "deny");
};
