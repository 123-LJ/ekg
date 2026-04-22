const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function quoteCommandPath(filePath) {
  return `"${slashPath(filePath)}"`;
}

function buildNodeCommand(scriptPath) {
  return `node ${quoteCommandPath(scriptPath)}`;
}

function readJsonFile(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    return structuredClone(fallback);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getDefaultClaudeSettingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".claude", "settings.local.json");
}

function getDefaultCodexConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".codex", "config.toml");
}

function getDefaultCodexInstructionsPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".codex", "ekg-model-instructions.md");
}

function getDefaultCodexHooksPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".codex", "hooks.json");
}

function ensureHookGroup(settings, eventName, matcher, hookSpec) {
  settings.hooks = settings.hooks || {};
  settings.hooks[eventName] = Array.isArray(settings.hooks[eventName])
    ? settings.hooks[eventName]
    : [];

  const groups = settings.hooks[eventName];
  const normalizedCommand = slashPath(hookSpec.command);
  let group = groups.find((candidate) => {
    if (matcher === undefined) {
      return candidate.matcher === undefined;
    }

    return candidate.matcher === matcher;
  });

  if (!group) {
    group = matcher === undefined
      ? { hooks: [] }
      : { matcher, hooks: [] };
    groups.push(group);
  }

  group.hooks = Array.isArray(group.hooks) ? group.hooks : [];
  const existingIndex = group.hooks.findIndex((hook) => {
    return slashPath(hook.command || "") === normalizedCommand;
  });

  if (existingIndex >= 0) {
    group.hooks[existingIndex] = {
      ...group.hooks[existingIndex],
      ...hookSpec
    };
  } else {
    group.hooks.push(hookSpec);
  }

  return settings;
}

function buildClaudeHookSpecs(ekgRoot) {
  return {
    preEdit: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "pre-edit.js")),
      timeout: 5,
      statusMessage: "EKG PreToolUse"
    },
    taskComplete: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "task-complete.js")),
      timeout: 8,
      statusMessage: "EKG Stop Capture"
    },
    subagentComplete: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "task-complete.js")),
      timeout: 8,
      statusMessage: "EKG Subagent Capture"
    }
  };
}

function mergeClaudeSettings(settings, ekgRoot) {
  const next = structuredClone(settings || {});
  const specs = buildClaudeHookSpecs(ekgRoot);

  ensureHookGroup(next, "PreToolUse", "Edit|Write", specs.preEdit);
  ensureHookGroup(next, "Stop", undefined, specs.taskComplete);
  ensureHookGroup(next, "SubagentStop", undefined, specs.subagentComplete);

  return next;
}

function installClaudeIntegration(options = {}) {
  const ekgRoot = options.ekgRoot || path.resolve(__dirname, "..", "..");
  const settingsPath = options.settingsPath || getDefaultClaudeSettingsPath(options.homeDir);
  const current = readJsonFile(settingsPath, {});
  const next = mergeClaudeSettings(current, ekgRoot);

  if (!options.dryRun) {
    writeJsonFile(settingsPath, next);
  }

  return {
    host: "claude",
    changed: JSON.stringify(current) !== JSON.stringify(next),
    settingsPath,
    dryRun: Boolean(options.dryRun)
  };
}

function parseTomlString(content, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`, "m");
  const match = String(content || "").match(pattern);
  return match ? match[1] : "";
}

function setTomlString(content, key, value) {
  const nextLine = `${key} = "${slashPath(value).replace(/"/g, '\\"')}"`;
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"[^"]*"\\s*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, nextLine);
  }

  const trimmed = String(content || "").replace(/\s+$/u, "");
  return trimmed
    ? `${nextLine}\n${trimmed}\n`
    : `${nextLine}\n`;
}

function ensureTomlTable(content, tableName) {
  const tableHeader = `[${tableName}]`;
  if (new RegExp(`^\\s*\\[${tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*$`, "m").test(content)) {
    return content;
  }

  const trimmed = String(content || "").replace(/\s+$/u, "");
  return trimmed
    ? `${trimmed}\n\n${tableHeader}\n`
    : `${tableHeader}\n`;
}

