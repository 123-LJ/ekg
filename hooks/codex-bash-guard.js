#!/usr/bin/env node

const fs = require("node:fs");

const MANAGED_STORE_PATTERN = /(ekg-out[\\/](?:ekg\.sqlite|ekg\.json|state\.json)|\bekg\.json\b|\bstate\.json\b)/iu;
const WRITE_LIKE_PATTERN = /(>|>>|\bset-content\b|\badd-content\b|\bout-file\b|\bcopy-item\b|\bmove-item\b|\brename-item\b|\bremove-item\b|\brm\b|\bdel\b|\berase\b|\bmv\b|\bcp\b|\btouch\b|\bsed\s+-i\b|\bperl\s+-pi\b|\btee\b)/iu;

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function extractCommand(input) {
  const toolInput = (input && input.tool_input) || {};
  return firstNonEmpty(
    toolInput.command,
    toolInput.cmd,
    Array.isArray(toolInput.argv) ? toolInput.argv.join(" ") : "",
    input && input.command
  );
}

function touchesManagedStore(command) {
  return MANAGED_STORE_PATTERN.test(slashPath(command));
}

function isWriteLikeCommand(command) {
  return WRITE_LIKE_PATTERN.test(String(command || ""));
}

function shouldBlockCommand(command) {
  return touchesManagedStore(command) && isWriteLikeCommand(command);
}

function buildDenialReason() {
  return "EKG managed store files must not be changed through raw Bash commands. Use node scripts/ekg.js or the runtime hooks instead.";
}

function buildPreToolDenyOutput(reason) {
  return {
    continue: false,
    suppressOutput: true,
    systemMessage: reason,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}

function buildPermissionRequestDenyOutput(reason) {
  return {
    continue: false,
    suppressOutput: true,
    systemMessage: reason,
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message: reason
      }
    }
  };
}

function buildFallbackDenyOutput(reason) {
  return {
    continue: false,
    suppressOutput: true,
    stopReason: reason,
    systemMessage: reason
  };
}

function buildEventOutput(eventName, reason) {
  if (eventName === "PermissionRequest") {
    return buildPermissionRequestDenyOutput(reason);
  }

  if (eventName === "PreToolUse") {
    return buildPreToolDenyOutput(reason);
  }

  return buildFallbackDenyOutput(reason);
}

function main() {
  const hookInput = readHookInput();
  const command = extractCommand(hookInput);
  if (!shouldBlockCommand(command)) {
    process.exit(0);
  }

  const eventName = firstNonEmpty(hookInput && hookInput.hook_event_name, "PreToolUse");
  const reason = buildDenialReason();
  process.stdout.write(`${JSON.stringify(buildEventOutput(eventName, reason), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  MANAGED_STORE_PATTERN,
  WRITE_LIKE_PATTERN,
  readHookInput,
  firstNonEmpty,
  slashPath,
  extractCommand,
  touchesManagedStore,
  isWriteLikeCommand,
  shouldBlockCommand,
  buildDenialReason,
  buildPreToolDenyOutput,
  buildPermissionRequestDenyOutput,
  buildFallbackDenyOutput,
  buildEventOutput,
  main
};
