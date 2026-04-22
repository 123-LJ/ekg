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

function getDefaultCodexAgentsOverridePath(homeDir = os.homedir()) {
  return path.join(homeDir, ".codex", "AGENTS.override.md");
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setTomlBooleanInTable(content, tableName, key, value) {
  const boolText = value ? "true" : "false";
  const normalized = String(content || "").replace(/\s+$/u, "");
  const lines = normalized ? normalized.split(/\r?\n/u) : [];
  const tablePattern = new RegExp(`^\\s*\\[${escapeRegExp(tableName)}\\]\\s*$`);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*$`);
  let tableStart = lines.findIndex((line) => tablePattern.test(line));

  if (tableStart < 0) {
    if (lines.length) {
      lines.push("");
    }
    lines.push(`[${tableName}]`, `${key} = ${boolText}`);
    return `${lines.join("\n")}\n`;
  }

  let tableEnd = lines.length;
  for (let index = tableStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      tableEnd = index;
      break;
    }
  }

  for (let index = tableStart + 1; index < tableEnd; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = `${key} = ${boolText}`;
      return `${lines.join("\n")}\n`;
    }
  }

  let insertAt = tableEnd;
  while (insertAt > tableStart + 1 && lines[insertAt - 1].trim() === "") {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, `${key} = ${boolText}`);
  return `${lines.join("\n")}\n`;
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
    "Do not edit ekg-out/ekg.sqlite, ekg.json, or state.json directly. Use the CLI/runtime commands so locks and mirrors stay consistent.",
    "",
    "## Strong automation",
    "",
    "If Codex hooks are enabled, EKG will also reinforce this workflow on SessionStart, UserPromptSubmit, Bash permission checks, and Stop."
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

function buildCodexGlobalGuidance(options = {}) {
  const ekgRoot = slashPath(options.ekgRoot || path.resolve(__dirname, "..", ".."));
  const existingGuidancePath = options.existingGuidancePath || "";
  const existingGuidanceText = options.existingGuidanceText || "";
  const lines = [
    "<!-- EKG managed Codex global guidance. Re-run scripts/install-host.js to refresh. -->",
    "",
    "# Global Codex + EKG Workflow",
    "",
    "EKG is an Experience Knowledge Graph for coding agents.",
    "",
    `EKG root: ${ekgRoot}`,
    "",
    "## Required Workflow",
    "",
    "1. Before editing a known file, feature, or bug area, query EKG first.",
    "2. After a verified fix or implementation, create a capture candidate instead of writing a confirmed experience directly.",
    "3. Review the candidate before promoting it into the formal graph.",
    "4. Never hand-edit ekg-out/ekg.sqlite, ekg.json, or state.json.",
    "",
    "## Query before editing",
    "",
    "```powershell",
    `cd ${ekgRoot}`,
    "node scripts/ekg.js query \"<keyword-or-file>\"",
    "```",
    "",
    "## Capture after solving",
    "",
    "```powershell",
    `cd ${ekgRoot}`,
    "node hooks/task-complete.js --task \"<task>\" --summary \"<verified result>\" --file <changed-file>",
    "node scripts/ekg.js capture-status",
    "node scripts/ekg.js capture-accept C001 --confirm",
    "```",
    "",
    "## When strong automation is enabled",
    "",
    "- SessionStart reminds Codex that EKG is active.",
    "- UserPromptSubmit injects prompt-aligned experience hints.",
    "- Bash guard hooks block direct writes to managed EKG store files.",
    "- Stop creates a reviewable capture candidate."
  ];

  if (existingGuidanceText.trim()) {
    lines.push(
      "",
      "## Preserved Existing Global Guidance",
      "",
      `Source: ${slashPath(existingGuidancePath) || "inline"}`,
      "",
      existingGuidanceText.trim()
    );
  }

  return lines.join("\n");
}

function buildCodexHookSpecs(ekgRoot) {
  return {
    sessionStart: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "codex-session-start.js")),
      timeout: 8,
      statusMessage: "EKG SessionStart"
    },
    userPromptSubmit: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "codex-user-prompt.js")),
      timeout: 8,
      statusMessage: "EKG Prompt Review"
    },
    preToolBash: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "codex-bash-guard.js")),
      timeout: 8,
      statusMessage: "EKG Bash Guard"
    },
    permissionBash: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "codex-bash-guard.js")),
      timeout: 8,
      statusMessage: "EKG Permission Guard"
    },
    taskComplete: {
      type: "command",
      command: buildNodeCommand(path.join(ekgRoot, "hooks", "task-complete.js")),
      timeout: 8,
      statusMessage: "EKG Stop Capture"
    }
  };
}

function mergeCodexHooksSettings(settings, ekgRoot) {
  const next = structuredClone(settings || {});
  const specs = buildCodexHookSpecs(ekgRoot);

  ensureHookGroup(next, "SessionStart", "startup|resume", specs.sessionStart);
  ensureHookGroup(next, "UserPromptSubmit", undefined, specs.userPromptSubmit);
  ensureHookGroup(next, "PreToolUse", "Bash", specs.preToolBash);
  ensureHookGroup(next, "PermissionRequest", "Bash", specs.permissionBash);
  ensureHookGroup(next, "Stop", undefined, specs.taskComplete);

  return next;
}

