#!/usr/bin/env node

const path = require("node:path");
const os = require("node:os");
const {
  parseArgs
} = require("../lib/core/utils");
const {
  installClaudeIntegration,
  installCodexIntegration
} = require("../lib/integrations");

function printUsage() {
  console.log(
    [
      "EKG host installer",
      "",
      "Usage:",
      "  node scripts/install-host.js --host claude",
      "  node scripts/install-host.js --host codex",
      "  node scripts/install-host.js --host all",
      "",
      "Options:",
      "  --dry-run                      Show target changes without writing files",
      "  --enable-codex-hooks          Also write ~/.codex/hooks.json and enable experimental hooks",
      "  --claude-settings <path>      Override Claude settings path",
      "  --codex-config <path>         Override Codex config.toml path",
      "  --codex-instructions <path>   Override generated Codex instructions path",
      "  --codex-hooks <path>          Override generated Codex hooks.json path"
    ].join("\n")
  );
}

function runInstaller(parsed) {
  const host = String(parsed.options.host || parsed.positional[0] || "all").trim().toLowerCase();
  const dryRun = Boolean(parsed.options["dry-run"]);
  const enableCodexHooks = Boolean(parsed.options["enable-codex-hooks"]);
  const ekgRoot = path.resolve(__dirname, "..");
  const homeDir = os.homedir();
  const results = [];

  if (host === "all" || host === "claude") {
    results.push(
      installClaudeIntegration({
        ekgRoot,
        homeDir,
        settingsPath: parsed.options["claude-settings"],
        dryRun
      })
    );
  }

  if (host === "all" || host === "codex") {
    results.push(
      installCodexIntegration({
        ekgRoot,
        homeDir,
        configPath: parsed.options["codex-config"],
        instructionsPath: parsed.options["codex-instructions"],
        hooksPath: parsed.options["codex-hooks"],
        enableExperimentalHooks: enableCodexHooks,
        dryRun
      })
    );
  }

  if (!results.length) {
    throw new Error(`unsupported host: ${host}`);
  }

  console.log(JSON.stringify({
    ekg_root: ekgRoot,
    dry_run: dryRun,
    results
  }, null, 2));
}

function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);

  if (parsed.options.help || parsed.options.h || parsed.positional[0] === "help") {
    printUsage();
    return;
  }

  runInstaller(parsed);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[ekg-install] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  printUsage,
  runInstaller,
  main
};
