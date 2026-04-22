const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  installClaudeIntegration,
  installCodexIntegration
} = require("../lib/integrations");

module.exports = function runInstallHostTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ekg-install-"));
  const homeDir = path.join(tmpRoot, "home");
  const ekgRoot = path.join(tmpRoot, "ekg");

  fs.mkdirSync(path.join(homeDir, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".codex"), { recursive: true });
  fs.mkdirSync(ekgRoot, { recursive: true });

  const claudeResult = installClaudeIntegration({
    ekgRoot,
    homeDir
  });
  assert.equal(claudeResult.host, "claude");
  assert.equal(fs.existsSync(path.join(homeDir, ".claude", "settings.local.json")), true);

  const claudeSettings = JSON.parse(
    fs.readFileSync(path.join(homeDir, ".claude", "settings.local.json"), "utf8")
  );
  assert.equal(claudeSettings.hooks.PreToolUse.length >= 1, true);
  assert.equal(claudeSettings.hooks.Stop.length >= 1, true);

  const codexResult = installCodexIntegration({
    ekgRoot,
    homeDir
  });
  assert.equal(codexResult.host, "codex");
  assert.equal(fs.existsSync(path.join(homeDir, ".codex", "config.toml")), true);
  assert.equal(fs.existsSync(path.join(homeDir, ".codex", "ekg-model-instructions.md")), true);

  const codexConfig = fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8");
  assert.equal(/model_instructions_file\s*=/.test(codexConfig), true);
  assert.equal(codexConfig.includes("ekg-model-instructions.md"), true);
};