function buildCodexHooksJson(ekgRoot) {
  return mergeCodexHooksSettings({}, ekgRoot);
}

function isManagedGeneratedFile(content, marker) {
  return String(content || "").includes(marker);
}

function installCodexIntegration(options = {}) {
  const ekgRoot = options.ekgRoot || path.resolve(__dirname, "..", "..");
  const codexMode = String(options.codexMode || (options.enableExperimentalHooks ? "hooks" : "light"))
    .trim()
    .toLowerCase();
  const enableCodexHooks = Boolean(options.enableExperimentalHooks)
    || codexMode === "hooks"
    || codexMode === "strong";
  const installGlobalAgents = Boolean(options.installGlobalAgents) || codexMode === "strong";

  if (!["light", "hooks", "strong"].includes(codexMode)) {
    throw new Error(`unsupported codex mode: ${codexMode}`);
  }

  const configPath = options.configPath || getDefaultCodexConfigPath(options.homeDir);
  const instructionsPath = options.instructionsPath || getDefaultCodexInstructionsPath(options.homeDir);
  const hooksPath = options.hooksPath || getDefaultCodexHooksPath(options.homeDir);
  const agentsPath = options.agentsPath || getDefaultCodexAgentsOverridePath(options.homeDir);
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
  const currentHooks = enableCodexHooks
    ? readJsonFile(hooksPath, {})
    : {};
  const nextHooks = enableCodexHooks
    ? mergeCodexHooksSettings(currentHooks, ekgRoot)
    : currentHooks;
  const currentAgentsText = installGlobalAgents && fs.existsSync(agentsPath)
    ? fs.readFileSync(agentsPath, "utf8")
    : "";
  const legacyAgentsPath = path.join(path.dirname(agentsPath), "AGENTS.md");
  const shouldPreserveLegacyAgents = installGlobalAgents
    && !currentAgentsText
    && fs.existsSync(legacyAgentsPath);
  const guidanceSourcePath = currentAgentsText
    ? agentsPath
    : (shouldPreserveLegacyAgents ? legacyAgentsPath : "");
  const guidanceSourceText = currentAgentsText && !isManagedGeneratedFile(
    currentAgentsText,
    "EKG managed Codex global guidance"
  )
    ? currentAgentsText
    : (shouldPreserveLegacyAgents ? fs.readFileSync(legacyAgentsPath, "utf8") : "");
  const agentsContent = installGlobalAgents
    ? buildCodexGlobalGuidance({
        ekgRoot,
        existingGuidancePath: guidanceSourcePath,
        existingGuidanceText: guidanceSourceText
      })
    : "";
  let nextConfig = setTomlString(currentConfig, "model_instructions_file", instructionsPath);

  if (enableCodexHooks) {
    nextConfig = setTomlBooleanInTable(nextConfig, "features", "codex_hooks", true);
  }

  if (!options.dryRun) {
    ensureDir(path.dirname(configPath));
    ensureDir(path.dirname(instructionsPath));
    fs.writeFileSync(instructionsPath, `${instructions}\n`, "utf8");
    fs.writeFileSync(configPath, nextConfig, "utf8");

    if (enableCodexHooks) {
      writeJsonFile(hooksPath, nextHooks);
    }

    if (installGlobalAgents) {
      ensureDir(path.dirname(agentsPath));
      fs.writeFileSync(agentsPath, `${agentsContent}\n`, "utf8");
    }
  }

  const instructionsChanged = !fs.existsSync(instructionsPath)
    || fs.readFileSync(instructionsPath, "utf8") !== `${instructions}\n`;
  const configChanged = currentConfig !== nextConfig;
  const hooksChanged = enableCodexHooks
    ? JSON.stringify(currentHooks) !== JSON.stringify(nextHooks)
    : false;
  const agentsChanged = installGlobalAgents
    ? !fs.existsSync(agentsPath) || currentAgentsText !== `${agentsContent}\n`
    : false;

  return {
    host: "codex",
    changed: configChanged || instructionsChanged || hooksChanged || agentsChanged,
    codexMode,
    configPath,
    instructionsPath,
    hooksPath: enableCodexHooks ? hooksPath : null,
    agentsPath: installGlobalAgents ? agentsPath : null,
    experimentalHooksEnabled: enableCodexHooks,
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
  getDefaultCodexAgentsOverridePath,
  ensureHookGroup,
  buildClaudeHookSpecs,
  mergeClaudeSettings,
  installClaudeIntegration,
  parseTomlString,
  setTomlString,
  ensureTomlTable,
  setTomlBooleanInTable,
  buildCodexInstructions,
  buildCodexGlobalGuidance,
  buildCodexHookSpecs,
  mergeCodexHooksSettings,
  buildCodexHooksJson,
  installCodexIntegration
};