function setTomlBooleanInTable(content, tableName, key, value) {
  let next = ensureTomlTable(content, tableName);
  const boolText = value ? "true" : "false";
  const tablePattern = new RegExp(`(^\\s*\\[${tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*$)([\\s\\S]*?)(?=^\\s*\\[|\\s*$)`, "m");
  const match = next.match(tablePattern);
  if (!match) {
    return `${next}\n[${tableName}]\n${key} = ${boolText}\n`;
  }

  const body = match[2];
  const keyPattern = new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\s*$`, "m");
  const nextBody = keyPattern.test(body)
    ? body.replace(keyPattern, `${key} = ${boolText}`)
    : `${body.replace(/\s+$/u, "")}\n${key} = ${boolText}\n`;

  return next.slice(0, match.index)
    + match[1]
    + nextBody
    + next.slice(match.index + match[0].length);
}

function buildCodexInstructions(options = {}) {
  const ekgRoot = slashPath(options.ekgRoot || path.resolve(__dirname, "..", ".."));
  const existingInstructionsPath = options.existingInstructionsPath || "";
  const existingInstructionsText = options.existingInstructionsText || "";
  const lines = [
    "<!-- EKG managed Codex instructions. Re-run scripts/install-host.js to refresh. -->",
    "",
    "# Codex + EKG Integration",
    "",
    "EKG is an Experience Knowledge Graph for coding agents.",
    "",
    `EKG root: ${ekgRoot}`,
    "",
    "## Required Workflow",
    "",
    "Before editing files, query EKG for relevant prior experience when the target file, feature, or bug area is known.",
    "",
    "Use:",
    "",
    "```powershell",
    `cd ${ekgRoot}`,
    "node scripts/ekg.js query \"<keyword-or-file>\"",
    "```",
    "",
    "After a bug fix, requirements implementation, or repeated debugging loop, create a capture candidate instead of writing a confirmed experience directly.",
    "",
    "Use:",
    "",
    "```powershell",
    `cd ${ekgRoot}`,
    "node hooks/task-complete.js --task \"<task>\" --summary \"<verified result>\" --file <changed-file>",
    "```",
    "",
    "Only promote a candidate after the solution is verified:",
    "",
    "```powershell",
    `cd ${ekgRoot}`,
    "node scripts/ekg.js capture-status",
    "node scripts/ekg.js capture-accept C001 --confirm",
    "```",
    "",
    "If a candidate is noise, dismiss it:",
    "",
    "```powershell",
    `cd ${ekgRoot}`,
    "node scripts/ekg.js capture-dismiss C001",
    "```",
    "",
    "## Important",
    "",
    "Do not edit ekg-out/ekg.sqlite, ekg.json, or state.json directly. Use the CLI/runtime commands so locks and mirrors stay consistent."
  ];

  if (existingInstructionsText.trim()) {
    lines.push(
      "",
      "## Preserved Existing Instructions",
      "",
      `Source: ${slashPath(existingInstructionsPath) || "inline"}`,
      "",
      existingInstructionsText.trim()
    );
  }

  return lines.join("\n");
}

function buildCodexHooksJson(ekgRoot) {
  return {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: buildNodeCommand(path.join(ekgRoot, "hooks", "task-complete.js")),
              timeout: 8,
              statusMessage: "EKG Stop Capture"
            }
          ]
        }
      ]
    }
  };
}

function installCodexIntegration(options = {}) {
  const ekgRoot = options.ekgRoot || path.resolve(__dirname, "..", "..");
  const configPath = options.configPath || getDefaultCodexConfigPath(options.homeDir);
  const instructionsPath = options.instructionsPath || getDefaultCodexInstructionsPath(options.homeDir);
  const hooksPath = options.hooksPath || getDefaultCodexHooksPath(options.homeDir);
  const currentConfig = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf8")
    : "";
  const existingInstructionsPath = parseTomlString(currentConfig, "model_instructions_file");
  const resolvedExistingInstructionsPath = existingInstructionsPath
    ? path.resolve(path.dirname(configPath), existingInstructionsPath)
    : "";
  const shouldPreserveExisting = resolvedExistingInstructionsPath
    && path.resolve(resolvedExistingInstructionsPath) !== path.resolve(instructionsPath)
    && fs.existsSync(resolvedExistingInstructionsPath);
  const existingInstructionsText = shouldPreserveExisting
    ? fs.readFileSync(resolvedExistingInstructionsPath, "utf8")
    : "";
  const instructions = buildCodexInstructions({
    ekgRoot,
    existingInstructionsPath: resolvedExistingInstructionsPath,
    existingInstructionsText
  });
  let nextConfig = setTomlString(currentConfig, "model_instructions_file", instructionsPath);

  if (options.enableExperimentalHooks) {
    nextConfig = setTomlBooleanInTable(nextConfig, "features", "codex_hooks", true);
  }

  if (!options.dryRun) {
    ensureDir(path.dirname(configPath));
    ensureDir(path.dirname(instructionsPath));
    fs.writeFileSync(instructionsPath, `${instructions}\n`, "utf8");
    fs.writeFileSync(configPath, nextConfig, "utf8");

    if (options.enableExperimentalHooks) {
      writeJsonFile(hooksPath, buildCodexHooksJson(ekgRoot));
    }
  }

  return {
    host: "codex",
    changed: currentConfig !== nextConfig,
    configPath,
    instructionsPath,
    hooksPath: options.enableExperimentalHooks ? hooksPath : null,
    experimentalHooksEnabled: Boolean(options.enableExperimentalHooks),
    codexHooksWindowsDisabled: process.platform === "win32",
    dryRun: Boolean(options.dryRun)
  };
}

module.exports = {
  ensureDir,
  slashPath,
  quoteCommandPath,
  buildNodeCommand,
  readJsonFile,
  writeJsonFile,
  getDefaultClaudeSettingsPath,
  getDefaultCodexConfigPath,
  getDefaultCodexInstructionsPath,
  getDefaultCodexHooksPath,
  ensureHookGroup,
  buildClaudeHookSpecs,
  mergeClaudeSettings,
  installClaudeIntegration,
  parseTomlString,
  setTomlString,
  ensureTomlTable,
  setTomlBooleanInTable,
  buildCodexInstructions,
  buildCodexHooksJson,
  installCodexIntegration
};
