const assert = require("node:assert/strict");
const {
  mergeClaudeSettings,
  parseTomlString,
  setTomlString,
  setTomlBooleanInTable,
  buildCodexInstructions,
  buildCodexHooksJson
} = require("../lib/integrations");

module.exports = function runIntegrationsTest() {
  const mergedClaude = mergeClaudeSettings({
    hooks: {
      PreToolUse: [
        {
          matcher: "Edit|Write",
          hooks: []
        }
      ]
    }
  }, "C:/repo/ekg");

  assert.equal(Array.isArray(mergedClaude.hooks.PreToolUse), true);
  assert.equal(mergedClaude.hooks.PreToolUse[0].hooks.length, 1);
  assert.equal(mergedClaude.hooks.Stop.length >= 1, true);
  assert.equal(mergedClaude.hooks.SubagentStop.length >= 1, true);

  const originalToml = [
    'model_provider = "codex-for-me"',
    'model = "gpt-5.4"'
  ].join("\n");
  const nextToml = setTomlString(originalToml, "model_instructions_file", "C:/ekg/instructions.md");
  assert.equal(parseTomlString(nextToml, "model_instructions_file"), "C:/ekg/instructions.md");

  const featuresToml = setTomlBooleanInTable(nextToml, "features", "codex_hooks", true);
  assert.equal(/\[features\]/.test(featuresToml), true);
  assert.equal(/codex_hooks = true/.test(featuresToml), true);

  const instructions = buildCodexInstructions({
    ekgRoot: "C:/repo/ekg",
    existingInstructionsPath: "C:/Users/demo/.codex/old.md",
    existingInstructionsText: "# Existing\n\nPreserve me."
  });
  assert.equal(instructions.includes("Codex + EKG Integration"), true);
  assert.equal(instructions.includes("Preserved Existing Instructions"), true);
  assert.equal(instructions.includes("Preserve me."), true);

  const hooksJson = buildCodexHooksJson("C:/repo/ekg");
  assert.equal(Array.isArray(hooksJson.hooks.Stop), true);
  assert.equal(
    hooksJson.hooks.Stop[0].hooks[0].command.includes("hooks/task-complete.js"),
    true
  );
};
