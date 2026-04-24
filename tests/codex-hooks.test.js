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
  buildProjectContextLines,
  buildPaperMatchLines,
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
        detailScoreThreshold: 8,
        semantic: {
          enabled: true,
          minimumScore: 0.1,
          scoreWeight: 10
        }
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
        },
        {
          kind: "Paper",
          id: "P100",
          title: "Redirect-safe authentication callbacks",
          abstract: "A paper about signin callback safety in authentication flows.",
          summary: "Studies callback handling in auth redirects.",
          findings: "",
          limitations: "",
          notes: "",
          authors: ["Alice Zhang"],
          topics: ["auth", "redirect"],
          keywords: ["signin", "callback"],
          aliases: ["signin redirect"],
          canonical_terms: ["auth-redirect"],
          suggested_canonical_terms: [],
          venue: "ICSE",
          year: "2025",
          url: "",
          doi: "",
          arxiv_id: "",
          source: "manual/paper-cli",
          status: "ACTIVE",
          relations: ["supports:E100"],
          created_at: "2026-04-22T00:00:00.000Z",
          updated_at: "2026-04-22T00:00:00.000Z"
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
            name: "Mall App",
            root: "C:/work/mall-app",
            type: "vue",
            tags: ["mall", "h5"],
            created_at: "2026-04-22T00:00:00.000Z",
            updated_at: "2026-04-22T00:00:00.000Z",
            last_used_at: "2026-04-22T00:00:00.000Z"
          }
        ]
      },
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
  assert.equal(sessionContext.includes("Active project: Mall App"), true);
  assert.equal(sessionContext.includes("Prefer searching inside the active project root"), true);
  assert.equal(sessionContext.includes("Pending capture candidates: 1"), true);

  const sessionOutput = buildSessionStartOutput(runtime);
  assert.equal(sessionOutput.hookSpecificOutput.hookEventName, "SessionStart");

  assert.equal(
    extractPromptTargetFile("Please fix src/views/loginRedirect.vue"),
    "src/views/loginRedirect.vue"
  );
  assert.equal(isCodingPrompt("Fix login redirect loop"), true);
  assert.equal(touchesManagedPromptStore("Please edit ekg.json directly"), true);

  const blockedPrompt = buildBlockedPromptOutput();
  assert.equal(blockedPrompt.continue, false);
  assert.equal(blockedPrompt.stopReason.includes("must not be edited directly"), true);

  const projectContext = buildProjectContextLines(runtime, "src/views/loginRedirect.vue");
  assert.equal(projectContext.activeProject.id, "P001");
  assert.equal(projectContext.resolved.project.id, "P001");
  assert.equal(projectContext.lines.some((line) => line.includes("Resolved project root")), true);

  const paperContext = buildPaperMatchLines(
    runtime,
    "Research signin callback handling for authentication redirect safety"
  );
  assert.equal(paperContext.matches.length, 1);
  assert.equal(paperContext.matches[0].paper.id, "P100");

  const promptContext = buildPromptContext(
    runtime,
    "Please fix src/views/loginRedirect.vue login redirect issue"
  );
  assert.equal(promptContext.targetFile, "src/views/loginRedirect.vue");
  assert.equal(promptContext.matches.length, 1);
  assert.equal(promptContext.paperMatches.length, 1);
  assert.equal(promptContext.context.includes("E100"), true);
  assert.equal(promptContext.context.includes("P100"), true);
  assert.equal(promptContext.context.includes("Active project: Mall App"), true);
  assert.equal(
    promptContext.context.includes("Avoid broad recursive scans outside the resolved project root"),
    true
  );

  const promptOutput = buildUserPromptOutput(runtime, "Fix src/views/loginRedirect.vue");
  assert.equal(promptOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");

  const semanticPromptContext = buildPromptContext(
    runtime,
    "Please fix signin reroute failure in the authentication flow"
  );
  assert.equal(semanticPromptContext.matches.length, 1);
  assert.equal(semanticPromptContext.matches[0].experience.id, "E100");

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
